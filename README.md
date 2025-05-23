# InstaReveal QR Draw System

A serverless, real-time QR code-based draw system built on the Cloudflare ecosystem. This project enables participants to generate QR codes, receive real-time updates via HTTP polling, and get draw results, while operators scan QR codes to trigger the draw process.

## Overview

The InstaReveal QR Draw System is designed with a front-end/back-end separated architecture for high availability and scalability. It consists of a unified frontend application (with Participant, Operator, and Admin interfaces accessible via different paths) and a backend Cloudflare Worker handling API requests and scheduled tasks. Both frontend and backend are deployed to a single Cloudflare Worker for simplicity.

## File Structure

```
.
├── frontend/                   # Unified Frontend (for Cloudflare deployment)
│   ├── public/                 # Static file directory for deployment
│   │   ├── index.html          # Main HTML for participant interface (Operator via /operator path, Admin via /admin path)
│   │   ├── style.css           # Shared styling for all interfaces
│   │   ├── app.js              # Main JavaScript for participant interface (QR code generation, polling, UI updates)
│   │   ├── operator.js         # JavaScript for operator interface (QR code scanning)
│   │   ├── admin.js            # JavaScript for admin interface (R2 image management)
│   │   └── participant.js      # (Optional, if separate participant logic is needed)
│
├── worker/                     # Backend Cloudflare Worker
│   ├── src/
│   │   └── index.js            # Worker script (HTTP API logic, scheduled tasks, serves static files)
│   │   └── index-backup.js     # Original Worker script with WebSocket logic (for reference)
│
├── .gitignore                  # Specifies files to ignore in Git
├── README.md                   # Project description and deployment guide (English)
├── README_zh-Hant.md          # Project description and deployment guide (Traditional Chinese)
├── TODO.md                     # Project development roadmap and checklist
└── Technical Specification.md  # Detailed technical documentation
```

## Technology Stack

- **Frontend Hosting**: Cloudflare Workers (deployed with backend)
- **Backend Logic & Polling**: Cloudflare Workers
- **State & Data Storage**: Cloudflare D1 (for session state)
- **Image Storage**: Cloudflare R2 (for storing draw result images)
- **QR Code Generation (Frontend)**: JavaScript library (`qr-code-styling.js`)
- **QR Code Scanning (Operator End)**: JavaScript library (`jsQR`)

## Deployment Instructions

This section provides essential steps for deploying the InstaReveal QR Draw System to a single Cloudflare Worker.

### Prerequisites

1. **Cloudflare Account**: Sign up at [Cloudflare](https://www.cloudflare.com/) if you haven't already.
2. **Wrangler CLI**: Install the Wrangler CLI tool for managing Cloudflare Workers. Follow instructions at [Cloudflare Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/).
3. **Node.js and npm**: Required for running deployment scripts.

### Steps

The parameters for D1 Databases and R2 Buckets are configured directly on Cloudflare and then referenced in your `worker/wrangler.toml` file.

1.  **Create Cloudflare Resources**:
    -   **D1 Database**: In the Cloudflare Dashboard, go to "Workers" > "D1". Create a database (e.g., `instareveal-sessions`). Note its **ID**. This D1 database will be used for session data.
    -   **R2 Bucket (Optional for Prize Images)**: Go to "R2" in the Cloudflare Dashboard. Create a bucket (e.g., `prize-images`). Note its **name**. This bucket will store your prize images.

2.  **Update Worker Configuration (`worker/wrangler.toml`)**:
    -   Create or update `worker/wrangler.toml` with your Worker settings and resource bindings. This file tells Wrangler how to connect your Worker to the Cloudflare resources you created.
    -   Ensure the `[assets]` section points to your frontend public directory.
        ```toml
        name = "instareveal-qr-draw"
        main = "src/index.js"
        compatibility_date = "2023-10-01"

        # Bind your D1 database using the ID obtained from Cloudflare Dashboard
        [[d1_databases]]
        binding = "SESSIONS_DB" # This is the variable name used in your Worker script (e.g., env.SESSIONS_DB)
        database_name = "instareveal-sessions"
        database_id = "YOUR_D1_DATABASE_ID"  # Replace with the actual ID after creating D1 database

        # Bind your R2 bucket using the name obtained from Cloudflare Dashboard
        [[r2_buckets]]
        binding = "PRIZE_IMAGE_BUCKET" # This is the variable name used in your Worker script (e.g., env.PRIZE_IMAGE_BUCKET)
        bucket_name = "prize-images" # Replace with the actual name from Cloudflare Dashboard

        # Specify the directory for static assets (frontend files)
        [assets]
        directory = "../frontend/public"

        # Environment variables for R2 public endpoint derivation
        [vars]
        CLOUDFLARE_ACCOUNT_ID = "YOUR_CLOUDFLARE_ACCOUNT_ID" # Replace with your actual Cloudflare Account ID
        PRIZE_IMAGE_BUCKET_NAME = "prize-images" # Ensure this matches the bucket_name above

        # Scheduled cleanup trigger (e.g., runs daily at midnight UTC)
        [triggers]
        crons = ["0 0 * * *"]
        ```
    -   **Important**: Replace `YOUR_D1_DATABASE_ID` and `YOUR_CLOUDFLARE_ACCOUNT_ID` with the actual IDs you obtained from the Cloudflare Dashboard. The `binding` names (`SESSIONS_DB`, `PRIZE_IMAGE_BUCKET`) are what you use to access these resources in your `worker/src/index.js` script (e.g., `env.SESSIONS_DB`).

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

-   **Polling Issues**: Check Cloudflare Worker logs (`wrangler tail`).
-   **API Errors**: Ensure Worker script validates inputs and handles errors.

## Security Considerations

-   Use HTTPS/WSS (enabled by default on Cloudflare).
-   Ensure session IDs are random and hard to guess.

## Scalability Notes

-   Monitor D1 and Polling concurrent connection limits.

## Future Enhancements

-   Support for multiple prize types.
-   Admin dashboard for event configuration.

For more technical details, refer to the `Technical Specification.md` document in the project root.
