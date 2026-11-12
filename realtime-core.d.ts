import type Pusher from 'pusher-js';
import type { Channel, Options, PresenceChannel } from 'pusher-js';
import type { Member } from './client.js';
import type { HistoryResult, RewindOptions, Stream } from './stream.js';
import type { AgentRun, AgentRunStatus, AgentToolCall } from './agent.js';

export type Stop = () => void;
/** A channel name (subscribed and shared) or a pusher-js channel (used as is). */
export type Target = string | Channel;

export interface Held {
  channel: Channel;
  /** Lets go of the channel; it is left when the last user lets go. */
  release(): void;
}

export interface PresenceState<Info = any> {
  channel: PresenceChannel;
  members: Member<Info>[];
  others: Member<Info>[];
  me: Member<Info> | null;
  count: number;
}

export interface StreamState<Meta = any> {
  stream: Stream<Meta> | null;
  streams: Record<string, Stream<Meta>>;
  text: string;
  done: boolean;
  error: string | null;
  incomplete: boolean;
  meta: Meta | null;
  history: HistoryResult | null;
}

export interface AgentStreamState {
  run: AgentRun | null;
  runs: Record<string, AgentRun>;
  text: string;
  reasoning: string;
  status: AgentRunStatus | 'idle';
  done: boolean;
  error: string | null;
  toolCalls: AgentToolCall[];
  approvals: any[];
  history: HistoryResult | null;
}

export type ConnectionState = 'initialized' | 'connecting' | 'connected' | 'unavailable' | 'failed' | 'disconnected';

export interface Realtime {
  /** The shared pusher-js client, opened on first use; null on the server. */
  getPusher(): Pusher | null;
  subscribe(name: string): Held | null;
  onEvent<T = any>(target: Target, event: string, handler: (data: T, metadata?: { user_id?: string }) => void): Stop;
  onPresence<Info = any>(target: Target, cb: (state: PresenceState<Info>) => void): Stop;
  onConnectionState(cb: (state: ConnectionState) => void): Stop;
  /** Sends a client event once the channel is subscribed. */
  trigger(target: Target, event: `client-${string}`, data: any): Promise<boolean>;
  onStream<Meta = any>(
    target: Target,
    cb: (state: StreamState<Meta>) => void,
    options?: { event?: string; id?: string; maxStreams?: number; rewind?: boolean | RewindOptions },
  ): Stop;
  onAgentStream(
    target: Target,
    cb: (state: AgentStreamState) => void,
    options?: { invocationId?: string; maxRuns?: number; rewind?: boolean | RewindOptions; events?: string[] },
  ): Stop;
  disconnect(): void;
}

export function createRealtime(config?: {
  appKey?: string | null;
  options?: Partial<Options> | null;
  Pusher?: (new (key: string, options: Options) => Pusher) | null;
  client?: Pusher | (() => Pusher) | null;
}): Realtime;
