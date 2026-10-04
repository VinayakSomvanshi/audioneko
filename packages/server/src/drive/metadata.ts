/**
 * audioneko: Streaming ISO-BMFF (M4B) & ID3v2 (MP3) Binary Metadata Parser
 * Operates on partial byte ranges (64 KB - 256 KB) with zero full-file downloads.
 */

export interface ParsedChapter {
  index: number;
  title: string;
  startTimeSeconds: number;
  endTimeSeconds: number;
  durationSeconds: number;
}

export interface ParsedMetadata {
  title?: string;
  author?: string;
  durationSeconds?: number;
  chapters: ParsedChapter[];
  coverBytes?: Uint8Array;
  coverMimeType?: string;
}

// ==========================================
// 1. ISO-BMFF (MP4 / M4B) Atom Parser
// ==========================================

export function parseMp4Metadata(buffer: Uint8Array): ParsedMetadata {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const result: ParsedMetadata = { chapters: [] };

  let offset = 0;
  let timescale = 1000;
  let durationUnits = 0;

  while (offset + 8 <= buffer.byteLength) {
    const atomSize = view.getUint32(offset);
    const atomType = String.fromCharCode(
      buffer[offset + 4] ?? 0,
      buffer[offset + 5] ?? 0,
      buffer[offset + 6] ?? 0,
      buffer[offset + 7] ?? 0,
    );

    let actualSize = atomSize;
    let headerSize = 8;

    if (atomSize === 1 && offset + 16 <= buffer.byteLength) {
      // 64-bit largesize
      const high = view.getUint32(offset + 8);
      const low = view.getUint32(offset + 12);
      actualSize = high * 4294967296 + low;
      headerSize = 16;
    } else if (atomSize === 0) {
      actualSize = buffer.byteLength - offset;
    }

    if (actualSize < headerSize || offset + actualSize > buffer.byteLength) {
      // Reached boundary of loaded chunk
      break;
    }

    // Traverse containers: moov, trak, mdia, minf, stbl, udta
    if (
      atomType === "moov" ||
      atomType === "trak" ||
      atomType === "mdia" ||
      atomType === "minf" ||
      atomType === "stbl" ||
      atomType === "udta"
    ) {
      // Step inside container
      offset += headerSize;
      continue;
    }

    // mvhd: Movie header (extract timescale & total duration)
    if (atomType === "mvhd") {
      const version = buffer[offset + headerSize] ?? 0;
      const dataOffset = offset + headerSize + 4; // Skip version + 3 flags
      if (version === 0 && dataOffset + 16 <= buffer.byteLength) {
        timescale = view.getUint32(dataOffset + 8);
        durationUnits = view.getUint32(dataOffset + 12);
      } else if (version === 1 && dataOffset + 24 <= buffer.byteLength) {
        timescale = view.getUint32(dataOffset + 16);
        const durHigh = view.getUint32(dataOffset + 20);
        const durLow = view.getUint32(dataOffset + 24);
        durationUnits = durHigh * 4294967296 + durLow;
      }
      if (timescale > 0 && durationUnits > 0) {
        result.durationSeconds = durationUnits / timescale;
      }
    }

    // chpl: Nero chapter atom
    if (atomType === "chpl") {
      const chplDataOffset = offset + headerSize;
      const chplChapters = parseChplAtom(buffer, chplDataOffset, actualSize - headerSize);
      if (chplChapters.length > 0) {
        result.chapters = chplChapters;
      }
    }

    // covr: Embedded cover image atom
    if (atomType === "covr") {
      const covrDataOffset = offset + headerSize;
      // Step into data atom inside covr
      if (covrDataOffset + 16 <= buffer.byteLength) {
        const dataAtomSize = view.getUint32(covrDataOffset);
        const dataAtomType = String.fromCharCode(
          buffer[covrDataOffset + 4] ?? 0,
          buffer[covrDataOffset + 5] ?? 0,
          buffer[covrDataOffset + 6] ?? 0,
          buffer[covrDataOffset + 7] ?? 0,
        );
        if (dataAtomType === "data") {
          const typeFlags = view.getUint32(covrDataOffset + 8);
          const mimeType =
            typeFlags === 13 ? "image/jpeg" : typeFlags === 14 ? "image/png" : "image/jpeg";
          const imageBytes = buffer.slice(covrDataOffset + 16, covrDataOffset + dataAtomSize);
          result.coverBytes = imageBytes;
          result.coverMimeType = mimeType;
        }
      }
    }

    offset += actualSize;
  }

  return result;
}

/**
 * Parses Nero chapter atom (chpl)
 */
function parseChplAtom(buffer: Uint8Array, offset: number, length: number): ParsedChapter[] {
  const chapters: ParsedChapter[] = [];
  const view = new DataView(buffer.buffer, buffer.byteOffset + offset, length);

  if (length < 8) return chapters;

  const version = buffer[offset] ?? 0;
  // Skip version (1 byte), flags (3 bytes), reserved (1 byte)
  let pos = 5;

  let chapterCount = 0;
  if (version === 1) {
    chapterCount = view.getUint32(pos);
    pos += 4;
  } else {
    chapterCount = buffer[offset + pos] ?? 0;
    pos += 1;
  }

  const timescale = 10000000; // Nero chapter timestamps use 100ns units (10,000,000 / sec)

  for (let i = 0; i < chapterCount; i++) {
    if (pos + 8 >= length) break;

    const high = view.getUint32(pos);
    const low = view.getUint32(pos + 4);
    const timestampTicks = high * 4294967296 + low;
    const startSec = timestampTicks / timescale;
    pos += 8;

    if (pos >= length) break;
    const titleLen = buffer[offset + pos] ?? 0;
    pos += 1;

    let title = `Chapter ${i + 1}`;
    if (pos + titleLen <= length) {
      title = new TextDecoder("utf-8").decode(buffer.slice(offset + pos, offset + pos + titleLen));
      pos += titleLen;
    }

    chapters.push({
      index: i + 1,
      title: title || `Chapter ${i + 1}`,
      startTimeSeconds: startSec,
      endTimeSeconds: startSec, // Updated in post-processing
      durationSeconds: 0,
    });
  }

  // Calculate durations and end times between consecutive chapters
  for (let i = 0; i < chapters.length; i++) {
    const current = chapters[i]!;
    const next = chapters[i + 1];
    if (next) {
      current.endTimeSeconds = next.startTimeSeconds;
      current.durationSeconds = Math.max(0, current.endTimeSeconds - current.startTimeSeconds);
    }
  }

  return chapters;
}

// ==========================================
// 2. ID3v2 (MP3) Frame Parser
// ==========================================

export function parseId3Metadata(buffer: Uint8Array): ParsedMetadata {
  const result: ParsedMetadata = { chapters: [] };

  if (buffer.byteLength < 10) return result;

  // Check ID3 magic header
  if (buffer[0] !== 0x49 || buffer[1] !== 0x44 || buffer[2] !== 0x33) {
    return result; // Not an ID3 tag
  }

  const majorVersion = buffer[3] ?? 3; // ID3v2.3 or ID3v2.4
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  // Read syncsafe integer tag size
  const tagSize =
    ((buffer[6] ?? 0) << 21) |
    ((buffer[7] ?? 0) << 14) |
    ((buffer[8] ?? 0) << 7) |
    (buffer[9] ?? 0);

  let offset = 10;
  const maxOffset = Math.min(10 + tagSize, buffer.byteLength);

  while (offset + 10 <= maxOffset) {
    const frameId = String.fromCharCode(
      buffer[offset] ?? 0,
      buffer[offset + 1] ?? 0,
      buffer[offset + 2] ?? 0,
      buffer[offset + 3] ?? 0,
    );

    // Padding or end of frames
    if (frameId.charCodeAt(0) === 0) break;

    let frameSize = 0;
    if (majorVersion === 4) {
      // ID3v2.4 uses syncsafe integer for frame size
      frameSize =
        ((buffer[offset + 4] ?? 0) << 21) |
        ((buffer[offset + 5] ?? 0) << 14) |
        ((buffer[offset + 6] ?? 0) << 7) |
        (buffer[offset + 7] ?? 0);
    } else {
      // ID3v2.3 uses standard uint32
      frameSize = view.getUint32(offset + 4);
    }

    if (frameSize <= 0 || offset + 10 + frameSize > buffer.byteLength) {
      break;
    }

    const frameData = buffer.slice(offset + 10, offset + 10 + frameSize);

    // TIT2: Title
    if (frameId === "TIT2") {
      result.title = decodeId3Text(frameData);
    }

    // TPE1: Author / Artist
    if (frameId === "TPE1") {
      result.author = decodeId3Text(frameData);
    }

    // TLEN: Length in ms
    if (frameId === "TLEN") {
      const lenStr = decodeId3Text(frameData);
      const ms = Number.parseInt(lenStr, 10);
      if (!Number.isNaN(ms) && ms > 0) {
        result.durationSeconds = ms / 1000;
      }
    }

    // CHAP: Chapter frame
    if (frameId === "CHAP") {
      const chapter = parseId3ChapFrame(frameData, result.chapters.length + 1);
      if (chapter) {
        result.chapters.push(chapter);
      }
    }

    // APIC: Attached picture (cover art)
    if (frameId === "APIC") {
      const cover = parseId3ApicFrame(frameData);
      if (cover) {
        result.coverBytes = cover.bytes;
        result.coverMimeType = cover.mimeType;
      }
    }

    offset += 10 + frameSize;
  }

  return result;
}

function decodeId3Text(frameData: Uint8Array): string {
  if (frameData.byteLength <= 1) return "";
  const encoding = frameData[0];
  const textBytes = frameData.slice(1);

  if (encoding === 0) {
    return new TextDecoder("iso-8859-1").decode(textBytes).replace(/\0+$/, "");
  }
  if (encoding === 1) {
    return new TextDecoder("utf-16").decode(textBytes).replace(/\0+$/, "");
  }
  if (encoding === 2) {
    return new TextDecoder("utf-16be").decode(textBytes).replace(/\0+$/, "");
  }
  return new TextDecoder("utf-8").decode(textBytes).replace(/\0+$/, "");
}

function parseId3ChapFrame(data: Uint8Array, chapterIndex: number): ParsedChapter | null {
  if (data.byteLength < 16) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  // Find null-terminated element ID string
  let idEnd = 0;
  while (idEnd < data.byteLength && data[idEnd] !== 0) {
    idEnd++;
  }
  const pos = idEnd + 1;

  if (pos + 16 > data.byteLength) return null;

  const startMs = view.getUint32(pos);
  const endMs = view.getUint32(pos + 4);
  // pos + 8: start offset, pos + 12: end offset
  let subOffset = pos + 16;
  let title = `Chapter ${chapterIndex}`;

  // Read sub-frames (e.g. TIT2 for chapter name)
  while (subOffset + 10 <= data.byteLength) {
    const subFrameId = String.fromCharCode(
      data[subOffset] ?? 0,
      data[subOffset + 1] ?? 0,
      data[subOffset + 2] ?? 0,
      data[subOffset + 3] ?? 0,
    );
    const subSize = view.getUint32(subOffset + 4);
    if (subSize <= 0 || subOffset + 10 + subSize > data.byteLength) break;

    if (subFrameId === "TIT2") {
      const titleBytes = data.slice(subOffset + 10, subOffset + 10 + subSize);
      title = decodeId3Text(titleBytes) || title;
      break;
    }
    subOffset += 10 + subSize;
  }

  const startSec = startMs / 1000;
  const endSec = endMs / 1000;

  return {
    index: chapterIndex,
    title,
    startTimeSeconds: startSec,
    endTimeSeconds: endSec,
    durationSeconds: Math.max(0, endSec - startSec),
  };
}

function parseId3ApicFrame(data: Uint8Array): { mimeType: string; bytes: Uint8Array } | null {
  if (data.byteLength < 5) return null;
  // encoding (1 byte)
  let pos = 1;

  // Find null-terminated MIME type string
  const mimeStart = pos;
  while (pos < data.byteLength && data[pos] !== 0) {
    pos++;
  }
  const mimeType = new TextDecoder("iso-8859-1").decode(data.slice(mimeStart, pos)) || "image/jpeg";
  pos++; // Skip null byte

  if (pos >= data.byteLength) return null;
  // pictureType (1 byte)
  pos++;

  // Find null-terminated description string
  while (pos < data.byteLength && data[pos] !== 0) {
    pos++;
  }
  pos++; // Skip null byte

  if (pos >= data.byteLength) return null;
  const bytes = data.slice(pos);

  return { mimeType, bytes };
}
