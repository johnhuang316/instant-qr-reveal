// worker/src/handlers/generateQrSession.js
export async function handleGenerateQrSession(request, env) {
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
