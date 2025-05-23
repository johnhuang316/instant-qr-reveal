# InstaReveal QR Draw System - Technical Specification

## 1. System Architecture Overview

This system will adopt a front-end/back-end separated architecture, leveraging a Serverless technology stack to achieve high availability, elastic scalability, and cost-effectiveness. Key components include:

* **Frontend Application (Client-Side)**:
    * **Participant Interface**: A static web application (SPA) responsible for generating a QR Code, establishing a WebSocket connection, and displaying the draw result.
    * **Operator Interface**: A web application or simple app responsible for scanning the participant's QR Code and transmitting the information to the backend.
* **Backend Service (Server-Side)**:
    * **API Gateway / Request Handling**: Processes HTTP requests from the frontend (e.g., generating QR Codes, receiving scan results).
    * **WebSocket Server**: Manages real-time bidirectional communication with the participant interface to push draw results.
    * **Draw Logic Engine**: Executes the draw algorithm.
    * **State Storage**: Persists or temporarily stores session state and prize information.
* **Data Storage**:
    * **Session Database**: Stores the unique ID and status (pending scan, scanned, result, etc.) for each draw session.
    * **Prize Pool**: Stores information about the images available to be drawn.

### Recommended Technology Stack (Based on Cloudflare Ecosystem)

* **Frontend Hosting**: Cloudflare Pages (for both participant and operator web interfaces)
* **Backend Logic & WebSocket (Single Worker Script)**: Cloudflare Workers
* **State & Data Storage**: Cloudflare Workers KV (for session state and minimal prize information)
* **Image Storage**: Cloudflare R2 (for storing draw result images)
* **QR Code Generation (Frontend)**: JavaScript library (e.g., `qrcode.js`)
* **QR Code Scanning (Operator End)**: HTML5 QR Code scanning library (e.g., `jsQR`, `html5-qrcode`) or native app functionality.

## 2. Suggested File Structure

A typical project file structure might look as follows, assuming both participant and operator frontends are deployed as Cloudflare Pages, and the backend uses a single Cloudflare Worker.

```
.
├── participant-frontend/       # Participant Frontend (Cloudflare Pages project)
│   ├── public/                 # Static file directory for Cloudflare Pages
│   │   ├── index.html
│   │   ├── style.css
│   │   ├── app.js              # Main JavaScript for participant end
│   │   └── lib/
│   │       └── qrcode.min.js   # QR Code generation library
│   └── wrangler.toml           # (Optional) For Pages Functions or advanced config
│
├── operator-frontend/          # Operator Frontend (Cloudflare Pages project)
│   ├── public/                 # Static file directory for Cloudflare Pages
│   │   ├── index.html
│   │   ├── style.css
│   │   ├── operator.js         # Main JavaScript for operator end
│   │   └── lib/
│   │       └── jsQR.js         # QR Code scanning library
│   └── wrangler.toml           # (Optional) For Pages Functions or advanced config
│
├── worker/                     # Backend Cloudflare Worker
│   ├── src/
│   │   └── index.js            # Worker script (HTTP API & WebSocket logic)
│   └── wrangler.toml           # Worker configuration (KV namespace, R2 bucket bindings, etc.)
│
├── .gitignore
└── README.md
```

**Structure Description:**

* **`participant-frontend/`**:
    * Contains all static files (HTML, CSS, JavaScript) for the participant interface.
    * `public/` is the default static asset output directory for Cloudflare Pages.
    * `lib/` is for frontend JavaScript library dependencies.
* **`operator-frontend/`**:
    * Contains all static files for the operator interface, similar in structure to the participant frontend.
    * If the operator interface is very simple, consider merging it into the participant frontend Pages project under a different path.
* **`worker/`**:
    * `src/index.js`: The main Cloudflare Worker code file, containing all backend API endpoint handling, WebSocket logic, and interactions with Workers KV and R2.
    * `wrangler.toml`: The Cloudflare Worker configuration file, defining the Worker name, bindings (e.g., KV namespaces, R2 buckets), routes, etc.
* **.gitignore**: Specifies files and directories to be ignored by Git version control.
* **README.md**: Project description document.

**Deployment Flow Sketch:**

1.  **Frontend Deployment**:
    * The `participant-frontend` and `operator-frontend` directories are deployed as separate Cloudflare Pages projects. Cloudflare Pages can connect directly to Git repositories (e.g., GitHub, GitLab) and automatically build and deploy on code pushes.
2.  **Backend Deployment**:
    * Within the `worker/` directory, use the Wrangler CLI tool (`wrangler publish`) to deploy the Cloudflare Worker script. The `wrangler.toml` file guides the deployment process.

This structure clearly separates the frontend and backend, facilitating independent development and deployment.

## 3. Component Detailed Design

### 3.1 Frontend Application (Participant Interface)

* **Tech Stack**: HTML, CSS, JavaScript (consider lightweight frameworks like Vue.js or React, or vanilla JS).
* **Main Functional Modules**:
    1.  **UI Rendering Module**:
        * Displays the initial page, "Generate QR Code" button.
        * Dynamically generates and displays the QR Code image.
        * Shows a "waiting for scan" message.
        * Updates the page to display the draw result image upon receiving it.
    2.  **API Communication Module (HTTP)**:
        * Sends a "Generate QR Code" request to the backend.
    3.  **WebSocket Communication Module**:
        * Establishes a WebSocket connection with the backend WebSocket server (e.g., `wss://your-worker-domain/ws?sessionId=UNIQUE_ID` or sends `sessionId` after connection).
        * Listens for messages (draw results) from the server.
        * Handles connection errors and reconnection logic (optional, depending on complexity).
        * May optionally close the WebSocket connection after receiving and displaying the result.
    4.  **QR Code Generation Module**:
        * Invokes a JavaScript QR Code library to encode the Session ID (returned by the backend) into a QR Code image.

### 3.2 Frontend Application (Operator Interface)

* **Tech Stack**: HTML, CSS, JavaScript (if web-based).
* **Main Functional Modules**:
    1.  **UI Rendering Module**:
        * Provides a "Start Scan" button/interface.
        * Displays the camera preview.
        * Shows scan success/failure/processing messages.
    2.  **QR Code Scanning Module**:
        * Requests device camera permission.
        * Uses a JavaScript QR Code scanning library to continuously analyze the camera feed and identify QR Codes.
    3.  **API Communication Module (HTTP)**:
        * Sends the scanned QR Code content (Session ID) to the designated backend API endpoint.

### 3.3 Backend Service (Single Cloudflare Worker Script)

A single Cloudflare Worker script will handle all HTTP API requests and WebSocket connections. It will require an internal router (e.g., `itty-router` or a simple `switch` statement based on `request.url`) to dispatch requests to the appropriate handling logic.

```javascript
// Conceptual Worker script structure (not complete code)
// File path: worker/src/index.js
// import { Router } from 'itty-router'; // Example: using itty-router

// const router = Router();
// Global or instance-scoped Map to store sessionId to WebSocket connection mapping
const webSocketConnections = new Map();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // WebSocket upgrade request handling
    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected WebSocket upgrade', { status: 426 });
      }
      const { 0: clientWs, 1: serverWs } = new WebSocketPair();

      // sessionId can be passed via query param or sent as the first message after connection
      const sessionIdFromQuery = url.searchParams.get('sessionId');

      serverWs.accept();

      // If sessionId is passed via query param, register it immediately
      if (sessionIdFromQuery) {
          webSocketConnections.set(sessionIdFromQuery, serverWs);
          console.log(`WebSocket registered via query param for session: ${sessionIdFromQuery}`);
      }

      serverWs.addEventListener('message', async (event) => {
        try {
          const messageData = JSON.parse(event.data);
          if (messageData.type === 'registerSession' && messageData.sessionId) {
            // Associate this WebSocket with the sessionId (if not already registered via query param)
            if (!webSocketConnections.has(messageData.sessionId)) {
                webSocketConnections.set(messageData.sessionId, serverWs);
                console.log(`WebSocket registered via message for session: ${messageData.sessionId}`);
            }
            // Optionally send a confirmation message
            // serverWs.send(JSON.stringify({ type: 'registered', status: 'success', sessionId: messageData.sessionId }));
          }
          // Other message handling...
        } catch (e) {
          console.error('Error processing message from client:', e);
          // serverWs.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
        }
      });

      serverWs.addEventListener('close', () => {
        console.log('WebSocket closed');
        // Clean up the corresponding connection from webSocketConnections
        for (const [sid, ws] of webSocketConnections.entries()) {
          if (ws === serverWs) {
            webSocketConnections.delete(sid);
            console.log(`WebSocket connection removed for session: ${sid}`);
            break;
          }
        }
      });
      serverWs.addEventListener('error', (err) => {
        console.error('WebSocket error:', err);
        // Cleanup logic same as 'close'
         for (const [sid, ws] of webSocketConnections.entries()) {
          if (ws === serverWs) {
            webSocketConnections.delete(sid);
            console.log(`WebSocket connection removed due to error for session: ${sid}`);
            break;
          }
        }
      });

      return new Response(null, { status: 101, webSocket: clientWs });
    }

    // HTTP API Routing (Example)
    if (url.pathname === '/api/generate-qr-session' && request.method === 'POST') {
      return handleGenerateQrSession(request, env);
    }
    if (url.pathname === '/api/pastor-scan' && request.method === 'POST') {
      return handlePastorScan(request, env);
    }

    return new Response('Not Found', { status: 404 });
  },
};

async function handleGenerateQrSession(request, env) {
  // 1. Generate a globally unique session ID (e.g., UUID v4)
  const sessionId = crypto.randomUUID(); // Built-in crypto in Cloudflare Workers

  // 2. Store the session ID and its initial state in Workers KV
  const sessionData = {
    sessionId: sessionId,
    status: "pending",
    createdAt: new Date().toISOString()
  };
  // Ensure YOUR_KV_NAMESPACE is correctly bound in wrangler.toml
  await env.YOUR_KV_NAMESPACE.put(`session:${sessionId}`, JSON.stringify(sessionData));
  // Note KV write limits

  // 3. Return the session ID to the frontend
  return new Response(JSON.stringify({ sessionId: sessionId }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handlePastorScan(request, env) {
  try {
    const { sessionId } = await request.json();
    if (!sessionId) {
      return new Response(JSON.stringify({ status: "error", message: "sessionId is required" }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // 2. Read the state of this sessionId from Workers KV
    const kvKey = `session:${sessionId}`;
    const sessionDataString = await env.YOUR_KV_NAMESPACE.get(kvKey);
    if (!sessionDataString) {
      return new Response(JSON.stringify({ status: "error", message: "Invalid session" }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }
    const sessionData = JSON.parse(sessionDataString);

    // 3. Validate state
    if (sessionData.status !== "pending") {
      return new Response(JSON.stringify({ status: "error", message: "Session already drawn or invalid state" }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // 4. Execute draw
    // Randomly select an image from the prize image pool (can be a hardcoded list, list from KV, or external API).
    // Image URLs should point to publicly accessible resources, e.g., images in a Cloudflare R2 Bucket.
    // Example: Assume images are in an R2 Bucket named 'prize-images', publicly accessible or via custom domain.
    // wrangler.toml needs R2 Bucket binding: [[r2_buckets]] binding = "PRIZE_IMAGE_BUCKET" bucket_name = "prize-images"
    // const prizeImageKeys = ["image_A.jpg", "image_B.png", "image_C.gif"]; // Image file names in R2
    // const randomImageKey = prizeImageKeys[Math.floor(Math.random() * prizeImageKeys.length)];
    // const r2Object = await env.PRIZE_IMAGE_BUCKET.get(randomImageKey);
    // if (r2Object === null) {
    //   return new Response(JSON.stringify({ status: "error", message: "Prize image missing" }), { status: 500 });
    // }
    // const resultImageUrl = `https://your-r2-public-url-or-custom-domain/${randomImageKey}`; // Or use R2's public URL

    // Simplified example using placehold.co URLs
    const prizeImages = ["https://placehold.co/600x400/E63946/FFF?text=PrizeA", "https://placehold.co/600x400/F4A261/FFF?text=PrizeB", "https://placehold.co/600x400/2A9D8F/FFF?text=PrizeC"];
    const resultImageUrl = prizeImages[Math.floor(Math.random() * prizeImages.length)];


    // 5. Update KV state
    sessionData.status = "drawn";
    sessionData.resultImageUrl = resultImageUrl;
    sessionData.drawnAt = new Date().toISOString();
    await env.YOUR_KV_NAMESPACE.put(kvKey, JSON.stringify(sessionData));
    // Note KV write limits

    // 6. Trigger result push: Directly find the corresponding WebSocket connection and push
    const targetWebSocket = webSocketConnections.get(sessionId);
    if (targetWebSocket) {
      // Cloudflare Workers' WebSocket object doesn't have a direct readyState property like in browsers.
      // We assume if we get it from the Map, it's active, or send() will throw an error.
      try {
          targetWebSocket.send(JSON.stringify({
            type: "drawResult",
            imageUrl: resultImageUrl,
            message: "Congratulations!" // Optional
          }));
          console.log(`Result sent to session: ${sessionId}`);
          // After successful push, consider closing the WebSocket
          // targetWebSocket.close(1000, "Draw complete"); // Normal closure
          // webSocketConnections.delete(sessionId); // Remove from Map
      } catch (e) {
          console.error(`Failed to send message to WebSocket for session ${sessionId}:`, e);
          // If send fails (e.g., connection already closed unexpectedly), remove from Map
          webSocketConnections.delete(sessionId);
      }
    } else {
      console.warn(`No active WebSocket found for session: ${sessionId}. Result stored in KV.`);
      // A fallback notification mechanism or flag might be needed if real-time push fails.
      // E.g., participant end could poll for result upon WebSocket reconnection.
    }

    // 7. Return success message to the operator end
    return new Response(JSON.stringify({ status: "success", message: "Result processed and push attempted" }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error("Error in handlePastorScan:", error);
    return new Response(JSON.stringify({ status: "error", message: "Internal server error" }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
```

#### **Routing and Handling Logic Description**:

* **`POST /api/generate-qr-session`**:
    * **Logic**:
        1.  Generates a globally unique session ID (e.g., `crypto.randomUUID()`).
        2.  Stores the session ID and its initial state (e.g., `{ "sessionId": "UNIQUE_ID", "status": "pending", "createdAt": TIMESTAMP }`) in Workers KV.
            * **KV Key**: `session:<UNIQUE_ID>`
            * **KV Value**: JSON stringified state object.
            * **Note KV write limits**.
        3.  Returns the session ID to the frontend.
    * **Response (JSON)**:
        ```json
        {
          "sessionId": "UNIQUE_ID"
        }
        ```

* **`GET /ws` (WebSocket Endpoint)**:
    * **Logic**:
        1.  Validates if the request is a WebSocket upgrade request.
        2.  If so, creates a `WebSocketPair`. One `WebSocket` (clientWs) is returned to the client, the other (serverWs) is retained by the Worker.
        3.  Calls `serverWs.accept()` to accept the connection.
        4.  **`serverWs.addEventListener('message', ...)`**:
            * Expects the client's first message after connection to contain its `sessionId` (e.g., `{ type: 'registerSession', sessionId: 'UNIQUE_ID' }`), or the `sessionId` might have been provided via query parameter during connection.
            * Upon receiving this (or getting from query param), associates the `serverWs` object with the `sessionId` in the global `webSocketConnections` Map for subsequent pushes.
        5.  **`serverWs.addEventListener('close', ...)` / `serverWs.addEventListener('error', ...)`**:
            * When the connection closes or an error occurs, removes the corresponding entry from the `webSocketConnections` Map to free resources.
    * **Returns**: A `Response` object with status 101 and `webSocket: clientWs`.

* **`POST /api/pastor-scan`**:
    * **Request (JSON)**:
        ```json
        {
          "sessionId": "SCANNED_SESSION_ID"
        }
        ```
    * **Logic**:
        1.  Gets `sessionId` from the request.
        2.  Reads the state of this `sessionId` from Workers KV.
        3.  **Validation**: Checks if the session exists and its status is "pending".
        4.  **Execute Draw**: Randomly selects an image from the prize pool.
        5.  **Update KV State**: Updates status to "drawn" and records the result. **Note KV write limits**.
        6.  **Trigger Result Push**:
            * Looks up the corresponding `serverWs` object from the global `webSocketConnections` Map using `sessionId`.
            * If found and the connection is open, sends the draw result (JSON format) to the participant via `serverWs.send()`.
            * Push message format (JSON):
                ```json
                {
                  "type": "drawResult",
                  "imageUrl": "[https://example.com/path/to/image.jpg](https://example.com/path/to/image.jpg)",
                  "message": "Congratulations!" // Optional
                }
                ```
            * After the result is pushed, optionally closes this WebSocket connection (`serverWs.close()`) and removes it from the Map.
        7.  Returns a success or failure message to the operator end.
    * **Response (JSON)**:
        ```json
        // Success
        { "status": "success", "message": "Result pushed" }
        // Failure
        { "status": "error", "message": "Invalid session or already drawn" }
        ```

### 3.4 Data Models (Workers KV)

* **Session Data**:
    * **Key**: `session:<SessionID>` (e.g., `session:abc-123-xyz-789`)
    * **Value (JSON Object)**:
        ```json
        {
          "sessionId": "abc-123-xyz-789",
          "status": "pending" | "drawn" | "error", // Session status
          "createdAt": "ISO8601_TIMESTAMP",       // Creation time
          "drawnAt": "ISO8601_TIMESTAMP",         // (Optional) Draw time
          "resultImageUrl": "URL_TO_IMAGE",       // (Optional) Winning image URL
          "clientIp": "USER_IP_ADDRESS"           // (Optional) Participant IP for tracking
        }
        ```

* **Prize Image Pool**:
    * **Key**: `config:prizeImages` (if stored in KV)
    * **Value (JSON Array of Strings/Objects)**:
        ```json
        [
          "[https://your-r2-bucket.your-account-id.r2.cloudflarestorage.com/image1.jpg](https://your-r2-bucket.your-account-id.r2.cloudflarestorage.com/image1.jpg)",
          "[https://your-pages-site.pages.dev/images/image2.png](https://your-pages-site.pages.dev/images/image2.png)",
          { "url": "[https://some-other-cdn.com/image3.gif](https://some-other-cdn.com/image3.gif)", "weight": 2 } // Optional, with weight
        ]
        ```
    * **Description**: These image URLs can point to publicly accessible object storage services. It's recommended to use Cloudflare R2 for storing these prize images. Its free tier offers 10GB/month storage, 10 million Class B operations/month (e.g., image reads), and free egress, making it cost-effective for hosting these images within limits. Alternatively, images can be deployed with the frontend project in the `public` directory of Cloudflare Pages. The Worker's draw logic will select an image URL from this configuration.

## 4. API Endpoint Definition Summary

| Endpoint Path            | HTTP Method | Request Example (Body)             | Response Example (Success)                   | Description                                    |
| :----------------------- | :---------- | :--------------------------------- | :------------------------------------------- | :--------------------------------------------- |
| `/api/generate-qr-session` | `POST`      | (empty)                            | `{"sessionId": "UNIQUE_ID"}`                 | Participant requests QR Code session generation |
| `/ws`                    | `GET`       | (WebSocket upgrade protocol)       | (WebSocket connection established)           | WebSocket communication endpoint               |
| `/api/pastor-scan`       | `POST`      | `{"sessionId": "SCANNED_ID"}`      | `{"status": "success", "message": "Pushed"}` | Operator submits scanned session ID            |

## 5. Security Considerations

* **HTTPS/WSS**: All communication must be encrypted using HTTPS and WSS. Cloudflare provides this by default.
* **Session ID Randomness**: Session IDs should be sufficiently random and hard to guess to prevent malicious attempts.
* **Rate Limiting**: Consider setting rate limits at the Cloudflare level or within the Worker for API endpoints to prevent abuse.
* **Input Validation**: The backend must rigorously validate all inputs from the frontend.
* **KV Access Control**: Ensure Worker script access permissions to KV are appropriately managed.
* **R2 Bucket Access Control**: If using R2, configure Bucket public access policies or use signed URLs via Workers as needed.

## 6. Deployment and Scalability

* **Frontend Deployment**: Use Cloudflare Pages for its global CDN and automatic deployment benefits.
* **Backend Deployment**: Cloudflare Workers deploy automatically to global edge nodes, offering good scalability.
* **Scalability Bottlenecks**:
    * **Workers KV Write Limits (Free Tier)**: This is the primary limitation. If exceeded, an upgrade or alternative storage solution is needed.
    * **R2 Free Tier Limits**: While generous, high volumes of images or frequent access could exceed free limits.
    * **Worker CPU Time/Memory**: Free tier limits are usually sufficient for this application but should be monitored.
    * **WebSocket Concurrent Connections**: Cloudflare Workers have limits on WebSocket connections (not explicitly published numbers but implied for free tier). Evaluate or upgrade if high concurrency is expected.
    * **Single Worker Instance WebSocket Management**: For very high concurrent WebSocket connections (e.g., thousands), managing the `webSocketConnections` Map in a single Worker instance's memory might hit limits or performance issues. Cloudflare Durable Objects would be a more suitable solution for managing state and connections per WebSocket session in such scenarios.

## 7. Future Extensibility

* **Multiple Prize Types**: Not just images, but text, links, etc.
* **Prize Inventory Management**: Implement stricter control over prize quantities (Durable Objects might be better suited).
* **Admin Dashboard**: For administrators to configure events, prizes, view draw logs, etc.
* **Participant Authentication**: If eligibility needs to be restricted.
* **More Detailed Analytics and Logging**: Record detailed data of draw activities.