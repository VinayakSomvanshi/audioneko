# audioneko: Implementation Checklist & Progress Tracker

> **Live Engineering Dashboard**: Tracks architectural milestones, component implementation status, and delivery phases. Updated after every logical step.

---

## 📊 High-Level Status Dashboard

| Metric | Status | Details |
| :--- | :--- | :--- |
| **Current Phase** | **Phase 1: Foundation & Data Engine** | Token minter, shared types, and D1 database ready |
| **Active Step** | **Step 1.5: 2 MB Chunk Range Proxy & Edge Cache API** | Implementing range proxy and edge caching |
| **Total Milestones** | **4 Phases / 18 Core Steps** | 4 steps completed |
| **Free-Tier Safety** | **Verified & Compliant (100%)** | All services within $0.00/mo envelope |
| **Git Repository** | **Connected to GitHub** | `main` branch synced with `origin` |

---

## 🗂️ Phased Implementation Checklist

### Phase 1: Foundation, Workspace & Core Data Engine
- [x] **Step 1.1: Root Monorepo Architecture & Tooling**
  - [x] Configure `pnpm` workspace (`pnpm-workspace.yaml`) with script permission policies
  - [x] Configure Turborepo build & dev pipeline (`turbo.json`)
  - [x] Configure Biome Rust linter and formatter (`biome.json`)
  - [x] Base strict TypeScript configuration (`tsconfig.json`)
  - [x] Initialize Git repository, `.gitignore`, and initial commit to GitHub
- [x] **Step 1.2: Shared Domain Schemas & API Contracts**
  - [x] Create `packages/shared/` workspace package
  - [x] Define domain interfaces: `Book`, `Chapter`, `AudioFile`, `Series`, `Progress`, `Bookmark`, `Clip`, `Shelf`, `SyncMessage` (`src/schema.ts`)
  - [x] Define API request & response contracts (`src/contracts.ts`)
  - [x] Compile and verify with `tsc --noEmit` and Biome
- [x] **Step 1.3: Edge Server Core & Drizzle D1 Database**
  - [x] Initialize `packages/server/` workspace package
  - [x] Configure `wrangler.jsonc` with D1 (`DB`), R2 (`R2`), KV (`KV`), and Durable Objects (`SYNC_ROOM`)
  - [x] Implement Drizzle ORM schema for D1 SQLite (`src/db/schema.ts`) with 16 tables
  - [x] Configure `drizzle.config.ts` for database migrations
  - [x] Generate initial SQL migration files via `drizzle-kit generate`
- [x] **Step 1.4: Zero-Dependency Google Service Account Token Minter**
  - [x] Implement Web Crypto RSA-SHA256 JWT minting (`src/drive/token.ts`)
  - [x] Implement KV caching for Bearer access token (55-minute TTL)
  - [x] Unit tests for token signing and expiry handling (`src/drive/token.test.ts`)
- [ ] **Step 1.5: 2 MB Chunk Range Proxy & Edge Cache API**
  - [ ] Implement Hono streaming endpoint (`/api/stream/:fileId`)
  - [ ] Byte-range alignment to uniform 2 MB chunk boundaries
  - [ ] Cloudflare Edge Cache API integration (`caches.default`)
  - [ ] Partial Content (`206 Partial Content`) header synthesizer
- [ ] **Step 1.6: Streaming Metadata & Chapter Extraction**
  - [ ] ISO-BMFF / MP4 atom parser for `.m4b` chapters (`moov.trak.mdia.minf.stbl`)
  - [ ] ID3v2.3 / ID3v2.4 frame parser for `.mp3` chapter markers (`CHAP` / `CTOC`)
  - [ ] Embedded cover art extraction (`APIC` / `covr`) without full-file downloads

---

### Phase 2: Authentication, Security & Player UI Shell
- [ ] **Step 2.1: Better Auth with Passkeys & D1**
  - [ ] Mount Better Auth router on Hono (`/api/auth/*`)
  - [ ] Configure `@better-auth/passkey` for WebAuthn biometric login
  - [ ] D1 session management and secure HttpOnly cookie handling
- [ ] **Step 2.2: Cryptographic Invite Token Engine**
  - [ ] Single-use 256-bit entropy invite link generator
  - [ ] Token redemption endpoint with Cloudflare Turnstile verification
  - [ ] First-run user onboarding flow
- [ ] **Step 2.3: TanStack Start + Tailwind CSS v4 PWA Shell**
  - [ ] Initialize `packages/app/` with TanStack Start, React 19, and Vite
  - [ ] Configure Tailwind CSS v4 with CSS-first `@theme` design tokens
  - [ ] Build responsive layout: Obsidian glassmorphism navigation, responsive sidebar
- [ ] **Step 2.4: Core Audio Player & Web Audio DSP Engine**
  - [ ] HTMLMediaElement transport with smooth 40ms gain ramp cross-fade
  - [ ] Web Audio API pipeline: 3-band parametric voice boost EQ
  - [ ] AudioWorklet for dynamic RMS silence trimming (Smart Speed)
  - [ ] Loudness normalization compressor targeting $-16\text{ LUFS}$
- [ ] **Step 2.5: Media Session, Lock Screen & Waveform Scrubber**
  - [ ] `navigator.mediaSession` metadata and hardware media key handlers
  - [ ] Decelerated vertical-drag waveform scrubbing bar
  - [ ] Smart sleep timer with shake-to-extend accelerometer integration
  - [ ] Picture-in-Picture (PiP) audio canvas visualizer

---

### Phase 3: Real-Time Sync, Offline Storage & Active Shelf
- [ ] **Step 3.1: Durable Objects Real-Time Progress Sync**
  - [ ] Implement `SyncRoom` Durable Object class with SQLite backend
  - [ ] Stateful hibernatable WebSocket listener connections
  - [ ] Hybrid Logical Clock (HLC) + Monotonic Progress Vector conflict resolution
  - [ ] Multi-device "Resume from other device" notification banner
- [ ] **Step 3.2: Origin Private File System (OPFS) Download Manager**
  - [ ] Background stream writer to OPFS via `FileSystemWritableFileStream`
  - [ ] Service Worker range request interception for offline playback
  - [ ] Client storage quota management dashboard with per-book cache eviction
- [ ] **Step 3.3: Cloudflare R2 Active Shelf LRU Cache Queue**
  - [ ] Cloudflare Queue worker pre-caching active books from Drive to R2
  - [ ] 8.5 GB high-water mark automatic LRU eviction policy
- [ ] **Step 3.4: Listening Analytics, Streaks & Social Presence**
  - [ ] Daily listening streak counter & GitHub-style activity heatmap
  - [ ] Edge presence tracking for friends listening activity
  - [ ] Synchronized listen-along room host/follower audio clock slewing

---

### Phase 4: Polish, Compatibility & Production Deployment
- [ ] **Step 4.1: Audiobookshelf (ABS) API Compatibility Layer**
  - [ ] Implement `/api/v1/login`, `/api/v1/libraries`, `/api/v1/items/:id`, `/api/v1/me/progress`
  - [ ] Verification with Plappa (iOS) and ShelfPlayer apps
- [ ] **Step 4.2: Workers AI Whisper & Llama Narrative Recaps**
  - [ ] Whisper Large v3 Turbo transcription for audio clips
  - [ ] Llama 3.3 70B narrative recap generation for paused books
- [ ] **Step 4.3: Two-Tier Search Engine**
  - [ ] Client-side MiniSearch for sub-5ms title/author/narrator search
  - [ ] Vectorize 768-dimension embeddings for natural language book discovery
- [ ] **Step 4.4: Automated CI/CD & Production Wrangler Deploy**
  - [ ] GitHub Actions workflow for linting, typechecking, and testing
  - [ ] Production deployment to custom domain on Cloudflare Anycast edge

---

## 📝 Activity Log

| Date / Time | Step Completed | Changes Made |
| :--- | :--- | :--- |
| **2026-10-04 22:31** | **Repository Setup** | Initialized git repository, added `.gitignore`, `README.md`, and `PROJECT_DESIGN_DOCUMENT.md`. Pushed to GitHub. |
| **2026-10-04 22:36** | **Tooling Setup** | Installed `pnpm` 12.9.1, configured `pnpm-workspace.yaml`, `turbo.json`, `biome.json`, and root `tsconfig.json`. |
| **2026-10-04 22:39** | **Shared Package** | Created `packages/shared` with domain schemas (`schema.ts`) and API contracts (`contracts.ts`). Typechecked and linted. |
| **2026-10-04 22:41** | **Progress Tracker** | Created live `PROGRESS.md` tracking all 4 phases and 18 steps. |
| **2026-10-04 22:44** | **Step 1.3: D1 Database Core** | Created `packages/server`, `wrangler.jsonc`, 16-table Drizzle ORM schema, and generated SQL migrations. |
| **2026-10-04 22:46** | **Step 1.4: Google Token Minter** | Implemented zero-dependency Web Crypto RSA-SHA256 JWT minter with KV caching; 4 Vitest unit tests passed. |
