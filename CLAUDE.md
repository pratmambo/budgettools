# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies (required before first deploy)
npm install

# Deploy to Netlify production
npx netlify deploy --dir . --prod

# Deploy a preview (staging)
npx netlify deploy --dir .
```

There is no build step — HTML files are served directly as-is. CSS uses the Tailwind CDN (`cdn.tailwindcss.com`) with a per-page `tailwind.config` block, not a local build.

## Architecture

BudgetTools is a **static HTML SaaS** with serverless backend functions. There is no framework or bundler; each page is a self-contained HTML file. Live at `https://budgettemplates.shop`.

### Three external services

| Service | Role |
|---|---|
| **Supabase** | Auth (email/password + Google OAuth) and database (Postgres with RLS) |
| **Cashfree** | Subscription payments — JS SDK checkout, webhook-driven activation |
| **Netlify** | Hosting (static files) + serverless functions (`netlify/functions/`) |

### Two categories of HTML pages

- **Free calculators** (`calc-*.html`) — standalone tools, no auth or payment integration. Each is fully self-contained.
- **Premium templates** (`wedding-planner.html`, `event-budget.html`, `travel-budget.html`, `cafe-costing.html`, `inventory.html`) — use the full auth → storage → payment → trial stack. Gated by a 5-minute demo timer + paywall. One-time payment grants 30 days of access.
- **Auth/account pages** (`auth.html`, `account.html`) and landing page (`index.html`).

### Client-side JS modules (`/js/`)

All four are loaded via `<script>` tags in templates — there is no bundler.

- **`auth.js`** — Initialises Supabase client, exposes `window.BT_AUTH` with session/user state and `apiFetch()` for authenticated calls to Netlify Functions. Dispatches `bt:auth:ready` and `bt:auth:change` custom events. Also provides `updateNav()` which toggles visibility of elements with `data-bt-*` attributes (`data-bt-login`, `data-bt-account`, `data-bt-user-email`, `data-bt-avatar`, `data-bt-signout`).
- **`storage-cloud.js`** — Overrides `window.Storage` with a cloud-backed API (`Storage.get()`, `Storage.set()`, `Storage.clear()`). Writes localStorage immediately (zero latency) and debounces cloud saves by 800 ms. Falls back to localStorage when logged out. Exposes `window.BT_STORAGE.checkProAccess()` and `window.BT_STORAGE.startCheckout()`.
- **`subscription.js`** — Exposes `window.BT_SUB` with the upgrade banner/modal and Cashfree checkout flow (`startCheckout(templateId, phone)`). Loads the Cashfree JS SDK on demand. Called by `BT_STORAGE.startCheckout()`.
- **`trial.js`** — 5-minute demo timer for premium templates. Uses `localStorage` (persists across sessions). After expiry, dims the page and shows the upgrade modal via `BT_SUB.showUpgradeModal()`. Exposes `window.BT_TRIAL.start(templateId)` and `window.BT_TRIAL.unlock()`.

**Script load order in premium templates:** Supabase CDN → `auth.js` → set `window.TEMPLATE_KEY` → `storage-cloud.js` → `subscription.js` → `trial.js`.

### Admin bypass

Admin emails are hardcoded in two places — `trial.js` (skips timer) and `subscription-status.js` (returns `hasAccess: true` for all templates). Both check against the same list. When adding a new admin, update both files.

### Netlify Functions (`/netlify/functions/`)

All functions use the Supabase **service role key** (bypasses RLS). Client JS only holds the anon key.

| Function | Route | Purpose |
|---|---|---|
| `user-data.js` | `GET/POST /api/user-data` | Read/write template state (JSONB) in `template_data` table |
| `subscription-status.js` | `GET /api/subscription-status` | Check if user has active (non-expired) access for a template or `all` |
| `create-checkout-session.js` | `POST /api/create-checkout-session` | Create Cashfree one-time order, return `sessionId` for JS SDK |
| `customer-portal.js` | `POST /api/customer-portal` | Returns user's active purchases and expiry dates |
| `payment-webhook.js` | `POST /webhooks/cashfree` | Receive Cashfree payment events → upsert `subscriptions` table with 30-day expiry |

### Database schema (`supabase-schema.sql`)

Three tables with RLS enabled:

- **`profiles`** — one row per user, auto-created by `on_auth_user_created` trigger on `auth.users` insert.
- **`subscriptions`** — one row per purchase. Written **only** by the webhook function (service role). Each row has `current_period_end` (30 days from payment). Access is granted while `current_period_end > now()`. `template_key` is one of: `wedding | event | travel | cafe | inventory | all`.
- **`template_data`** — one row per `(user_id, template_key)`. Stores the template's entire state as JSONB.

### Template keys

Each paid template maps to a key used consistently across `PLAN_PRICES` (create-checkout-session.js), `KEY_TO_TEMPLATE` (storage-cloud.js), `TEMPLATES` (subscription.js), and the database:

`wedding`, `event`, `travel`, `cafe`, `inventory`, `all`

The localStorage keys use a versioned format: `bt_wedding_v2`, `bt_event_v2`, `bt_travel_v1`, `bt_cafe_v1`, `bt_inventory_v1`. These are set via `window.TEMPLATE_KEY` in each HTML template before `storage-cloud.js` loads.

### Routing (`netlify.toml`)

- `/api/*` → `/.netlify/functions/:splat`
- `/webhooks/cashfree` → `/.netlify/functions/payment-webhook`
- `/auth/callback` → `/auth.html?mode=callback`

### Environment variables

All secrets live in Netlify environment variables (never in client JS):

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `CASHFREE_WEBHOOK_SECRET`, `CASHFREE_ENV` (sandbox or production), `URL`

Cashfree prices (USD) are hardcoded in `create-checkout-session.js` PLAN_PRICES. One-time payments — each purchase grants 30 days of access.

The client-side `SUPABASE_URL` and `SUPABASE_ANON_KEY` are hard-coded in `js/auth.js` — the anon key is safe to expose because RLS enforces data isolation.
