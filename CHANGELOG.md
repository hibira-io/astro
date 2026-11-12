# Changelog

## 0.1.0

First release, for Astro 4, 5, 6 and 7.

- The `hibira()` integration adds Hibira Live Chat to every page (`liveChat`,
  or `PUBLIC_HIBIRA_LIVECHAT_WORKSPACE`) and sets up the realtime client
  (`realtime`, or `PUBLIC_HIBIRA_KEY`). The widget loads once and stays across
  view transitions.
- Components (`@hibira-io/astro/components`): `<LiveChat>` for single pages,
  `<LiveChatUser>` to sign visitors in on the server with
  `HIBIRA_LIVECHAT_IDENTITY_SECRET`, and `<LiveChatButton>`. Elements with
  `data-hibira-live-chat` and links to `#hibira-live-chat` open the chat.
- `@hibira-io/astro/realtime`: one shared pusher-js connection and `onEvent`,
  `onPresence`, `onConnectionState`, `trigger`, `onStream` (LLM streams, with
  channel history `rewind`), `onAgentStream` and `subscribe`.
- `@hibira-io/astro/server`: `channelAuth()` / `userAuth()` API route
  handlers, `streamToChannel()`, `liveChatUser()` and `liveChatUserHash()`.
