import { getAssetFromKV } from '@cloudflare/kv-asset-handler';

// Cloudflare Worker script for InstaReveal QR Draw System
// Updated to use HTTP polling instead of WebSocket connections

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
      // If static asset not found, proceed with API routing
      console.log(`Static asset not found for ${url.pathname}: ${e.message}`);
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


async function handleGetSettings(env) {
  return new Response(JSON.stringify({}), {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleSaveSettings(request, env) {
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

  // Store the session ID and its initial state in D1
  const sessionData = {
    session_id: sessionId,
    status: 0, // 0 for pending
    created_at: new Date().toISOString(),
    last_polled_at: new Date().toISOString()
  };
  await env.SESSIONS_DB.prepare(
    `INSERT INTO sessions (session_id, status, created_at, last_polled_at) VALUES (?, ?, ?, ?)`
  ).bind(sessionData.session_id, sessionData.status, sessionData.created_at, sessionData.last_polled_at).run();

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

    // Read the state of this sessionId from D1
    const { results } = await env.SESSIONS_DB.prepare(
        `SELECT * FROM sessions WHERE session_id = ?`
    ).bind(sessionId).all();
    if (!results || results.length === 0) {
      return new Response(JSON.stringify({ status: "error", message: "Invalid session" }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }
    const sessionData = results[0];

    // Validate state
    if (sessionData.status !== 0) { // 0 for pending
      return new Response(JSON.stringify({ status: 2, message: "Session already drawn or invalid state" }), { status: 400, headers: { 'Content-Type': 'application/json' } }); // 2 for error
    }

    // Get list of images from R2 bucket
    const listed = await env.PRIZE_IMAGE_BUCKET.list();
    const prizeImageKeys = listed.objects.map(obj => obj.key);

    if (prizeImageKeys.length === 0) {
      return new Response(JSON.stringify({ status: 2, message: "No prize images found in R2 bucket. Please upload images via admin panel." }), { status: 500, headers: { 'Content-Type': 'application/json' } }); // 2 for error
    }

    // Dynamically construct the R2 public endpoint
    const accountId = env.CLOUDFLARE_ACCOUNT_ID;
    const bucketName = env.PRIZE_IMAGE_BUCKET_NAME;

    if (!accountId || !bucketName) {
      return new Response(JSON.stringify({ status: 2, message: "Cloudflare Account ID or R2 Bucket Name not configured as environment variables." }), { status: 500, headers: { 'Content-Type': 'application/json' } }); // 2 for error
    }
    const r2PublicEndpoint = `https://pub-${accountId}.r2.dev`;

    // Execute draw
    const selectedImageKey = prizeImageKeys[Math.floor(Math.random() * prizeImageKeys.length)];
    const imageUrl = `${r2PublicEndpoint}/${selectedImageKey}`; // Use shorter name

    // Update D1 state
    sessionData.status = 1; // 1 for drawn
    sessionData.result_image_url = imageUrl; // Use result_image_url as per schema
    sessionData.drawn_at = new Date().toISOString(); // Use drawn_at as per schema
    await env.SESSIONS_DB.prepare(
        `UPDATE sessions SET status = ?, drawn_at = ?, result_image_url = ?, last_polled_at = ? WHERE session_id = ?`
    ).bind(sessionData.status, sessionData.drawn_at, sessionData.result_image_url, new Date().toISOString(), sessionId).run();

    // Return success message to the operator end
    return new Response(JSON.stringify({ status: 1, message: "Result processed and stored" }), { // 1 for success
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

    const { results } = await env.SESSIONS_DB.prepare(
        `SELECT status, result_image_url, last_polled_at FROM sessions WHERE session_id = ?` // Select last_polled_at for ETag
    ).bind(sessionId).all();

    if (!results || results.length === 0) {
      return new Response(JSON.stringify({ status: 2, message: "Session not found" }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    const sessionData = results[0];

    // Generate ETag based on session status and result image URL
    const etag = `"${sessionData.status}-${sessionData.result_image_url || ''}-${sessionData.last_polled_at}"`; // Include last_polled_at for freshness

    // Check If-None-Match header
    const ifNoneMatch = request.headers.get('If-None-Match');
    if (ifNoneMatch && ifNoneMatch === etag) {
      // Update last_polled_at even if 304, to keep session alive
      await env.SESSIONS_DB.prepare(
          `UPDATE sessions SET last_polled_at = ? WHERE session_id = ?`
      ).bind(new Date().toISOString(), sessionId).run();
      return new Response(null, { status: 304, headers: { 'ETag': etag, 'Cache-Control': 'no-cache' } });
    }

    // Return minimal data for polling efficiency
    const response = {
      status: sessionData.status
    };
    
    if (sessionData.status === 1) { // 1 for drawn
      response.imageUrl = sessionData.result_image_url; // Use shorter name
    }

    // Update last_polled_at for this session
    await env.SESSIONS_DB.prepare(
        `UPDATE sessions SET last_polled_at = ? WHERE session_id = ?`
    ).bind(new Date().toISOString(), sessionId).run();

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json', 'ETag': etag, 'Cache-Control': 'no-cache' },
    });

  } catch (error) {
    console.error("Error in handleGetSessionStatus:", error);
    return new Response(JSON.stringify({ status: "error", message: "Internal server error" }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
