import type { Chapter } from "@audioneko/shared";
import type { EpubTocItem } from "./epub-parser";

const WORD_TO_NUMBER: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  "twenty-one": 21,
  "twenty-two": 22,
  "twenty-three": 23,
  "twenty-four": 24,
  "twenty-five": 25,
  "twenty-six": 26,
  "twenty-seven": 27,
  "twenty-eight": 28,
  "twenty-nine": 29,
  thirty: 30,
  "thirty-one": 31,
  "thirty-two": 32,
  "thirty-three": 33,
  "thirty-four": 34,
  "thirty-five": 35,
  "thirty-six": 36,
  "thirty-seven": 37,
  "thirty-eight": 38,
  "thirty-nine": 39,
  forty: 40,
  "forty-one": 41,
  "forty-two": 42,
  "forty-three": 43,
  "forty-four": 44,
  "forty-five": 45,
  "forty-six": 46,
  "forty-seven": 47,
  "forty-eight": 48,
  "forty-nine": 49,
  fifty: 50,
  "fifty-one": 51,
  "fifty-two": 52,
  "fifty-three": 53,
  "fifty-four": 54,
  "fifty-five": 55,
  "fifty-six": 56,
  "fifty-seven": 57,
  "fifty-eight": 58,
  "fifty-nine": 59,
  sixty: 60,
  "sixty-one": 61,
  "sixty-two": 62,
  "sixty-three": 63,
  "sixty-four": 64,
  "sixty-five": 65,
  "sixty-six": 66,
  "sixty-seven": 67,
  "sixty-eight": 68,
  "sixty-nine": 69,
  seventy: 70,
  "seventy-one": 71,
  "seventy-two": 72,
  "seventy-three": 73,
  "seventy-four": 74,
  "seventy-five": 75,
  "seventy-six": 76,
  "seventy-seven": 77,
  "seventy-eight": 78,
  "seventy-nine": 79,
  eighty: 80,
  "eighty-one": 81,
  "eighty-two": 82,
  "eighty-three": 83,
  "eighty-four": 84,
  "eighty-five": 85,
  "eighty-six": 86,
  "eighty-seven": 87,
  "eighty-eight": 88,
  "eighty-nine": 89,
  ninety: 90,
  "ninety-one": 91,
  "ninety-two": 92,
  "ninety-three": 93,
  "ninety-four": 94,
  "ninety-five": 95,
  "ninety-six": 96,
  "ninety-seven": 97,
  "ninety-eight": 98,
  "ninety-nine": 99,
  hundred: 100,
};

/**
 * Parses any valid Roman numeral (e.g. "iv", "xxv", "lxxi", "cxxi") into a decimal number.
 * Validates canonical subtraction and addition rules for numbers 1 to 3999.
 */
export function parseRomanNumeral(str: string): number | null {
  const s = str.toLowerCase().trim();
  if (!s || !/^[ivxlcdm]+$/.test(s)) return null;

  const romanValues: Record<string, number> = {
    i: 1,
    v: 5,
    x: 10,
    l: 50,
    c: 100,
    d: 500,
    m: 1000,
  };

  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const current = romanValues[s[i]!]!;
    const next = s[i + 1] ? romanValues[s[i + 1]!] : undefined;

    if (next !== undefined && current < next) {
      total -= current;
    } else {
      total += current;
    }
  }

  return total > 0 && total < 4000 ? total : null;
}

/**
 * Extracts a part sequence number from a title string (e.g. "Part I", "Part One", "Part 1").
 */
export function extractPartNumber(title: string): number | null {
  if (!title) return null;
  const clean = title.toLowerCase().trim();

  // 1. "Part 1", "Part 01"
  const digitsMatch = clean.match(/\bpart\s*(\d+)/i);
  if (digitsMatch?.[1]) {
    return Number.parseInt(digitsMatch[1], 10);
  }

  // 2. "Part One", "Part Twenty-Two"
  const wordMatch = clean.match(/\bpart\s+([a-z]+(?:-[a-z]+)?)/i);
  if (wordMatch?.[1]) {
    const word = wordMatch[1].toLowerCase();
    if (WORD_TO_NUMBER[word]) {
      return WORD_TO_NUMBER[word];
    }
  }

  // 3. "Part I", "Part IV", "Part XXV"
  const romanMatch = clean.match(/\bpart\s+([ivxlcdm]+)(?:\.|\s|:|-|$)/i);
  if (romanMatch?.[1]) {
    const val = parseRomanNumeral(romanMatch[1]);
    if (val !== null) {
      return val;
    }
  }

  return null;
}

/**
 * Extracts a chapter or sequence number from a title string.
 * Handles digits ("Chapter 1", "Ch. 02"), words ("Chapter One"), and Roman numerals ("Chapter XXV").
 */
export function extractChapterNumber(title: string): number | null {
  if (!title) return null;
  const clean = title.toLowerCase().trim();

  // 1. "Chapter 1", "Ch. 1", "Ch 1", "Track 01", "Part 1"
  const digitsMatch = clean.match(/(?:chapter|ch\.?|part|track|section)\s*(\d+)/i);
  if (digitsMatch?.[1]) {
    return Number.parseInt(digitsMatch[1], 10);
  }

  // 2. Starts with a digit: "1. The Drop", "01 - ..."
  const leadingDigits = clean.match(/^(\d+)(?:\.|\s|:|-|$)/);
  if (leadingDigits?.[1]) {
    return Number.parseInt(leadingDigits[1], 10);
  }

  // 3. Spelled-out word: "Chapter One", "Chapter Twenty-Two", "Part One"
  const wordMatch = clean.match(/(?:chapter|ch\.?|part)\s+([a-z]+(?:-[a-z]+)?)/i);
  if (wordMatch?.[1]) {
    const word = wordMatch[1].toLowerCase();
    if (WORD_TO_NUMBER[word]) {
      return WORD_TO_NUMBER[word];
    }
  }

  // 4. Roman numeral after chapter or part: "Chapter IV", "Part I", "Chapter XXV"
  const romanMatch = clean.match(/(?:chapter|ch\.?|part|section)\s+([ivxlcdm]+)(?:\.|\s|:|-|$)/i);
  if (romanMatch?.[1]) {
    const val = parseRomanNumeral(romanMatch[1]);
    if (val !== null) {
      return val;
    }
  }

  // 5. Standalone Roman numeral: e.g. "XXV", "IV", "III"
  const standaloneRoman = clean.match(/^([ivxlcdm]+)$/i);
  if (standaloneRoman?.[1]) {
    const val = parseRomanNumeral(standaloneRoman[1]);
    if (val !== null) {
      return val;
    }
  }

  return null;
}

/**
 * Normalizes title for comparison by removing punctuation and extra spaces.
 */
function cleanTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Identifies if a title or filename represents front-matter credits, disclaimer, or introductory material.
 */
export function isCreditsOrDisclaimer(title: string): boolean {
  return isFrontMatterSection(title);
}

/**
 * Universal detector for front-matter sections (cover, title page, copyright, dedication, maps, TOC, adcards, author bios).
 */
export function isFrontMatterSection(titleOrHref: string): boolean {
  const clean = cleanTitle(titleOrHref);
  return (
    clean.includes("opening credit") ||
    clean.includes("closing credit") ||
    clean.includes("end credit") ||
    clean.includes("disclaimer") ||
    clean.includes("copyright") ||
    clean.includes("acknowledgment") ||
    clean.includes("dedication") ||
    clean.includes("half title") ||
    clean.includes("halftitle") ||
    clean.includes("title page") ||
    clean.includes("titlepage") ||
    clean.includes("cover") ||
    clean.includes("adcard") ||
    clean.includes("praise") ||
    clean.includes("also by") ||
    clean.includes("other book") ||
    clean.includes("author book") ||
    clean.includes("books by") ||
    clean.includes("about the author") ||
    clean.includes("about the publisher") ||
    clean.includes("table of content") ||
    clean.includes("contents") ||
    clean.includes("toc") ||
    clean.includes("nav") ||
    clean.includes("map") ||
    clean.includes("cast of character") ||
    clean.includes("dramatis personae") ||
    clean.includes("epigraph") ||
    clean.includes("colophon") ||
    clean.includes("imprint") ||
    clean.includes("teaser") ||
    clean.includes("excerpt") ||
    clean.includes("preview") ||
    clean.includes("flyleaf") ||
    clean.includes("frontmatter") ||
    clean.includes("front matter")
  );
}

/**
 * Determines the spine index of the first actual story chapter.
 * Prioritizes Chapter 1 or Prologue from TOC, then valid landmark, then front-matter exclusion.
 */
export function findFirstStorySpineIndex(
  tocItems: EpubTocItem[],
  totalSpineCount = 0,
  startOfContentSpineIndex: number | null = null,
): number {
  // 1. Search TOC for Chapter 1 or Prologue (most reliable indicator of story start)
  const storyChapter = tocItems.find((t) => {
    const num = extractChapterNumber(t.title);
    return num === 1 || cleanTitle(t.title).includes("prologue");
  });
  if (storyChapter && storyChapter.spineIndex > 0) {
    return storyChapter.spineIndex;
  }

  // 2. Authoritative EPUB landmarks if > 0 and not front-matter
  if (
    startOfContentSpineIndex !== null &&
    startOfContentSpineIndex > 0 &&
    (totalSpineCount === 0 || startOfContentSpineIndex < totalSpineCount)
  ) {
    return startOfContentSpineIndex;
  }

  // 3. First TOC item that is not a front-matter section
  const nonFrontMatter = tocItems.find(
    (t) => !isFrontMatterSection(t.title) && !isFrontMatterSection(t.href),
  );
  if (nonFrontMatter && nonFrontMatter.spineIndex > 0) {
    return nonFrontMatter.spineIndex;
  }

  return 0;
}

/**
 * Finds the best matching EPUB spine index for a given audio chapter.
 * Prioritizes:
 * 1. Opening credits handling (stays on cover for track 0/1)
 * 2. Exact Title Match (authoritative, prevents false substring matches)
 * 3. Named Section keywords (Prologue, Epilogue, etc.)
 * 4. Explicit Chapter Number Match ("Chapter 1" <-> "Chapter One", "Chapter 10" <-> "Chapter Ten")
 * 5. Explicit Part Number Match ("Part I" <-> "Part One")
 * 6. Word-boundary phrase matching (safe non-digit phrases)
 * 7. Intelligent offset alignment matching audio track progression to story chapters
 */
export function findMatchingSpineIndex(
  currentAudioChapter: Chapter | null | undefined,
  audioChapters: Chapter[],
  tocItems: EpubTocItem[],
  totalSpineCount: number,
  manualOffset = 0,
  startOfContentSpineIndex: number | null = null,
): number {
  if (totalSpineCount <= 0) return 0;
  if (!currentAudioChapter || tocItems.length === 0) {
    const firstStory = findFirstStorySpineIndex(
      tocItems,
      totalSpineCount,
      startOfContentSpineIndex,
    );
    return Math.max(0, Math.min(totalSpineCount - 1, firstStory + manualOffset));
  }

  const rawTitle = currentAudioChapter.title || "";
  const audioClean = cleanTitle(rawTitle);

  // 1. Handle Opening Credits / Disclaimers at the start of the book
  if (isCreditsOrDisclaimer(rawTitle)) {
    const audioIdx = audioChapters.findIndex((c) => c.id === currentAudioChapter.id);
    if (audioIdx <= 1) {
      // Opening credits at start of book stay on cover / title page
      return Math.max(0, Math.min(totalSpineCount - 1, manualOffset));
    }
    // Mid-book / End-book credits: stay near story chapters
    const firstStory = findFirstStorySpineIndex(
      tocItems,
      totalSpineCount,
      startOfContentSpineIndex,
    );
    return Math.max(0, Math.min(totalSpineCount - 1, firstStory + manualOffset));
  }

  // 2. Exact Title Match (Normalized) - 100% authoritative!
  const exactMatch = tocItems.find((t) => cleanTitle(t.title) === audioClean);
  if (exactMatch) {
    return Math.max(0, Math.min(totalSpineCount - 1, exactMatch.spineIndex + manualOffset));
  }

  // 3. Named Section keywords (Prologue, Epilogue, Introduction, etc.)
  const namedKeywords = [
    "prologue",
    "epilogue",
    "preface",
    "foreword",
    "afterword",
    "epigraph",
    "interlude",
  ];
  for (const kw of namedKeywords) {
    const regex = new RegExp(`\\b${kw}\\b`, "i");
    if (regex.test(audioClean)) {
      const match = tocItems.find((t) => regex.test(cleanTitle(t.title)));
      if (match) {
        return Math.max(0, Math.min(totalSpineCount - 1, match.spineIndex + manualOffset));
      }
    }
  }

  // 4. Chapter Number Matching
  const isExplicitAudioChapter = /\b(?:chapter|ch)\b/i.test(audioClean);
  const audioChapterNum = extractChapterNumber(rawTitle);

  if (audioChapterNum !== null) {
    // 4a. If audio explicitly mentions "Chapter", match a TOC item that ALSO mentions "Chapter" with same number
    if (isExplicitAudioChapter) {
      const matchExplicitChapter = tocItems.find((t) => {
        const tClean = cleanTitle(t.title);
        return (
          /\b(?:chapter|ch)\b/i.test(tClean) && extractChapterNumber(t.title) === audioChapterNum
        );
      });
      if (matchExplicitChapter) {
        return Math.max(
          0,
          Math.min(totalSpineCount - 1, matchExplicitChapter.spineIndex + manualOffset),
        );
      }
    }

    // 4b. Match any TOC item whose chapter number matches (avoid cross-matching Part and Chapter)
    const isExplicitAudioPart = !isExplicitAudioChapter && /\bpart\b/i.test(audioClean);
    const matchByNum = tocItems.find((t) => {
      const tClean = cleanTitle(t.title);
      if (
        isExplicitAudioChapter &&
        /\bpart\b/i.test(tClean) &&
        !/\b(?:chapter|ch)\b/i.test(tClean)
      ) {
        return false;
      }
      if (isExplicitAudioPart && /\b(?:chapter|ch)\b/i.test(tClean) && !/\bpart\b/i.test(tClean)) {
        return false;
      }
      return extractChapterNumber(t.title) === audioChapterNum;
    });
    if (matchByNum) {
      return Math.max(0, Math.min(totalSpineCount - 1, matchByNum.spineIndex + manualOffset));
    }
  }

  // 5. Part Number Matching (when audio is a Part divider track, e.g. "Part I - Armies and Allies")
  const audioPartNum = extractPartNumber(rawTitle);
  if (audioPartNum !== null && !isExplicitAudioChapter) {
    const matchPart = tocItems.find((t) => extractPartNumber(t.title) === audioPartNum);
    if (matchPart) {
      return Math.max(0, Math.min(totalSpineCount - 1, matchPart.spineIndex + manualOffset));
    }
  }

  // 6. Substring / Phrase Match with WORD BOUNDARIES (SAFE MATCHING)
  // Ensures "chapter 10" never matches "chapter 1", and "the princess" never matches "the prince"
  if (audioClean.length > 5) {
    const matchPhrase = tocItems.find((t) => {
      const tClean = cleanTitle(t.title);
      if (tClean.length <= 5) return false;
      // Do not use phrase matching if either has an explicit chapter number
      if (extractChapterNumber(t.title) !== null || audioChapterNum !== null) {
        return false;
      }
      // Word boundary match: tClean must appear as distinct whole words in audioClean or vice versa
      const escapedT = tClean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const escapedAudio = audioClean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return (
        new RegExp(`(?:^|\\s)${escapedT}(?:\\s|$)`).test(audioClean) ||
        new RegExp(`(?:^|\\s)${escapedAudio}(?:\\s|$)`).test(tClean)
      );
    });
    if (matchPhrase) {
      return Math.max(0, Math.min(totalSpineCount - 1, matchPhrase.spineIndex + manualOffset));
    }
  }

  // 5. Intelligent Fallback: Calculate first story chapter offset in TOC
  // If TOC has front-matter entries before Chapter 1, use that offset!
  const firstStoryTocIndex = tocItems.findIndex((t) => {
    if (startOfContentSpineIndex !== null && t.spineIndex === startOfContentSpineIndex) return true;
    const num = extractChapterNumber(t.title);
    if (num === 1 || cleanTitle(t.title).includes("prologue")) return true;
    return !isFrontMatterSection(t.title);
  });

  const audioIndex = audioChapters.findIndex((c) => c.id === currentAudioChapter.id);
  if (audioIndex >= 0 && firstStoryTocIndex >= 0) {
    // Determine how many intro tracks audio has before its first story chapter
    const firstStoryAudioIndex = audioChapters.findIndex((c) => {
      const num = extractChapterNumber(c.title);
      return num === 1 || cleanTitle(c.title).includes("prologue");
    });

    const audioOffset = firstStoryAudioIndex >= 0 ? firstStoryAudioIndex : 0;
    const baseOffset = firstStoryTocIndex - audioOffset;
    const targetTocIndex = Math.max(
      0,
      Math.min(tocItems.length - 1, audioIndex + baseOffset + manualOffset),
    );
    const targetToc = tocItems[targetTocIndex];
    if (targetToc) {
      return targetToc.spineIndex;
    }
  }

  // 6. Absolute Fallback
  return Math.max(0, Math.min(totalSpineCount - 1, audioIndex + manualOffset));
}

/**
 * Reverse lookup: Finds the best matching audio chapter when a user clicks an item in the TOC drawer.
 */
export function findMatchingAudioChapter(
  tocItem: EpubTocItem,
  audioChapters: Chapter[],
): Chapter | null {
  if (audioChapters.length === 0) return null;

  const tocClean = cleanTitle(tocItem.title);

  // 1. Keyword match (Prologue, Epilogue, etc.)
  const namedKeywords = ["prologue", "epilogue", "preface", "foreword", "afterword"];
  for (const kw of namedKeywords) {
    if (tocClean.includes(kw)) {
      const match = audioChapters.find((c) => cleanTitle(c.title).includes(kw));
      if (match) return match;
    }
  }

  // 2. Chapter Number match
  const tocNum = extractChapterNumber(tocItem.title);
  if (tocNum !== null) {
    const match = audioChapters.find((c) => extractChapterNumber(c.title) === tocNum);
    if (match) return match;
  }

  // 3. String containment match
  if (tocClean.length > 5) {
    const match = audioChapters.find((c) => {
      const cClean = cleanTitle(c.title);
      return cClean.length > 5 && (cClean.includes(tocClean) || tocClean.includes(cClean));
    });
    if (match) return match;
  }

  return null;
}
