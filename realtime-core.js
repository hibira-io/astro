// Framework-free realtime helpers for Astro pages: one shared pusher-js
// client, reference-counted channels, and callbacks for events, presence,
// connection state and LLM streams. Every on*() returns a function that
// stops it. `@hibira-io/astro/realtime` is this, made from the integration's
// settings.

import { acquireChannel, hibiraOptions, presenceMembers, releaseChannel } from './client.js';
import { STREAM_EVENT, createStreamStore, followStream, latestStream } from './stream.js';
import { AGENT_EVENTS, createAgentStore, latestRun } from './agent.js';

const PRESENCE_EVENTS = ['pusher:subscription_succeeded', 'pusher:member_added', 'pusher:member_removed'];

/**
 * @param {object} config
 * @param {string|null} [config.appKey] app key from the Hibira portal
 * @param {object} [config.options] pusher-js options, merged over HIBIRA_DEFAULTS
 * @param {Function|null} [config.Pusher] the pusher-js class
 * @param {object|(() => object)} [config.client] an existing pusher-js client to use instead
 */
export function createRealtime({ appKey = null, options, Pusher = null, client = null } = {}) {
  let pusher = null;
  let warned = false;

  function getPusher() {
    if (pusher) return pusher;
    if (typeof window === 'undefined') return null;
    if (client) pusher = typeof client === 'function' ? client() : client;
    else if (appKey && Pusher) pusher = new Pusher(appKey, hibiraOptions(options));
    else if (!warned) {
      warned = true;
      console.warn('@hibira-io/astro: no Hibira app key, so nothing connects. Set PUBLIC_HIBIRA_KEY or hibira({ realtime: { key } }) in astro.config, and install pusher-js.');
    }
    return pusher;
  }

  // A channel name is subscribed (shared, counted); a channel object is used as is.
  function hold(target) {
    if (target && typeof target === 'object' && typeof target.bind === 'function') return { channel: target, release() {} };
    const p = getPusher();
    if (!p || typeof target !== 'string' || !target) return null;
    const channel = acquireChannel(p, target);
    let held = true;
    return {
      channel,
      release() {
        if (!held) return;
        held = false;
        releaseChannel(p, target);
      },
    };
  }

  /**
   * Subscribes to a channel, shared with every other user of the same name.
   * `release()` lets go; the channel is left when the last user does.
   * Null on the server or without a client.
   */
  function subscribe(name) {
    return hold(name);
  }

  /** Calls handler(data, metadata) for each `event` on a channel. */
  function onEvent(target, event, handler) {
    const h = hold(target);
    if (!h) return () => {};
    const fn = (data, metadata) => handler(data, metadata);
    h.channel.bind(event, fn);
    return once(() => {
      h.channel.unbind(event, fn);
      h.release();
    });
  }

  /**
   * Calls cb({ members, others, me, count, channel }) each time a presence
   * channel's members change. Members are [{ id, info, me }], you first.
   */
  function onPresence(target, cb) {
    const h = hold(target);
    if (!h) return () => {};
    const ch = h.channel;
    const update = () => {
      const members = presenceMembers(ch);
      cb({ channel: ch, members, others: members.filter((m) => !m.me), me: members.find((m) => m.me) ?? null, count: members.length });
    };
    for (const ev of PRESENCE_EVENTS) ch.bind(ev, update);
    if (ch.subscribed) update();
    return once(() => {
      for (const ev of PRESENCE_EVENTS) ch.unbind(ev, update);
      h.release();
    });
  }

  /**
   * Calls cb(state) now and on each change: "initialized", "connecting",
   * "connected", "unavailable", "failed" or "disconnected".
   */
  function onConnectionState(cb) {
    const p = getPusher();
    if (!p) return () => {};
    const fn = ({ current }) => cb(current);
    p.connection.bind('state_change', fn);
    cb(p.connection.state);
    return once(() => p.connection.unbind('state_change', fn));
  }

  /**
   * Sends a client event (client-…) on a private or presence channel once it
   * is subscribed. Turn on client events for the app first. Returns a
   * promise of true when sent, false when pusher-js refused it.
   */
  function trigger(target, event, data) {
    const h = hold(target);
    if (!h) return Promise.resolve(false);
    const ch = h.channel;
    return new Promise((resolve) => {
      const send = () => {
        ch.unbind('pusher:subscription_succeeded', send);
        const ok = ch.trigger(event, data);
        h.release();
        resolve(ok !== false);
      };
      if (ch.subscribed) send();
      else ch.bind('pusher:subscription_succeeded', send);
    });
  }

  /**
   * Follows the LLM streams streamToChannel() sends on a channel. Calls
   * cb({ text, done, error, incomplete, meta, stream, streams, history })
   * on each change, for the latest stream (or the one with `id`).
   *
   * @param {object} [o]
   * @param {string} [o.event="ai-stream"]
   * @param {string} [o.id] follow only this stream
   * @param {number} [o.maxStreams=50]
   * @param {boolean|object} [o.rewind] catch up from channel history: true, or { seconds = 300, limit, timeout = 5000 }
   */
  function onStream(target, cb, { event = STREAM_EVENT, id, maxStreams = 50, rewind } = {}) {
    const h = hold(target);
    if (!h) return () => {};
    let history = null;
    const emit = (streams) => {
      const stream = id != null ? streams[String(id)] ?? null : latestStream(streams);
      cb({
        stream,
        streams,
        text: stream?.text ?? '',
        done: stream?.done ?? false,
        error: stream?.error ?? null,
        incomplete: stream?.incomplete ?? false,
        meta: stream?.meta ?? null,
        history,
      });
    };
    const store = createStreamStore((streams) => emit(streams), { maxStreams });
    const stop = followStream(h.channel, {
      event,
      client: h.channel.pusher ?? pusher,
      rewind,
      onHistory: (result) => {
        history = result;
        emit(store.streams);
      },
      apply: (payload) => {
        if (id != null && String(payload?.id) !== String(id)) return;
        store.apply(payload);
      },
    });
    return once(() => {
      stop();
      h.release();
    });
  }

  /**
   * Follows a Laravel AI SDK agent's stream (laravel/ai broadcastOnQueue()
   * and friends). Calls cb({ text, reasoning, status, done, error,
   * toolCalls, approvals, run, runs, history }) on each change.
   */
  function onAgentStream(target, cb, { invocationId, maxRuns = 20, rewind, events } = {}) {
    const h = hold(target);
    if (!h) return () => {};
    let history = null;
    const emit = (runs) => {
      const run = invocationId != null ? runs[String(invocationId)] ?? null : latestRun(runs);
      cb({
        run,
        runs,
        text: run?.text ?? '',
        reasoning: run?.reasoning ?? '',
        status: run?.status ?? 'idle',
        done: run?.done ?? false,
        error: run?.error ?? null,
        toolCalls: run?.toolCalls ?? [],
        approvals: run?.approvals ?? [],
        history,
      });
    };
    const store = createAgentStore((runs) => emit(runs), { maxRuns });
    const stop = followStream(h.channel, {
      event: events?.length ? [...AGENT_EVENTS, ...events] : AGENT_EVENTS,
      client: h.channel.pusher ?? pusher,
      rewind,
      onHistory: (result) => {
        history = result;
        emit(store.runs);
      },
      apply: (payload, name) => store.apply(payload, name),
    });
    return once(() => {
      stop();
      h.release();
    });
  }

  /** Disconnects a client this made (not one passed as `client`). */
  function disconnect() {
    if (pusher && !client) pusher.disconnect();
    pusher = null;
  }

  return { getPusher, subscribe, onEvent, onPresence, onConnectionState, trigger, onStream, onAgentStream, disconnect };
}

function once(fn) {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    fn();
  };
}
