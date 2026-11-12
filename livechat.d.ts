/** https://chat.hibira.io */
export const LIVECHAT_HOST: string;

export interface LiveChatOptions {
  /** ws_… from Live Chat > Settings > Install. */
  workspace: string;
  /** Widget colour, #rgb … #rrggbbaa; default the colour set in Live Chat. */
  color?: string;
  /** "en", "zh-TW", "ja", …; default the visitor's browser language. */
  lang?: string;
  /** false leaves out the round button: open the chat with a <LiveChatButton> or a link to #hibira-live-chat. Default true. */
  launcher?: boolean;
}

/** A signed-in visitor as the widget takes it. */
export interface LiveChatIdentity {
  id: string;
  /** liveChatUserHash(secret, id) */
  hash: string;
  name?: string;
  email?: string;
}

/** Your user: what liveChatUser() and <LiveChatUser> take. */
export interface LiveChatUserInput {
  id: string | number;
  name?: string | null;
  email?: string | null;
}

/** Whether s looks like a workspace ID (ws_…). */
export function isWorkspace(s: unknown): s is string;

/** The widget's data- attributes. Throws on a bad workspace ID. */
export function liveChatAttributes(options: LiveChatOptions & { user?: LiveChatIdentity | null }): Record<string, string>;

/** data-user-* attributes of a signed-in visitor, or {}. */
export function userAttributes(user?: Partial<LiveChatIdentity> | null): Record<string, string>;

/** hex(HMAC-SHA256(identity secret, user id)). Server only. */
export function liveChatUserHash(secret: string, id: string | number): Promise<string>;

/** `{ id, hash, name, email }` for the widget, or null without a user id or secret. Server only. */
export function liveChatUser(user: LiveChatUserInput | null | undefined, secret: string | null | undefined): Promise<LiveChatIdentity | null>;

/** JSON safe inside an inline <script>. */
export function scriptJSON(value: unknown): string;

/** The inline script that loads the widget once per page load. */
export function liveChatLoader(options: { attributes: Record<string, string>; host?: string }): string;
