# @hibira-io/astro

[Hibira](https://hibira.io) for [Astro](https://astro.build): put **Hibira Live Chat** on every page with one line in `astro.config`, sign visitors in from your server, and use **realtime** channels, presence and LLM token streaming from page scripts. Works with `astro dev`, static and on-demand builds, and view transitions (`<ClientRouter />`). Astro 4, 5, 6 and 7.

```sh
npx astro add @hibira-io/astro
# or
npm install @hibira-io/astro
npm install pusher-js        # only for realtime
```

## Live Chat on every page

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import hibira from '@hibira-io/astro';

export default defineConfig({
  integrations: [hibira({ liveChat: 'ws_…' })],
});
```

The workspace ID is in Live Chat > Settings > Install. Leave it out and set `PUBLIC_HIBIRA_LIVECHAT_WORKSPACE` in `.env` instead. Add your site's address to the workspace's allowed sites.

Options:

```js
hibira({
  liveChat: {
    workspace: 'ws_…',
    color: '#e5484d',   // default: the colour set in Live Chat
    lang: 'ja',         // default: the visitor's browser language
    launcher: false,    // no round button; open it from your own buttons
  },
});
```

The widget loads once and stays open across view transitions.

### Open it from your own buttons

```astro
---
import { LiveChatButton } from '@hibira-io/astro/components';
---
<LiveChatButton class="btn">Chat with us</LiveChatButton>
<LiveChatButton topic="sales">Talk to sales</LiveChatButton>
```

Any element with `data-hibira-live-chat` and any link to `#hibira-live-chat` opens it too (handy in Markdown and menus). `data-topic="sales"` marks a new conversation as a sales inquiry. From a script: `window.HibiraLiveChat.open()`.

### Signed-in visitors

On sites with accounts, tell Live Chat who the visitor is. Their conversations follow them across browsers and devices, and your team sees their name and email. Put `<LiveChatUser>` in your layout; it renders only for a signed-in user:

```astro
---
import { LiveChatUser } from '@hibira-io/astro/components';
const user = Astro.locals.user; // however your site knows
---
<LiveChatUser user={user && { id: user.id, name: user.name, email: user.email }} />
```

It signs the user ID on the server with `HIBIRA_LIVECHAT_IDENTITY_SECRET` (Live Chat > Settings > Install > Verified visitors), which never reaches the browser. Signing in or out on a later page, with or without view transitions, switches the chat to that user. This needs pages rendered on demand (an adapter and `export const prerender = false`, or `output: 'server'`). For your own markup, `liveChatUser()` and `liveChatUserHash()` are in `@hibira-io/astro/server`.

### Only on some pages

Without `liveChat` in the integration, add the component to the pages or layout that should have the chat:

```astro
---
import { LiveChat } from '@hibira-io/astro/components';
---
<LiveChat workspace="ws_…" user={Astro.locals.user} />
```

## Realtime

```js
// astro.config.mjs
hibira({
  realtime: {
    key: 'pk_…', // or PUBLIC_HIBIRA_KEY
    options: { channelAuthorization: { endpoint: '/api/hibira/auth', transport: 'ajax' } },
  },
});
```

Then, in any `<script>` (or island):

```astro
<p>Status: <span id="state"></span></p>
<script>
  import { onConnectionState, onEvent, onPresence, onStream } from '@hibira-io/astro/realtime';

  onConnectionState((s) => (document.getElementById('state').textContent = s));
  onEvent('orders', 'created', (order) => console.log(order));
  onPresence('presence-room', ({ members, me, count }) => console.log(count));
  onStream('private-ai.42', ({ text, done }) => console.log(text, done), { rewind: true });
</script>
```

One connection is shared by the whole site and survives view transitions. Channels are shared and reference-counted: every `on…()` returns a function that stops it, and the channel is left when the last user stops.

| Function | What it does |
| --- | --- |
| `getPusher()` | The pusher-js client (null on the server). Pass it to `@hibira-io/react`, `vue` or `svelte` in islands. |
| `onEvent(channel, event, fn)` | `fn(data, metadata)` for each event. |
| `onPresence(channel, fn)` | `fn({ members, others, me, count })`, you first. |
| `onConnectionState(fn)` | `connecting`, `connected`, `unavailable`, … |
| `trigger(channel, 'client-…', data)` | A client event once subscribed (turn client events on for the app). |
| `onStream(channel, fn, { rewind })` | LLM streams sent with `streamToChannel()`, put back together. |
| `onAgentStream(channel, fn)` | Laravel AI SDK agent streams (`hibira-io/laravel`). |
| `subscribe(name)` | `{ channel, release() }` for anything else. |

`options` are pusher-js options merged over Hibira's (`wsHost: 'ws.hibira.io'`, TLS). They are written into the page, so JSON only. `encrypted: true` uses `pusher-js/with-encryption` for `private-encrypted-` channels. Any Pusher-compatible server works: set `wsHost`, `wsPort` and `forceTLS`.

### Private and presence channels

An API route signs channel subscriptions with the `pusher` package:

```js
// src/pages/api/hibira/auth.js
import Pusher from 'pusher';
import { channelAuth } from '@hibira-io/astro/server';

export const prerender = false;

const pusher = new Pusher({
  appId: import.meta.env.HIBIRA_APP_ID,
  key: import.meta.env.PUBLIC_HIBIRA_KEY,
  secret: import.meta.env.HIBIRA_SECRET,
  host: 'ws.hibira.io', // the host shown on your app page
  useTLS: true,
});

export const POST = channelAuth(pusher, ({ locals }, { channelName }) => {
  const user = locals.user;
  if (!user) return false;                                   // 403
  if (channelName.startsWith('presence-')) return { user_id: user.id, user_info: { name: user.name } };
  return channelName === `private-user.${user.id}`;
});
```

`userAuth()` does the same for `pusher.signin()`. Astro 5.14 and later read the request's host only for domains listed in `security.allowedDomains`. When your site runs behind a proxy, list your domain there, or Astro's same-origin check refuses pusher-js's POST with 403.

### Streaming LLM answers

```js
// src/pages/api/ask.js
import { streamToChannel } from '@hibira-io/astro/server';

export const POST = async ({ request, locals }) => {
  const { question } = await request.json();
  const stream = await anthropic.messages.stream({ model, max_tokens: 1024, messages: [{ role: 'user', content: question }] });
  const result = await streamToChannel(pusher, `private-ai.${locals.user.id}`, stream);
  return Response.json({ id: result.id });
};
```

Tokens go out in batches (every 100 ms, under 3,500 bytes), and `onStream()` puts them back in order. With channel history on and `{ rewind: true }`, a page reloaded halfway through an answer picks the whole answer up again. `textOf()` understands Anthropic, OpenAI, Gemini and Vercel AI SDK streams.

## Environment variables

| Variable | Used for |
| --- | --- |
| `PUBLIC_HIBIRA_LIVECHAT_WORKSPACE` | Live Chat workspace ID, when `liveChat` is left out |
| `HIBIRA_LIVECHAT_IDENTITY_SECRET` | Signing visitors in (server only) |
| `PUBLIC_HIBIRA_KEY` | Realtime app key, when `realtime.key` is left out |

`liveChat: false` or `realtime: false` turns either off even when the variable is set.

## 中文摘要

`@hibira-io/astro` 是 Hibira 的 Astro 整合套件。在 `astro.config` 加一行 `hibira({ liveChat: 'ws_…' })`，每一页就有 Hibira Live Chat；`<LiveChatUser>` 在伺服器端用識別密鑰簽署已登入的訪客，密鑰不會送到瀏覽器；`<LiveChatButton>` 或連到 `#hibira-live-chat` 的連結可以打開對話。使用 view transitions 時聊天視窗跨頁保留。`@hibira-io/astro/realtime` 提供整站共用的連線，以及事件、presence、連線狀態、client events 和 LLM 串流（`onStream`，可配合頻道歷史 `rewind`）；`@hibira-io/astro/server` 提供頻道授權的 API route 處理器和 `streamToChannel()`。支援 Astro 4 到 7。

## License

MIT
