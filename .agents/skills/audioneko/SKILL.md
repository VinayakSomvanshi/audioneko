---
name: audioneko
description: >-
  Comprehensive architectural handbook, workflow runbook, design system rules,
  and zero-cost invariants for the audioneko private audiobook streaming platform.
  Activate when developing, debugging, refactoring, or testing any component across
  audioneko (Cloudflare Workers, D1, Durable Objects, Google Drive API, Web Audio DSP,
  TanStack app, and sober-thoughts design system).
---

# audioneko Project Guide & Architectural Runbook

> **audioneko** is a private, bleeding-edge, zero-recurring-cost ($0.00/mo) audiobook streaming platform for a curator and 3–10 friends. It bridges personal Google Drive storage ("Cold Vault") with the Cloudflare Edge network (Workers, D1, Durable Objects, KV) and a high-contrast obsidian PWA client.

---

## 1. Hard Architectural Invariants & User Directives

Every change to this codebase must adhere strictly to these core rules:

### A. Strict $0.00 / Zero Credit Card Requirement
- **No Mandatory Payment Methods**: The app must run 100% within the permanent free tiers of Cloudflare and Google Cloud without requiring a credit card on file.
- **R2 is Completely Optional**: Enabling Cloudflare R2 requires a credit card on file (even though the first 10 GB is free). Therefore, **R2 must never be a hard dependency**. All streaming code in [`packages/server/src/drive/stream.ts`](file:///home/vinayak/Documents/audioneko/packages/server/src/drive/stream.ts) must check `if (env.R2)` and seamlessly fall back to streaming directly from Google Drive.
- **Cover Art Storage**: Thumbnails are stored in Cloudflare KV or D1 (both require no credit card), never solely in R2.
- **Offline Bandwidth Protection**: Heavy offline caching is offloaded to the client device using the **Origin Private File System (OPFS)**, which uses the listener's local phone/laptop disk for free.

### B. No Active AI / LLM Dependencies
- **Deferred to Future Backlog**: Cloudflare Workers AI (Whisper, Llama 3.3 70B, Vectorize embeddings) are strictly deferred to future backlog. Do not add AI bindings or LLM inference dependencies to the active code.
- **Instant Client-Side Search**: Search in Phase 4 is powered purely by **`MiniSearch`** running client-side in the browser. It delivers sub-5ms title, author, narrator, and series indexing with zero network latency, zero API keys, and zero token costs.

### C. Passkeys Deferred / Invite-Only Auth
- **No WebAuthn/Passkey Dependency**: Passkeys are deferred to future backlog because Relying Party IDs (`rpId`) have known browser/public-suffix quirks on `*.workers.dev` subdomains.
- **Primary Auth Model**: Single-use 256-bit entropy cryptographic invite links (`/join?token=...`) with SHA-256 token hashing in D1, atomic usage decrement, and standard Email/Username & Password via Better Auth.

### D. Design System: Inspired by `sober-thoughts` (Zero Cloudy Glass)
- **Aesthetic**: Obsidian minimalist, tactile, high-contrast, crisp 1px borders.
- **Strict Anti-Rule**: **NO cloudy/milky frosted glass or glassmorphism**. Avoid blur-heavy muddy backgrounds. Use solid, crisp obsidian surfaces with razor-sharp 1px borders (`border-border`).
- **Color Tokens**:
  - Background: `--bg: oklch(0.085 0 0);` (`#101012`)
  - Elevated Surface: `--bg-surface: oklch(0.12 0.008 15);`
  - Subtle Surface: `--bg-elevated: oklch(0.16 0.01 15);`
  - Crisp Border: `--border: oklch(0.21 0.01 15);`
  - Warm Crimson Accent: `--accent: oklch(0.66 0.21 22);` (`#e04838`)
  - Accent Background: `--accent-bg: oklch(0.66 0.21 22 / 0.12);`
  - Crisp High-Contrast Text: `--text: oklch(0.96 0.002 90);`
  - Muted Text: `--text-muted: oklch(0.65 0.01 15);`
  - Subtle Text: `--text-subtle: oklch(0.45 0.01 15);`
- **Typography**: `Inter` for clean sans body/headings, paired with `IBM Plex Mono` for numbers, timestamps, badges, and progress counters.
- **Signatures**: Live pulsing `.logo-dot` indicator and inline anti-flashbang dark-mode script.

### E. Domain & Webhook Invariants
- **`*.workers.dev` First**: The system must run flawlessly on a default free `*.workers.dev` subdomain without requiring a paid registrar domain (e.g. `.app`).
- **Cache API Alignment**: When using Cloudflare's `caches.default`, always construct the cache key request URL using the actual incoming request origin (`new URL(request.url).origin`) to prevent cross-domain runtime exceptions.
- **No GSC Webhook Verification**: Google Drive push webhooks (`changes.watch`) require domain verification in Google Search Console, which fails on `*.workers.dev`. Always use the **6-hour Cron Trigger (`0 */6 * * *`)** and an **on-demand "Scan Library" button** in the admin dashboard.

---

## 2. Monorepo Architecture & Package Boundaries

```
audioneko/
├── packages/
│   ├── shared/         # Domain types, schemas, API contracts (ZERO dependencies)
│   ├── server/         # Cloudflare Worker, Hono, D1, Drizzle, Better Auth, DO
│   └── app/            # TanStack Router, React 19, Tailwind CSS v4, Web Audio
├── .agents/skills/     # Customization skills & workflows
├── PROGRESS.md         # Live milestone progress & activity log
├── PROJECT_DESIGN_DOCUMENT.md  # Architectural reference
└── biome.json          # Formatter & linter configuration
```

### `packages/shared` (`@audioneko/shared`)
- **Strict Boundary**: Must remain completely free of browser-only or server-only dependencies.
- Contains domain models in [`src/schema.ts`](file:///home/vinayak/Documents/audioneko/packages/shared/src/schema.ts): `User`, `Book`, `Chapter`, `AudioFile`, `Series`, `Progress`, `InviteToken`.
- Contains API request/response contracts in [`src/contracts.ts`](file:///home/vinayak/Documents/audioneko/packages/shared/src/contracts.ts): `ApiResponse<T>`, `BookListResponse`, `BookDetailResponse`, `StreamTokenResponse`, `InviteGenerateRequest`, `SyncProgressPayload`.

### `packages/server` (`@audioneko/server`)
- Cloudflare Workers edge monolith powered by Hono.
- **Database**: Cloudflare D1 with Drizzle ORM (16 tables in [`src/db/schema.ts`](file:///home/vinayak/Documents/audioneko/packages/server/src/db/schema.ts)).
- **Auth**: Better Auth configured with email/password and D1 session adapter ([`src/auth/index.ts`](file:///home/vinayak/Documents/audioneko/packages/server/src/auth/index.ts)).
- **Invite Engine**: 256-bit entropy cryptographic invites with SHA-256 storage ([`src/auth/invites.ts`](file:///home/vinayak/Documents/audioneko/packages/server/src/auth/invites.ts)).
- **Google Token Minter**: Zero-dependency Web Crypto RSA-SHA256 JWT minter with KV caching ([`src/drive/token.ts`](file:///home/vinayak/Documents/audioneko/packages/server/src/drive/token.ts)).
- **4-Tier Streaming Proxy**: Range parser, 2 MB chunk alignment, optional R2, Edge Cache API, and Google Drive range streaming ([`src/drive/stream.ts`](file:///home/vinayak/Documents/audioneko/packages/server/src/drive/stream.ts)).
- **Metadata Parser**: ISO-BMFF and ID3 binary tag extraction for M4B and MP3 chapters/covers ([`src/drive/metadata.ts`](file:///home/vinayak/Documents/audioneko/packages/server/src/drive/metadata.ts)).
- **Real-Time Sync Room**: Cloudflare Durable Object (`SyncRoom`) with SQLite backend for multi-device progress sync.

### `packages/app` (`@audioneko/app`)
- Single Page Application with TanStack Router, React 19, and Tailwind CSS v4.
- Output directory: `dist/` (configured in `wrangler.jsonc` as static assets for the server).
- **Audio Context**: Centralized transport coordinator ([`src/context/audio-context.tsx`](file:///home/vinayak/Documents/audioneko/packages/app/src/context/audio-context.tsx)).
- **Audio Engine**: Web Audio DSP pipeline ([`src/lib/audio-engine.ts`](file:///home/vinayak/Documents/audioneko/packages/app/src/lib/audio-engine.ts)).
- **Media Session**: Lock-screen controls and metadata ([`src/lib/media-session.ts`](file:///home/vinayak/Documents/audioneko/packages/app/src/lib/media-session.ts)).
- **Sleep Timer**: Countdown with 30s linear volume fade and shake-to-extend ([`src/lib/sleep-timer.ts`](file:///home/vinayak/Documents/audioneko/packages/app/src/lib/sleep-timer.ts)).
- **Scrubber**: Decelerated vertical-drag timeline ([`src/components/player/WaveformScrubber.tsx`](file:///home/vinayak/Documents/audioneko/packages/app/src/components/player/WaveformScrubber.tsx)).
- **PiP Visualizer**: Picture-in-Picture canvas with live frequency spectrum ([`src/lib/pip-visualizer.ts`](file:///home/vinayak/Documents/audioneko/packages/app/src/lib/pip-visualizer.ts)).
- **Full Player Modal**: Expanded tactile player ([`src/components/player/FullPlayerModal.tsx`](file:///home/vinayak/Documents/audioneko/packages/app/src/components/player/FullPlayerModal.tsx)).

---

## 3. Audio Engine & DSP Technical Specifications

When editing or extending the audio playback pipeline:

1. **Anti-Pop Gain Ramp**:
   - Always ramp gain linearly over 40ms (`0.001 -> volume` on play, `volume -> 0.001` on pause) using `gainNode.gain.linearRampToValueAtTime(...)`. Never abruptly cut off or start audio elements.
2. **Voice Boost EQ**:
   - Band A (Highpass): 85 Hz, $Q = \text{Math.SQRT1_2}$ (kills desk rumble and mic plosives). Note: Always use `Math.SQRT1_2` rather than `0.707` to satisfy Biome's `noApproximativeNumericConstant`.
   - Band B (Peaking): 2.2 kHz, $Q = 1.2$, gain $= +3.5\text{ dB}$ (lifts speech clarity and vocal presence).
   - Band C (Peaking/Notch): 7.5 kHz, $Q = 1.0$, gain $= -2.5\text{ dB}$ (tames harsh sibilance "s" / "sh").
3. **Loudness Normalization**:
   - Dynamics compressor targeting $-16\text{ LUFS}$: Threshold $-24\text{ dB}$, Knee $12\text{ dB}$, Ratio $4:1$, Attack $0.003\text{s}$, Release $0.25\text{s}$.
4. **Smart Speed (Silence Trimming)**:
   - Dynamic silence detector AudioWorklet running on a rolling 250ms RMS window.
   - When silent: automatically speeds up playback rate to $\min(3.0\times, \text{baseRate} \times 2.2)$.
   - When speech resumes: immediately restores the listener's chosen `basePlaybackRate`.
5. **Decelerated Scrubber Math**:
   - Drag delta $0 \le \Delta y < 35\text{px}$: $1.0\times$ (Normal speed)
   - Drag delta $35 \le \Delta y < 80\text{px}$: $0.5\times$ (Half-speed)
   - Drag delta $80 \le \Delta y < 140\text{px}$: $0.25\times$ (Quarter-speed)
   - Drag delta $\Delta y \ge 140\text{px}$: $0.1\times$ (Fine scrubbing)
6. **Sleep Timer Volume Fade**:
   - Within the final 30 seconds: `volumeMultiplier = remainingSeconds / 30`.
   - Shake to extend: Accelerometer $\Delta(\text{vector}) > 18\text{ m/s}^2$ extends by $+15$ minutes and vibrates with `[40, 60, 40]`.

---

## 4. Free Tier Quotas & Safety Margins (3–10 Users)

| Service | Free Tier Allocation | Estimated 3–10 Friends Usage | Safety Headroom | Credit Card Required? |
| :--- | :--- | :--- | :--- | :---: |
| **Cloudflare Workers** | 100,000 requests / day | ~500 req / day | **99.5% Headroom** | **NO** |
| **Cloudflare D1** | 5,000,000 row reads / day | ~5,000 reads / day | **99.9% Headroom** | **NO** |
| **Cloudflare D1** | 100,000 row writes / day | ~500 writes / day | **99.5% Headroom** | **NO** |
| **Cloudflare D1** | 5 GB storage | < 25 MB (metadata only) | **99.5% Headroom** | **NO** |
| **Cloudflare KV** | 100,000 reads / day | ~200 reads / day | **99.8% Headroom** | **NO** |
| **Cloudflare KV** | 1,000 writes / day | ~50 writes / day | **95.0% Headroom** | **NO** |
| **Cloudflare Durable Objects** | 1,000,000 requests / month | ~15,000 req / month | **98.5% Headroom** | **NO** |
| **Google Drive API** | 10,000 requests / 100s | < 1 request / 100s | **99.9% Headroom** | **NO** |
| **Browser OPFS** | Hundreds of GBs (client disk) | Unlimited per user device | **100% Free** | **NO** |

---

## 5. Development Runbook & Quality Commands

Always ensure `PATH="$HOME/.local/bin:$PATH"` is prepended when executing commands in bash.

### Fast Validation Pipeline
Run this sequence before committing any milestone:
```bash
export PATH="$HOME/.local/bin:$PATH"

# 1. Biome formatting & lint check (zero errors allowed)
pnpm exec biome check .

# 2. Workspace TypeScript check across all 3 packages
pnpm run typecheck

# 3. Vitest test runner across server and app
pnpm test

# 4. Vite production build test
pnpm run build
```

### Package-Specific Testing
```bash
# Test server only
pnpm --filter @audioneko/server test

# Test app only
pnpm --filter @audioneko/app test

# Typecheck server only
pnpm --filter @audioneko/server typecheck
```

### Git & Documentation Protocol
- **Keep `PROGRESS.md` in Sync**: Always check off completed tasks and update the activity log table after completing a step.
- **Conventional Commits**: Format commit messages as `feat(scope): ...`, `fix(scope): ...`, `chore(scope): ...`, or `docs(scope): ...`.
- **Remote Synchronization**: Push commits to GitHub `origin main` after validating tests.
