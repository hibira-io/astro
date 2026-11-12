import type { LiveChatOptions, LiveChatUserInput } from '../livechat.js';

type Component<Props> = (props: Props) => any;

export interface LiveChatProps extends Partial<LiveChatOptions> {
  /** Live Chat origin; default https://chat.hibira.io. */
  host?: string;
  /** Signs the visitor in; needs HIBIRA_LIVECHAT_IDENTITY_SECRET or `secret`. */
  user?: LiveChatUserInput | null;
  /** The identity secret (lcid_…); default HIBIRA_LIVECHAT_IDENTITY_SECRET. Server only. */
  secret?: string;
}

export interface LiveChatUserProps {
  user?: LiveChatUserInput | null;
  secret?: string;
}

export interface LiveChatButtonProps {
  /** "sales" marks a new conversation as a sales inquiry. */
  topic?: 'sales';
  [attribute: string]: any;
}

/** Hibira Live Chat on this page, without the integration. */
export const LiveChat: Component<LiveChatProps>;
/** Signs the visitor in to Live Chat. Renders nothing without a user. */
export const LiveChatUser: Component<LiveChatUserProps>;
/** A button that opens Live Chat. */
export const LiveChatButton: Component<LiveChatButtonProps>;
