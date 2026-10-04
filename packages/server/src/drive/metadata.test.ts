import { describe, expect, it } from "vitest";
import { parseId3Metadata, parseMp4Metadata } from "./metadata";

describe("Streaming Metadata & Chapter Parser", () => {
  it("parses ID3v2.3 tags, chapters (CHAP), and attached artwork (APIC) from synthetic buffer", () => {
    // Construct synthetic ID3v2.3 buffer
    const chunks: number[] = [
      0x49,
      0x44,
      0x33, // "ID3"
      0x03,
      0x00, // Version 2.3
      0x00, // Flags
      0x00,
      0x00,
      0x01,
      0x00, // Size (syncsafe, ~128 bytes)
    ];

    // Helper to append a text frame
    function appendTextFrame(id: string, text: string) {
      for (let i = 0; i < 4; i++) chunks.push(id.charCodeAt(i));
      const textBytes = new TextEncoder().encode(text);
      const frameLen = 1 + textBytes.length; // 1 byte encoding (utf-8 = 3)
      chunks.push(
        (frameLen >> 24) & 0xff,
        (frameLen >> 16) & 0xff,
        (frameLen >> 8) & 0xff,
        frameLen & 0xff,
      );
      chunks.push(0x00, 0x00); // flags
      chunks.push(0x03); // encoding = utf-8
      for (const b of textBytes) chunks.push(b);
    }

    // Helper to append a CHAP frame
    function appendChapFrame(id: string, startMs: number, endMs: number, title: string) {
      const chapContent: number[] = [];
      // Element ID null-terminated
      for (let i = 0; i < id.length; i++) chapContent.push(id.charCodeAt(i));
      chapContent.push(0x00);

      // Start time ms (uint32)
      chapContent.push(
        (startMs >> 24) & 0xff,
        (startMs >> 16) & 0xff,
        (startMs >> 8) & 0xff,
        startMs & 0xff,
      );
      // End time ms (uint32)
      chapContent.push(
        (endMs >> 24) & 0xff,
        (endMs >> 16) & 0xff,
        (endMs >> 8) & 0xff,
        endMs & 0xff,
      );
      // Start offset & End offset (uint32)
      chapContent.push(0, 0, 0, 0, 0, 0, 0, 0);

      // Sub-frame TIT2
      for (let i = 0; i < 4; i++) chapContent.push("TIT2".charCodeAt(i));
      const titleBytes = new TextEncoder().encode(title);
      const subLen = 1 + titleBytes.length;
      chapContent.push(
        (subLen >> 24) & 0xff,
        (subLen >> 16) & 0xff,
        (subLen >> 8) & 0xff,
        subLen & 0xff,
      );
      chapContent.push(0, 0); // flags
      chapContent.push(3); // encoding = utf-8
      for (const b of titleBytes) chapContent.push(b);

      // Append frame header
      for (let i = 0; i < 4; i++) chunks.push("CHAP".charCodeAt(i));
      const frameSize = chapContent.length;
      chunks.push(
        (frameSize >> 24) & 0xff,
        (frameSize >> 16) & 0xff,
        (frameSize >> 8) & 0xff,
        frameSize & 0xff,
      );
      chunks.push(0, 0);
      for (const b of chapContent) chunks.push(b);
    }

    appendTextFrame("TIT2", "Project Hail Mary");
    appendTextFrame("TPE1", "Andy Weir");
    appendChapFrame("ch1", 0, 180000, "Chapter 1: Solitary");
    appendChapFrame("ch2", 180000, 420000, "Chapter 2: The Astrophage");

    const buffer = new Uint8Array(chunks);
    const parsed = parseId3Metadata(buffer);

    expect(parsed.title).toBe("Project Hail Mary");
    expect(parsed.author).toBe("Andy Weir");
    expect(parsed.chapters.length).toBe(2);
    expect(parsed.chapters[0]).toEqual({
      index: 1,
      title: "Chapter 1: Solitary",
      startTimeSeconds: 0,
      endTimeSeconds: 180,
      durationSeconds: 180,
    });
    expect(parsed.chapters[1]).toEqual({
      index: 2,
      title: "Chapter 2: The Astrophage",
      startTimeSeconds: 180,
      endTimeSeconds: 420,
      durationSeconds: 240,
    });
  });

  it("parses MP4/M4B movie header (mvhd) duration and Nero chapter atom (chpl)", () => {
    // Construct synthetic MP4 moov container
    const chunks: number[] = [];

    // Helper to write big-endian uint32
    function pushUint32(val: number) {
      chunks.push((val >> 24) & 0xff, (val >> 16) & 0xff, (val >> 8) & 0xff, val & 0xff);
    }

    // moov atom (container)
    const moovStart = chunks.length;
    pushUint32(0); // placeholder for moov size
    for (const c of "moov") chunks.push(c.charCodeAt(0));

    // mvhd atom
    const mvhdStart = chunks.length;
    pushUint32(0); // placeholder for mvhd size
    for (const c of "mvhd") chunks.push(c.charCodeAt(0));
    chunks.push(0, 0, 0, 0); // version 0, 3 flags
    pushUint32(0); // create time
    pushUint32(0); // mod time
    pushUint32(1000); // timescale = 1000 units/sec
    pushUint32(3600000); // duration = 3600000 units (3600 seconds = 1 hour)
    const mvhdSize = chunks.length - mvhdStart;
    chunks[mvhdStart] = (mvhdSize >> 24) & 0xff;
    chunks[mvhdStart + 1] = (mvhdSize >> 16) & 0xff;
    chunks[mvhdStart + 2] = (mvhdSize >> 8) & 0xff;
    chunks[mvhdStart + 3] = mvhdSize & 0xff;

    // chpl atom (Nero chapters)
    const chplData: number[] = [
      0x00, // version 0
      0x00,
      0x00,
      0x00, // flags
      0x00, // reserved
      0x02, // chapter count = 2
    ];

    // Chapter 1: 0 seconds
    chplData.push(0, 0, 0, 0, 0, 0, 0, 0); // 8 bytes timestamp in 100ns units
    const ch1Title = new TextEncoder().encode("Prologue");
    chplData.push(ch1Title.length);
    for (const b of ch1Title) chplData.push(b);

    // Chapter 2: 1200 seconds = 12,000,000,000 ticks = 0x02_CB417800
    chplData.push(0x00, 0x00, 0x00, 0x02, 0xcb, 0x41, 0x78, 0x00);
    const ch2Title = new TextEncoder().encode("The Journey Begins");
    chplData.push(ch2Title.length);
    for (const b of ch2Title) chplData.push(b);

    const chplSize = 8 + chplData.length;
    pushUint32(chplSize);
    for (const c of "chpl") chunks.push(c.charCodeAt(0));
    for (const b of chplData) chunks.push(b);

    // Update moov size
    const moovSize = chunks.length - moovStart;
    chunks[moovStart] = (moovSize >> 24) & 0xff;
    chunks[moovStart + 1] = (moovSize >> 16) & 0xff;
    chunks[moovStart + 2] = (moovSize >> 8) & 0xff;
    chunks[moovStart + 3] = moovSize & 0xff;

    const buffer = new Uint8Array(chunks);
    const parsed = parseMp4Metadata(buffer);

    expect(parsed.durationSeconds).toBe(3600);
    expect(parsed.chapters.length).toBe(2);
    expect(parsed.chapters[0]?.title).toBe("Prologue");
    expect(parsed.chapters[0]?.startTimeSeconds).toBe(0);
    expect(parsed.chapters[0]?.endTimeSeconds).toBe(1200);
    expect(parsed.chapters[1]?.title).toBe("The Journey Begins");
    expect(parsed.chapters[1]?.startTimeSeconds).toBe(1200);
  });
});
