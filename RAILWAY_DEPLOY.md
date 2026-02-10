# Railway Deployment Guide

This guide breaks down how to deploy your Project Management application to Railway using separate services for Frontend (Client) and Backend (Server).

## Prerequisites
- A Railway account (railway.app)
- Your project uploaded to GitHub (Railway deploys from GitHub repo)

## Step 1: Backend Deployment (Server)

1.  **Create a New Project on Railway**
    -   Go to Dashboard -> New Project -> Deploy from GitHub repo.
    -   Select your repository.
    -   Click "Add Variables" before deploying if possible, or Deploy and then Configure.

2.  **Configure the Server Service**
    -   Railway will detect the repo. Because it's a monorepo, you need to configure the **Root Directory**.
    -   Go to **Settings** -> **Root Directory** and set it to `/server`.
    -   Railway should auto-detect `npm start` or the start command from `server/package.json`.
        -   Start Command: `npm start` (which runs `prisma generate && node server.js`)

3.  **Environment Variables (Backend)**
    -   Go to **Variables** tab for the Server service.
    -   Add the following variables (matching your `.env` or requirements):
        -   `DATABASE_URL`: Your PostgreSQL connection string (You can provision a standard PostgreSQL database in Railway and use its URL).
        -   `CLERK_PUBLISHABLE_KEY`: (If needed by backend)
        -   `CLERK_SECRET_KEY`: Your Clerk Secret Key
        -   `INNGEST_SIGNING_KEY`: (If using Inngest)
        -   `INNGEST_EVENT_KEY`: (If using Inngest)
        -   `PORT`: (Railway sets this automatically, but your code uses `process.env.PORT`, so no need to set manually).

4.  **Database (Optional)**
    -   If you don't have a database, click "New" -> "Database" -> "PostgreSQL" in the Railway canvas.
    -   Link it to your Server service or copy the `DATABASE_URL` into the Server's variables.

## Step 2: Frontend Deployment (Client)

1.  **Add a New Service**
    -   In the same Railway project, click "New" -> "GitHub Repo".
    -   Select the **same repository** again.

2.  **Configure the Client Service**
    -   Go to **Settings** -> **Root Directory** and set it to `/client`.
    -   **Build Command**: Railway usually detects `npm run build`. Verify it is `npm install && npm run build`.
    -   **Start Command**: We have added a command for this: `npm start` (which runs `serve -s dist -l $PORT`).

3.  **Environment Variables (Client)**
    -   Go to **Variables** tab for the Client service.
    -   **CRITICAL**: You must set this *before* the deployment builds, as Vite bakes it in.
    -   `VITE_BASE_URL`: The URL of your **deployed Backend** (e.g., `https://server-production.up.railway.app`).
    -   `VITE_CLERK_PUBLISHABLE_KEY`: Your Clerk Publishable Key (pk_test_...).

4.  **Networking**
    -   Go to **Settings** -> **Networking** -> **Generate Domain**.
    -   This enables public access (e.g., `client-production.up.railway.app`).

## Troubleshooting

-   **CORS Issues**: Ensure your Backend's `cors` configuration allows the Frontend's domain. Your current `server.js` uses `app.use(cors())` which allows all origins, so it should work out of the box.
-   **Database Connection**: Ensure the Backend has the correct `DATABASE_URL`. If using Railway Postgres, use the TCP connection string (e.g. `postgresql://...`).
-   **Build Fails**: Check the build logs. Ensure dependencies are installed.
-   **White Screen on Frontend**: Check console logs. Usually points to missing `VITE_BASE_URL` or misconfigured API calls.

## Additional Notes
-   We modified `server/config/prisma.js` to use the standard `PrismaClient` to ensure compatibility with standard PostgreSQL databases used on Railway.
-   We updated `client/package.json` to include `serve` for serving the static files in production.
