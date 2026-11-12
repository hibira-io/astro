// Hibira Live Chat for Astro: the script that loads the widget
// (https://chat.hibira.io/w/v1.js) with its data- attributes, opens it from
// the page's own buttons and links, signs visitors in, and keeps it on the
// page across Astro view transitions (<ClientRouter />).
//
// Runs in Node (the integration, components' frontmatter) and in workers:
// only standard APIs.

export const LIVECHAT_HOST = 'https://chat.hibira.io';

const WORKSPACE = /^ws_[A-Za-z0-9_-]{1,64}$/;
const COLOR = /^#[0-9a-fA-F]{3,8}$/;

/** Whether `s` looks like a workspace ID (ws_…). */
export function isWorkspace(s) {
  return typeof s === 'string' && WORKSPACE.test(s);
}

/**
 * The widget's data- attributes for these options.
 *
 * @param {object} o
 * @param {string} o.workspace ws_… from Live Chat > Settings > Install
 * @param {string} [o.color] #rgb … #rrggbbaa; default the colour set in Live Chat
 * @param {string} [o.lang] "en", "zh-TW", "ja"…; default the browser's language
 * @param {boolean} [o.launcher=true] false leaves out the round button
 * @param {{ id: string|number, hash: string, name?: string, email?: string }} [o.user]
 *   a signed-in visitor; `hash` from liveChatUserHash()
 */
export function liveChatAttributes({ workspace, color, lang, launcher = true, user } = {}) {
  if (!isWorkspace(workspace)) {
    throw new TypeError(`@hibira-io/astro: "${workspace}" is not a Live Chat workspace ID (ws_…). Copy it from Live Chat > Settings > Install.`);
  }
  const a = { 'data-workspace': workspace };
  if (typeof color === 'string' && COLOR.test(color.trim())) a['data-color'] = color.trim();
  if (typeof lang === 'string' && /^[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})*$/.test(lang)) a['data-lang'] = lang.replace(/_/g, '-').toLowerCase();
  if (launcher === false) a['data-launcher'] = 'none';
  Object.assign(a, userAttributes(user));
  return a;
}

/** data-user-* attributes of a signed-in visitor, or {} when it has no id and hash. */
export function userAttributes(user) {
  if (!user || user.id == null || user.id === '' || !user.hash) return {};
  const a = { 'data-user-id': String(user.id).slice(0, 200), 'data-user-hash': String(user.hash) };
  if (user.name) a['data-user-name'] = String(user.name).slice(0, 200);
  if (user.email) a['data-user-email'] = String(user.email).slice(0, 200);
  return a;
}

/**
 * hex(HMAC-SHA256(identity secret, user id)): proves to Live Chat that your
 * server signed this visitor in. Make it on the server only; the secret
 * (lcid_…, Live Chat > Settings > Install > Verified visitors) must never
 * reach the browser.
 *
 * @param {string} secret
 * @param {string|number} id
 * @returns {Promise<string>}
 */
export async function liveChatUserHash(secret, id) {
  if (!secret) throw new TypeError('@hibira-io/astro: liveChatUserHash() needs the identity secret (HIBIRA_LIVECHAT_IDENTITY_SECRET)');
  const subtle = globalThis.crypto?.subtle ?? (await import('node:crypto')).webcrypto.subtle;
  const enc = new TextEncoder();
  const key = await subtle.importKey('raw', enc.encode(String(secret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await subtle.sign('HMAC', key, enc.encode(String(id))));
  let hex = '';
  for (const b of sig) hex += b.toString(16).padStart(2, '0');
  return hex;
}

/**
 * A signed-in visitor for the widget: `{ id, hash, name, email }`, or null
 * without a user id or secret.
 */
export async function liveChatUser(user, secret) {
  if (!user || user.id == null || user.id === '' || !secret) return null;
  const out = { id: String(user.id), hash: await liveChatUserHash(secret, user.id) };
  if (user.name) out.name = String(user.name);
  if (user.email) out.email = String(user.email);
  return out;
}

/** JSON that is safe inside an inline <script>. */
export function scriptJSON(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * The inline script that loads the widget once per page load.
 *
 * - It waits for the page to be parsed, so a <LiveChatUser> anywhere on the
 *   page (a <script type="application/json" data-hibira-live-chat-user>)
 *   signs the visitor in from the first moment.
 * - Clicks on [data-hibira-live-chat], .hibira-live-chat-open and links to
 *   #hibira-live-chat open the chat; data-topic="sales" marks a new
 *   conversation as a sales inquiry.
 * - With view transitions it carries the widget over to each new page, and
 *   signs the visitor in or out when the new page says another user.
 *
 * @param {object} o
 * @param {Record<string,string>} o.attributes from liveChatAttributes()
 * @param {string} [o.host] Live Chat origin, default https://chat.hibira.io
 */
export function liveChatLoader({ attributes, host = LIVECHAT_HOST } = {}) {
  const src = String(host).replace(/\/+$/, '') + '/w/v1.js';
  return `(function(A,S){var w=window,d=document;if(w.__hibiraAstroLiveChat)return;w.__hibiraAstroLiveChat=1;
var U="script[data-hibira-live-chat-user]",cur=null,pend=null;
function who(doc){var e=doc.querySelector(U);if(!e)return null;try{var u=JSON.parse(e.textContent||"null");return u&&u.id!=null&&u.hash?u:null}catch(x){return null}}
function load(){var u=who(d),s=d.createElement("script"),k;cur=u?String(u.id):"";s.src=S;s.async=true;for(k in A)s.setAttribute(k,A[k]);
if(u){s.setAttribute("data-user-id",String(u.id));s.setAttribute("data-user-hash",String(u.hash));if(u.name)s.setAttribute("data-user-name",String(u.name));if(u.email)s.setAttribute("data-user-email",String(u.email))}
var n=d.querySelector("script[nonce]");if(n&&n.nonce)s.nonce=n.nonce;(d.head||d.body).appendChild(s)}
if(d.readyState==="loading")d.addEventListener("DOMContentLoaded",load,{once:true});else load();
function open(t){var o=t==="sales"?{topic:"sales"}:void 0;if(w.HibiraLiveChat)w.HibiraLiveChat.open(o);else pend=o||{}}
w.addEventListener("hibira-livechat:ready",function(){if(pend){w.HibiraLiveChat.open(pend.topic?pend:void 0);pend=null}});
d.addEventListener("click",function(e){var t=e.target,el=t&&t.closest?t.closest("[data-hibira-live-chat],.hibira-live-chat-open,a[href=\\"#hibira-live-chat\\"]"):null;if(!el)return;e.preventDefault();open(el.getAttribute("data-topic"))});
d.addEventListener("astro:before-swap",function(e){var nd=e.newDocument,c=d.body.children,i,keep=[];for(i=0;i<c.length;i++)if(c[i].classList.contains("hibira-cb-ui"))keep.push(c[i]);for(i=0;i<keep.length;i++)nd.body.appendChild(keep[i]);
var u=who(nd),id=u?String(u.id):"";if(id===cur)return;cur=id;function sw(){if(u)w.HibiraLiveChat.identify(u);else w.HibiraLiveChat.logout()}if(w.HibiraLiveChat)sw();else w.addEventListener("hibira-livechat:ready",sw,{once:true})});
})(${scriptJSON(attributes)},${scriptJSON(src)});`;
}
