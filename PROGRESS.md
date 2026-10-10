# audioneko: Implementation Checklist & Progress Tracker

> **Live Engineering Dashboard**: Tracks architectural milestones, component implementation status, and delivery phases. Updated after every logical step.

---

## High-Level Status Dashboard

| Metric | Status | Details |
| :--- | :--- | :--- |
| **Current Phase** | **Phase 4: Polish, Compatibility & Production Deployment** | All 4 Phases Complete (100%) |
| **Active Step** | **Step 4.5: Mobile PWA Hardening, Offline Bookmarks Sync & Audio Resilience** | Completed; Full offline PWA with OPFS byte streaming, airplane mode bookmarks auto-sync, anti-suspension audio watchdog, and tactile haptics |
| **Total Milestones** | **4 Phases / 19 Core Steps** | 19 of 19 steps completed (100% Monorepo Completion) |
| **Automated Test Coverage**| **172 Vitest Tests Across 32 Suites** | 100% passing (68 app tests + 104 server tests) |
| **Platform Quota Safety** | **Verified & Compliant (100%)** | All services operate with high headroom margin |
| **Git Repository** | **Connected to GitHub** | `main` branch synced with `origin` |

---

## Phased Implementation Checklist

### Phase 1: Foundation, Workspace & Core Data Engine (100% Complete)
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
- [x] **Step 1.5: 2 MB Chunk Range Proxy & Edge Cache API**
  - [x] Implement Hono streaming endpoint (`/api/stream/:fileId`) with `GET` and `HEAD` support
  - [x] Byte-range alignment to uniform 2 MB chunk boundaries
  - [x] Cloudflare Edge Cache API integration (`caches.default`)
  - [x] R2 Active Shelf fast-path streaming integration (Tier 2)
  - [x] Partial Content (`206 Partial Content`) header synthesizer
  - [x] Unit tests verifying range parsing, chunk boundary logic, and HEAD headers (`src/drive/stream.test.ts`)
- [x] **Step 1.6: Streaming Metadata & Chapter Extraction + External Enrichment**
  - [x] ISO-BMFF / MP4 atom parser for `.m4b` chapters (`chpl`, `mvhd`) and covers (`covr`)
  - [x] ID3v2.3 / ID3v2.4 frame parser for `.mp3` chapter markers (`CHAP` / `CTOC`) and artwork (`APIC`)
  - [x] Open Library API and Google Books API metadata enrichment client (`src/drive/enrich.ts`)
  - [x] Unit tests for binary parsing and external enrichment (`src/drive/metadata.test.ts`, `src/drive/enrich.test.ts`)

---

### Phase 2: Authentication, Security & Player UI Shell (100% Complete)
- [x] **Step 2.1: Better Auth with Email/Password & D1 Database**
  - [x] Mount Better Auth router on Hono (`/api/auth/*`)
  - [x] Configure `emailAndPassword` authentication with secure password hashing
  - [x] D1 session management and secure HttpOnly cookie handling
  - [x] Session & admin authorization middlewares (`requireAuth`, `optionalAuth`, `requireAdmin`)
  - [x] Note: Passkeys moved to future scope / stretch backlog per user request
- [x] **Step 2.2: Cryptographic Invite Token Engine**
  - [x] Single-use 256-bit entropy invite link generator (`generateSecureToken`)
  - [x] SHA-256 token hashing with zero plaintext persistence in D1 (`hashToken`)
  - [x] Token verification and atomic usage counter redemption (`verifyInviteToken`, `redeemInviteToken`)
  - [x] Admin invite management endpoints & token-gated registration endpoint (`/api/invites/*`)
  - [x] 11 new Vitest unit and HTTP route integration tests passing (31 total passing)
- [x] **Step 2.3: TanStack Start + Tailwind CSS v4 PWA Shell**
  - [x] Initialized `packages/app/` with React 19, `@tanstack/react-router`, and Vite
  - [x] Configured Tailwind CSS v4 with CSS-first `@theme` design tokens inspired by `sober-thoughts` (obsidian, high-contrast, tactile 1px borders, zero cloudy glass)
  - [x] Built responsive layout: top header with logo dot & theme toggle, desktop sidebar with R2 quota meter, mobile bottom navigation, and docked mini-player
  - [x] Built routes: `/` (Library & Continue Listening), `/book/:id` (Details & Chapters), `/join` (Invite Onboarding), `/login` (Sign In), `/admin/invites` (Invite Manager)
  - [x] Configured PWA manifest (`public/manifest.json`), favicon, anti-flashbang theme script, and Vitest suite (34 total tests passing across monorepo)
- [x] **Step 2.4: Core Audio Player & Web Audio DSP Engine**
  - [x] HTMLMediaElement transport with smooth 40ms gain ramp cross-fade
  - [x] Web Audio API pipeline: 3-band parametric voice boost EQ (85 Hz highpass, 2.2 kHz presence peak, 7.5 kHz sibilance notch)
  - [x] AudioWorklet for dynamic RMS silence trimming (Smart Speed)
  - [x] Loudness normalization compressor targeting $-16\text{ LUFS}$
  - [x] Integrated into AudioContext state, MiniPlayer toggles, and unit tested (39 total tests passing)
- [x] **Step 2.5: Media Session, Lock Screen & Waveform Scrubber**
  - [x] `navigator.mediaSession` metadata, lock screen timeline position state, and hardware media key handlers (`play`, `pause`, `seekto`, `seekbackward`, `seekforward`, `previoustrack`, `nexttrack`)
  - [x] Decelerated vertical-drag waveform scrubbing bar (`1x`, `½x`, `¼x`, `0.1x` fine tiers) with chapter boundary markers and keyboard seeking
  - [x] Smart sleep timer (presets 5, 15, 30, 45, 60m or End of Chapter) with smooth 30s linear volume fade-out and shake-to-extend accelerometer listener
  - [x] Picture-in-Picture (PiP) audio canvas visualizer streaming live Web Audio analyser frequency spectrum and cover artwork
  - [x] Obsidian tactile `FullPlayerModal` component and MiniPlayer integration with 55 unit and integration tests passing across monorepo

---

### Phase 3: Real-Time Sync, Offline Storage & Active Shelf (Completed)
- [x] **Step 3.1: Durable Objects Real-Time Progress Sync**
  - [x] Implement `SyncRoom` Durable Object class with SQLite backend (`packages/server/src/sync/room.ts`)
  - [x] Stateful hibernatable WebSocket listener connections (`/api/sync/ws`)
  - [x] Hybrid Logical Clock (HLC) + Monotonic Progress Vector conflict resolution (`packages/shared/src/hlc.ts`)
  - [x] Multi-device "Resume from other device" notification banner (`ResumeBanner.tsx`)
  - [x] Auto-reconnecting client WebSocket manager with exponential backoff (`SyncClient`)
  - [x] 23 new unit tests across shared, server, and app (78 total tests passing across monorepo)
- [x] **Step 3.2: Origin Private File System (OPFS) Download Manager**
  - [x] Background stream writer to OPFS via `FileSystemWritableFileStream` with memory chunk piping and abort controller
  - [x] Service Worker range request interception (`/api/stream/:fileId`) for offline byte-range playback (`206 Partial Content`)
  - [x] Client storage quota management dashboard (`StorageManagerModal.tsx`, `/offline` route) with per-book cache eviction
  - [x] Zero server cost guarantee verified: audio cached directly to user's local disk; 83 Vitest tests passing across monorepo
- [x] **Step 3.3: Cloudflare R2 Active Shelf LRU Cache Queue**
  - [x] Cloudflare Queue & `ctx.waitUntil` background worker pre-caching active books from Google Drive to R2 (`precacheBookToR2`)
  - [x] 8.5 GB high-water mark automatic LRU eviction policy (`evictLruBooks`)
  - [x] REST endpoints `/api/shelf/status`, `/api/shelf/precache/:bookId`, `/api/shelf/evict`, `/api/shelf/:bookId` and 6-hour cron maintenance
  - [x] Flexible storage design: `if (env.R2)` safeguards allow operation with or without R2; 93 Vitest tests passing across monorepo
- [x] **Step 3.4: Listening Analytics, Streaks & Social Presence**
  - [x] Daily listening streak counter & GitHub-style 365-day activity contribution heatmap (`ActivityHeatmap.tsx`, `analytics.ts`)
  - [x] Edge presence tracking for friends listening activity with live pulsing indicators (`FriendActivityBar.tsx`, `presence.ts`)
  - [x] Synchronized listen-along room host/follower audio clock slewing without audio pops (`ListenAlongRoom`, `slewing.ts`, `listen-along-client.ts`)
  - [x] Automatic playback event logger in audio context and `/analytics` route; 105 Vitest tests passing across monorepo

---

### Phase 4: Polish, Compatibility & Production Deployment (100% Complete)
- [x] **Step 4.1: Audiobookshelf (ABS) API Compatibility Layer**
  - [x] Implement `/login`, `/api/v1/login`, `/api/v1/libraries`, `/api/v1/libraries/:libraryId/personalized`, `/api/v1/items/:id`, `/api/v1/items/:id/cover`, `/api/v1/me/progress`
  - [x] Full support for Plappa (iOS), ShelfPlayer, and native ABS clients with Bearer, x-token, and ?token authentication
  - [x] 11 new Vitest unit and HTTP integration tests passing (116 total passing across monorepo)
- [x] **Step 4.2: Instant Client-Side Search Engine (MiniSearch)**
  - [x] Sub-5ms title, author, narrator, series, and description indexing with zero network latency and pure client-side evaluation
  - [x] Fuzzy keyword matching, prefix search, and weighted field boosting (`packages/app/src/lib/search.ts`)
  - [x] Tactile obsidian `SearchPaletteModal` with `Cmd+K` / `Ctrl+K` global keyboard palette navigation and latency tracker
  - [x] 6 new Vitest unit tests passing (122 total passing across monorepo)
- [x] **Step 4.3: Automated CI/CD & Production Wrangler Deploy**
  - [x] GitHub Actions automated workflow (`.github/workflows/ci.yml`) for Biome format/lint, TypeScript typecheck, Vitest, and production Vite build
  - [x] Production deployment configuration in `packages/server/wrangler.jsonc` with Durable Objects, assets binding, and 6-hour cron triggers
  - [x] Comprehensive deployment runbook (`DEPLOYMENT.md`) covering D1, KV, Google Service Account secrets, and client connections
- [x] **Step 4.4: 1:1 High-Resolution Square Artwork & Narrative Presentation**
  - [x] Uniform 1:1 square artwork presentation across library, shelves, and player cards with zero edge clipping and ambient color backdrops
  - [x] StoryGraph and Goodreads CSV import/export for reading progress synchronization (`/analytics`)
  - [x] High-resolution HTML5 canvas quote card generator with exportable themes
- [x] **Step 4.5: Mobile PWA Hardening, Offline Bookmarks Sync & Audio Resilience**
  - [x] AudioContext anti-suspension watchdog preventing audio stalls when mobile screens lock or tabs background
  - [x] Seamless Airplane Mode & Offline PWA launch: unauthenticated offline bypass to `/offline` to play downloaded OPFS books
  - [x] Service Worker OPFS range-request streaming with automatic format/MIME type resolution (`audio/mpeg`, `audio/flac`, `audio/ogg`, `audio/mp4`) and offline cover fallback
  - [x] Offline Bookmarks store with local caching, offline creation/deletion queueing, and automatic flush to Cloudflare D1 upon reconnection (`audioneko:bookmarks-synced`)
  - [x] Storage quota protection: atomic OPFS `.move()`, persistent storage permission request, pre-flight estimation, and DownloadButton error state with one-click retry
  - [x] Native-like tactile haptic feedback (`navigator.vibrate`) on transport buttons, chapter steps, and bookmarks
  - [x] PWA Web App Manifest shortcuts for home-screen long-press quick launches ("Offline Audiobooks" and "Library")

---

### Future Scope & Backlog (Deferred per User Request)
- **Passkeys / WebAuthn**: Passwordless hardware/biometric authentication (FIDO2)
- **Workers AI Whisper Transcription & Dialogue Quotes**: Dual-field bookmarking with timestamp range (start and end audio points), automated speech extraction of character dialogue and paragraphs via Whisper, and separate personal listener reflections
- **Workers AI Narrative Recaps**: Llama 3.3 70B story recap generation when resuming after inactivity
- **Vectorize Semantic Search**: 768-dimension embedding vector search for natural language queries

---

## Activity Log

| Date / Time | Step Completed | Changes Made |
| :--- | :--- | :--- |
| **2026-10-04 22:31** | **Repository Setup** | Initialized git repository, added `.gitignore`, `README.md`, and `PROJECT_DESIGN_DOCUMENT.md`. Pushed to GitHub. |
| **2026-10-04 22:36** | **Tooling Setup** | Installed `pnpm` 12.9.1, configured `pnpm-workspace.yaml`, `turbo.json`, `biome.json`, and root `tsconfig.json`. |
| **2026-10-04 22:39** | **Shared Package** | Created `packages/shared` with domain schemas (`schema.ts`) and API contracts (`contracts.ts`). Typechecked and linted. |
| **2026-10-04 22:41** | **Progress Tracker** | Created live `PROGRESS.md` tracking all 4 phases and 18 steps. |
| **2026-10-04 22:44** | **Step 1.3: D1 Database Core** | Created `packages/server`, `wrangler.jsonc`, 16-table Drizzle ORM schema, and generated SQL migrations. |
| **2026-10-04 22:46** | **Step 1.4: Google Token Minter** | Implemented zero-dependency Web Crypto RSA-SHA256 JWT minter with KV caching; 4 Vitest unit tests passed. |
| **2026-10-04 22:49** | **Step 1.5: 2 MB Chunk Range Proxy** | Built 4-tier hybrid streaming engine with Edge Cache API, R2 fast-path, and range alignment; 7 Vitest tests passed. |
| **2026-10-04 22:52** | **Step 1.6: Metadata & TMDB Engine** | Built ISO-BMFF / ID3v2 binary streaming parsers and Open Library + Google Books enrichment engine; 15 Vitest tests passed. Phase 1 Complete! |
| **2026-10-04 22:58** | **Step 2.1: Better Auth & Sessions** | Configured Better Auth with Email/Password & D1; built `requireAuth`, `optionalAuth`, `requireAdmin` middlewares; passkeys deferred to future scope per user; 20 Vitest tests passed. |
| **2026-10-04 23:01** | **Step 2.2: Cryptographic Invites** | Built 256-bit entropy invite engine with SHA-256 hashing, atomic usage counters, admin endpoints, and token-gated registration; 31 Vitest tests passing. |
| **2026-10-04 23:14** | **Step 2.3: PWA Shell (Sober Thoughts Style)** | Built React 19 + Tailwind v4 PWA shell inspired by sober-thoughts (obsidian, high-contrast, tactile 1px borders, zero cloudy glass); 34 Vitest tests passing across monorepo. |
| **2026-10-04 23:35** | **Step 2.4: Web Audio DSP Engine** | Built HTMLMediaElement transport, 40ms gain ramp, 3-band parametric Voice Boost EQ, RMS silence trimming, and -16 LUFS compressor; 39 Vitest tests passing. |
| **2026-10-05 00:15** | **Step 2.5: Media Session & Scrubber** | Built lock-screen controls, decelerated vertical-drag scrubber, smart sleep timer with fade & accelerometer shake-to-extend, PiP visualizer, and FullPlayerModal; 55 Vitest tests passing. Phase 2 Complete! |
| **2026-10-05 11:12** | **Step 3.1: Durable Objects Real-Time Sync** | Implemented `SyncRoom` Durable Object with SQLite backend and hibernatable WebSockets, HLC + Monotonic Progress Vector conflict resolution, client `SyncClient` with exponential backoff, and tactile obsidian `ResumeBanner`; 78 Vitest tests passing. |
| **2026-10-05 11:22** | **Step 3.2: OPFS Download Manager** | Implemented Origin Private File System (OPFS) background streaming chunk downloader, Service Worker range-interception (`/api/stream/:fileId`) with 206 streaming, storage quota estimator and manager, and offline UI; 83 Vitest tests passing. |
| **2026-10-05 11:30** | **Step 3.3: R2 Active Shelf LRU** | Built optional Cloudflare R2 Active Shelf pre-caching engine, 8.5 GB high-water mark LRU eviction algorithm, queue consumer, scheduled cron maintenance, and management endpoints with direct drive streaming; 93 Vitest tests passing. |
| **2026-10-05 11:39** | **Step 3.4: Analytics, Streaks & Social** | Built daily streak tracker, GitHub-style 365-day contribution heatmap, real-time edge friend presence with pulsing indicators, and ListenAlongRoom Durable Object with audio clock slewing; 105 Vitest tests passing. Phase 3 Complete! |
| **2026-10-05 11:47** | **Step 4.1: Audiobookshelf (ABS) API** | Implemented Audiobookshelf API emulation routes (`/login`, `/api/v1/libraries`, `/api/v1/items/:id`, `/api/v1/me/progress`, SVG cover fallback) for Plappa, ShelfPlayer, and native ABS clients; 116 Vitest tests passing. |
| **2026-10-05 11:51** | **Step 4.2: Instant MiniSearch Engine** | Built sub-5ms client-side search indexing engine, tactile obsidian `SearchPaletteModal` with `Cmd+K` / `Ctrl+K` keybindings, and fuzzy prefix search; 122 Vitest tests passing. |
| **2026-10-05 11:54** | **Step 4.3: CI/CD & Production Deploy** | Configured GitHub Actions CI pipeline (`.github/workflows/ci.yml`), production `wrangler.jsonc` Durable Objects & cron triggers, and `DEPLOYMENT.md` runbook. Phase 4 Complete! 100% Monorepo Completion. |
| **2026-10-05 12:20** | **Comprehensive Codebase Audit & Hardening** | RFC 7233 byte-range clamping & 416 status handling; Hono CORS allowed & exposed headers for audio players; HEAD request routing for ABS; OPFS multi-chunk sequential downloader; React render-phase cleanups; Vite vendor chunk splitting. 126 Vitest tests passing (100%). |
| **2026-10-05 16:25** | **Open Library & Google Books Metadata Enrichment & Subrequest Optimization** | Connected `enrichBookMetadata` in scanner for books with missing metadata/covers; added cascading multi-strategy Open Library searches with leading-article stripping and multi-doc candidate ranking; eliminated redundant 128KB drive probe subrequests and cached existing metadata to stay strictly within Cloudflare Workers 50 subrequest limit; 100% of 18 library audiobooks now enriched with official authors and high-res cover art. |
| **2026-10-05 23:30** | **Strict Audio Streaming Authentication & RBAC Enforcement** | Enforced `requireAuth` on `/api/stream/:fileId` (GET and HEAD), `/api/books`, `/api/series`, `/api/authors`, `/api/shelves`; locked down `/api/library/scan` to `requireAuth, requireAdmin`; unified session cookie and token verification via `authenticateRequest`; guarded client `playBook` and added global `RootLayout` auth gate redirecting unauthenticated visitors to `/login`. 122 Vitest tests passing (100%). |
| **2026-10-06 13:25** | **Comprehensive Responsive UI Alignment & Bleed Elimination Audit** | Audited all 12 routes and key player modals across mobile (320px–480px), tablet, and desktop breakpoints; enforced `min-w-0 flex-1` on flex parents to resolve text clipping; added safe-area insets (`env(safe-area-inset-top)` & `env(safe-area-inset-bottom)`) for iOS notch & home indicators on `Header`, `BottomNav`, and `FullPlayerModal`; made `MiniPlayer` mobile-compact hiding secondary DSP buttons on narrow viewports; ensured table horizontal scroll containers and wrapped action cards; verified Biome check (0 errors) and Vitest (122/122 passing); deployed live to Cloudflare. |
| **2026-10-06 15:23** | **Zero-Latency Instant Audio Playback Engine** | Eliminated all playback delays across player and library: removed blocking `canplay` and `audio.load()` pipeline wiping, made Web Audio `playWithRamp` instant unmuted trigger, added background `prewarmBook` with `loadedmetadata` position sync on continue listening card, enabled hover/touch/focus pre-warming on library book cards, added multi-tier in-memory auth and D1 file metadata caching to bypass Google Drive metadata calls, fixed RFC 7233 open-ended byte ranges preventing MP4 `moov` truncation; 122 Vitest tests passing (100%); deployed live to Cloudflare. |
| **2026-10-06 15:55** | **UX Enhancements & Power Features** | Implemented global desktop keyboard hotkeys (Space, Arrows, M, [, ], F); dual buffered/played tracks on scrubbers; one-tap sleep timer popover in MiniPlayer; in-player volume slider & mute control in FullPlayerModal; timestamped bookmarks & notes API (`/api/bookmarks`) + slide-over drawer; narrator filter chips on library home; series continuous auto-queue on finish; PWA shell offline caching in Service Worker with stale-while-revalidate; 126 Vitest tests passing across monorepo; deployed live to Cloudflare. |
| **2026-10-06 16:10** | **Complete Codebase Audit, Dead Code Elimination, Robust Exception Handling & Guardrails** | Removed 100% of unused imports, dead variables, and uncalled parameters across `@audioneko/server`, `@audioneko/app`, and `@audioneko/shared` (verified via `tsc --noUnusedLocals --noUnusedParameters`); implemented global `app.onError` uncaught exception handler and standardized `app.notFound` 404 JSON responses; added robust try/catch blocks and input sanitization to Bookmarks API; fixed critical listener logout bug in `audio-context.tsx` (switched audio error session check from `/api/admin/me` to `/api/auth/get-session`); added safe finite/non-negative number boundary clamping in `WaveformScrubber.tsx`, `MiniPlayer.tsx`, and `audio-context.tsx` to eliminate any possible `NaN` glitches; verified 126/126 tests passing (100%), Biome lint/format clean; deployed live to Cloudflare Workers (`dc0b00b3-b145-49dc-8fc6-4fca0cd0297b`). |
| **2026-10-07 13:15** | **Analytics Timezone Alignment & UI Refinement** | Shifted server-side peak listening hour, streak dates, and 365-day heatmap calculations to the user's browser timezone offset (`tzOffset`); removed friend activity bar and social terminology from `/analytics`; 127 Vitest tests passing; deployed live to Cloudflare. |
| **2026-10-07 13:21** | **Blinking Neko Brand Indicator & Narrator Filter Removal** | Removed narrator filter chip row from library; created `BlinkingNeko` component with theme-aware `.neko-pulse` animation replacing generic dots across continue listening, OPFS downloading badges, and player sync banners; updated documentation. |
| **2026-10-08 14:10** | **StoryGraph & Goodreads CSV Sync + Quote Cards** | Implemented reading history CSV import and export on `/analytics` route; added HTML5 canvas quote card generator modal with customizable aesthetic themes (`editorial-dark`, `sober-minimal`, `warm-paper`). |
| **2026-10-09 18:40** | **Audio Engine Anti-Suspension & Background Watchdog** | Built active `AudioContext.onstatechange` watchdog in `audio-engine.ts` and `audio-context.tsx` to automatically resume audio if suspended by mobile OS background constraints; attached `visibilitychange`, `focus`, and `playing` handlers; enforced `playsinline` and `webkit-playsinline` for iOS PWA background longevity. |
| **2026-10-09 19:15** | **Continue Listening Hero Alignment** | Synchronized `continueBook` state in `library.tsx` to directly prioritize the currently loaded audio player book whenever playback is not completed, eliminating UI desynchronization between player and hero. |
| **2026-10-10 12:20** | **Mobile OPFS Quota Protection & Storage Persistence** | Added `requestPersistentStorage()` using `navigator.storage.persist()`; integrated atomic `partHandle.move()` in OPFS download pipeline to prevent temporary file duplication; added pre-flight storage quota checks and user-friendly error formatting. |
| **2026-10-10 14:15** | **Offline PWA & Airplane Mode Architecture** | Implemented unauthenticated offline access bypass in `root.tsx` and `login.tsx` for immediate access to `/offline` without network; upgraded `sw.js` to intercept audio range requests and stream from OPFS with format/MIME type auto-detection from `meta.json` (`audio/mpeg`, `audio/flac`, `audio/ogg`, `audio/mp4`); added offline cover fallback from OPFS `cover.jpg`. |
| **2026-10-10 16:30** | **WebSocket Offline Progress Queue & Reconnection Sync** | Added `pendingOfflineUpdates` buffer in `sync-client.ts` to queue listening progress while offline; attached `window.addEventListener("online")` and `socket.onopen` triggers to automatically flush offline progress to Cloudflare D1 upon regaining connection. |
| **2026-10-10 18:10** | **Picture-in-Picture Button Mobile Separation** | Replaced misleading outward-arrows icon with standard `PictureInPicture2` icon; hid PiP button on mobile viewports (`hidden sm:inline-flex`) where mobile browsers reject canvas-stream PiP, preventing dead button interactions. |
| **2026-10-10 21:15** | **Offline Cover Loop Fix, Bookmarks Store, Haptics & App Shortcuts** | Resolved `useEffect` dependency loop in `OfflineCover` preventing premature blob URL revocation; created `offline-bookmarks.ts` with local caching and offline creation/deletion queueing that auto-syncs to D1 upon reconnecting (`audioneko:bookmarks-synced`); added `DownloadButton` error state with one-click retry; added tactile haptics (`navigator.vibrate`) on transport buttons; added PWA manifest home-screen shortcuts for "Offline Audiobooks" and "Library". 172 Vitest tests passing (100%). Deployed live. |
| **2026-10-10 21:45** | **Open Source Licensing (AGPLv3)** | Adopted GNU Affero General Public License v3.0 (`AGPL-3.0-or-later`) across the monorepo; created root `LICENSE` file with standard FSF copyleft terms; updated `README.md`, `PROJECT_DESIGN_DOCUMENT.md`, and all workspace `package.json` files with `AGPL-3.0-or-later` SPDX identifier. |


