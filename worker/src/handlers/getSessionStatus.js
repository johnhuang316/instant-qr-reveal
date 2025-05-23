// worker/src/handlers/getSessionStatus.js
export async function handleGetSessionStatus(request, env) {
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
