// worker/src/handlers/deleteR2Image.js
export async function handleDeleteR2Image(request, env) {
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
