// The Astro integration: adds Hibira Live Chat to every page and sets up the
// realtime client that `@hibira-io/astro/realtime` hands out.
//
//   // astro.config.mjs
//   import hibira from '@hibira-io/astro';
//   export default defineConfig({
//     integrations: [hibira({ liveChat: 'ws_…', realtime: { key: 'pk_…' } })],
//   });
//
// Both read the environment when left out: PUBLIC_HIBIRA_LIVECHAT_WORKSPACE
// and PUBLIC_HIBIRA_KEY (from .env files too).

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIVECHAT_HOST, isWorkspace, liveChatAttributes, liveChatLoader } from './livechat.js';

export { LIVECHAT_HOST, isWorkspace, liveChatAttributes, liveChatLoader } from './livechat.js';

const NAME = '@hibira-io/astro';
const VIRTUAL = 'virtual:hibira/realtime';

/**
 * @param {object} [options]
 * @param {string|false|{ workspace?: string, color?: string, lang?: string, launcher?: boolean, host?: string }} [options.liveChat]
 *   the Live Chat workspace ID, or its options; false turns the widget off
 * @param {false|{ key?: string, options?: object, encrypted?: boolean }} [options.realtime]
 *   the Hibira app key and pusher-js options (JSON only); false turns it off
 */
export default function hibira(options = {}) {
  return {
    name: NAME,
    hooks: {
      'astro:config:setup': async ({ config, command, injectScript, updateConfig, logger }) => {
        const env = await readEnv(config.root, command === 'dev' ? 'development' : 'production');

        const lc = resolveLiveChat(options.liveChat, env);
        if (lc) {
          injectScript('head-inline', liveChatLoader({ attributes: liveChatAttributes(lc), host: lc.host }));
        } else if (options.liveChat !== false && options.liveChat !== undefined) {
          logger.warn('Live Chat is off: no workspace ID. Set liveChat: "ws_…" or PUBLIC_HIBIRA_LIVECHAT_WORKSPACE.');
        }

        const rt = resolveRealtime(options.realtime, env);
        const pusherModule = rt?.encrypted ? 'pusher-js/with-encryption' : 'pusher-js';
        updateConfig({
          vite: {
            plugins: [realtimePlugin(rt, pusherModule)],
            optimizeDeps: {
              exclude: [NAME],
              ...(rt ? { include: [pusherModule] } : {}),
            },
            ssr: { noExternal: [NAME] },
          },
        });
      },
    },
  };
}

/** Live Chat options from the integration's options and the environment, or null. */
export function resolveLiveChat(option, env = {}) {
  if (option === false) return null;
  const o = typeof option === 'string' ? { workspace: option } : { ...(option ?? {}) };
  o.workspace = o.workspace || env.PUBLIC_HIBIRA_LIVECHAT_WORKSPACE || '';
  if (!o.workspace) return null;
  if (!isWorkspace(o.workspace)) {
    throw new Error(`${NAME}: "${o.workspace}" is not a Live Chat workspace ID (ws_…). Copy it from Live Chat > Settings > Install.`);
  }
  o.host = o.host || env.PUBLIC_HIBIRA_LIVECHAT_HOST || LIVECHAT_HOST;
  return o;
}

/** Realtime options from the integration's options and the environment, or null. */
export function resolveRealtime(option, env = {}) {
  if (option === false) return null;
  const o = { ...(option ?? {}) };
  o.key = o.key || env.PUBLIC_HIBIRA_KEY || '';
  if (!o.key) return null;
  return { key: String(o.key), options: o.options ?? {}, encrypted: Boolean(o.encrypted) };
}

/** The source of virtual:hibira/realtime for these options. */
export function realtimeModule(rt, pusherModule = 'pusher-js') {
  if (!rt) return 'export default { appKey: null, options: null, Pusher: null };\n';
  return `import Pusher from ${JSON.stringify(pusherModule)};\nexport default { appKey: ${JSON.stringify(rt.key)}, options: ${JSON.stringify(rt.options ?? {})}, Pusher };\n`;
}

function realtimePlugin(rt, pusherModule) {
  const resolved = '\0' + VIRTUAL;
  return {
    name: 'hibira:realtime',
    resolveId(id) {
      if (id === VIRTUAL) return resolved;
    },
    load(id) {
      if (id === resolved) return realtimeModule(rt, pusherModule);
    },
  };
}

// .env, .env.local, .env.[mode], .env.[mode].local (later files win), the
// way Astro and Vite read them; process.env wins over all of them. Only our
// variables are read.
const KEYS = ['PUBLIC_HIBIRA_LIVECHAT_WORKSPACE', 'PUBLIC_HIBIRA_LIVECHAT_HOST', 'PUBLIC_HIBIRA_KEY'];

export async function readEnv(root, mode) {
  const dir = root instanceof URL ? fileURLToPath(root) : String(root ?? process.cwd());
  const env = {};
  for (const name of ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`]) {
    let text;
    try {
      text = await readFile(join(dir, name), 'utf8');
    } catch {
      continue;
    }
    Object.assign(env, parseEnv(text));
  }
  for (const k of KEYS) if (process.env[k]) env[k] = process.env[k];
  return env;
}

export function parseEnv(text) {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || !KEYS.includes(m[1])) continue;
    let v = m[2];
    const q = /^(['"`])(.*)\1$/.exec(v);
    if (q) v = q[2];
    else v = v.replace(/\s+#.*$/, '');
    out[m[1]] = v;
  }
  return out;
}
