// worker/src/handlers/getSettings.js
export async function handleGetSettings(env) {
    return new Response(JSON.stringify({}), {
        headers: { 'Content-Type': 'application/json' },
    });
}
