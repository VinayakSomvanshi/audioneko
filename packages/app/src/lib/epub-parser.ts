import { unzipSync } from "fflate";

export interface EpubMetadata {
  title: string;
  creator: string;
  language?: string;
  publisher?: string;
  identifier?: string;
}

export interface EpubTocItem {
  id: string;
  title: string;
  href: string; // e.g. "text/chapter1.xhtml" or "chapter1.xhtml#part1"
  spineIndex: number;
  level: number;
  children?: EpubTocItem[];
}

export interface EpubChapter {
  spineIndex: number;
  id: string;
  href: string;
  title: string;
  htmlContent: string;
  wordCount: number;
}

export interface SmilSyncParagraph {
  textSrc: string; // e.g. "chapter1.xhtml#p1"
  elementId: string;
  clipBeginSeconds: number;
  clipEndSeconds: number;
}

export class EpubParser {
  private files: Record<string, Uint8Array> = {};
  private opfDir = "";
  private manifest = new Map<string, { href: string; mediaType: string; properties?: string }>();
  private spineItems: Array<{ id: string; href: string }> = [];
  private objectUrls = new Set<string>();

  public metadata: EpubMetadata = { title: "", creator: "" };
  public toc: EpubTocItem[] = [];
  public spineCount = 0;
  public startOfContentSpineIndex: number | null = null;

  constructor(data: ArrayBuffer | Uint8Array) {
    const uint8 = data instanceof Uint8Array ? data : new Uint8Array(data);
    this.files = unzipSync(uint8);
    this.parseContainer();
  }

  /**
   * Cleans up all generated Object URLs to avoid memory leaks.
   */
  public destroy(): void {
    for (const url of this.objectUrls) {
      URL.revokeObjectURL(url);
    }
    this.objectUrls.clear();
    this.files = {};
  }

  /**
   * Helper to normalize path by resolving "." and ".."
   */
  private resolvePath(baseDir: string, relativePath: string): string {
    const cleanRelative = (relativePath.split("#")[0] ?? "").replace(/^\//, "");
    if (!baseDir) return cleanRelative;

    const parts = baseDir.split("/").filter(Boolean);
    const relParts = cleanRelative.split("/").filter(Boolean);

    for (const part of relParts) {
      if (part === ".") continue;
      if (part === "..") {
        parts.pop();
      } else {
        parts.push(part);
      }
    }
    return parts.join("/");
  }

  /**
   * Helper to find file in zip case-insensitively if direct lookup misses
   */
  private getFileBytes(path: string): Uint8Array | null {
    if (this.files[path]) {
      return this.files[path];
    }
    const cleanPath = path.replace(/^\//, "");
    if (this.files[cleanPath]) {
      return this.files[cleanPath];
    }
    // Case-insensitive fallback
    const lower = cleanPath.toLowerCase();
    for (const key of Object.keys(this.files)) {
      if (key.toLowerCase() === lower && this.files[key]) {
        return this.files[key];
      }
    }
    return null;
  }

  /**
   * Safe XML parser that strips malformed/single-quoted <?xml ...?> declarations
   * and falls back to HTML parsing if an XML parsererror occurs.
   */
  private parseXmlDoc(
    rawStr: string,
    mimeType: "application/xml" | "application/xhtml+xml" = "application/xml",
  ): Document {
    const parser = new DOMParser();
    const cleanXml = rawStr.replace(/^\s*<\?xml[^>]*\?>/i, "").trim();
    const doc = parser.parseFromString(cleanXml, mimeType);
    if (doc.querySelector("parsererror")) {
      return parser.parseFromString(cleanXml, "text/html");
    }
    return doc;
  }

  /**
   * Namespace-agnostic element query helper.
   */
  private getElements(root: Document | Element, tagName: string): Element[] {
    const list1 = Array.from(root.getElementsByTagName(tagName));
    if (list1.length > 0) return list1;
    const list2 = Array.from(root.getElementsByTagNameNS("*", tagName));
    if (list2.length > 0) return list2;
    return Array.from(root.querySelectorAll(tagName));
  }

  private parseContainer(): void {
    const containerXmlBytes = this.getFileBytes("META-INF/container.xml");
    if (!containerXmlBytes) {
      throw new Error("Invalid EPUB: Missing META-INF/container.xml");
    }

    const xmlStr = new TextDecoder("utf-8").decode(containerXmlBytes);
    const doc = this.parseXmlDoc(xmlStr, "application/xml");

    const rootfiles = this.getElements(doc, "rootfile");
    const opfFullPath = rootfiles[0]?.getAttribute("full-path");
    if (!opfFullPath) {
      throw new Error("Invalid EPUB: No rootfile full-path found in container.xml");
    }

    const lastSlash = opfFullPath.lastIndexOf("/");
    this.opfDir = lastSlash >= 0 ? opfFullPath.slice(0, lastSlash) : "";

    const opfBytes = this.getFileBytes(opfFullPath);
    if (!opfBytes) {
      throw new Error(`Invalid EPUB: OPF package file not found at ${opfFullPath}`);
    }

    const opfStr = new TextDecoder("utf-8").decode(opfBytes);
    this.parseOpf(opfStr);
  }

  private parseOpf(opfXmlStr: string): void {
    const doc = this.parseXmlDoc(opfXmlStr, "application/xml");

    // 1. Metadata
    const getMetaEl = (name: string): Element | null => {
      const els = this.getElements(doc, name);
      if (els[0]) return els[0];
      const elsDc = this.getElements(doc, `dc:${name}`);
      return elsDc[0] ?? null;
    };

    const titleEl = getMetaEl("title");
    const creatorEl = getMetaEl("creator");
    const langEl = getMetaEl("language");

    this.metadata = {
      title: titleEl?.textContent?.trim() || "Untitled",
      creator: creatorEl?.textContent?.trim() || "Unknown Author",
      language: langEl?.textContent?.trim() || "en",
    };

    // 2. Manifest
    this.manifest.clear();
    let ncxHref: string | null = null;
    let navHref: string | null = null;

    const itemEls = this.getElements(doc, "item");
    for (const item of itemEls) {
      const id = item.getAttribute("id");
      const href = item.getAttribute("href");
      const mediaType = item.getAttribute("media-type") || "";
      const properties = item.getAttribute("properties") || "";

      if (id && href) {
        this.manifest.set(id, { href, mediaType, properties });
        if (properties.includes("nav")) {
          navHref = href;
        }
        if (mediaType === "application/x-dtbncx+xml") {
          ncxHref = href;
        }
      }
    }

    // 3. Spine
    this.spineItems = [];
    const itemrefEls = this.getElements(doc, "itemref");
    for (const itemref of itemrefEls) {
      const idref = itemref.getAttribute("idref");
      if (idref && this.manifest.has(idref)) {
        const item = this.manifest.get(idref)!;
        this.spineItems.push({
          id: idref,
          href: item.href,
        });
      }
    }
    this.spineCount = this.spineItems.length;

    // 4. Parse Table of Contents
    if (navHref) {
      this.parseNavDoc(navHref);
    } else if (ncxHref) {
      this.parseNcxDoc(ncxHref);
    } else {
      // Fallback: Generate sequential TOC from spine
      this.toc = this.spineItems.map((s, index) => ({
        id: s.id,
        title: `Section ${index + 1}`,
        href: s.href,
        spineIndex: index,
        level: 1,
      }));
    }

    // 5. Parse standard EPUB 2 <guide> for landmarks (start of body matter)
    const guideEls = this.getElements(doc, "guide");
    const guideEl = guideEls[0];
    if (guideEl && this.startOfContentSpineIndex === null) {
      const references = this.getElements(guideEl, "reference");
      for (const ref of references) {
        const type = (ref.getAttribute("type") || "").toLowerCase();
        const href = ref.getAttribute("href") || "";
        // Only accept "text" or "bodymatter", and ensure spine index > 0 so cover isn't treated as story start
        if (type === "text" || type === "bodymatter") {
          const idx = this.findSpineIndexForHref(href);
          if (idx > 0) {
            this.startOfContentSpineIndex = idx;
            break;
          }
        }
      }
    }
  }

  private findSpineIndexForHref(href: string): number {
    const cleanTarget = href.split("#")[0] ?? "";
    const resolvedTarget = this.resolvePath(this.opfDir, cleanTarget);

    for (let i = 0; i < this.spineItems.length; i++) {
      const item = this.spineItems[i];
      if (!item) continue;
      const resolvedSpine = this.resolvePath(this.opfDir, item.href);
      if (resolvedSpine === resolvedTarget || resolvedSpine.endsWith(cleanTarget)) {
        return i;
      }
    }
    return 0;
  }

  /**
   * Parse EPUB 3 Navigation Document (nav.xhtml)
   */
  private parseNavDoc(navRelHref: string): void {
    const fullPath = this.resolvePath(this.opfDir, navRelHref);
    const navBytes = this.getFileBytes(fullPath);
    if (!navBytes) return;

    const navStr = new TextDecoder("utf-8").decode(navBytes);
    const doc = this.parseXmlDoc(navStr, "application/xhtml+xml");

    const navEls = this.getElements(doc, "nav");
    const navDir = navRelHref.includes("/") ? navRelHref.slice(0, navRelHref.lastIndexOf("/")) : "";

    // Check for EPUB 3 <nav epub:type="landmarks"> to identify start of story
    for (const nav of navEls) {
      const epubType = (
        nav.getAttribute("epub:type") ||
        nav.getAttribute("role") ||
        ""
      ).toLowerCase();
      if (epubType.includes("landmark")) {
        const landmarkLinks = this.getElements(nav, "a");
        for (const a of landmarkLinks) {
          const type = (a.getAttribute("epub:type") || "").toLowerCase();
          const hrefAttr = a.getAttribute("href") || "";
          if (
            type === "bodymatter" ||
            type === "text" ||
            type === "start" ||
            type.includes("start-page")
          ) {
            const resolvedHref = navDir ? this.resolvePath(navDir, hrefAttr) : hrefAttr;
            const spineIdx = this.findSpineIndexForHref(resolvedHref);
            if (spineIdx > 0) {
              this.startOfContentSpineIndex = spineIdx;
              break;
            }
          }
        }
      }
    }

    let navEl: Element | null = null;
    for (const el of navEls) {
      const epubType = el.getAttribute("epub:type") || el.getAttribute("role");
      if (epubType === "toc" || epubType === "doc-toc") {
        navEl = el;
        break;
      }
    }
    if (!navEl && navEls.length > 0) {
      navEl = navEls[0] ?? null;
    }

    if (!navEl) return;

    const items: EpubTocItem[] = [];
    const linkEls = this.getElements(navEl, "a");

    let idx = 0;
    for (const a of linkEls) {
      const hrefAttr = a.getAttribute("href") || "";
      const title = a.textContent?.trim() || `Chapter ${idx + 1}`;
      const resolvedHref = navDir ? this.resolvePath(navDir, hrefAttr) : hrefAttr;
      const spineIndex = this.findSpineIndexForHref(resolvedHref);

      items.push({
        id: `toc_${idx++}`,
        title,
        href: resolvedHref,
        spineIndex,
        level: 1,
      });
    }

    if (items.length > 0) {
      this.toc = items;
    }
  }

  /**
   * Parse EPUB 2 NCX Document (toc.ncx)
   */
  private parseNcxDoc(ncxRelHref: string): void {
    const fullPath = this.resolvePath(this.opfDir, ncxRelHref);
    const ncxBytes = this.getFileBytes(fullPath);
    if (!ncxBytes) return;

    const ncxStr = new TextDecoder("utf-8").decode(ncxBytes);
    const doc = this.parseXmlDoc(ncxStr, "application/xml");

    const ncxDir = ncxRelHref.includes("/") ? ncxRelHref.slice(0, ncxRelHref.lastIndexOf("/")) : "";

    const navPoints = this.getElements(doc, "navPoint");
    const items: EpubTocItem[] = [];

    let idx = 0;
    for (const np of navPoints) {
      const textEls = this.getElements(np, "text");
      const contentEls = this.getElements(np, "content");
      const title = textEls[0]?.textContent?.trim() || `Chapter ${idx + 1}`;
      const src = contentEls[0]?.getAttribute("src") || "";
      const resolvedHref = ncxDir ? this.resolvePath(ncxDir, src) : src;
      const spineIndex = this.findSpineIndexForHref(resolvedHref);

      items.push({
        id: np.getAttribute("id") || `ncx_${idx++}`,
        title,
        href: resolvedHref,
        spineIndex,
        level: 1,
      });
    }

    if (items.length > 0) {
      this.toc = items;
    }
  }

  /**
   * Retrieves and renders a single chapter XHTML file by its spine index.
   * Strips publisher styles, resolves image assets to blob URLs, and cleans markup.
   */
  public getChapter(spineIndex: number): EpubChapter {
    if (spineIndex < 0 || spineIndex >= this.spineItems.length) {
      throw new Error(`Spine index ${spineIndex} out of bounds (0..${this.spineItems.length - 1})`);
    }

    const spineItem = this.spineItems[spineIndex];
    if (!spineItem) {
      throw new Error(`Spine item at index ${spineIndex} not found`);
    }

    const fullPath = this.resolvePath(this.opfDir, spineItem.href);
    const chapterBytes = this.getFileBytes(fullPath);

    if (!chapterBytes) {
      return {
        spineIndex,
        id: spineItem.id,
        href: spineItem.href,
        title: `Chapter ${spineIndex + 1}`,
        htmlContent: "<p class='text-muted font-mono text-xs'>Chapter content unavailable.</p>",
        wordCount: 0,
      };
    }

    const chapterDir = fullPath.includes("/") ? fullPath.slice(0, fullPath.lastIndexOf("/")) : "";

    const rawHtml = new TextDecoder("utf-8").decode(chapterBytes);
    const doc = this.parseXmlDoc(rawHtml, "application/xhtml+xml");

    // 1. Strip publisher styles, stylesheets, and scripts
    const removeSelectors = ["style", "link[rel='stylesheet']", "script", "iframe", "object"];
    for (const sel of removeSelectors) {
      const els = doc.querySelectorAll(sel);
      for (const el of els) {
        el.remove();
      }
    }

    // 2. Rewrite image sources to blob URLs
    const imgEls = doc.querySelectorAll("img, image");
    for (const img of imgEls) {
      const src =
        img.getAttribute("src") || img.getAttribute("xlink:href") || img.getAttribute("href");

      if (src && !src.startsWith("data:") && !src.startsWith("http")) {
        const resolvedImgPath = this.resolvePath(chapterDir, src);
        const imgBytes = this.getFileBytes(resolvedImgPath);

        if (imgBytes) {
          const ext = resolvedImgPath.split(".").pop()?.toLowerCase() || "jpeg";
          const mimeType =
            ext === "png"
              ? "image/png"
              : ext === "gif"
                ? "image/gif"
                : ext === "webp"
                  ? "image/webp"
                  : ext === "svg"
                    ? "image/svg+xml"
                    : "image/jpeg";

          const blob = new Blob([new Uint8Array(imgBytes)], { type: mimeType });
          const blobUrl = URL.createObjectURL(blob);
          this.objectUrls.add(blobUrl);

          img.setAttribute("src", blobUrl);
          img.removeAttribute("xlink:href");
          // Add clean responsive styles
          img.setAttribute(
            "class",
            "max-w-full h-auto rounded border border-border my-4 mx-auto block shadow-sm",
          );
        }
      }
    }

    // 3. Clean inline styles on elements that could clash with obsidian theme
    const styledEls = doc.querySelectorAll("[style]");
    for (const el of styledEls) {
      // Remove hardcoded font, color, background, width, height, and margins
      const style = el.getAttribute("style") || "";
      const cleanedStyle = style
        .replace(/color\s*:[^;]+;?/gi, "")
        .replace(/background(-color)?\s*:[^;]+;?/gi, "")
        .replace(/font-family\s*:[^;]+;?/gi, "")
        .replace(/font-size\s*:[^;]+;?/gi, "")
        .replace(/line-height\s*:[^;]+;?/gi, "")
        .replace(/margin(-left|-right|-top|-bottom)?\s*:\s*[0-9]+(px|pt|em|rem);?/gi, "")
        .trim();

      if (cleanedStyle) {
        el.setAttribute("style", cleanedStyle);
      } else {
        el.removeAttribute("style");
      }
    }

    // 4. Intercept anchor links to avoid browser navigating away
    const anchorEls = doc.querySelectorAll("a");
    for (const a of anchorEls) {
      const href = a.getAttribute("href");
      if (href) {
        if (href.startsWith("http://") || href.startsWith("https://")) {
          a.setAttribute("target", "_blank");
          a.setAttribute("rel", "noopener noreferrer");
        } else {
          // Internal link or footnote
          a.setAttribute("data-internal-href", href);
          a.setAttribute("href", "#");
          a.classList.add("cursor-pointer", "text-accent", "underline");
        }
      }
    }

    // 5. Determine title from TOC or first heading
    const matchedToc = this.toc.find((t) => t.spineIndex === spineIndex);
    let title = matchedToc?.title || "";
    if (!title) {
      const heading = doc.querySelector("h1, h2, h3, title");
      title = heading?.textContent?.trim() || `Chapter ${spineIndex + 1}`;
    }

    // 6. Calculate word count
    const bodyText = doc.body?.textContent || "";
    const words = bodyText.trim().split(/\s+/).filter(Boolean);
    const wordCount = words.length;

    // 7. Extract sanitized inner HTML
    const htmlContent = doc.body ? doc.body.innerHTML : rawHtml;

    return {
      spineIndex,
      id: spineItem.id,
      href: spineItem.href,
      title,
      htmlContent,
      wordCount,
    };
  }
}
