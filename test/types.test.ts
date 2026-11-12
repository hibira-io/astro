// Compiled by `npm run typecheck`, never run.
import { defineConfig } from 'astro/config';
import hibira, { liveChatAttributes, resolveLiveChat } from '@hibira-io/astro';
import { getPusher, onEvent, onPresence, onStream, onAgentStream, onConnectionState, trigger, subscribe } from '@hibira-io/astro/realtime';
import { channelAuth, userAuth, streamToChannel, liveChatUserHash, liveChatUser } from '@hibira-io/astro/server';
import { createRealtime } from '@hibira-io/astro/core';
import Pusher from 'pusher';

defineConfig({
  integrations: [
    hibira(),
    hibira({ liveChat: 'ws_x', realtime: { key: 'pk', encrypted: true, options: { channelAuthorization: { endpoint: '/a', transport: 'ajax' } } } }),
    hibira({ liveChat: { workspace: 'ws_x', color: '#000', launcher: false }, realtime: false }),
  ],
});

const attrs: Record<string, string> = liveChatAttributes({ workspace: 'ws_x' });
const lc = resolveLiveChat('ws_x');
if (lc) lc.host.toUpperCase();

const p = getPusher();
p?.connection.state;
const stop: () => void = onEvent<{ id: string }>('orders', 'created', (o) => o.id.toUpperCase());
onPresence<{ name: string }>('presence-room', ({ members, me, count }) => members.map((m) => m.info?.name) && me?.id && count);
onStream('ai', ({ text, done, history }) => text + done + history?.error, { rewind: { seconds: 60 } });
onAgentStream('private-agent', ({ status, toolCalls }) => status + toolCalls.length);
onConnectionState((s) => s === 'connected');
const sent: Promise<boolean> = trigger('private-x', 'client-typing', {});
subscribe('x')?.release();
createRealtime({ appKey: 'k' }).disconnect();

const pusher = new Pusher({ appId: '1', key: 'k', secret: 's', cluster: 'x' });
export const POST = channelAuth(pusher, (_ctx, { channelName }) => channelName.startsWith('presence-') ? { user_id: 1, user_info: {} } : true);
export const PUT = userAuth(pusher, () => ({ id: 1, name: 'Ann' }));
streamToChannel(pusher, 'ai', ['a', 'b']);
liveChatUserHash('s', 1).then((h: string) => h);
liveChatUser({ id: 1, email: null }, 's').then((u) => u?.hash);
void [attrs, stop, sent];
