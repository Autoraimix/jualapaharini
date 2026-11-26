# HariniJualApa — Smart Affiliate Price Finder (PWA + SQLite)

A mobile-first Progressive Web App (PWA) and full-width desktop storefront powered by **React + Vite + Tailwind CSS**, **Node.js / Express**, and **SQLite** (`better-sqlite3`).

## Features

- **Smart Search & Sorting**: Natural-language price intents (`"earbuds under 80"`), synonyms (`"kipas"`, `"baju"`), typo tolerance, item codes (`#001`), plus sorting by **Latest**, **Price: Low → High**, **Price: High → Low**, **Top Purchase**, and **Most Reliable**.
- **1 to 4 Store Links per Product**: Attach links from **Shopee**, **TikTok Shop**, **Lazada**, and **Pinduoduo** (minimum 1 link required, up to 4), with automatic price comparison and best-deal highlighting.
- **Multi-Link Reliability Score**: Automatically averages product ratings across all attached store links.
- **Hidden Admin Portal (`/admin`)**:
  - Normal users only see `Home`, `Top Picks`, and `Saved`.
  - Admin opens `/admin` (e.g. `http://localhost:5173/admin` or `http://localhost:3001/admin`) to sign in.
  - Persistent SQLite sessions with **10-minute inactivity auto-lock** and explicit **Log Out**.
  - **Change Password** menu (`Username`, `Current Password`, `New Password`, `Confirmation Password`).
  - Local file upload for product images, per-platform Auto-Fetch (supports optional `SHOPEE_APP_ID` / `SHOPEE_APP_SECRET` Affiliate OpenAPI keys), and **CSV / JSON bulk import & export**.
- **Full-Stack QA Suite**: Run `npm run qa` to verify production PWA build, Express/SQLite integration tests, 10-minute idle expiry, CSV/JSON roundtrip, and headless Playwright PC & mobile UI checks.

## Getting Started

1. Copy `.env.example` to `.env` and set your admin credentials:
   ```powershell
   Copy-Item .env.example .env
   ```
2. Install dependencies:
   ```powershell
   npm install
   ```
3. Run in development mode (`http://localhost:5173`):
   ```powershell
   npm run dev
   ```
4. Or build & run production PWA mode (`http://localhost:3001`):
   ```powershell
   npm run build
   npm start
   ```
5. Run automated Full-Stack QA:
   ```powershell
   npm run qa
   ```
