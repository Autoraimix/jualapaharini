# Full-Stack Self-Review & QA Protocol (HariniJualApa)

Adapted and improvised from Raxzon Launcher QA & Review Standards for **React + Vite PWA + Express + SQLite**.

---

## 1. Dual-Reviewer Protocol

Before shipping any feature or bug fix, verify through both lenses:
- **`senior-reviewer` (Code, API, DB, Security)**: SQLite schema & migrations, salted `scrypt` auth, 10-minute idle session timeout, 1–4 store link validation, CSV/JSON import/export edge cases, clean lifecycle cleanup.
- **`ui-reviewer` (UI/UX, Responsive, PWA)**: Mobile PWA 1-col + bottom dock vs PC 5-col + left sidebar, hidden `/admin` route, red error / green success banners, file-only image upload, no emojis in Admin category select, clean Change Password menu order.

---

## 2. Mandatory Full-Stack Invariants (Anti-Regression Rules)

1. **Storefront Navigation & Hidden Admin**:
   - Shoppers only see `Home`, `Top Picks`, `Saved` (plus Smart Filter on mobile).
   - Admin accesses the portal exclusively via `/admin` (or `#/admin`).
2. **1 to 4 Store Links (`Shopee`, `TikTok`, `Lazada`, `Pinduoduo`)**:
   - Every product requires **at least 1 link** and supports up to **4 links**.
   - `reliability_score` is always computed from the average rating of attached links.
3. **Admin Session & Security**:
   - Sessions persist in SQLite (`admin_sessions`) with a **10-minute sliding inactivity timeout**.
   - Never display `"Session expired"` unless an active session actually timed out after 10 minutes AFK (`code: 'SESSION_EXPIRED'`).
   - Change Password lives in its own **Change Password** menu with exact field order: `Username`, `Current Password`, `New Password`, `Confirmation Password`.
   - Always provide a visible **Log Out** button when authenticated.
4. **Admin Form & Status Feedback**:
   - Errors & warnings render in **red** (`rose-*`); successes render in **green** (`emerald-*`).
   - Category `<select>` shows category names only (no icons/emojis).
   - Product images are uploaded via local file selection (`<input type="file">`) only.
   - CSV and JSON import & export must handle `RM`-prefixed prices and auto-generate sequential `#code` values without collisions.

---

## 3. Automated QA Gate

Run before every release or push:
```bash
npm run qa
```
`npm run qa` executes:
1. `npm run build` (Vite + Workbox PWA precache verification)
2. Express + SQLite API integration suite (isolated temp DB, auth/10-min expiry, CRUD, CSV/JSON roundtrip, 1–4 link constraints, upload, smart search)
3. Headless Chrome Playwright E2E UI verification on both PC (`1440×860`) and Mobile (`420×860`)
