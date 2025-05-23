# InstaReveal QR Draw System

A serverless, real-time QR code-based draw system built on the Cloudflare ecosystem. This project enables participants to generate QR codes, connect via WebSocket for real-time updates, and receive draw results, while operators scan QR codes to trigger the draw process.

## Overview

The InstaReveal QR Draw System is designed with a front-end/back-end separated architecture for high availability and scalability. It consists of a unified frontend application (with Participant and Operator interfaces accessible via different paths) and a backend Cloudflare Worker handling API requests and WebSocket communications. Both frontend and backend are deployed to a single Cloudflare Worker for simplicity.

## File Structure

```
.
├── frontend/                   # Unified Frontend (for Cloudflare deployment)
│   ├── public/                 # Static file directory for deployment
│   │   ├── index.html          # Main HTML for both interfaces (Participant by default, Operator via /operator path)
│   │   ├── style.css           # Shared styling for both interfaces
│   │   └── app.js              # JavaScript for QR code generation, scanning, and WebSocket with routing logic
│
├── worker/                     # Backend Cloudflare Worker
│   ├── src/
│   │   └── index.js            # Worker script (HTTP API & WebSocket logic, also serves static files)
│
├── .gitignore                  # (Optional) Specifies files to ignore in Git
├── README.md                   # Project description and deployment guide (English)
├── README_zh-Hant.md          # Project description and deployment guide (Traditional Chinese)
└── Technical Specification.md  # Detailed technical documentation
```

## Technology Stack

- **Frontend Hosting**: Cloudflare Workers (deployed with backend)
- **Backend Logic & WebSocket**: Cloudflare Workers
- **State & Data Storage**: Cloudflare Workers KV (for session state and minimal prize information)
- **Image Storage**: Cloudflare R2 (for storing draw result images)
- **QR Code Generation (Frontend)**: JavaScript library (e.g., `qrcode.js`)
- **QR Code Scanning (Operator End)**: HTML5 QR Code scanning library (e.g., `jsQR`)

## Deployment Instructions

This section provides essential steps for deploying the InstaReveal QR Draw System to a single Cloudflare Worker.

### Prerequisites

1. **Cloudflare Account**: Sign up at [Cloudflare](https://www.cloudflare.com/) if you haven't already.
2. **Wrangler CLI**: Install the Wrangler CLI tool for managing Cloudflare Workers. Follow instructions at [Cloudflare Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/).
3. **Node.js and npm**: Required for running deployment scripts.

### Steps

The parameters for KV Namespaces and R2 Buckets are configured directly on Cloudflare and then referenced in your `worker/wrangler.toml` file.

1.  **Create Cloudflare Resources**:
    -   **Workers KV Namespace**: In the Cloudflare Dashboard, go to "Workers" > "KV". Create a namespace (e.g., `INSTAREVEAL_SESSIONS`). Note its **ID**. This KV namespace will be used for both session data and storing prize image settings.
    -   **R2 Bucket (Optional for Prize Images)**: Go to "R2" in the Cloudflare Dashboard. Create a bucket (e.g., `prize-images`). Note its **name**. This bucket will store your prize images.

2.  **Update Worker Configuration (`worker/wrangler.toml`)**:
    -   Create or update `worker/wrangler.toml` with your Worker settings and resource bindings. This file tells Wrangler how to connect your Worker to the Cloudflare resources you created.
    -   Ensure the `[assets]` section points to your frontend public directory.
        ```toml
        name = "instareveal-qr-draw"
        main = "src/index.js"
        compatibility_date = "2023-10-01"

        # Bind your KV namespace using the ID obtained from Cloudflare Dashboard
        [[kv_namespaces]]
        binding = "YOUR_KV_NAMESPACE" # This is the variable name used in your Worker script (e.g., env.YOUR_KV_NAMESPACE)
        id = "YOUR_KV_NAMESPACE_ID"  # Replace with the actual ID from Cloudflare Dashboard

        # Bind your R2 bucket using the name obtained from Cloudflare Dashboard
        [[r2_buckets]]
        binding = "PRIZE_IMAGE_BUCKET" # This is the variable name used in your Worker script (e.g., env.PRIZE_IMAGE_BUCKET)
        bucket_name = "prize-images" # Replace with the actual name from Cloudflare Dashboard

        # Specify the directory for static assets (frontend files)
        [assets]
        directory = "../frontend/public"
        ```
    -   **Important**: Replace `YOUR_KV_NAMESPACE_ID` and `prize-images` with the actual ID and name you obtained from the Cloudflare Dashboard. The `binding` names (`YOUR_KV_NAMESPACE`, `PRIZE_IMAGE_BUCKET`) are what you use to access these resources in your `worker/src/index.js` script (e.g., `env.YOUR_KV_NAMESPACE`).

3.  **Deploy the Worker**:
    -   Open a terminal and `cd` into the `worker` directory.
    -   Authenticate Wrangler: `wrangler login`
    -   Deploy the Worker with assets: `npx wrangler deploy --assets ../frontend/public`

### Configuring and Managing Prize Images via Admin Panel

After deploying the Worker, you can manage your prize images and configure the R2 public endpoint using the new Admin Panel.

1.  **Access Admin Panel**: Navigate to `your-worker-domain.workers.dev/admin` (replace `your-worker-domain.workers.dev` with your deployed Worker's URL).

2.  **Configure R2 Public Endpoint (KV Setting)**:
    -   In the "Prize Image Settings (KV)" section, enter the **R2 Public Endpoint** for your R2 bucket (e.g., `https://pub-YOUR_ACCOUNT_ID.r2.dev/your-bucket-name`). This URL is used by the Worker to construct image paths.
    -   Click "Save Settings to KV". This value will be stored in your Workers KV namespace.

3.  **Upload and Manage Images in R2**:
    -   In the "Manage R2 Images" section:
        -   **Upload Images**: Click "Choose Files" to select one or more image files from your computer. Then, click "Upload Selected Images to R2" to directly upload them to your configured R2 bucket.
        -   **List Images**: The "Current Images in R2" section will automatically display images found in your R2 bucket.
        -   **Delete Images**: For each listed image, you will see a "Delete" button. Click it to remove the image from your R2 bucket.
    -   **Important**: Ensure your R2 bucket is configured for public access if you want the images to be directly accessible via their public URLs.

4.  **Update Prize Image Filenames (KV Setting)**:
    -   After uploading or managing images in R2, update the "Prize Image Filenames (comma-separated)" field in the "Prize Image Settings (KV)" section. Enter the exact filenames of the images you want to use for the draw, separated by commas (e.g., `prizeA.png, prizeB.png, prizeC.png`). These filenames must match the keys of the images you've uploaded to R2.
    -   Click "Save Settings to KV". These filenames will be stored in your Workers KV namespace and used by the Worker when selecting a prize.

### Testing the Deployment

1.  **Participant Interface**: Access the deployed Worker URL (e.g., `your-worker-domain.workers.dev`).
2.  **Operator Interface**: Access the operator interface via `your-worker-domain.workers.dev/operator`.
3.  **Verify Functionality**: Test QR code generation, scanning, and real-time draw results. The prize images should now be fetched from your R2 bucket based on the settings configured in the Admin Panel.

## Troubleshooting

-   **WebSocket Connection Issues**: Check Cloudflare Worker logs (`wrangler tail`).
-   **API Errors**: Ensure Worker script validates inputs and handles errors.

## Security Considerations

-   Use HTTPS/WSS (enabled by default on Cloudflare).
-   Ensure session IDs are random and hard to guess.

## Scalability Notes

-   Monitor Workers KV and WebSocket concurrent connection limits.

## Future Enhancements

-   Support for multiple prize types.
-   Admin dashboard for event configuration.

For more technical details, refer to the `Technical Specification.md` document in the project root.
