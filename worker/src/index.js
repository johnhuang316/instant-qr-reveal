import { getAssetFromKV } from '@cloudflare/kv-asset-handler';

import Router from './router';
import { handleGenerateQrSession } from './handlers/generateQrSession';
import { handlePastorScan } from './handlers/pastorScan';
import { handleGetSessionStatus } from './handlers/getSessionStatus';
import { handleGetSettings } from './handlers/getSettings';
import { handleSaveSettings } from './handlers/saveSettings';
import { handleListR2Images } from './handlers/listR2Images';
import { handleUploadR2Image } from './handlers/uploadR2Image';
import { handleDeleteR2Image } from './handlers/deleteR2Image';
import { handleGetR2PublicEndpoint } from './handlers/getR2PublicEndpoint';

// Cloudflare Worker script for InstaReveal QR Draw System
// Updated to use HTTP polling instead of WebSocket connections

const router = new Router();

// API Routes
router.post('/api/generate-qr-session', handleGenerateQrSession);
router.post('/api/pastor-scan', handlePastorScan);
router.get('/api/session-status', handleGetSessionStatus);
router.get('/api/admin/settings', handleGetSettings);
router.post('/api/admin/settings', handleSaveSettings);
router.get('/api/admin/r2/list', handleListR2Images);
router.post('/api/admin/r2/upload', handleUploadR2Image);
router.delete('/api/admin/r2/delete', handleDeleteR2Image);
router.get('/api/admin/r2/endpoint', handleGetR2PublicEndpoint);


export default {
  async fetch(request, env, ctx) {
    console.log('Full Env object in fetch handler:', JSON.stringify(env, null, 2));
    const url = new URL(request.url);

    // If it's an API path, directly route it
    if (url.pathname.startsWith('/api/')) {
      const apiResponse = await router.route(request, env, ctx);
      if (apiResponse) {
        return apiResponse;
      }
    } else {
      // Otherwise, try to serve static assets
      try {
        return await getAssetFromKV({ request, waitUntil: ctx.waitUntil }, {
          ASSET_MANIFEST: env.__STATIC_CONTENT_MANIFEST,
          ASSET_NAMESPACE: env.__STATIC_CONTENT,
        });
      } catch (e) {
        // If static asset not found, proceed with special paths or Not Found
        console.log(`Static asset not found for ${url.pathname}: ${e.message}`);
      }
    }

    // Handle /operator path to serve index.html (if not already served as static asset)
    if (url.pathname === '/operator' || url.pathname === '/operator/') {
      request = new Request(`${url.origin}/index.html`, request);
      try {
        return await getAssetFromKV({ request, waitUntil: ctx.waitUntil }, {
          ASSET_MANIFEST: env.__STATIC_CONTENT_MANIFEST,
          ASSET_NAMESPACE: env.__STATIC_CONTENT,
        });
      } catch (e) {
        console.error(`Error serving /operator path: ${e.message}`);
        return new Response('Operator interface not found', { status: 404 });
      }
    }
    
    // Handle /admin path to serve admin.html (if not already served as static asset)
    if (url.pathname === '/admin' || url.pathname === '/admin/') {
      request = new Request(`${url.origin}/admin.html`, request);
      try {
        return await getAssetFromKV({ request, waitUntil: ctx.waitUntil }, {
          ASSET_MANIFEST: env.__STATIC_CONTENT_MANIFEST,
          ASSET_NAMESPACE: env.__STATIC_CONTENT,
        });
      } catch (e) {
        console.error(`Error serving /admin path: ${e.message}`);
        return new Response('Admin interface not found', { status: 404 });
      }
    }

    return new Response('Not Found', { status: 404 });
  },

  async scheduled(event, env, ctx) {
    console.log('Running scheduled cleanup task...');
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    try {
      const { success, error } = await env.SESSIONS_DB.prepare(
        `DELETE FROM sessions WHERE created_at < ?`
      ).bind(twentyFourHoursAgo).run();

      if (success) {
        console.log('Old sessions cleanup successful.');
      } else {
        console.error('Old sessions cleanup failed:', error);
      }
    } catch (e) {
      console.error('Error during scheduled cleanup:', e);
    }
  },
};
