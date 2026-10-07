# audioneko

A private, high-performance audiobook streaming platform for personal libraries and small groups of friends, powered by Google Drive and the Cloudflare Edge platform.

---

## Architecture and Design Blueprint

The complete technical architecture, data model, performance budget, security threat model, and delivery plan are documented in:

* [PROJECT_DESIGN_DOCUMENT.md](./PROJECT_DESIGN_DOCUMENT.md)
* [PROGRESS.md](./PROGRESS.md)

---

## Feature Catalog

### 1. Audio Player and Web Audio DSP Engine
* **Dual-Engine Audio Transport**: Hybrid pipeline pairing an HTML5 `HTMLMediaElement` for smooth stream buffering with a Web Audio API audio graph for low-latency digital signal processing.
* **Speculative Zero-Latency Pre-Warming**: Pre-warms audio streams on card hover, focus, and pointer down events, achieving sub-100ms Time-to-First-Audio (TTFA).
* **Smart Resume Rewind**: Adaptive context rewind upon resuming audio after an interruption or pause:
  * Resumed within 30 seconds: 0 seconds (seamless resume).
  * Paused 30 seconds to 5 minutes: 5 seconds rewind.
  * Paused 5 minutes to 30 minutes: 10 seconds rewind.
  * Paused 30 minutes to 3 hours: 15 seconds rewind.
  * Paused 3 hours to 24 hours: 20 seconds rewind.
  * Paused over 24 hours: 25 seconds rewind.
  * Toggable on demand directly in the full player view.
* **Smart Speed (Silence Trimming)**: Client-side `AudioWorkletNode` executing rolling-window RMS energy calculations. Detects non-vocal pauses below -42 dB and accelerates playback without pitch distortion or clipping speech.
* **Voice Boost Parametric Equalizer**: 3-band speech intelligibility biquad filter consisting of an 85 Hz high-pass rumble filter, a 2.2 kHz dialogue presence lift, and a 7.5 kHz sibilance taming notch.
* **Loudness Normalization and Compression**: Real-time `DynamicsCompressorNode` enforcing a consistent -16 LUFS broadcast target to smooth abrupt volume variances between different narrators and productions.
* **Multi-Band Voice Equalizer Presets**: Voice intelligibility presets (Clear Dialogue, Warm Acoustic, Deep Voice, Podcast Master) alongside custom 5-band frequency attenuation control.
* **Enhanced Media Session and Headset Remapping**: Hardware headset button customization (double-tap skip, triple-tap previous) alongside native lock screen timeline sync and media controls.
* **Variable Playback Speeds**: Granular playback rates from 0.5x to 3.0x in 0.05x increments using native WSOLA pitch preservation (`preservesPitch = true`).
* **Gain Ramp Crossfading**: Automated 40ms linear gain ramp-up and ramp-down on play, pause, and seek events to eliminate speaker pops and clicks.
* **Picture-in-Picture Visualizer**: HTML5 Canvas rendering real-time frequency bar spectrum analysis alongside book artwork, streaming to Picture-in-Picture (PiP) mode.
* **Volume and Mute Memory**: In-player volume slider with non-zero volume memory and instant mute toggle.

### 2. Precision Scrubbing, Waveforms and Chapters
* **Decelerated 4-Speed Fine-Scrubbing**: Vertical-drag scrubber with decelerated seek rates (1x at normal height, 0.5x, 0.25x, and 0.1x as the pointer moves downward) for second-by-second navigation in 30+ hour audiobooks.
* **Dual-Track Scrubber**: Waveform timeline displaying independent visual tracks for buffered network stream depth and current playback progress.
* **Instant Embedded Chapter Parsing**: Streaming binary parsers for ISO-BMFF / MP4 atoms (`chpl`, `mvhd`) in `.m4b` files and ID3v2.3/ID3v2.4 frames (`CHAP`, `CTOC`) in `.mp3` files, extracting chapter titles, timestamps, and offsets in under 80ms without downloading entire files.
* **Chapter Drawer and Timelines**: Full player drawer listing all chapters with active chapter indicators, chapter durations, remaining countdown clocks, and single-click seeking.
* **Quick Navigation Controls**: Instant chapter step buttons and configurable quick-skip buttons (+/-15 seconds backward and +/-30 seconds forward).

### 3. Desktop Controls and Native Mobile Integration
* **Global Desktop Hotkeys**: Full keyboard navigation across the entire application:
  * `Space` / `K`: Toggle Play / Pause
  * `Left Arrow` / `Right Arrow`: Skip backward 15s / forward 15s
  * `Shift + Left Arrow` / `Shift + Right Arrow`: Skip backward 30s / forward 30s
  * `Up Arrow` / `Down Arrow`: Adjust volume up / down
  * `M`: Toggle Mute
  * `[` / `]`: Skip to Previous / Next Chapter
  * `F`: Toggle Full Player Modal
  * `Cmd+K` / `Ctrl+K`: Global Search Palette
* **Native Media Session Integration**: Comprehensive `navigator.mediaSession` implementation providing high-resolution cover artwork, title, author, interactive scrub bar, and hardware media key handlers for lock screens, headphone clickers, and CarStream / Android Auto.
* **Tactile Haptic Feedback**: Optional tactile device vibration (`navigator.vibrate`) on key playback and scrub interactions on supported mobile hardware.
* **Ambient Dynamic Backdrop**: Real-time extraction of dominant color palettes from active book artwork, rendering an animated obsidian blurred ambient backdrop.
* **Obsidian Aesthetics and Blinking Neko Indicators**: Built upon the `sober-thoughts` design philosophy (obsidian dark surfaces, high contrast, tactile 1px borders) with a custom `NekoIcon` brand silhouette and animated glowing pulse indicators (`BlinkingNeko`) replacing generic status dots across Continue Listening, active downloads, cross-device resume toasts, and book detail headers.

### 4. Smart Sleep Timer
* **Countdown Presets**: Quick selection for 5, 15, 30, 45, or 60 minutes.
* **End of Chapter Mode**: Automatically synchronizes the sleep timer to pause playback at the exact millisecond the current chapter concludes.
* **MiniPlayer Quick Access**: One-tap sleep timer popover directly on the docked mini-player without expanding the full modal.
* **Exponential Volume Fade**: Smooth 30-second exponential audio decay leading up to timer expiration to prevent abrupt waking.
* **Shake-to-Extend**: Accelerometer-driven motion detection allowing listeners to extend the timer by 15 minutes by gently shaking their mobile device without turning on the screen.

### 5. Library Discovery, Shelves and Organization
* **Google Drive Cold Vault**: Secure primary storage in Google Drive with hierarchical traversal supporting single-file chaptered M4B files, multi-track MP3 folders, and nested directory layouts.
* **Google Drive Push Notification Webhooks**: Webhook endpoint (`/api/webhooks/drive`) supporting the Google Drive `changes.watch` protocol. Automatically triggers instant incremental scans upon file additions or modifications without waiting for scheduled crons.
* **Heuristic Metadata Extraction**: Automatic tokenizer parsing author names, book titles, series name, volume numbers, release years, and narrator tags directly from folder and file naming structures.
* **Dynamic Author Metadata and Portraits**: Automated author portrait ingestion resolving via local Drive image assets, Open Library Authors API, and verified literary profiles. Dedicated Author catalog and profile views at `/authors`.
* **Multi-Tier Cover Art Cascade**: Priority extraction from embedded `covr` / `APIC` binary tags -> local `cover.jpg` / `folder.png` -> Open Library Covers API -> Google Books API -> client-side procedural gradient.
* **1:1 High-Resolution Square Artwork Presentation**: Uniform 1:1 aspect ratio layout with zero-cutoff fit and ambient background reflection across all views.
* **Dynamic Smart Shelves**:
  * *Continue Listening*: Sorted by last-played timestamp with pre-warmed streaming buffers and progress percentages.
  * *Up Next in Series*: Automatically identifies and surfaces the next chronological unread book in a series.
  * *Recently Added*: Highlights newly indexed titles from the latest Google Drive scan.
  * *Favorites and Custom Shelves*: User-curated reading lists and personal shelves.
* **Series Continuous Auto-Queue**: Automatically queues and transitions playback to the subsequent volume upon completing the current audiobook.
* **Dedicated Navigation Routes**: Dedicated views for Authors (`/authors`), Series (`/series`), Shelves (`/shelves`), and Book Details (`/book/:id`).

### 6. Instant Search and Command Palette
* **Sub-5ms Client-Side Search**: In-memory inverted index powered by MiniSearch indexing titles, authors, narrators, and series with zero network round trips.
* **Fuzzy Typo Tolerance and Prefix Matching**: Resilient search matching queries with spelling errors or partial word stems.
* **Global Command Palette (`Cmd+K` / `Ctrl+K`)**: Keyboard-driven modal with live query execution latency tracking, arrow-key navigation, and instant play triggering.

### 7. Notebook, Annotations and Content Tools
* **Single-Tap Bookmarking**: Creates instant timestamped bookmarks capturing exact playback offset, active chapter, and creation date.
* **Notebook Timeline (`/bookmarks`, `/notebook`)**: Consolidated timeline across the entire audiobook library featuring live search, book covers, audio jump links, and inline note editing.
* **Markdown Annotation Export**: One-click download of all highlights and notes formatted in clean Markdown (`/api/bookmarks/export/markdown`), grouped hierarchically by book and chapter.
* **High-Resolution Quote Card Generator**: Built-in HTML5 Canvas generator rendering 1200x675 exportable PNG quote cards with typographic styling and customizable aesthetic themes (`editorial-dark`, `sober-minimal`, `warm-paper`).
* **Dedicated REST API**: Backed by `/api/bookmarks` and `/api/bookmarks/:id` with input sanitization, user isolation, and atomic persistence in Cloudflare D1.

### 8. Real-Time Multi-Device Sync and Listen-Along Rooms
* **Cloudflare Durable Objects (`SyncRoom`)**: Stateful, hibernatable WebSocket connections maintaining real-time listener state across browser tabs, smartphones, and desktop computers.
* **Conflict-Free State Resolution**: Hybrid Logical Clocks (HLC) and Monotonic Progress Vectors resolve multi-device playback discrepancies without position loss.
* **Cross-Device Resume Toast**: Unobtrusive banner alerting listeners when playback progress advanced on another device, allowing one-click synchronization.
* **Synchronized Listen-Along Rooms**: Shared rooms over WebSockets where a host coordinates playback. Dynamic audio clock slewing aligns listener audio within +/-50ms without acoustic clicks.

### 9. Offline-First Progressive Web App (OPFS)
* **Origin Private File System (OPFS)**: High-performance streaming storage engine storing multi-gigabyte audiobooks directly in private browser storage, bypassing IndexedDB quota bottlenecks.
* **Multi-Task Download Queue**: Concurrent background audio downloads with granular progress tracking, speed calculation, and estimated completion times.
* **Pause, Resume, and Cancel Controls**: Individual and bulk controls (`Pause All`, `Resume All`, `Cancel All`) with state preservation that survives page reloads without restarting downloads.
* **Persistent Offline Cover Artwork**: Caches high-resolution book covers locally in OPFS alongside audio data for full visual fidelity while offline.
* **Service Worker HTTP 206 Interception**: Service Worker intercepts audio range requests for saved titles, streaming Partial Content (`206 Partial Content`) directly from local OPFS blobs when offline.
* **Storage Management Dashboard (`/offline`)**: Detailed client storage meter displaying total device quota, consumed bytes per audiobook, and one-tap chapter/book eviction.
* **PWA Standalone App**: Installable Progressive Web App with standalone window display, custom theme colors, and offline app shell caching.

### 10. Listening Analytics and Streaks
* **Consecutive Day Listening Streaks**: Automated daily streak counter tracking active listening consistency with local timezone alignment.
* **GitHub-Style Activity Heatmap**: Interactive 365-day contribution grid displaying daily listening engagement and duration on the `/analytics` route with automatic listener local timezone alignment.
* **StoryGraph & Goodreads CSV Sync**: Import and export reading progress via CSV to cross-reference finished titles with external reading platforms directly from the `/analytics` route.
* **Weekly Reading Velocity**: Computes active listening time over the past 7 days with trend analysis.
* **Playback Pace Analysis**: Calculates weighted average playback rates across completed listening sessions.
* **Peak Listening Hour**: Identifies listener peak engagement time windows shifted accurately into the user's local timezone.
* **Session Metrics**: Tracks total hours listened, top authors, and completion percentages.

### 11. Audiobookshelf (ABS) API Compatibility
* **Third-Party Client Support**: Emulates Audiobookshelf REST and WebSocket endpoints (`/login`, `/api/v1/login`, `/api/libraries`, `/api/items/:id`, `/api/session/local`, `/api/v1/me/progress`).
* **Mobile Ecosystem Integration**: Connects native third-party mobile applications like Plappa (iOS), ShelfPlayer (Android), and official Audiobookshelf clients directly to the audioneko edge backend.
* **Flexible Authentication**: Supports HTTP Bearer tokens, `x-token` headers, and URL token query parameters.

### 12. Security, Authentication and Administration
* **Better Auth Infrastructure**: Secure email and password authentication with PBKDF2 password hashing and secure HttpOnly cookie sessions.
* **Cryptographic Invite Tokens**: Single-use 256-bit entropy cryptographic invite links (`/join?token=...`) with SHA-256 token hashing and atomic redemption counters to ensure private, invite-only access.
* **Curator Admin Control Plane (`/admin`, `/admin-invites`)**:
  * On-demand incremental and deep Google Drive library rescans.
  * Health status cards monitoring Google Drive API quotas and database records.
  * System operational logs with level filtering.
  * Invite link generator with expiration and usage constraints.
* **Edge Security and Bot Protection**: Cloudflare Turnstile integration, WAF rate limiting, and RFC 7233 byte-range validation.

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
│   │   │   ├── components/  # Player, Library, Content, Shelf, Social, and Admin
│   │   │   ├── context/     # Audio player context and Web Audio bridge
│   │   │   ├── lib/         # Audio engine, OPFS storage, search, sleep timer, smart rewind
│   │   │   └── routes/      # Declarative TanStack Router views (Timeline, Shelves, Books)
│   │   └── index.html
│   ├── server/              # Hono application deployed to Cloudflare Workers
│   │   ├── src/
│   │   │   ├── abs/         # Audiobookshelf API compatibility layer
│   │   │   ├── admin/       # Control plane, watch channels, and scan routes
│   │   │   ├── auth/        # Better Auth setup, invites, middleware
│   │   │   ├── db/          # D1 schema and database clients
│   │   │   ├── drive/       # Drive auth, author enricher, webhooks, stream proxy
│   │   │   ├── shelf/       # Edge active shelf queue and LRU maintenance
│   │   │   ├── social/      # Listening analytics, presence, and listen-along rooms
│   │   │   ├── sync/        # Real-time multi-device playback synchronization
│   │   │   └── index.ts     # Edge router, webhook handler, cron handler, asset fallback
│   │   └── wrangler.jsonc   # Cloudflare Workers configuration and resource bindings
│   └── shared/              # Common data models, contracts, and utilities
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
