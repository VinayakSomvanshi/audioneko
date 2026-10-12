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

const ROMAN_NUMERALS: Record<string, number> = {
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
  ix: 9,
  x: 10,
  xi: 11,
  xii: 12,
  xiii: 13,
  xiv: 14,
  xv: 15,
  xvi: 16,
  xvii: 17,
  xviii: 18,
  xix: 19,
  xx: 20,
};

/**
 * Extracts a chapter or sequence number from a title string.
 * Handles digits ("Chapter 1", "Ch. 02"), words ("Chapter One"), and Roman numerals ("Part I").
 */
export function extractChapterNumber(title: string): number | null {
  if (!title) return null;
  const clean = title.toLowerCase().trim();

  // 1. "Chapter 1", "Ch. 1", "Ch 1", "Track 01"
  const digitsMatch = clean.match(/(?:chapter|ch\.?|track|section)\s*(\d+)/i);
  if (digitsMatch?.[1]) {
    return Number.parseInt(digitsMatch[1], 10);
  }

  // 2. Starts with a digit: "1. The Drop", "01 - ..."
  const leadingDigits = clean.match(/^(\d+)(?:\.|\s|:|-|$)/);
  if (leadingDigits?.[1]) {
    return Number.parseInt(leadingDigits[1], 10);
  }

  // 3. Spelled-out word: "Chapter One", "Chapter Twenty-Two"
  const wordMatch = clean.match(/(?:chapter|ch\.?)\s+([a-z]+(?:-[a-z]+)?)/i);
  if (wordMatch?.[1]) {
    const word = wordMatch[1].toLowerCase();
    if (WORD_TO_NUMBER[word]) {
      return WORD_TO_NUMBER[word];
    }
  }

  // 4. Roman numeral after chapter or part: "Chapter IV", "Part I"
  const romanMatch = clean.match(/(?:chapter|part|section)\s+([ivxlcdm]+)(?:\.|\s|:|-|$)/i);
  if (romanMatch?.[1]) {
    const roman = romanMatch[1].toLowerCase();
    if (ROMAN_NUMERALS[roman]) {
      return ROMAN_NUMERALS[roman];
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
 * Identifies if a title represents front-matter credits, disclaimer, or introductory material.
 */
export function isCreditsOrDisclaimer(title: string): boolean {
  const clean = cleanTitle(title);
  return (
    clean.includes("opening credit") ||
    clean.includes("closing credit") ||
    clean.includes("end credit") ||
    clean.includes("disclaimer") ||
    clean.includes("copyright") ||
    clean.includes("acknowledgment") ||
    clean.includes("dedication") ||
    clean.includes("half title") ||
    clean.includes("title page")
  );
}

/**
 * Finds the best matching EPUB spine index for a given audio chapter.
 * Prioritizes:
 * 1. Exact or keyword title match (e.g., "Prologue", "Epilogue", "The Four Houses of Midgard")
 * 2. Chapter number match (e.g., Audio "Chapter 1 - Part One" matches TOC "Chapter One")
 * 3. Fallback to first story chapter if currently on opening credits
 * 4. Fallback to index-proportional estimation if titles do not align
 */
export function findMatchingSpineIndex(
  currentAudioChapter: Chapter | null | undefined,
  audioChapters: Chapter[],
  tocItems: EpubTocItem[],
  totalSpineCount: number,
  manualOffset = 0,
): number {
  if (totalSpineCount <= 0) return 0;
  if (!currentAudioChapter || tocItems.length === 0) {
    return Math.max(0, Math.min(totalSpineCount - 1, manualOffset));
  }

  const rawTitle = currentAudioChapter.title || "";
  const audioClean = cleanTitle(rawTitle);

  // 1. Handle Opening Credits / Disclaimers
  if (isCreditsOrDisclaimer(rawTitle)) {
    // If in opening credits, show Cover/Title if available, or stay at 0
    return Math.max(0, Math.min(totalSpineCount - 1, manualOffset));
  }

  // 2. Exact or Named Section match (Prologue, Epilogue, Introduction, etc.)
  const namedKeywords = ["prologue", "epilogue", "preface", "foreword", "afterword", "epigraph"];
  for (const kw of namedKeywords) {
    if (audioClean.includes(kw)) {
      const match = tocItems.find((t) => cleanTitle(t.title).includes(kw));
      if (match) {
        return Math.max(0, Math.min(totalSpineCount - 1, match.spineIndex + manualOffset));
      }
    }
  }

  // 3. High-confidence specific title phrase match (e.g. "The Four Houses of Midgard")
  if (audioClean.length > 5) {
    const matchPhrase = tocItems.find((t) => {
      const tClean = cleanTitle(t.title);
      return tClean.length > 5 && (audioClean.includes(tClean) || tClean.includes(audioClean));
    });
    if (matchPhrase) {
      return Math.max(0, Math.min(totalSpineCount - 1, matchPhrase.spineIndex + manualOffset));
    }
  }

  // 4. Chapter Number Matching ("Chapter 1" <-> "Chapter One")
  const audioChapterNum = extractChapterNumber(rawTitle);
  if (audioChapterNum !== null) {
    const isExplicitAudioChapter = audioClean.includes("chapter") || audioClean.includes("ch");
    if (isExplicitAudioChapter) {
      const matchExplicitChapter = tocItems.find((t) => {
        const tClean = cleanTitle(t.title);
        return (
          (tClean.includes("chapter") || tClean.includes("ch")) &&
          extractChapterNumber(t.title) === audioChapterNum
        );
      });
      if (matchExplicitChapter) {
        return Math.max(
          0,
          Math.min(totalSpineCount - 1, matchExplicitChapter.spineIndex + manualOffset),
        );
      }
    }

    const matchByNum = tocItems.find((t) => extractChapterNumber(t.title) === audioChapterNum);
    if (matchByNum) {
      return Math.max(0, Math.min(totalSpineCount - 1, matchByNum.spineIndex + manualOffset));
    }
  }

  // 5. Intelligent Fallback: Calculate first story chapter offset in TOC
  // If TOC has 8 front-matter entries before Chapter 1, use that offset!
  const firstStoryTocIndex = tocItems.findIndex((t) => {
    const num = extractChapterNumber(t.title);
    return num === 1 || cleanTitle(t.title).includes("prologue");
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
