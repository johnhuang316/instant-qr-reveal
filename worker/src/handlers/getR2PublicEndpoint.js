// worker/src/handlers/getR2PublicEndpoint.js
export async function handleGetR2PublicEndpoint(request, env) {
    // Dynamically construct the R2 public endpoint using environment variables
    const urlId = env.CLOUDFLARE_R2_URL_ID;
    const bucketName = env.PRIZE_IMAGE_BUCKET_NAME;

    if (!urlId || !bucketName) {
        return new Response(JSON.stringify({ status: "error", message: "Cloudflare Account ID or R2 Bucket Name not configured as environment variables." }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const r2PublicEndpoint = `https://pub-${urlId}.r2.dev`;

    return new Response(JSON.stringify({ r2PublicEndpoint }), {
        headers: { 'Content-Type': 'application/json' },
    });
}
