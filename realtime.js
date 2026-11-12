// @hibira-io/astro/realtime: the shared pusher-js client and helpers, set up
// from hibira({ realtime }) in astro.config. Import it in a <script> (or an
// island); on the server every helper is a no-op.
//
//   <script>
//     import { onEvent } from '@hibira-io/astro/realtime';
//     onEvent('orders', 'created', (order) => { ... });
//   </script>

import config from 'virtual:hibira/realtime';
import { createRealtime } from './realtime-core.js';

export { HIBIRA_DEFAULTS, hibiraOptions } from './client.js';
export { STREAM_EVENT } from './stream.js';

const realtime = createRealtime(config);

export const { getPusher, subscribe, onEvent, onPresence, onConnectionState, trigger, onStream, onAgentStream, disconnect } = realtime;
