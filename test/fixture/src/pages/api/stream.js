import Pusher from 'pusher';
import { streamToChannel } from '@hibira-io/astro/server';

export const POST = async () => {
  const pusher = new Pusher({
    appId: process.env.HIBIRA_APP_ID ?? 'ci-app',
    key: process.env.PUBLIC_HIBIRA_KEY ?? import.meta.env.PUBLIC_HIBIRA_KEY,
    secret: process.env.HIBIRA_SECRET ?? 'ci-secret-0123456789',
    host: process.env.HIBIRA_WS_HOST,
    port: process.env.HIBIRA_WS_PORT,
    useTLS: process.env.HIBIRA_WS_TLS !== '0',
  });
  async function* words() {
    for (const w of ['Hello ', 'from ', 'Astro']) yield w;
  }
  const r = await streamToChannel(pusher, 'ai', words(), { interval: 10 });
  return Response.json(r);
};
