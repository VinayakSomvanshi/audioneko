# audioneko: Immersion Reading & Companion E-Book Specification
**Architecture, Data Modeling, Synchronization Engines & User Experience Standard**  
*Document Version: 1.0.0 • Target Environment: Cloudflare Workers Edge & Client PWA (React 19)*  
*License: GNU Affero General Public License v3.0 (AGPL-3.0-or-later)*

---

## 1. Executive Summary & Product Vision

**audioneko** is designed as a private, high-fidelity audiobook streaming platform. However, audio storytelling and the written word are complementary media:
- When listening to complex fantasy, sci-fi, or non-fiction, listeners frequently encounter intricate character names, invented languages, dialogue nuances, maps, and technical terminology that are difficult to comprehend or spell purely by ear.
- Many listeners own dedicated hardware e-readers (Kindle, Kobo, Onyx Boox) and desire a unified vault where a single title encompasses both the audio performance and the e-book publication for cross-device sideloading.
- Language learners and multimodal readers retain significantly more information when engaging in **Immersion Reading**—reading the printed text while listening to the narrated audio.

This specification defines the complete end-to-end architecture for **Companion E-Books & Immersion Reading** in audioneko:
1. **Pillar 1: Companion E-Book Download Engine**: Automated detection and one-click downloading of `.epub`, `.mobi`, and `.pdf` files from Google Drive directly to client devices and e-readers.
2. **Pillar 2: In-Player Read-Along Engine ("Spotify-Style Lyrics for Books")**: A dynamic, zero-bundle-penalty reader integrated into the full player modal allowing listeners to toggle between cover art and active chapter text.
3. **Pillar 3: Progressive Audio-to-Text Synchronization**: A tiered synchronization model starting with deterministic chapter-level alignment and proportional auto-scrolling, up to sentence-level EPUB3 SMIL media overlay highlighting.

```
                              ┌─────────────────────────────────────────┐
                              │       Google Drive Audiobook Vault      │
                              │     (e.g., "Iron Flame.m4b" + ".epub")  │
                              └────────────────────┬────────────────────┘
                                                   │
                                                   ▼ Scanner Ingestion
                              ┌─────────────────────────────────────────┐
                              │        Cloudflare D1 Books Table        │
                              │     - Audio: Duration, M4B Chapters     │
                              │     - E-Book: Drive ID, Format, Size    │
                              └─────────┬─────────────────────┬─────────┘
                                        │                     │
                ┌───────────────────────┘                     └───────────────────────┐
                ▼                                                                     ▼
   ┌───────────────────────────┐                                         ┌───────────────────────────┐
   │    EXTERNAL SIDELOADING   │                                         │    IN-APP READ-ALONG      │
   │    [ Download EPUB ]      │                                         │   [ Read Along Tab ]      │
   │  - Direct RFC 6266 Stream │                                         │ - Dynamic Lazy-Loaded     │
   │  - Sideload to Kindle/Kobo│                                         │ - Chapter & Scroll Sync   │
   │  - Offline OPFS Cache     │                                         │ - Sober Thoughts Serifs   │
   └───────────────────────────┘                                         └───────────────────────────┘
```

---

## 2. Core Use Cases & User Personas

### 2.1 The Fantasy & Lore Enthusiast (Spelling & Clarification)
- **Scenario**: While listening to *House of Flame and Shadow* or *Fourth Wing*, a narrator introduces characters (e.g. *Rhiannon Amari*, *Jesinia Neilwart*) or places (*Aretia*, *Navarre*).
- **Behavior**: The listener swipes up or taps "Read Along" in the player, glances at the current paragraph to see the exact orthography and context, and continues listening without breaking flow or risking spoilers via web searches.

### 2.2 The Multimodal Commuter & E-Ink Reader
- **Scenario**: A listener streams the audiobook during their morning commute over cellular or Bluetooth. In the evening, they prefer reading on a Kindle Paperwhite or Kobo Clara without screen glare.
- **Behavior**: On the book detail page, they tap "Download EPUB", receiving a clean, DRM-free e-book ready to be forwarded to their "Send to Kindle" email or transferred over USB-C.

### 2.3 The Accessibility & Maximum-Retention Listener
- **Scenario**: Language learners, neurodivergent listeners, or study-focused readers who struggle with auditory-only processing.
- **Behavior**: They open the dedicated Reader view (`/book/:id/read`), adjust typography to high-contrast serif with relaxed line spacing, and engage in continuous read-along with smooth proportional scrolling.

---

## 3. System Architecture & Data Modeling

### 3.1 Cloudflare D1 Database Schema Additions
In [packages/server/src/db/schema.ts](file:///home/vinayak/Documents/audioneko/packages/server/src/db/schema.ts), the `books` table is extended with optional companion e-book metadata fields:

```typescript
export const books = sqliteTable(
  "books",
  {
    // ... existing core fields (id, title, author, durationSeconds, etc.) ...
    
    // Companion E-Book Metadata
    ebookDriveFileId: text("ebook_drive_file_id"),
    ebookFormat: text("ebook_format", { enum: ["epub", "mobi", "azw3", "pdf"] }),
    ebookSizeBytes: integer("ebook_size_bytes").default(0),
    ebookFileName: text("ebook_file_name"),
    ebookChecksum: text("ebook_checksum"),
  },
  (table) => [
    index("books_author_idx").on(table.author),
    index("books_series_idx").on(table.seriesId),
    index("books_ebook_idx").on(table.ebookDriveFileId),
  ],
);
```

### 3.2 Automated Google Drive Scanner Discovery
In [packages/server/src/drive/scanner.ts](file:///home/vinayak/Documents/audioneko/packages/server/src/drive/scanner.ts), the crawl loop identifies and pairs companion files:
1. **File Extension Matching**:
   Recognize files with MIME types:
   - `application/epub+zip` (`.epub`)
   - `application/x-mobipocket-ebook` (`.mobi`)
   - `application/vnd.amazon.ebook` (`.azw3`)
   - `application/pdf` (`.pdf`)
2. **Companion Pairing Heuristic**:
   - If an audio file and an e-book file share the same parent Google Drive folder, they are automatically linked.
   - If multiple e-books exist in a folder, `.epub` is selected by default as the primary web-renderable standard, with secondary formats cataloged.
3. **Database Upsert**:
   When updating book metadata, `ebookDriveFileId`, `ebookFormat`, `ebookSizeBytes`, and `ebookFileName` are populated atomically.

### 3.3 Manual Admin Override in Metadata Fixer
In [MetadataFixerModal.tsx](file:///home/vinayak/Documents/audioneko/packages/app/src/components/admin/MetadataFixerModal.tsx):
- Admins can view the currently linked e-book file.
- An input allows attaching an alternative Google Drive file ID for the e-book.
- A drag-and-drop file upload target allows uploading an `.epub` file directly to the book folder.

### 3.4 Edge Streaming Proxy Route
In [packages/server/src/index.ts](file:///home/vinayak/Documents/audioneko/packages/server/src/index.ts):
- `GET /api/books/:id/ebook`:
  - Authenticated via session cookie or bearer token (`requireAuth`).
  - Supports `HEAD` and `GET`.
  - Serves Google Drive file bytes using the existing authorized service account stream proxy.
  - Generates standard RFC 6266 headers:
    ```http
    Content-Type: application/epub+zip
    Content-Disposition: attachment; filename="Title - Author.epub"; filename*=UTF-8''Title%20-%20Author.epub
    Content-Length: 2451920
    Cache-Control: public, max-age=86400, stale-while-revalidate=604800
    ```

---

## 4. Pillar 1: Companion E-Book Download Engine (External E-Readers)

### 4.1 Book Detail Page Presentation
In [book-detail.tsx](file:///home/vinayak/Documents/audioneko/packages/app/src/routes/book-detail.tsx):
- When `book.ebookDriveFileId` is present:
  - Render a companion download button alongside the audio transport controls:
    ```tsx
    <a
      href={`/api/books/${book.id}/ebook`}
      download
      className="px-4 py-2.5 rounded border border-border bg-surface text-muted hover:text-text hover:border-accent/40 font-mono text-xs flex items-center gap-2 transition-colors cursor-pointer"
      title="Download companion e-book for Kindle, Kobo, or Apple Books"
    >
      <BookOpen className="w-4 h-4 text-accent" />
      <span>Download {book.ebookFormat?.toUpperCase() || "EPUB"}</span>
      <span className="text-[10px] text-subtle font-mono">({formatBytes(book.ebookSizeBytes)})</span>
    </a>
    ```

### 4.2 Sideloading Guidance Modal
A lightweight, tactile help modal triggered by a small `Info` button next to the download action, explaining:
- **Send to Kindle**: How to email `.epub` files to `@kindle.com` or upload via `amazon.com/sendtokindle`.
- **Kobo / Boox**: How to drag-and-drop the `.epub` over USB-C or transfer via web browser.
- **Apple Books**: How opening the downloaded file on iOS or macOS adds it directly to the native library.

### 4.3 Offline OPFS Download Option
In [opfs.ts](file:///home/vinayak/Documents/audioneko/packages/app/src/lib/opfs.ts):
- Because e-books are compact (typically $1\text{ MB} - 5\text{ MB}$), when a user downloads an audiobook for offline listening, the companion e-book is optionally downloaded into OPFS at `opfs://books/:bookId/book.epub`.
- This guarantees 100% offline access to the text on airplanes or low-connectivity zones without consuming significant device storage.

---

## 5. Pillar 2: In-Player Read-Along Architecture ("Spotify-Style Lyrics")

### 5.1 Player UI Integration
In [FullPlayerModal.tsx](file:///home/vinayak/Documents/audioneko/packages/app/src/components/player/FullPlayerModal.tsx):
- Introduce a segmented mode switcher located above the primary visual area:
  ```tsx
  <div className="flex items-center justify-center gap-1 p-0.5 rounded-lg bg-elevated border border-border">
    <button
      type="button"
      onClick={() => setPlayerView("artwork")}
      className={`px-3 py-1 rounded text-xs font-mono font-medium transition-colors ${
        playerView === "artwork" ? "bg-surface text-text shadow-xs" : "text-muted hover:text-text"
      }`}
    >
      Artwork
    </button>
    <button
      type="button"
      onClick={() => setPlayerView("reader")}
      className={`px-3 py-1 rounded text-xs font-mono font-medium transition-colors flex items-center gap-1.5 ${
        playerView === "reader" ? "bg-surface text-text shadow-xs" : "text-muted hover:text-text"
      }`}
    >
      <BookOpen className="w-3.5 h-3.5 text-accent" />
      <span>Read Along</span>
    </button>
  </div>
  ```
- **Mobile Gesture**: Swiping upward on the square cover art transitions smoothly to the `reader` view.

### 5.2 Dynamic Code Splitting & Performance Budget
- **Zero Bundle Impact**: The EPUB parsing and rendering component is lazy-loaded using `React.lazy()` and `Suspense`:
  ```tsx
  const ReadAlongReader = React.lazy(() => import("../reader/ReadAlongReader"));
  ```
- Listeners who exclusively use audio never download the reader bundle, keeping initial app load times under 100ms.

### 5.3 Client-Side EPUB Parsing Pipeline
To avoid edge server compute overhead, EPUB decompression and rendering occur directly in the client browser:
1. **Container Extraction**:
   - Fetch the EPUB file blob (from edge cache or OPFS).
   - Use `fflate` inside a Web Worker to decompress the zip file in memory.
2. **Metadata & Spine Parsing**:
   - Read `META-INF/container.xml` to locate the `.opf` package file.
   - Parse `package.opf` to extract the manifest, spine items, and Table of Contents (`toc.ncx` or `nav.xhtml`).
3. **HTML Sanitization & Style Stripping**:
   - Publisher EPUBs often contain hardcoded fonts, garish background colors, and table layouts that conflict with dark mode.
   - Run extracted chapter XHTML through a sanitizer that strips publisher inline styles and `<link rel="stylesheet">` tags while preserving semantic tags (`<p>`, `<h1>`, `<em>`, `<blockquote>`, `<img>`).
4. **Image Handling**:
   - Map relative EPUB image paths (`src="../images/map.jpg"`) to in-memory `URL.createObjectURL` references to allow viewing maps, chapter headers, and illustrations without network calls.

### 5.4 Sober-Thoughts Reader Typography
Adhering strictly to audioneko design standards:
- **Background**: Solid obsidian (`#101012`, `oklch(0.085 0 0)`), zero cloudy glass.
- **Typography Tokens**:
  - Primary text: High-contrast warm off-white (`oklch(0.96 0.002 90)`).
  - Font families: User-switchable between **Serif** (Charter, Iowan Old Style, or Georgia), **Sans** (Inter), and **Mono** (IBM Plex Mono).
  - Controls: Slider for font size ($14\text{px} - 24\text{px}$), line-height toggle ($1.4 - 1.8$), and margin width padding.

---

## 6. Pillar 3: Audio-to-Text Synchronization Models

### 6.1 Tier 1: Deterministic Chapter-Level Synchronization
- **Principle**: The audio transport drives the reader chapter, and the reader drives the audio transport.
- **Mechanism**:
  - The M4B audio file contains chapters with timestamps:
    - Chapter 1: $0\text{s} - 1,240\text{s}$
    - Chapter 2: $1,240\text{s} - 2,580\text{s}$
  - The EPUB contains spine files:
    - `chapter01.xhtml`
    - `chapter02.xhtml`
  - When the audio crosses $1,240\text{s}$, the reader automatically flips to `chapter02.xhtml`.
  - When the listener taps "Chapter 4" in the reader Table of Contents, the audio player seeks to Chapter 4's `startTime`.
- **Complexity**: Low. 100% deterministic, zero manual preparation.

### 6.2 Tier 2: Proportional Interpolated Auto-Scroll
- **Principle**: While within an active chapter, the text view auto-scrolls down proportionally as audio plays.
- **Formula**:
  $$\text{Progress Fraction} = \frac{\text{Current Time} - \text{Chapter Start}}{\text{Chapter End} - \text{Chapter Start}}$$
  $$\text{Target Scroll Top} = \text{Progress Fraction} \times (\text{Scroll Height} - \text{Client Height})$$
- **Smooth Animation**: Apply a CSS smooth scroll or requestAnimationFrame throttle (every 500ms) to prevent jitter.
- **User Independence (Scroll Lock)**:
  - If the user touches or scrolls the text container manually, **Auto-Scroll is temporarily paused** (Scroll Lock engaged).
  - A small floating pill appears: `[ Snap to Audio • 14:20 ]`.
  - Tapping the pill returns the view to the interpolated audio position and re-enables sync.

### 6.3 Tier 3: EPUB3 SMIL Media Overlays (Sentence Karaoke)
- **Principle**: Word-by-word or sentence-by-sentence highlighted karaoke.
- **Format**: EPUB3 specifies Synchronized Multimedia Integration Language (`.smil`).
- **Detection**:
  - During the EPUB parse pass, check `package.opf` for `media-type="application/smil+xml"`.
  - If SMIL documents exist, they define exact millisecond mappings for each HTML `<span id="...">`:
    ```xml
    <par id="par-1">
      <text src="chapter1.xhtml#sentence-1" />
      <audio src="audio.m4b" clipBegin="12.4s" clipEnd="18.2s" />
    </par>
    ```
- **Rendering**:
  - Highlight the active `<span id="...">` with a glowing crimson underline or amber text illumination:
    ```css
    .read-along-active-sentence {
      background: oklch(0.66 0.21 22 / 0.15);
      border-bottom: 2px solid oklch(0.66 0.21 22);
      border-radius: 2px;
      transition: background 0.2s ease;
    }
    ```

### 6.4 Desynchronization Mitigations
In commercial audiobooks, audio chaptering sometimes differs slightly from print e-book chapters (e.g. an audio file includes an opening publisher disclaimer as Chapter 1, shifting all subsequent chapters by +1).
- **Manual Offset Selector**:
  - Inside the reader header, a compact dropdown: `Audio: Chapter 5 -> Text: Chapter 4 [ Adjust Offset ]`.
  - Listeners can bump the chapter alignment by $+1$ or $-1$ if a book was mastered with an offset track.
- **Full-Text In-Chapter Search**:
  - An inline search bar allows typing a phrase heard in the audio to jump directly to that paragraph in the text.

---

## 7. Pillar 4: Dedicated Reader Mode (`/book/:id/read`)

For listeners who want a full-page reading experience on tablets, laptops, or desktops:
- **Route**: `/book/:id/read`
- **Layout**:
  - Top header with clean breadcrumb navigation back to library.
  - Centered reader column ($650\text{px} - 800\text{px}$ maximum reading width for optimal typographic line length of 65–75 characters).
  - Bottom docked miniplayer showing audio progress, play/pause, voice boost, and speed controls.
- **Keyboard Shortcuts**:
  - `Space`: Toggle audio playback.
  - `J` / `K`: Scroll text up/down.
  - `[` / `]`: Adjust playback rate.
  - `ArrowLeft` / `ArrowRight`: Skip backward / forward 15s.

---

## 8. Technical Challenges, Edge Cases & Mitigations

| Technical Challenge | Potential Risk | Architectural Mitigation |
| :--- | :--- | :--- |
| **MOBI / AZW3 Format** | MOBI is a legacy proprietary binary format that browsers cannot unpack natively. | Promote EPUB as the primary format for in-app reading. For MOBI/AZW3 files, provide the **Download Button** for Kindle sideloading, while reserving the **Read-Along Player** for EPUB. |
| **Memory Consumption on Mobile** | Rendering a 900-page fantasy EPUB all at once can freeze Safari / Chrome on mobile devices. | Render only **one chapter at a time** in the DOM. When advancing chapters, unmount the previous chapter and mount the next one cleanly. |
| **Publisher CSS Pollution** | Publishers embed hardcoded white backgrounds, dark text, or rigid pixel margins that break dark mode. | Strip all embedded publisher `<style>` tags during parsing. Enforce audioneko's CSS design system tokens exclusively. |
| **Embedded Images & Maps** | Fantasy books contain high-resolution maps that might fail to render if paths are broken. | Resolve relative image URIs against the EPUB zip manifest and generate blob URLs via `URL.createObjectURL()`. |
| **PWA Screen Lock / WakeLock** | When reading and listening without touching the screen, mobile screens may dim or sleep. | Use the `navigator.wakeLock` API while the reader tab is actively focused during audio playback to keep the screen alive. |

---

## 9. Phased Implementation Roadmap

### Phase A: Companion E-Book Ingestion & Downloads (Immediate Win)
- [ ] Add `ebookDriveFileId`, `ebookFormat`, `ebookSizeBytes`, `ebookFileName` to D1 `books` schema.
- [ ] Update `packages/server/src/drive/scanner.ts` to detect `.epub`, `.mobi`, `.azw3`, and `.pdf` files.
- [ ] Implement `GET /api/books/:id/ebook` edge streaming proxy route with RFC 6266 attachment headers.
- [ ] Add "Download E-Book" button with file size to [book-detail.tsx](file:///home/vinayak/Documents/audioneko/packages/app/src/routes/book-detail.tsx).
- [ ] Add manual e-book linking input to [MetadataFixerModal.tsx](file:///home/vinayak/Documents/audioneko/packages/app/src/components/admin/MetadataFixerModal.tsx).

### Phase B: Client-Side EPUB Parsing & In-Player Reader View
- [ ] Add lightweight client-side zip decompression (`fflate`).
- [ ] Build `EpubParser` utility to extract OPF metadata, spine, TOC, and chapter XHTML in a Web Worker.
- [ ] Create `ReadAlongReader.tsx` component with `sober-thoughts` dark typography.
- [ ] Integrate view switcher (`Artwork` vs `Read Along`) into [FullPlayerModal.tsx](file:///home/vinayak/Documents/audioneko/packages/app/src/components/player/FullPlayerModal.tsx) via `React.lazy`.
- [ ] Implement Tier 1 Chapter-Level synchronization (audio chapter change turns reader chapter; clicking TOC seeks audio).

### Phase C: Proportional Auto-Scroll & Reader Customization
- [ ] Implement Tier 2 proportional auto-scroll engine with smooth interpolation.
- [ ] Implement Scroll Lock detection with floating "Snap to Audio" action.
- [ ] Add typography preference controls (Font family, font size, line-height).
- [ ] Add chapter manual offset selector ($+1 / -1$) for misaligned audio mastering.
- [ ] Cache e-book in OPFS for offline read-along on airplanes.

### Phase D: Dedicated Reader Route & SMIL Media Overlays
- [ ] Build `/book/:id/read` dedicated full-page reading route with docked miniplayer.
- [ ] Add EPUB3 SMIL Media Overlay detection and sentence-level karaoke highlighting.
- [ ] Add `navigator.wakeLock` support to prevent screen dimming while reading.
- [ ] Enable dual-timestamp quote clipping (highlight text passage to create audio bookmark).

---

## 10. Quality & Engineering Invariants

To maintain the architectural integrity of the audioneko platform:
1. **Strictly Zero Server Cost**: E-book parsing and rendering must remain 100% client-side in the listener's browser. Do not introduce server-side headless browsers, heavy rendering containers, or external paid APIs.
2. **Zero Bundle Bloat**: All reader code must be dynamically imported on demand (`React.lazy`). The base audio player bundle must remain unaffected.
3. **Strict Typography Guidelines**: No cloudy glass or low-contrast text. Maintain obsidian black `#101012`, crisp 1px borders, and high-contrast typography.
4. **Offline Resilience**: Offline OPFS streaming and playback must operate independently of network connectivity once cached.
