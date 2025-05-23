// worker/src/handlers/pastorScan.js
export async function handlePastorScan(request, env) {
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
        const urlId = env.CLOUDFLARE_R2_URL_ID;
        const bucketName = env.PRIZE_IMAGE_BUCKET_NAME;

        if (!urlId || !bucketName) {
            return new Response(JSON.stringify({ status: 2, message: "Cloudflare Account ID or R2 Bucket Name not configured as environment variables." }), { status: 500, headers: { 'Content-Type': 'application/json' } }); // 2 for error
        }
        const r2PublicEndpoint = `https://pub-${urlId}.r2.dev`;

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
