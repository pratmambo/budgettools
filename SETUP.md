# BudgetTools — Setup Guide

Complete walkthrough for going from a static HTML site to a fully working SaaS with cloud sync, auth, and payments.

---

## Overview

This setup connects three services:

- **Supabase** — handles user authentication (email/password + Google OAuth) and stores per-user budget data with Row Level Security so users can only see their own records.
- **Stripe** — handles subscriptions and payments. A webhook keeps your Supabase `subscriptions` table in sync with Stripe billing events.
- **Netlify Functions** — serverless backend that sits between the browser and Supabase/Stripe. These functions hold the secret keys (service role, Stripe secret) that must never appear in client-side JS.

The client-side JS in `/js/auth.js`, `/js/storage-cloud.js`, and `/js/subscription.js` only use the Supabase **anon key** (safe to expose) and JWT tokens issued after login. All privileged operations go through Netlify Functions.

---

## Step 1: Supabase Setup

### 1.1 Create a project

1. Go to [supabase.com](https://supabase.com) and sign in.
2. Click **New project**, choose a name (e.g. `budgettools`), set a strong database password, and pick the region closest to your users.
3. Wait ~2 minutes for the project to provision.

### 1.2 Run the database schema

1. In the Supabase dashboard, go to **SQL Editor** → **New Query**.
2. Open `supabase-schema.sql` from this repo and paste the entire contents into the editor.
3. Click **Run**. You should see "Success. No rows returned."

This creates the `user_data` and `subscriptions` tables with the correct RLS policies.

### 1.3 Get your API keys

1. Go to **Settings** → **API**.
2. Copy the **Project URL** — it looks like `https://abcdefghijklm.supabase.co`.
3. Copy the **anon / public** key — starts with `eyJ`.
4. Copy the **service_role** key (keep this secret — only used in Netlify Functions).

### 1.4 Enable Google OAuth

1. Go to **Authentication** → **Providers** → **Google** → toggle **Enable**.
2. You need a Google OAuth 2.0 Client ID and Secret. To get them:
   - Go to [console.cloud.google.com](https://console.cloud.google.com).
   - Create a new project (or select an existing one).
   - Go to **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**.
   - Choose **Web application** as the application type.
   - Under **Authorised redirect URIs**, add: `https://abcdefghijklm.supabase.co/auth/v1/callback` (replace with your actual Supabase Project URL).
   - Copy the **Client ID** and **Client Secret**.
3. Back in Supabase, paste the Client ID and Client Secret into the Google provider form and save.

### 1.5 Configure redirect URLs

1. In Supabase, go to **Authentication** → **URL Configuration**.
2. Set **Site URL** to your Netlify URL, e.g. `https://your-site.netlify.app`.
3. Under **Redirect URLs**, click **Add URL** and add: `https://your-site.netlify.app/auth.html`
4. Save changes.

---

## Step 2: Update auth.js and auth.html

Replace the placeholder values in the following files with your real Supabase credentials.

### js/auth.js

Find these two lines near the top and replace the placeholder strings:

```js
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
```

### auth.html

Find the same two placeholders in the `<script>` block near the top of `auth.html` and replace them.

### account.html

Find the same two placeholders in the `<script>` block near the top of `account.html` and replace them.

> **Note:** The anon key is safe to commit to version control and expose in client-side JS. Supabase's Row Level Security policies ensure each user can only access their own data. Never put the `service_role` key in any client-side file.

---

## Step 3: Stripe Setup

### 3.1 Create an account

1. Go to [stripe.com](https://stripe.com) and sign up or sign in.
2. Stay in **Test mode** until you are ready to go live (toggle in the dashboard top-left).

### 3.2 Create subscription products

Create 6 products with monthly recurring prices. For each one, you must add a `template_key` metadata field so the webhook can match a subscription to a template.

| Product name             | Price        | `template_key` metadata value |
|--------------------------|--------------|-------------------------------|
| Wedding Planner Pro      | $8.99/month  | `wedding`                     |
| Event Budget & P&L Pro   | $8.99/month  | `event`                       |
| Travel Budget Planner Pro| $8.99/month  | `travel`                      |
| Cafe Costing Pro         | $8.99/month  | `cafe`                        |
| Inventory Management Pro | $8.99/month  | `inventory`                   |
| All Templates — All-Access | $19.99/month | `all`                        |

**For each product:**
1. Go to **Products** → **Add product**.
2. Enter the name, set pricing to **Recurring** → **Monthly**, and enter the price.
3. Under **Product metadata**, add key `template_key` with the value from the table above.
4. Save the product and copy the **Price ID** (starts with `price_`). You will need these for the environment variables.

### 3.3 Enable the Customer Portal

1. Go to **Settings** → **Billing** → **Customer portal**.
2. Click **Activate** (you can customise the portal settings — allow cancellation, show invoices, etc.).
3. This lets users manage and cancel their own subscriptions from `/account.html`.

---

## Step 4: Netlify Environment Variables

Go to your Netlify site → **Site configuration** → **Environment variables** → **Add a variable**. Add all of the following:

| Variable name                | Value / Description                                                        |
|------------------------------|----------------------------------------------------------------------------|
| `SUPABASE_URL`               | Your Supabase Project URL, e.g. `https://abcdefghijklm.supabase.co`       |
| `SUPABASE_SERVICE_ROLE_KEY`  | Your Supabase service_role key (secret — never in client JS)               |
| `STRIPE_SECRET_KEY`          | Your Stripe secret key. Starts with `sk_test_` in test mode                |
| `STRIPE_WEBHOOK_SECRET`      | Webhook signing secret from Step 6. Starts with `whsec_`                   |
| `STRIPE_PRICE_WEDDING`       | Price ID for Wedding Planner Pro, e.g. `price_xxxxxxxxxx`                  |
| `STRIPE_PRICE_EVENT`         | Price ID for Event Budget & P&L Pro                                        |
| `STRIPE_PRICE_TRAVEL`        | Price ID for Travel Budget Planner Pro                                     |
| `STRIPE_PRICE_CAFE`          | Price ID for Cafe Costing Pro                                              |
| `STRIPE_PRICE_INVENTORY`     | Price ID for Inventory Management Pro                                      |
| `STRIPE_PRICE_ALL`           | Price ID for All-Access bundle                                             |
| `URL`                        | Your Netlify site URL, e.g. `https://your-site.netlify.app` (no trailing slash) |

After adding variables, redeploy your site for them to take effect.

---

## Step 5: Configure Stripe Webhook

The webhook keeps your Supabase `subscriptions` table in sync whenever a subscription is created, updated, cancelled, or a payment fails.

1. In the Stripe dashboard, go to **Developers** → **Webhooks** → **Add endpoint**.
2. Set the **Endpoint URL** to: `https://your-site.netlify.app/webhooks/stripe`
3. Under **Select events**, choose the following:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
   - `invoice.payment_succeeded`
4. Click **Add endpoint**.
5. On the webhook detail page, click **Reveal** next to **Signing secret** and copy it.
6. Go back to Netlify and add/update the `STRIPE_WEBHOOK_SECRET` environment variable with this value.
7. Redeploy the site.

---

## Step 6: Deploy

### 6.1 Install dependencies

Netlify Functions use Node.js packages. Install them from the repo root:

```bash
npm install
```

### 6.2 Deploy to production

```bash
npx netlify deploy --dir . --prod
```

If this is your first deploy on this machine, you will be prompted to log in to Netlify and link to your site.

---

## Step 7: Test the Full Flow

Use Stripe's test card numbers — no real money is charged in test mode.

**Test card:** `4242 4242 4242 4242` — any future expiry date, any 3-digit CVC, any ZIP.

**Recommended test sequence:**

1. Open your deployed site and click **Sign Up Free**.
2. Create an account with a real email address (you will receive a confirmation email from Supabase).
3. Confirm your email, then sign in.
4. Open a template (e.g. Wedding Planner) — you should see the **Demo Mode** banner.
5. Click **Unlock** and complete the Stripe checkout using the test card above.
6. After payment, Stripe redirects back to your site. The template should now load without the demo banner.
7. In Supabase, go to **Table Editor** → `subscriptions` — you should see a row for your user with `status = active`.
8. In the Stripe dashboard → **Customers**, you should see the test customer with an active subscription.
9. Test cloud sync: enter some data in the template, reload the page — data should reload from the cloud, not just localStorage.
10. Go to `/account.html` and verify your subscription is listed. Click **Manage Billing** to open the Stripe Customer Portal.

---

## Troubleshooting

### Webhook not receiving events

- Verify the endpoint URL is exactly `https://your-site.netlify.app/webhooks/stripe` with no trailing slash.
- In the Stripe dashboard → **Developers** → **Webhooks**, click your endpoint and check **Recent deliveries**. Failed deliveries show the HTTP status and response body.
- Make sure all 5 events are selected on the webhook.
- Confirm `STRIPE_WEBHOOK_SECRET` in Netlify matches the signing secret shown on the webhook detail page.

### User can't log in with Google

- In Supabase → **Authentication** → **Providers** → **Google**, confirm the Client ID and Client Secret are correct.
- In Google Cloud Console → **Credentials**, confirm the **Authorised redirect URI** is `https://YOUR-PROJECT-ID.supabase.co/auth/v1/callback` (using your actual Supabase project URL, not your Netlify URL).
- In Supabase → **Authentication** → **URL Configuration**, confirm the Site URL and redirect URL are set to your Netlify domain.

### Function returns 500

- Go to Netlify → **Functions** tab → click the function name → view **Recent invocations** for the error log.
- Check that all environment variables in Step 4 are set and the site has been redeployed after adding them.
- Make sure `npm install` was run before deploying — missing `node_modules` in the functions directory causes 500 errors.

### Template still shows Demo Mode after subscribing

1. In Supabase → **Table Editor** → `subscriptions`, check that a row exists for your user ID with `status = active` and the correct `template_key`.
2. If no row exists, the webhook did not fire or failed. Check Stripe → **Developers** → **Webhooks** → **Recent deliveries** for errors.
3. If a row exists but the template still gates access, check the Netlify function logs for `/api/subscription-status` — look for logic errors or mismatched `template_key` values.
4. Try signing out and back in to force a fresh JWT and subscription check.
