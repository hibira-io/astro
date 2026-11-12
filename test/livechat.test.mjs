import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { isWorkspace, liveChatAttributes, liveChatLoader, liveChatUser, liveChatUserHash, scriptJSON, userAttributes } from '../livechat.js';

test('attributes: workspace, colour, language, launcher', () => {
  assert.deepEqual(liveChatAttributes({ workspace: 'ws_abc' }), { 'data-workspace': 'ws_abc' });
  assert.deepEqual(liveChatAttributes({ workspace: 'ws_abc', color: ' #ff6600 ', lang: 'zh_TW', launcher: false }), {
    'data-workspace': 'ws_abc',
    'data-color': '#ff6600',
    'data-lang': 'zh-tw',
    'data-launcher': 'none',
  });
  assert.deepEqual(liveChatAttributes({ workspace: 'ws_abc', color: 'red', lang: '"><x' }), { 'data-workspace': 'ws_abc' });
  assert.throws(() => liveChatAttributes({ workspace: 'abc' }), /not a Live Chat workspace ID/);
  assert.equal(isWorkspace('ws_A-b_9'), true);
  assert.equal(isWorkspace('ws_'), false);
});

test('user attributes need an id and a hash', () => {
  assert.deepEqual(userAttributes({ id: 7 }), {});
  assert.deepEqual(userAttributes({ id: 7, hash: 'h', name: 'Ann', email: 'a@x.io' }), {
    'data-user-id': '7',
    'data-user-hash': 'h',
    'data-user-name': 'Ann',
    'data-user-email': 'a@x.io',
  });
});

test('the user hash is hex HMAC-SHA256 of the id under the secret', async () => {
  const want = createHmac('sha256', 'lcid_secret').update('42').digest('hex');
  assert.equal(await liveChatUserHash('lcid_secret', 42), want);
  assert.deepEqual(await liveChatUser({ id: 42, name: 'Ann', email: null }, 'lcid_secret'), { id: '42', hash: want, name: 'Ann' });
  assert.equal(await liveChatUser({ id: 42 }, ''), null);
  assert.equal(await liveChatUser(null, 'lcid_secret'), null);
  await assert.rejects(liveChatUserHash('', 1), /identity secret/);
});

test('scriptJSON cannot close the script tag', () => {
  const s = scriptJSON({ name: '</script><script>alert(1)</script>&' });
  assert.ok(!s.includes('<') && !s.includes('>') && !s.includes('&'));
  assert.deepEqual(JSON.parse(s), { name: '</script><script>alert(1)</script>&' });
});

async function page(body, attributes = { 'data-workspace': 'ws_test', 'data-color': '#123456' }) {
  const loader = liveChatLoader({ attributes, host: 'https://chat.example.com/' });
  const dom = new JSDOM(`<!doctype html><html><head><script>${loader}</script></head><body>${body}</body></html>`, {
    url: 'https://site.example/',
    runScripts: 'dangerously',
  });
  if (dom.window.document.readyState !== 'loading') return dom;
  return new Promise((resolve) => dom.window.document.addEventListener('DOMContentLoaded', () => resolve(dom)));
}

// Stands in for the widget: what v1.js does once loaded.
function fakeWidget(w) {
  const calls = [];
  const host = w.document.createElement('div');
  host.className = 'hibira-cb-ui';
  w.document.body.appendChild(host);
  w.HibiraLiveChat = {
    open: (o) => calls.push(['open', o && JSON.parse(JSON.stringify(o))]),
    close: () => calls.push(['close']),
    identify: (u) => calls.push(['identify', JSON.parse(JSON.stringify(u))]),
    logout: () => calls.push(['logout']),
  };
  w.dispatchEvent(new w.CustomEvent('hibira-livechat:ready'));
  return { calls, host };
}

test('loader adds the widget script once the page is parsed, with the signed-in visitor', async () => {
  const user = { id: '42', hash: 'abc', name: 'Ann <b>', email: 'a@x.io' };
  const dom = await page(`<p>hi</p><script type="application/json" data-hibira-live-chat-user>${scriptJSON(user)}</script>`);
  const d = dom.window.document;
  const scripts = [...d.querySelectorAll('script[src]')];
  assert.equal(scripts.length, 1);
  const s = scripts[0];
  assert.equal(s.getAttribute('src'), 'https://chat.example.com/w/v1.js');
  assert.equal(s.async, true);
  assert.equal(s.getAttribute('data-workspace'), 'ws_test');
  assert.equal(s.getAttribute('data-color'), '#123456');
  assert.equal(s.getAttribute('data-user-id'), '42');
  assert.equal(s.getAttribute('data-user-hash'), 'abc');
  assert.equal(s.getAttribute('data-user-name'), 'Ann <b>');
  assert.equal(s.getAttribute('data-user-email'), 'a@x.io');
});

test('loader runs once even when the inline script runs again', async () => {
  const dom = await page('');
  const w = dom.window;
  w.eval(liveChatLoader({ attributes: { 'data-workspace': 'ws_test' } }));
  assert.equal(w.document.querySelectorAll('script[src]').length, 1);
});

test('buttons and links open the chat, before and after the widget is ready', async () => {
  const dom = await page('<button data-hibira-live-chat data-topic="sales" id="b">Chat</button><a href="#hibira-live-chat" id="a">Help</a><span class="hibira-live-chat-open" id="c"><i id="ci">x</i></span>');
  const w = dom.window;
  const d = w.document;
  d.getElementById('b').click();
  const { calls } = fakeWidget(w);
  assert.deepEqual(calls, [['open', { topic: 'sales' }]]);
  d.getElementById('a').click();
  d.getElementById('ci').click();
  assert.deepEqual(calls.slice(1), [['open', undefined], ['open', undefined]]);
  assert.equal(w.location.hash, '');
});

test('view transitions carry the widget to the new page and follow sign-in changes', async () => {
  const dom = await page('<main>one</main>');
  const w = dom.window;
  const d = w.document;
  const { calls, host } = fakeWidget(w);
  const swap = (html) => {
    const nd = new w.DOMParser().parseFromString(`<!doctype html><html><head></head><body>${html}</body></html>`, 'text/html');
    const e = new w.Event('astro:before-swap');
    e.newDocument = nd;
    d.dispatchEvent(e);
    d.body.replaceWith(d.adoptNode(nd.body));
  };
  const u = { id: '7', hash: 'h7' };
  swap(`<main>two</main><script type="application/json" data-hibira-live-chat-user>${scriptJSON(u)}</script>`);
  assert.equal(host.parentNode, d.body);
  assert.equal(d.querySelector('main').textContent, 'two');
  assert.deepEqual(calls, [['identify', u]]);
  swap(`<main>three</main><script type="application/json" data-hibira-live-chat-user>${scriptJSON(u)}</script>`);
  assert.deepEqual(calls.length, 1);
  swap('<main>four</main>');
  assert.deepEqual(calls[1], ['logout']);
  assert.equal(host.parentNode, d.body);
});
