// worker/src/handlers/listR2Images.js
export async function handleListR2Images(env) {
    try {
        // User requested to pass account_id, though R2Bucket.list() does not take it.
        // This is for demonstration purposes to show the method signature is incorrect.
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
