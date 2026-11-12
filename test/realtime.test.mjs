import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakePusher } from './fake-pusher.mjs';
import { createRealtime } from '../realtime-core.js';

globalThis.window ??= globalThis;

test('one shared client, made from the key and Hibira defaults', () => {
  const made = [];
  class P {
    constructor(key, options) {
      made.push([key, options]);
      Object.assign(this, fakePusher());
    }
  }
  const rt = createRealtime({ appKey: 'pk_1', options: { cluster: 'x' }, Pusher: P });
  assert.equal(rt.getPusher(), rt.getPusher());
  assert.equal(made.length, 1);
  assert.equal(made[0][0], 'pk_1');
  assert.equal(made[0][1].wsHost, 'ws.hibira.io');
  assert.equal(made[0][1].cluster, 'x');
});

test('no key: warns once, helpers are no-ops', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const rt = createRealtime({});
  assert.equal(rt.getPusher(), null);
  assert.equal(rt.getPusher(), null);
  assert.equal(warn.mock.callCount(), 1);
  assert.equal(typeof rt.onEvent('a', 'b', () => {}), 'function');
  assert.equal(rt.subscribe('a'), null);
});

test('onEvent shares the channel and leaves it with the last user', () => {
  const p = fakePusher();
  const rt = createRealtime({ client: p });
  const got = [];
  const stop1 = rt.onEvent('orders', 'created', (d) => got.push(['1', d]));
  const stop2 = rt.onEvent('orders', 'created', (d) => got.push(['2', d]));
  assert.deepEqual(p.log.filter((l) => l[0] === 'subscribe'), [['subscribe', 'orders']]);
  p.channel('orders').emit('created', { id: 1 });
  assert.deepEqual(got, [['1', { id: 1 }], ['2', { id: 1 }]]);
  stop1();
  stop1();
  assert.equal(p.channel('orders') != null, true);
  stop2();
  assert.deepEqual(p.log.at(-1), ['unsubscribe', 'orders']);
});

test('onPresence reports members, you first', () => {
  const p = fakePusher();
  const rt = createRealtime({ client: p });
  const states = [];
  const stop = rt.onPresence('presence-room', (s) => states.push(s));
  p.succeed('presence-room', { a: { name: 'Ann' }, b: { name: 'Bo' } }, 'b');
  assert.deepEqual(states.at(-1).members.map((m) => m.id), ['b', 'a']);
  assert.equal(states.at(-1).me.id, 'b');
  assert.equal(states.at(-1).count, 2);
  p.join('presence-room', 'c', { name: 'Cy' });
  assert.deepEqual(states.at(-1).others.map((m) => m.id), ['a', 'c']);
  stop();
});

test('onConnectionState gives the state now and on changes', () => {
  const p = fakePusher();
  const rt = createRealtime({ client: p });
  const got = [];
  const stop = rt.onConnectionState((s) => got.push(s));
  p.setState('connected');
  stop();
  p.setState('disconnected');
  assert.deepEqual(got, ['connecting', 'connected']);
});

test('trigger waits for the subscription', async () => {
  const p = fakePusher();
  const rt = createRealtime({ client: p });
  const sent = rt.trigger('private-x', 'client-typing', { a: 1 });
  const ch = p.channel('private-x');
  ch.trigger = (ev, data) => {
    ch.sent.push([ev, data]);
    return true;
  };
  p.succeed('private-x');
  assert.equal(await sent, true);
  assert.deepEqual(ch.sent, [['client-typing', { a: 1 }]]);
});

test('onStream puts streamed text back together', () => {
  const p = fakePusher();
  const rt = createRealtime({ client: p });
  const got = [];
  const stop = rt.onStream('ai', (s) => got.push(s));
  const ch = p.channel('ai');
  ch.emit('ai-stream', { id: 's1', seq: 0, delta: 'Hel', meta: { model: 'm' } });
  ch.emit('ai-stream', { id: 's1', seq: 2, done: true });
  ch.emit('ai-stream', { id: 's1', seq: 1, delta: 'lo' });
  const last = got.at(-1);
  assert.equal(last.text, 'Hello');
  assert.equal(last.done, true);
  assert.deepEqual(last.meta, { model: 'm' });
  stop();
  assert.deepEqual(p.log.at(-1), ['unsubscribe', 'ai']);
});

test('onStream with rewind asks channel history', () => {
  const p = fakePusher();
  const rt = createRealtime({ client: p });
  const stop = rt.onStream('ai', () => {}, { rewind: true });
  p.succeed('ai');
  assert.deepEqual(p.log.find((l) => l[0] === 'send_event').slice(1, 3), ['pusher:rewind', { channel: 'ai', seconds: 300 }]);
  stop();
});

test('onAgentStream follows Laravel AI SDK events', () => {
  const p = fakePusher();
  const rt = createRealtime({ client: p });
  const got = [];
  const stop = rt.onAgentStream('private-agent', (s) => got.push(s));
  const ch = p.channel('private-agent');
  ch.emit('stream_start', { id: 'e1', invocation_id: 'r1' });
  ch.emit('text_delta', { id: 'e2', invocation_id: 'r1', delta: 'Hi' });
  assert.equal(got.at(-1).text, 'Hi');
  assert.equal(got.at(-1).status, 'streaming');
  stop();
});

test('a channel object is used as is and never left', () => {
  const p = fakePusher();
  const rt = createRealtime({ client: p });
  const ch = p.subscribe('mine');
  const stop = rt.onEvent(ch, 'x', () => {});
  stop();
  assert.equal(p.log.filter((l) => l[0] === 'unsubscribe').length, 0);
});
