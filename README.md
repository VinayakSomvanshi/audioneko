# audioneko

A private, zero-recurring-cost audiobook streaming platform for personal libraries and small groups of friends, powered by Google Drive and the Cloudflare Edge platform.

---

## Architecture and Design Blueprint

The complete technical architecture, data model, free-tier budget, security threat model, and delivery plan are documented in:

* [PROJECT_DESIGN_DOCUMENT.md](./PROJECT_DESIGN_DOCUMENT.md)
* [PROGRESS.md](./PROGRESS.md)

---

## Core Highlights

* **Zero-Cost Invariant ($0.00 / month forever, Zero Credit Card Required)**: Operates entirely within the permanent free tiers of Cloudflare (Workers with Static Assets, D1, Durable Objects, KV) and Google Cloud Platform without requiring a credit card on file.
* **Instant Zero-Latency Playback**: Sub-100ms audio startup via speculative background pre-warming, multi-tier metadata caching, non-blocking audio pipelines, and RFC 7233 range-streaming.
* **Google Drive as Single Source of Truth**: Original audiobook files remain securely stored in Google Drive ("Cold Vault"). The edge indexes, enriches, and caches active streams without redundant storage costs.
* **3-Tier Zero-Card Streaming Pipeline**: Client OPFS (offline pre-cache on listener device) -> Cloudflare Edge Cache API (2 MB sliced audio ranges) -> Authenticated Google Drive Streaming Proxy with open-ended RFC 7233 range requests.
* **Client-Side Web Audio DSP**: Custom audio engine featuring Smart Speed (dynamic silence trimming), Voice Boost EQ (85 Hz high-pass cut, 2.2 kHz dialogue lift, sibilance taming), and loudness normalization.
* **Full-Featured Player Experience**: Dynamic waveform scrubber with 4-tier decelerated fine-scrubbing (1x, 0.5x, 0.25x, 0.1x), desktop keyboard shortcuts, dual buffered/played progress tracks, sleep timer with audio fade-out, bookmarks, and notes.
* **Cross-Device Sync and Social Presence**: Cloudflare Durable Objects with hibernatable WebSockets for sub-second playback sync across tabs and devices, real-time friend activity presence, and synchronized listen-along rooms.
* **Audiobookshelf (ABS) Compatibility Layer**: Emulates the Audiobookshelf REST and WebSocket APIs (`/api/v1/authorize`, `/api/libraries`, `/api/items`, `/api/session/local`), allowing third-party mobile clients like Plappa (iOS) and ShelfPlayer (Android) to connect directly.
* **Cryptographic Invites and Access Control**: Single-use 256-bit entropy cryptographic invite tokens, email/password credentials managed by Better Auth, and role-based listener/admin authorization.
* **Offline-First PWA**: Progressive Web App with standalone display support, Service Worker stale-while-revalidate asset caching, and book storage in the Origin Private File System (OPFS).

---

## Technology Stack

### Frontend (`packages/app`)
* **Framework**: React 19 with TanStack Router and TanStack Query
* **Styling**: Tailwind CSS v4, Vanilla CSS design tokens (`sober-thoughts` dark palette)
* **Audio**: HTML5 Audio wrapped in Web Audio API DSP pipeline
* **Search**: Client-side MiniSearch index for sub-5ms title, author, and narrator queries
* **Icons**: Lucide Icons
* **Build Tooling**: Vite 6

### Backend (`packages/server`)
* **Runtime**: Cloudflare Workers with Static Assets
* **Routing**: Hono v4
* **Database**: Cloudflare D1 (Serverless SQLite) with Drizzle ORM
* **State and WebSockets**: Cloudflare Durable Objects (`SyncRoom`, `ListenAlongRoom`)
* **Key-Value Cache**: Cloudflare Workers KV
* **Background Tasks**: Scheduled Worker Crons (`0 */6 * * *`)
* **Authentication**: Better Auth with D1 adapter

### Shared Library (`packages/shared`)
* Cross-package TypeScript interfaces, validation schemas, chapter models, and protocol definitions.

---

## Monorepo Structure

```text
audioneko/
├── packages/
│   ├── app/                 # TanStack React 19 Single Page App
│   │   ├── src/
│   │   │   ├── components/  # Player, Library, Shelf, Social, and Admin components
│   │   │   ├── context/     # Audio player context and Web Audio bridge
│   │   │   ├── lib/         # Audio engine, OPFS storage, search, sleep timer
│   │   │   └── routes/      # Declarative TanStack Router views
│   │   └── index.html
│   ├── server/              # Hono application deployed to Cloudflare Workers
│   │   ├── src/
│   │   │   ├── abs/         # Audiobookshelf API compatibility layer
│   │   │   ├── admin/       # Control plane and library scan routes
│   │   │   ├── auth/        # Better Auth setup, invites, middleware
│   │   │   ├── db/          # D1 schema and database clients
│   │   │   ├── drive/       # Google Drive token manager, scanner, and stream proxy
│   │   │   ├── shelf/       # R2 active shelf queue and LRU maintenance
│   │   │   ├── social/      # Listening analytics, presence, and listen-along rooms
│   │   │   ├── sync/        # Real-time multi-device playback synchronization
│   │   │   └── index.ts     # Edge router, cron handler, and asset fallback
│   │   └── wrangler.jsonc   # Cloudflare Workers configuration and resource bindings
│   └── shared/              # Common data models, constants, and utilities
├── package.json             # Turborepo and pnpm root workspace configuration
├── biome.json               # Code formatting and linting rules
└── tsconfig.base.json       # Monorepo TypeScript base configuration
```

---

## Getting Started

### Prerequisites
* Node.js 20.x or later
* pnpm (`corepack enable pnpm` or npm)
* Cloudflare Wrangler CLI (`npm install -g wrangler`)
* Google Cloud Platform service account credentials with Google Drive read permissions

### Installation

1. Clone the repository:
   ```bash
   git clone git@github.com:VinayakSomvanshi/audioneko.git
   cd audioneko
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Configure environment variables in `packages/server/.dev.vars`:
   ```bash
   BETTER_AUTH_SECRET="your-32-byte-hex-secret"
   BETTER_AUTH_URL="http://localhost:5173"
   GOOGLE_SERVICE_ACCOUNT_EMAIL="your-sa@project.iam.gserviceaccount.com"
   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   GOOGLE_DRIVE_FOLDER_ID="your-google-drive-audiobooks-folder-id"
   ```

### Local Development

* Run all packages in development mode:
  ```bash
  pnpm dev
  ```
  The client application will start at `http://localhost:5173` and the server will start via Wrangler at `http://localhost:8787`.

* Run the test suite:
  ```bash
  pnpm test
  ```

* Verify TypeScript types across the monorepo:
  ```bash
  pnpm typecheck
  ```

* Format and lint with Biome:
  ```bash
  pnpm lint
  pnpm format
  ```

### Database Migrations

Apply database migrations to Cloudflare D1:

* Local development database:
  ```bash
  cd packages/server
  pnpm db:migrate:local
  ```

* Remote production database:
  ```bash
  cd packages/server
  pnpm db:migrate:remote
  ```

---

## Deployment

Build the frontend bundle and deploy the server worker to Cloudflare:

1. Build the frontend client:
   ```bash
   cd packages/app
   pnpm build
   ```

2. Deploy the worker and static assets:
   ```bash
   cd packages/server
   wrangler deploy
   ```

Live production instance:
[https://audioneko.greatmidoriya.workers.dev](https://audioneko.greatmidoriya.workers.dev)

---

## License

Private and non-commercial personal use. All rights reserved.
