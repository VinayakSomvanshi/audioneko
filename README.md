# audioneko 🎧

> A private, bleeding-edge, zero-recurring-cost audiobook streaming web app for small groups of friends, powered by Google Drive and the Cloudflare Edge platform.

---

## 📖 Architecture & Design Blueprint

The full technical architecture, exhaustive feature inventory, data model, free-tier budget, security threat model, and delivery plan are documented in:

👉 **[PROJECT_DESIGN_DOCUMENT.md](./PROJECT_DESIGN_DOCUMENT.md)**

---

## ⚡ Core Highlights
* **$0.00 / month forever**: Runs 100% within the permanent free tiers of Cloudflare (Workers with Static Assets, D1, R2, Durable Objects) and Google Cloud Platform.
* **Google Drive as Single Source of Truth**: Audio files live in Google Drive ("Cold Vault"). The edge indexes and caches active audio without costly re-hosting.
* **4-Tier Hybrid Streaming**: Client OPFS $\to$ Cloudflare R2 Active Shelf (10 GB LRU) $\to$ Edge Cache API (2 MB slices) $\to$ Google Drive API.
* **Cryptographic Invites & Auth**: Single-use 256-bit entropy cryptographic invite links + Email/Password via Better Auth with D1.
* **Local-First Audio Engine**: Web Audio DSP (Smart Speed silence trimming, Voice Boost EQ, loudness normalization), MediaSession lock-screen integration, and offline downloads via Origin Private File System (OPFS).
* **Audiobookshelf (ABS) API Compatibility**: Connect open-source native apps (Plappa, ShelfPlayer) directly to the edge backend.

---

## 🛠️ Stack at a Glance
* **Frontend**: TanStack (React 19), Tailwind CSS v4, Lucide Icons, Vite
* **Backend**: Hono on Cloudflare Workers (Edge-native monolith with Static Assets)
* **Database & ORM**: Cloudflare D1 (Serverless SQLite) with Drizzle ORM
* **Realtime Sync**: Cloudflare Durable Objects (SQLite backend) with hibernatable WebSockets
* **Search Engine**: Instant client-side index (MiniSearch) for sub-5ms title/author/narrator queries
* **Tooling**: Biome, TypeScript 5.8+, pnpm monorepo, Turborepo, Wrangler v3+

---

## 📄 License
Private & non-commercial use.
