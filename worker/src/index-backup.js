import { getAssetFromKV } from '@cloudflare/kv-asset-handler';

// Cloudflare Worker script for InstaReveal QR Draw System
// Handles HTTP API requests and WebSocket connections

// Global Map to store sessionId to WebSocket connection mapping
const webSocketConnections = new Map();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Try to serve static assets first
    try {
      return await getAssetFromKV({ request, waitUntil: ctx.waitUntil }, {
        ASSET_MANIFEST: env.__STATIC_CONTENT_MANIFEST,
        ASSET_NAMESPACE: env.__STATIC_CONTENT,
      });
    } catch (e) {
      // If static asset not found, proceed with API/WebSocket routing
      console.log(`Static asset not found for ${url.pathname}: ${e.message}`);
    }

    // WebSocket upgrade request handling
    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected WebSocket upgrade', { status: 426 });
      }
      const { 0: clientWs, 1: serverWs } = new WebSocketPair();

      // sessionId can be passed via query param or sent as the first message after connection
      const sessionIdFromQuery = url.searchParams.get('sessionId');

      serverWs.accept();

      // If sessionId is passed via query param, register it immediately
      if (sessionIdFromQuery) {
          webSocketConnections.set(sessionIdFromQuery, serverWs);
          console.log(`WebSocket registered via query param for session: ${sessionIdFromQuery}`);
      }

      serverWs.addEventListener('message', async (event) => {
        try {
          const messageData = JSON.parse(event.data);
          if (messageData.type === 'registerSession' && messageData.sessionId) {
            // Associate this WebSocket with the sessionId (if not already registered via query param)
            if (!webSocketConnections.has(messageData.sessionId)) {
                webSocketConnections.set(messageData.sessionId, serverWs);
                console.log(`WebSocket registered via message for session: ${messageData.sessionId}`);
            }
          }
        } catch (e) {
          console.error('Error processing message from client:', e);
        }
      });

      serverWs.addEventListener('close', () => {
        console.log('WebSocket closed');
        // Clean up the corresponding connection from webSocketConnections
        for (const [sid, ws] of webSocketConnections.entries()) {
          if (ws === serverWs) {
            webSocketConnections.delete(sid);
            console.log(`WebSocket connection removed for session: ${sid}`);
            break;
          }
        }
      });
      serverWs.addEventListener('error', (err) => {
        console.error('WebSocket error:', err);
        // Cleanup logic same as 'close'
        for (const [sid, ws] of webSocketConnections.entries()) {
          if (ws === serverWs) {
            webSocketConnections.delete(sid);
            console.log(`WebSocket connection removed due to error for session: ${sid}`);
            break;
          }
        }
      });

      return new Response(null, { status: 101, webSocket: clientWs });
    }

    // HTTP API Routing
    if (url.pathname === '/api/generate-qr-session' && request.method === 'POST') {
      return handleGenerateQrSession(request, env);
    }
    if (url.pathname === '/api/pastor-scan' && request.method === 'POST') {
      return handlePastorScan(request, env);
    }
    if (url.pathname === '/api/session-status' && request.method === 'GET') {
      return handleGetSessionStatus(request, env);
    }

    // Admin API for settings (simplified, no longer for R2 endpoint or image keys)
    if (url.pathname === '/api/admin/settings') {
      if (request.method === 'GET') {
        return handleGetSettings(env); // Returns empty object
      }
      if (request.method === 'POST') {
        return handleSaveSettings(request, env); // Does nothing
      }
    }

    // Admin API for R2 image management
    if (url.pathname.startsWith('/api/admin/r2/')) {
      if (url.pathname === '/api/admin/r2/list' && request.method === 'GET') {
        return handleListR2Images(env);
      }
      if (url.pathname === '/api/admin/r2/upload' && request.method === 'POST') {
        return handleUploadR2Image(request, env);
      }
      if (url.pathname === '/api/admin/r2/delete' && request.method === 'DELETE') {
        return handleDeleteR2Image(request, env);
      }
      if (url.pathname === '/api/admin/r2/endpoint' && request.method === 'GET') {
        return handleGetR2PublicEndpoint(request, env);
      }
    }

    // Handle /operator path to serve index.html
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
    
    // Handle /admin path to serve admin.html
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
};

// KV key for storing prize settings (no longer used for R2 endpoint or image keys)
const PRIZE_SETTINGS_KV_KEY = 'config:prize_settings'; // Still exists for potential future settings

async function handleGetSettings(env) {
  // This function can be repurposed for other KV-based settings if needed.
  // R2 endpoint and image keys are now dynamically derived or managed via R2 APIs.
  return new Response(JSON.stringify({}), { // Return empty for now
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleSaveSettings(request, env) {
  // This function can be repurposed for other KV-based settings if needed.
  return new Response(JSON.stringify({ status: "success", message: "No settings to save via this endpoint" }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleGetR2PublicEndpoint(request, env) {
  // Dynamically construct the R2 public endpoint using environment variables
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const bucketName = env.PRIZE_IMAGE_BUCKET_NAME;

  if (!accountId || !bucketName) {
    return new Response(JSON.stringify({ status: "error", message: "Cloudflare Account ID or R2 Bucket Name not configured as environment variables." }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  const r2PublicEndpoint = `https://pub-${accountId}.r2.dev`;

  return new Response(JSON.stringify({ r2PublicEndpoint }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleGenerateQrSession(request, env) {
  // Generate a globally unique session ID
  const sessionId = crypto.randomUUID(); // Built-in crypto in Cloudflare Workers

  // Store the session ID and its initial state in Workers KV
  const sessionData = {
    sessionId: sessionId,
    status: "pending",
    createdAt: new Date().toISOString()
  };
  // Ensure INSTAREVEAL_SESSIONS is correctly bound in wrangler.toml
  await env.INSTAREVEAL_SESSIONS.put(`session:${sessionId}`, JSON.stringify(sessionData));
  // Note KV write limits

  // Return the session ID to the frontend
  return new Response(JSON.stringify({ sessionId: sessionId }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handlePastorScan(request, env) {
  try {
    const { sessionId } = await request.json();
    if (!sessionId) {
      return new Response(JSON.stringify({ status: "error", message: "sessionId is required" }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Read the state of this sessionId from Workers KV
    const kvKey = `session:${sessionId}`;
    const sessionDataString = await env.INSTAREVEAL_SESSIONS.get(kvKey);
    if (!sessionDataString) {
      return new Response(JSON.stringify({ status: "error", message: "Invalid session" }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }
    const sessionData = JSON.parse(sessionDataString);

    // Validate state
    if (sessionData.status !== "pending") {
      return new Response(JSON.stringify({ status: "error", message: "Session already drawn or invalid state" }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Get list of images from R2 bucket
    const listed = await env.PRIZE_IMAGE_BUCKET.list();
    const prizeImageKeys = listed.objects.map(obj => obj.key);

    if (prizeImageKeys.length === 0) {
      return new Response(JSON.stringify({ status: "error", message: "No prize images found in R2 bucket. Please upload images via admin panel." }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    // Dynamically construct the R2 public endpoint
    const accountId = env.CLOUDFLARE_ACCOUNT_ID;
    const bucketName = env.PRIZE_IMAGE_BUCKET_NAME;

    if (!accountId || !bucketName) {
      return new Response(JSON.stringify({ status: "error", message: "Cloudflare Account ID or R2 Bucket Name not configured as environment variables." }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    const r2PublicEndpoint = `https://pub-${accountId}.r2.dev`;

    // Execute draw
    const selectedImageKey = prizeImageKeys[Math.floor(Math.random() * prizeImageKeys.length)];
    const resultImageUrl = `${r2PublicEndpoint}/${selectedImageKey}`;

    // Update KV state
    sessionData.status = "drawn";
    sessionData.resultImageUrl = resultImageUrl;
    sessionData.drawnAt = new Date().toISOString();
    await env.INSTAREVEAL_SESSIONS.put(kvKey, JSON.stringify(sessionData));
    // Note KV write limits

    // Trigger result push: Directly find the corresponding WebSocket connection and push
    const targetWebSocket = webSocketConnections.get(sessionId);
    if (targetWebSocket) {
      try {
          targetWebSocket.send(JSON.stringify({
            type: "drawResult",
            imageUrl: resultImageUrl,
            message: "Congratulations!"
          }));
          console.log(`Result sent to session: ${sessionId}`);
      } catch (e) {
          console.error(`Failed to send message to WebSocket for session ${sessionId}:`, e);
          webSocketConnections.delete(sessionId);
      }
    } else {
      console.warn(`No active WebSocket found for session: ${sessionId}. Result stored in KV.`);
    }

    // Return success message to the operator end
    return new Response(JSON.stringify({ status: "success", message: "Result processed and push attempted" }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error("Error in handlePastorScan:", error);
    return new Response(JSON.stringify({ status: "error", message: "Internal server error" }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

async function handleListR2Images(env) {
  try {
    const listed = await env.PRIZE_IMAGE_BUCKET.list();
    const images = listed.objects.map(obj => obj.key);
    return new Response(JSON.stringify({ images }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error("Error in handleListR2Images:", error);
    return new Response(JSON.stringify({ status: "error", message: "Internal server error" }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

async function handleUploadR2Image(request, env) {
  try {
    const url = new URL(request.url);
    const filename = url.searchParams.get('filename');
    if (!filename) {
      return new Response(JSON.stringify({ status: "error", message: "filename query parameter is required" }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Parse multipart/form-data
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return new Response(JSON.stringify({ status: "error", message: "No file provided" }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Upload to R2
    await env.PRIZE_IMAGE_BUCKET.put(filename, file.stream());

    return new Response(JSON.stringify({ status: "success", message: `File ${filename} uploaded` }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error("Error in handleUploadR2Image:", error);
    return new Response(JSON.stringify({ status: "error", message: "Internal server error" }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

async function handleDeleteR2Image(request, env) {
  try {
    const url = new URL(request.url);
    const filename = url.searchParams.get('filename');
    if (!filename) {
      return new Response(JSON.stringify({ status: "error", message: "filename query parameter is required" }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Delete from R2
    await env.PRIZE_IMAGE_BUCKET.delete(filename);

    return new Response(JSON.stringify({ status: "success", message: `File ${filename} deleted` }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error("Error in handleDeleteR2Image:", error);
    return new Response(JSON.stringify({ status: "error", message: "Internal server error" }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

async function handleGetSessionStatus(request, env) {
  try {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId');

    if (!sessionId) {
      return new Response(JSON.stringify({ status: "error", message: "sessionId query parameter is required" }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const kvKey = `session:${sessionId}`;
    const sessionDataString = await env.INSTAREVEAL_SESSIONS.get(kvKey);

    if (!sessionDataString) {
      return new Response(JSON.stringify({ status: "error", message: "Session not found" }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    const sessionData = JSON.parse(sessionDataString);

    return new Response(JSON.stringify({
      status: "success",
      sessionStatus: sessionData.status,
      resultImageUrl: sessionData.resultImageUrl || null,
      message: sessionData.message || null
    }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error("Error in handleGetSessionStatus:", error);
    return new Response(JSON.stringify({ status: "error", message: "Internal server error" }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
