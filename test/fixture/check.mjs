// Drives the built fixture in Chromium: the Live Chat widget (served from
// WIDGET_FILE in place of https://chat.hibira.io/w/v1.js), signed-in
// visitors, view transitions, and realtime against a Pusher-compatible
// server (HIBIRA_WS_HOST/PORT; HIBIRA_APP_ID, PUBLIC_HIBIRA_KEY, HIBIRA_SECRET).
//
//   BASE=http://127.0.0.1:4329 WIDGET_FILE=v1.js node check.mjs
//
// Without WIDGET_FILE a stand-in script is served and only the loader is checked.
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import Pusher from 'pusher';

const base = process.env.BASE ?? 'http://127.0.0.1:4329';
const widget = process.env.WIDGET_FILE ? readFileSync(process.env.WIDGET_FILE, 'utf8') : null;
const shots = process.env.SHOTS;
const server = new Pusher({
  appId: process.env.HIBIRA_APP_ID ?? 'ci-app',
  key: process.env.PUBLIC_HIBIRA_KEY ?? 'ci-key',
  secret: process.env.HIBIRA_SECRET ?? 'ci-secret-0123456789',
  host: process.env.HIBIRA_WS_HOST ?? '127.0.0.1',
  port: process.env.HIBIRA_WS_PORT ?? '8090',
  useTLS: false,
});

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const widgetRequests = [];
await page.route('https://chat.hibira.io/**', (route) => {
  const url = route.request().url();
  if (url.endsWith('/w/v1.js')) {
    widgetRequests.push(url);
    if (widget) return route.fulfill({ contentType: 'text/javascript', body: widget });
    return route.fulfill({ contentType: 'text/javascript', body: 'window.__fakeWidget=document.currentScript.dataset;' });
  }
  return route.fulfill({ status: 503, body: '{}', contentType: 'application/json' });
});

// 1. Signed-in visitor: the widget script carries the workspace, colour and the visitor.
await page.goto(`${base}/?user=ann`);
await page.waitForFunction(() => window.HibiraLiveChat || window.__fakeWidget);
const attrs = await page.evaluate(() => {
  const s = document.querySelector('script[src$="/w/v1.js"]');
  return Object.fromEntries([...s.attributes].map((a) => [a.name, a.value]));
});
assert.equal(attrs['data-workspace'], 'ws_fixture');
assert.equal(attrs['data-color'], '#e5484d');
assert.equal(attrs['data-user-id'], 'ann');
assert.equal(attrs['data-user-name'], 'Ann');
assert.equal(attrs['data-user-hash'], createHmac('sha256', 'lcid_fixture_secret').update('ann').digest('hex'));
console.log('widget attributes ok');

// 2. Realtime: connected, a server event, presence through the auth route, an LLM stream.
await page.waitForFunction(() => document.getElementById('state').textContent === 'connected', null, { timeout: 10000 });
await page.waitForTimeout(500);
await server.trigger('orders', 'created', { id: 'A-1001' });
await page.waitForFunction(() => document.getElementById('order').textContent === 'A-1001');
await page.waitForFunction(() => document.getElementById('room').textContent === 'ann');
const res = await page.evaluate(() => fetch('/api/stream', { method: 'POST' }).then((r) => r.json()));
assert.equal(res.text, 'Hello from Astro');
await page.waitForFunction(() => document.getElementById('answer').textContent === 'Hello from Astro [done]');
console.log('realtime ok');

if (widget) {
  // 3. The real widget: its host is on the page, the button opens the panel.
  await page.waitForFunction(() => document.querySelector('body > .hibira-cb-ui'));
  await page.click('#talk');
  await page.waitForTimeout(400);
  if (shots) await page.screenshot({ path: `${shots}/open-desktop.png` });
  const open = await page.evaluate(() => {
    const host = document.querySelector('body > .hibira-cb-ui');
    return !!host.shadowRoot.querySelector('.on');
  });
  assert.equal(open, true, 'panel opens from <LiveChatButton>');
  console.log('button opens the chat ok');

  // 4. View transition: the widget stays (same host element, still open) and
  // the realtime connection is kept.
  const before = await page.evaluate(() => (window.__host = document.querySelector('body > .hibira-cb-ui'), window.__p = performance.getEntriesByType('navigation').length));
  await page.click('#about');
  await page.waitForFunction(() => document.getElementById('page').textContent === 'About');
  const kept = await page.evaluate(() => document.querySelector('body > .hibira-cb-ui') === window.__host && document.querySelectorAll('body > .hibira-cb-ui').length >= 1);
  assert.equal(kept, true, 'widget kept across the view transition');
  assert.equal(widgetRequests.length, 1, 'widget loaded once');
  console.log('view transition keeps the widget ok');

  // 5. Signing out on the next page tells the widget.
  await page.evaluate(() => {
    window.__calls = [];
    const lc = window.HibiraLiveChat;
    for (const k of ['identify', 'logout']) {
      const fn = lc[k];
      lc[k] = (...a) => (window.__calls.push(k), fn(...a));
    }
  });
  await page.click('#about-anon');
  await page.waitForFunction(() => location.search === '');
  await page.waitForFunction(() => window.__calls.length > 0);
  assert.deepEqual(await page.evaluate(() => window.__calls), ['logout']);
  console.log('sign-out across a view transition ok');
}

// 6. Static page loads for a visitor who is not signed in.
const p2 = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
await p2.route('https://chat.hibira.io/**', (route) =>
  route.request().url().endsWith('/w/v1.js') && widget ? route.fulfill({ contentType: 'text/javascript', body: widget }) : route.fulfill({ status: 503, body: '{}' }),
);
await p2.goto(`${base}/about`);
await p2.waitForFunction(() => document.querySelector('script[src$="/w/v1.js"]'));
assert.equal(await p2.evaluate(() => document.querySelector('script[src$="/w/v1.js"]').hasAttribute('data-user-id')), false);
if (shots && widget) {
  await p2.waitForTimeout(800);
  await p2.screenshot({ path: `${shots}/launcher-mobile-dark.png` });
}
console.log('anonymous visitor ok');

assert.deepEqual(errors, []);
await browser.close();
console.log('all checks passed');
