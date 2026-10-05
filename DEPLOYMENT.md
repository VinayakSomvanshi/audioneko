# audioneko: Production Deployment Runbook ($0.00/mo Cloudflare Edge)

> **Zero-Recurring-Cost Private Audiobook Platform**: Complete guide to deploying **audioneko** to Cloudflare's Anycast edge network at $0.00/mo without requiring a credit card or paid domain registrar.

---

## 🏗️ Architecture Overview

```
Google Drive (Cold Vault)
       │  (Encrypted Chunk Stream via Service Account)
       ▼
Cloudflare Workers monolith (Hono)
 ├── D1 SQLite Database (Metadata, Users, Progress, Social Presence)
 ├── KV Namespace (Access Token Cache & State)
 ├── Durable Objects (Real-Time Multi-Device WebSocket Sync & Listen-Along)
 └── Static Assets (React 19, TanStack Router, Tailwind v4 PWA Shell)
       ▲
       │  (Web Audio DSP, OPFS Offline Playback, MiniSearch)
Clients: Browser PWA / Plappa / ShelfPlayer
```

---

## 📋 Prerequisites

1. **Free Cloudflare Account**: Sign up at [cloudflare.com](https://dash.cloudflare.com) (no credit card required).
2. **Node.js 22+ & pnpm**:
   ```bash
   export PATH="$HOME/.local/bin:$PATH"
   pnpm --version
   ```
3. **Wrangler CLI Login**:
   ```bash
   pnpm --filter @audioneko/server wrangler login
   ```
4. **Google Cloud Service Account**:
   - Create a Google Cloud project (free tier).
   - Enable the **Google Drive API**.
   - Create a Service Account, generate a JSON Key, and share your Audiobook Vault folder with the service account email (Viewer permissions).

---

## 🚀 Step-by-Step Deployment

### 1. Provision Cloudflare D1 SQLite Database

Create the production D1 database:
```bash
pnpm --filter @audioneko/server wrangler d1 create audioneko-db
```

Copy the returned `database_id` and update `packages/server/wrangler.jsonc`:
```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "audioneko-db",
    "database_id": "<YOUR_D1_DATABASE_ID>",
    "migrations_dir": "drizzle"
  }
]
```

Apply database migrations to the remote D1 instance:
```bash
pnpm --filter @audioneko/server wrangler d1 migrations apply audioneko-db --remote
```

---

### 2. Provision Cloudflare KV Namespace

Create the production KV namespace for Google access token caching:
```bash
pnpm --filter @audioneko/server wrangler kv:namespace create audioneko-kv
```

Copy the returned `id` and update `packages/server/wrangler.jsonc`:
```jsonc
"kv_namespaces": [
  {
    "binding": "KV",
    "id": "<YOUR_KV_NAMESPACE_ID>"
  }
]
```

---

### 3. Configure Production Secrets

Set encrypted production secrets using Wrangler:

```bash
# 1. Better Auth Encryption Secret (32+ bytes cryptographic entropy)
pnpm --filter @audioneko/server wrangler secret put BETTER_AUTH_SECRET
# Paste result of: openssl rand -base64 32

# 2. Google Service Account Email
pnpm --filter @audioneko/server wrangler secret put GOOGLE_SERVICE_ACCOUNT_EMAIL
# Paste: your-service-account@project.iam.gserviceaccount.com

# 3. Google Service Account RSA Private Key (PEM format)
pnpm --filter @audioneko/server wrangler secret put GOOGLE_PRIVATE_KEY
# Paste: -----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----

# 4. App URL (Your *.workers.dev subdomain or custom domain)
pnpm --filter @audioneko/server wrangler secret put APP_URL
# Example: https://audioneko.<your-subdomain>.workers.dev
```

---

### 4. Build and Deploy

Build the client PWA and deploy the unified edge worker:

```bash
# 1. Build client static assets
pnpm run build

# 2. Deploy to Cloudflare Workers
pnpm --filter @audioneko/server wrangler deploy
```

Your server will be live immediately at `https://audioneko.<subdomain>.workers.dev`.

---

## 🔑 Initial Setup: Curator Admin Onboarding

1. Generate your initial admin registration invite token locally or via D1 command:
   ```bash
   pnpm --filter @audioneko/server wrangler d1 execute audioneko-db --remote \
     --command "INSERT INTO invites (id, token_hash, created_by, role, expires_at, max_uses, used_count) VALUES ('inv_init', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'system', 'admin', 2000000000, 1, 0);"
   ```
2. Open `https://audioneko.<subdomain>.workers.dev/join?token=<YOUR_TOKEN>` in your browser.
3. Complete sign-up to become the primary Curator / Admin.
4. Access `/admin/invites` in the dashboard to generate single-use invite links for your 3–10 friends.

---

## 📱 Connecting Third-Party Audiobookshelf Apps

**audioneko** includes a native Audiobookshelf (ABS) API compatibility layer:

- **Plappa (iOS)**: In Plappa, tap **Add Server** > Select **Audiobookshelf** > Enter your worker URL (`https://audioneko.<subdomain>.workers.dev`) > Enter your audioneko username and password.
- **ShelfPlayer**: In ShelfPlayer, enter your server URL and credentials.
- **ABS Android / Web**: Connects out of the box with the same URL.

---

## 🛡️ Free Tier Quota Safety Runbook

| Service | Free Tier Allocation | Estimated 3–10 Friends Usage | Safety Headroom |
| :--- | :--- | :--- | :--- |
| **Workers Requests** | 100,000 / day | ~500 / day | **99.5%** |
| **D1 Row Reads** | 5,000,000 / day | ~5,000 / day | **99.9%** |
| **D1 Row Writes** | 100,000 / day | ~500 / day | **99.5%** |
| **KV Reads** | 100,000 / day | ~200 / day | **99.8%** |
| **Durable Objects** | 1,000,000 req / month | ~15,000 req / month | **98.5%** |
| **Drive API** | 10,000 req / 100s | < 1 req / 100s | **99.9%** |
| **Browser OPFS** | Unlimited (Client Disk) | Hundreds of GBs local | **100% Free** |

**Zero Credit Card Guarantee**: All services operate strictly within permanent $0.00/mo allocations.
