// worker/src/handlers/uploadR2Image.js
export async function handleUploadR2Image(request, env) {
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
