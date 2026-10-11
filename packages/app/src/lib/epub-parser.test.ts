// @vitest-environment happy-dom

import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { EpubParser } from "./epub-parser";

function createMockEpub(): Uint8Array {
  const containerXml = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

  const opfXml = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>House of Earth and Blood</dc:title>
    <dc:creator>Sarah J. Maas</dc:creator>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="ch1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/>
    <item id="nav" href="text/nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="map_img" href="images/map.png" media-type="image/png"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
  </spine>
</package>`;

  const navXhtml = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body>
    <nav epub:type="toc">
      <h1>Table of Contents</h1>
      <ol>
        <li><a href="ch1.xhtml">Part I: The Hollow</a></li>
        <li><a href="ch2.xhtml">Chapter 1</a></li>
      </ol>
    </nav>
  </body>
</html>`;

  const ch1Xhtml = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <title>Part I</title>
    <style>body { color: black; background: white; }</style>
  </head>
  <body>
    <h1 style="color: #000; font-family: 'Comic Sans';">Part I: The Hollow</h1>
    <img src="../images/map.png" alt="City of Lunathion Map"/>
    <p style="margin-left: 20px;">By the time the autumn sun began to sink below the horizon, Bryce Quinlan was already exhausted.</p>
  </body>
</html>`;

  const ch2Xhtml = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>Chapter 1</title></head>
  <body>
    <h1>Chapter 1</h1>
    <p>Danika Fendyr smelled like fresh rain and lightning.</p>
  </body>
</html>`;

  // 1x1 transparent PNG bytes
  const fakePng = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ]);

  return zipSync({
    mimetype: strToU8("application/epub+zip"),
    "META-INF/container.xml": strToU8(containerXml),
    "OEBPS/content.opf": strToU8(opfXml),
    "OEBPS/text/nav.xhtml": strToU8(navXhtml),
    "OEBPS/text/ch1.xhtml": strToU8(ch1Xhtml),
    "OEBPS/text/ch2.xhtml": strToU8(ch2Xhtml),
    "OEBPS/images/map.png": fakePng,
  });
}

describe("EpubParser", () => {
  it("parses EPUB metadata, manifest, spine and navigation", () => {
    const epubBytes = createMockEpub();
    const parser = new EpubParser(epubBytes);

    expect(parser.metadata.title).toBe("House of Earth and Blood");
    expect(parser.metadata.creator).toBe("Sarah J. Maas");
    expect(parser.spineCount).toBe(2);

    expect(parser.toc.length).toBe(2);
    expect(parser.toc[0]?.title).toBe("Part I: The Hollow");
    expect(parser.toc[0]?.spineIndex).toBe(0);
    expect(parser.toc[1]?.title).toBe("Chapter 1");
    expect(parser.toc[1]?.spineIndex).toBe(1);
  });

  it("extracts and sanitizes chapter content", () => {
    const epubBytes = createMockEpub();
    const parser = new EpubParser(epubBytes);

    const ch1 = parser.getChapter(0);
    expect(ch1.title).toBe("Part I: The Hollow");
    expect(ch1.wordCount).toBeGreaterThan(10);
    // Hardcoded style attributes and style tags should be stripped
    expect(ch1.htmlContent).not.toContain("<style>");
    expect(ch1.htmlContent).not.toContain("color: black");
    // Image tag should be rewritten to a blob URL
    expect(ch1.htmlContent).toContain("blob:");
    expect(ch1.htmlContent).toContain("Bryce Quinlan");

    const ch2 = parser.getChapter(1);
    expect(ch2.title).toBe("Chapter 1");
    expect(ch2.htmlContent).toContain("Danika Fendyr");

    parser.destroy();
  });
});
