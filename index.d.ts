import type { AstroIntegration } from 'astro';
import type { Options } from 'pusher-js';
import type { LiveChatOptions } from './livechat.js';

export { LIVECHAT_HOST, isWorkspace, liveChatAttributes, liveChatLoader } from './livechat.js';
export type { LiveChatOptions, LiveChatIdentity, LiveChatUserInput } from './livechat.js';

export interface HibiraLiveChatOptions extends Partial<LiveChatOptions> {
  /** Live Chat origin; default https://chat.hibira.io (or PUBLIC_HIBIRA_LIVECHAT_HOST). */
  host?: string;
}

export interface HibiraRealtimeOptions {
  /** App key from the Hibira portal; default PUBLIC_HIBIRA_KEY. */
  key?: string;
  /**
   * pusher-js options merged over HIBIRA_DEFAULTS. They are written into the
   * page's JavaScript, so JSON only: use channelAuthorization: { endpoint }
   * rather than a custom authorizer function.
   */
  options?: Partial<Options>;
  /** Use pusher-js/with-encryption, for private-encrypted- channels. */
  encrypted?: boolean;
}

export interface HibiraOptions {
  /**
   * The Live Chat workspace ID (ws_…), or its options. Left out, the widget
   * is added when PUBLIC_HIBIRA_LIVECHAT_WORKSPACE is set; false turns it off.
   */
  liveChat?: string | HibiraLiveChatOptions | false;
  /**
   * Settings for `@hibira-io/astro/realtime`. Left out, PUBLIC_HIBIRA_KEY is
   * used when set; false turns it off.
   */
  realtime?: HibiraRealtimeOptions | false;
}

/** The Hibira integration for astro.config: Live Chat on every page, and the realtime client. */
export default function hibira(options?: HibiraOptions): AstroIntegration;

export function resolveLiveChat(option: HibiraOptions['liveChat'], env?: Record<string, string | undefined>): (HibiraLiveChatOptions & { workspace: string; host: string }) | null;
export function resolveRealtime(option: HibiraOptions['realtime'], env?: Record<string, string | undefined>): { key: string; options: Partial<Options>; encrypted: boolean } | null;
export function realtimeModule(rt: { key: string; options?: Partial<Options> } | null, pusherModule?: string): string;

/** Our variables from .env files (Vite's order) and process.env. */
export function readEnv(root: URL | string, mode: string): Promise<Record<string, string>>;
export function parseEnv(text: string): Record<string, string>;
