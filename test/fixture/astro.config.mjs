// A small Astro site that uses @hibira-io/astro the way a customer would:
// Live Chat everywhere from the integration, signed-in visitors, view
// transitions, realtime scripts and a channel auth route.
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import hibira from '@hibira-io/astro';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  // Astro 5.14+ only trusts the Host header for these; without it the URL is
  // http://localhost and the same-origin check refuses pusher-js's auth POST.
  security: { allowedDomains: [{ hostname: '127.0.0.1' }, { hostname: 'localhost' }] },
  integrations: [
    hibira({
      liveChat: { color: '#e5484d' },
      realtime: {
        options: {
          wsHost: process.env.HIBIRA_WS_HOST || 'ws.hibira.io',
          wsPort: Number(process.env.HIBIRA_WS_PORT || 443),
          forceTLS: process.env.HIBIRA_WS_TLS !== '0',
          channelAuthorization: { endpoint: '/api/hibira/auth', transport: 'ajax' },
        },
      },
    }),
  ],
});
