import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import hibira, { realtimeModule, resolveLiveChat, resolveRealtime } from '../index.js';

async function setup(options, env = '') {
  const root = mkdtempSync(join(tmpdir(), 'hibira-astro-'));
  if (env) writeFileSync(join(root, '.env'), env);
  const scripts = [];
  const configs = [];
  const warnings = [];
  const integration = hibira(options);
  await integration.hooks['astro:config:setup']({
    config: { root: pathToFileURL(root + '/') },
    command: 'build',
    injectScript: (stage, code) => scripts.push([stage, code]),
    updateConfig: (c) => configs.push(c),
    logger: { warn: (m) => warnings.push(m), info() {} },
  });
  const plugin = configs[0].vite.plugins[0];
  const id = plugin.resolveId('virtual:hibira/realtime');
  return { integration, scripts, vite: configs[0].vite, virtual: plugin.load(id), warnings };
}

test('name and hooks', () => {
  const i = hibira();
  assert.equal(i.name, '@hibira-io/astro');
  assert.equal(typeof i.hooks['astro:config:setup'], 'function');
});

test('liveChat as a string adds the loader to every page', async () => {
  const { scripts, virtual, vite } = await setup({ liveChat: 'ws_abc' });
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0][0], 'head-inline');
  assert.match(scripts[0][1], /"data-workspace":"ws_abc"/);
  assert.match(scripts[0][1], /https:\/\/chat\.hibira\.io\/w\/v1\.js/);
  assert.match(virtual, /appKey: null/);
  assert.deepEqual(vite.optimizeDeps.exclude, ['@hibira-io/astro']);
  assert.equal(vite.optimizeDeps.include, undefined);
  assert.deepEqual(vite.ssr.noExternal, ['@hibira-io/astro']);
});

test('settings come from .env when left out', async () => {
  const { scripts, virtual, vite } = await setup({}, 'PUBLIC_HIBIRA_LIVECHAT_WORKSPACE=ws_env\nPUBLIC_HIBIRA_KEY=pk_env\n');
  assert.match(scripts[0][1], /"data-workspace":"ws_env"/);
  assert.match(virtual, /import Pusher from "pusher-js"/);
  assert.match(virtual, /appKey: "pk_env"/);
  assert.deepEqual(vite.optimizeDeps.include, ['pusher-js']);
});

test('false turns each off, even with the environment set', async () => {
  const { scripts, virtual } = await setup({ liveChat: false, realtime: false }, 'PUBLIC_HIBIRA_LIVECHAT_WORKSPACE=ws_env\nPUBLIC_HIBIRA_KEY=pk_env\n');
  assert.equal(scripts.length, 0);
  assert.match(virtual, /appKey: null/);
});

test('encrypted realtime uses pusher-js/with-encryption', async () => {
  const { virtual, vite } = await setup({ realtime: { key: 'pk_1', encrypted: true, options: { channelAuthorization: { endpoint: '/api/auth', transport: 'ajax' } } } });
  assert.match(virtual, /from "pusher-js\/with-encryption"/);
  assert.match(virtual, /"endpoint":"\/api\/auth"/);
  assert.deepEqual(vite.optimizeDeps.include, ['pusher-js/with-encryption']);
});

test('liveChat options without a workspace warn', async () => {
  const { scripts, warnings } = await setup({ liveChat: { color: '#000' } });
  assert.equal(scripts.length, 0);
  assert.match(warnings[0], /no workspace ID/);
});

test('a bad workspace ID fails the build', async () => {
  await assert.rejects(setup({ liveChat: 'abc' }), /not a Live Chat workspace ID/);
});

test('resolvers', () => {
  assert.equal(resolveLiveChat(undefined, {}), null);
  assert.deepEqual(resolveLiveChat({ workspace: 'ws_a', launcher: false }, {}), { workspace: 'ws_a', launcher: false, host: 'https://chat.hibira.io' });
  assert.equal(resolveLiveChat('ws_a', { PUBLIC_HIBIRA_LIVECHAT_HOST: 'http://localhost:8080' }).host, 'http://localhost:8080');
  assert.equal(resolveRealtime({}, {}), null);
  assert.deepEqual(resolveRealtime({ key: 'pk' }, {}), { key: 'pk', options: {}, encrypted: false });
  assert.equal(realtimeModule(null), 'export default { appKey: null, options: null, Pusher: null };\n');
});

test('parseEnv reads our variables only', async () => {
  const { parseEnv } = await import('../index.js');
  assert.deepEqual(parseEnv('# c\nPUBLIC_HIBIRA_KEY="pk_q"\nexport PUBLIC_HIBIRA_LIVECHAT_WORKSPACE=ws_x # note\nOTHER=1\n'), {
    PUBLIC_HIBIRA_KEY: 'pk_q',
    PUBLIC_HIBIRA_LIVECHAT_WORKSPACE: 'ws_x',
  });
});

test('.env.production overrides .env on build', async () => {
  const root = mkdtempSync(join(tmpdir(), 'hibira-astro-'));
  writeFileSync(join(root, '.env'), 'PUBLIC_HIBIRA_KEY=pk_a\n');
  writeFileSync(join(root, '.env.production'), 'PUBLIC_HIBIRA_KEY=pk_b\n');
  const { readEnv } = await import('../index.js');
  assert.equal((await readEnv(pathToFileURL(root + '/'), 'production')).PUBLIC_HIBIRA_KEY, 'pk_b');
  assert.equal((await readEnv(root, 'development')).PUBLIC_HIBIRA_KEY, 'pk_a');
});
