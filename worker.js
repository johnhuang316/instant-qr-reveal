export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === "POST" && path === "/api/generate-qr-session") {
      return handleGenerateQRSession(request, env);
    } else if (method === "POST" && path === "/api/pastor-scan") {
      return handlePastorScan(request, env);
    } else if (method === "GET" && path === "/api/check-status") {
      return handleCheckStatus(request, env);
    } else {
      return new Response("Not Found", { status: 404 });
    }
  },
};

async function handleGenerateQRSession(request, env) {
  try {
    const sessionId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    const stmt = env.DB.prepare(
      "INSERT INTO sessions (session_id, status, created_at) VALUES (?, ?, ?)"
    );
    await stmt.bind(sessionId, "pending", createdAt).run();

    return new Response(JSON.stringify({ sessionId }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error generating QR session:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Database error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

async function handlePastorScan(request, env) {
  try {
    const { sessionId } = await request.json();
    if (!sessionId) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing sessionId" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const images = ["img1.jpg", "img2.jpg", "img3.jpg"];
    const randomImage = images[Math.floor(Math.random() * images.length)];
    const drawnAt = new Date().toISOString();

    const stmt = env.DB.prepare(
      "UPDATE sessions SET status = ?, drawn_at = ?, result_image_url = ? WHERE session_id = ?"
    );
    const info = await stmt.bind("drawn", drawnAt, randomImage, sessionId).run();

    if (info.changes === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Session not found" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: "Session updated." }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in pastor scan:", error);
    // Check if the error is due to invalid JSON
    if (error instanceof SyntaxError) {
        return new Response(
            JSON.stringify({ success: false, error: "Invalid JSON body" }),
            {
                status: 400,
                headers: { "Content-Type": "application/json" },
            }
        );
    }
    return new Response(
      JSON.stringify({ success: false, error: "Database error or invalid request" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

async function handleCheckStatus(request, env) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");

  if (!sessionId) {
    return new Response(
      JSON.stringify({ error: "Missing sessionId parameter" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  try {
    const stmt = env.DB.prepare(
      "SELECT status, result_image_url FROM sessions WHERE session_id = ?"
    );
    const session = await stmt.bind(sessionId).first();

    if (session) {
      return new Response(
        JSON.stringify({
          status: session.status,
          result_image_url: session.result_image_url,
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    } else {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    console.error("Error checking status:", error);
    return new Response(JSON.stringify({ error: "Database error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
