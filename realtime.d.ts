import type { Realtime } from './realtime-core.js';

export { HIBIRA_DEFAULTS, hibiraOptions } from './client.js';
export type { Member } from './client.js';
export { STREAM_EVENT } from './stream.js';
export type { Stop, Target, Held, PresenceState, StreamState, AgentStreamState, ConnectionState, Realtime } from './realtime-core.js';

export const getPusher: Realtime['getPusher'];
export const subscribe: Realtime['subscribe'];
export const onEvent: Realtime['onEvent'];
export const onPresence: Realtime['onPresence'];
export const onConnectionState: Realtime['onConnectionState'];
export const trigger: Realtime['trigger'];
export const onStream: Realtime['onStream'];
export const onAgentStream: Realtime['onAgentStream'];
export const disconnect: Realtime['disconnect'];
