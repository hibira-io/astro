import Pusher from 'pusher';
import { channelAuth } from '@hibira-io/astro/server';

const pusher = new Pusher({
  appId: process.env.HIBIRA_APP_ID ?? 'ci-app',
  key: process.env.PUBLIC_HIBIRA_KEY ?? import.meta.env.PUBLIC_HIBIRA_KEY,
  secret: process.env.HIBIRA_SECRET ?? 'ci-secret-0123456789',
});

export const POST = channelAuth(pusher, ({ request }, { channelName }) => {
  const name = new URL(request.headers.get('referer') ?? 'http://x/').searchParams.get('user');
  if (!name) return false;
  if (channelName.startsWith('presence-')) return { user_id: name, user_info: { name } };
  return true;
});

export const GET = () => new Response('use POST', { status: 405 });
