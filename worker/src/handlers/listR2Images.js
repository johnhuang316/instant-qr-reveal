// worker/src/handlers/listR2Images.js
export async function handleListR2Images(request,env) {
    try {
        const listed = await env.PRIZE_IMAGE_BUCKET.list(); // Removed incorrect 'account_id' parameter
        const images = listed.objects.map(obj => obj.key);
        return new Response(JSON.stringify({ images }), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error("Error in handleListR2Images:", error);
        return new Response(JSON.stringify({ status: "error", message: "Internal server error" }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}
