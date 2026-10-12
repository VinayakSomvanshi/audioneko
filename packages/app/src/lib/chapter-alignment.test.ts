import type { Chapter } from "@audioneko/shared";
import { describe, expect, it } from "vitest";
import {
  extractChapterNumber,
  findFirstStorySpineIndex,
  findMatchingAudioChapter,
  findMatchingSpineIndex,
  isCreditsOrDisclaimer,
} from "./chapter-alignment";
import type { EpubTocItem } from "./epub-parser";

describe("chapter-alignment", () => {
  describe("extractChapterNumber", () => {
    it("extracts numeric chapter numbers correctly", () => {
      expect(extractChapterNumber("Chapter 1")).toBe(1);
      expect(extractChapterNumber("Chapter 04")).toBe(4);
      expect(extractChapterNumber("Ch. 12")).toBe(12);
      expect(extractChapterNumber("Chapter 103 - Epilogue")).toBe(103);
      expect(extractChapterNumber("1. The Drop")).toBe(1);
      expect(extractChapterNumber("25 - Part Two")).toBe(25);
    });

    it("extracts English spelled-out numbers", () => {
      expect(extractChapterNumber("Chapter One")).toBe(1);
      expect(extractChapterNumber("Chapter Two")).toBe(2);
      expect(extractChapterNumber("Chapter Twenty-Five")).toBe(25);
      expect(extractChapterNumber("Chapter Forty")).toBe(40);
    });

    it("extracts Roman numerals including numbers above 20", () => {
      expect(extractChapterNumber("Part I. The Drop")).toBe(1);
      expect(extractChapterNumber("Part II")).toBe(2);
      expect(extractChapterNumber("Chapter IV")).toBe(4);
      expect(extractChapterNumber("Chapter IX")).toBe(9);
      expect(extractChapterNumber("Chapter XXV")).toBe(25);
      expect(extractChapterNumber("Chapter XL")).toBe(40);
      expect(extractChapterNumber("Chapter LXXI")).toBe(71);
      expect(extractChapterNumber("Chapter C")).toBe(100);
      expect(extractChapterNumber("Chapter CXXI")).toBe(121);
      // Standalone Roman numerals
      expect(extractChapterNumber("IV")).toBe(4);
      expect(extractChapterNumber("XXI")).toBe(21);
      expect(extractChapterNumber("CXXI")).toBe(121);
    });

    it("returns null for non-numbered titles", () => {
      expect(extractChapterNumber("Opening Credits")).toBeNull();
      expect(extractChapterNumber("Prologue")).toBeNull();
      expect(extractChapterNumber("The Four Houses of Midgard")).toBeNull();
    });
  });

  describe("isCreditsOrDisclaimer", () => {
    it("identifies credits and disclaimers", () => {
      expect(isCreditsOrDisclaimer("Opening Credits (Part 1)")).toBe(true);
      expect(isCreditsOrDisclaimer("Closing Credits (Part 2)")).toBe(true);
      expect(isCreditsOrDisclaimer("Title Page")).toBe(true);
      expect(isCreditsOrDisclaimer("Dedication")).toBe(true);
      expect(isCreditsOrDisclaimer("About the Author")).toBe(true);
      expect(isCreditsOrDisclaimer("Books by Sarah J. Maas")).toBe(true);
      expect(isCreditsOrDisclaimer("Excerpt from House of Earth and Blood")).toBe(true);
      expect(isCreditsOrDisclaimer("Chapter 1")).toBe(false);
      expect(isCreditsOrDisclaimer("Prologue")).toBe(false);
    });
  });

  describe("findMatchingSpineIndex", () => {
    const mockToc: EpubTocItem[] = [
      { id: "t0", title: "Cover", href: "cover.xhtml", spineIndex: 0, level: 1 },
      { id: "t1", title: "Half Title", href: "halftitle.xhtml", spineIndex: 1, level: 1 },
      { id: "t2", title: "Dedication", href: "dedication.xhtml", spineIndex: 2, level: 1 },
      { id: "t3", title: "Title Page", href: "title.xhtml", spineIndex: 3, level: 1 },
      {
        id: "t4",
        title: "The Four Houses of Midgard",
        href: "four.xhtml",
        spineIndex: 4,
        level: 1,
      },
      { id: "t5", title: "Prologue", href: "prologue.xhtml", spineIndex: 5, level: 1 },
      { id: "t6", title: "Part I. The Drop", href: "part1.xhtml", spineIndex: 6, level: 1 },
      { id: "t7", title: "Chapter One", href: "ch1.xhtml", spineIndex: 7, level: 1 },
      { id: "t8", title: "Chapter Two", href: "ch2.xhtml", spineIndex: 8, level: 1 },
      { id: "t9", title: "Chapter Three", href: "ch3.xhtml", spineIndex: 9, level: 1 },
      { id: "t10", title: "Epilogue", href: "epilogue.xhtml", spineIndex: 10, level: 1 },
    ];

    const mockAudioChapters: Chapter[] = [
      {
        id: "c0",
        bookId: "b1",
        chapterIndex: 0,
        title: "Opening Credits (Part 1)",
        startTime: 0,
        endTime: 20,
        duration: 20,
      },
      {
        id: "c1",
        bookId: "b1",
        chapterIndex: 1,
        title: "Prologue",
        startTime: 20,
        endTime: 600,
        duration: 580,
      },
      {
        id: "c2",
        bookId: "b1",
        chapterIndex: 2,
        title: "Chapter 1 - Part One: The Drop",
        startTime: 600,
        endTime: 1800,
        duration: 1200,
      },
      {
        id: "c3",
        bookId: "b1",
        chapterIndex: 3,
        title: "Chapter 2",
        startTime: 1800,
        endTime: 3000,
        duration: 1200,
      },
      {
        id: "c4",
        bookId: "b1",
        chapterIndex: 4,
        title: "Chapter 3",
        startTime: 3000,
        endTime: 4200,
        duration: 1200,
      },
      {
        id: "c5",
        bookId: "b1",
        chapterIndex: 5,
        title: "Epilogue",
        startTime: 4200,
        endTime: 4500,
        duration: 300,
      },
    ];

    it("matches Prologue across front-matter offset", () => {
      const idx = findMatchingSpineIndex(mockAudioChapters[1], mockAudioChapters, mockToc, 11);
      expect(idx).toBe(5); // Spine index of Prologue
    });

    it("matches Chapter 1 to Chapter One even with 6 front-matter files", () => {
      const idx = findMatchingSpineIndex(mockAudioChapters[2], mockAudioChapters, mockToc, 11);
      expect(idx).toBe(7); // Spine index of Chapter One
    });

    it("matches Chapter 2 to Chapter Two", () => {
      const idx = findMatchingSpineIndex(mockAudioChapters[3], mockAudioChapters, mockToc, 11);
      expect(idx).toBe(8); // Spine index of Chapter Two
    });

    it("matches Chapter 3 to Chapter Three", () => {
      const idx = findMatchingSpineIndex(mockAudioChapters[4], mockAudioChapters, mockToc, 11);
      expect(idx).toBe(9); // Spine index of Chapter Three
    });

    it("matches Epilogue", () => {
      const idx = findMatchingSpineIndex(mockAudioChapters[5], mockAudioChapters, mockToc, 11);
      expect(idx).toBe(10); // Spine index of Epilogue
    });

    it("handles Opening Credits without crashing, keeping on cover", () => {
      const idx = findMatchingSpineIndex(mockAudioChapters[0], mockAudioChapters, mockToc, 11);
      expect(idx).toBe(0); // Cover
    });
  });

  describe("findMatchingAudioChapter", () => {
    const mockAudioChapters: Chapter[] = [
      {
        id: "c0",
        bookId: "b1",
        chapterIndex: 0,
        title: "Opening Credits",
        startTime: 0,
        endTime: 20,
        duration: 20,
      },
      {
        id: "c1",
        bookId: "b1",
        chapterIndex: 1,
        title: "Prologue",
        startTime: 20,
        endTime: 600,
        duration: 580,
      },
      {
        id: "c2",
        bookId: "b1",
        chapterIndex: 2,
        title: "Chapter 1",
        startTime: 600,
        endTime: 1800,
        duration: 1200,
      },
      {
        id: "c3",
        bookId: "b1",
        chapterIndex: 3,
        title: "Chapter 2",
        startTime: 1800,
        endTime: 3000,
        duration: 1200,
      },
    ];

    it("reverse-matches TOC 'Chapter Two' to Audio 'Chapter 2'", () => {
      const tocItem: EpubTocItem = {
        id: "t8",
        title: "Chapter Two",
        href: "ch2.xhtml",
        spineIndex: 8,
        level: 1,
      };
      const audioMatch = findMatchingAudioChapter(tocItem, mockAudioChapters);
      expect(audioMatch?.title).toBe("Chapter 2");
      expect(audioMatch?.startTime).toBe(1800);
    });

    it("reverse-matches TOC 'Prologue' to Audio 'Prologue'", () => {
      const tocItem: EpubTocItem = {
        id: "t5",
        title: "Prologue",
        href: "prologue.xhtml",
        spineIndex: 5,
        level: 1,
      };
      const audioMatch = findMatchingAudioChapter(tocItem, mockAudioChapters);
      expect(audioMatch?.title).toBe("Prologue");
      expect(audioMatch?.startTime).toBe(20);
    });
  });

  describe("findFirstStorySpineIndex", () => {
    it("respects authoritative EPUB guide / landmarks when provided", () => {
      const mockToc: EpubTocItem[] = [
        { id: "t0", title: "Cover", href: "cover.xhtml", spineIndex: 0, level: 1 },
        { id: "t1", title: "Title", href: "title.xhtml", spineIndex: 1, level: 1 },
        { id: "t2", title: "Prologue", href: "prologue.xhtml", spineIndex: 2, level: 1 },
      ];
      // Landmark explicitly points to spine index 2
      expect(findFirstStorySpineIndex(mockToc, 10, 2)).toBe(2);
    });

    it("skips multiple front-matter items to find Chapter One", () => {
      const mockToc: EpubTocItem[] = [
        { id: "t0", title: "Cover", href: "cover.xhtml", spineIndex: 0, level: 1 },
        { id: "t1", title: "Title Page", href: "title.xhtml", spineIndex: 1, level: 1 },
        { id: "t2", title: "Dedication", href: "ded.xhtml", spineIndex: 2, level: 1 },
        { id: "t3", title: "Map of the Realm", href: "map.xhtml", spineIndex: 3, level: 1 },
        { id: "t4", title: "Praise for the Author", href: "praise.xhtml", spineIndex: 4, level: 1 },
        { id: "t5", title: "Chapter One: Awakening", href: "ch1.xhtml", spineIndex: 5, level: 1 },
      ];
      expect(findFirstStorySpineIndex(mockToc, 15)).toBe(5);
    });

    it("correctly identifies first story chapter with unnumbered named titles", () => {
      const mockToc: EpubTocItem[] = [
        { id: "t0", title: "Cover", href: "cover.xhtml", spineIndex: 0, level: 1 },
        { id: "t1", title: "Copyright", href: "cop.xhtml", spineIndex: 1, level: 1 },
        { id: "t2", title: "Dedication", href: "ded.xhtml", spineIndex: 2, level: 1 },
        { id: "t3", title: "The Boy Who Lived", href: "ch1.xhtml", spineIndex: 3, level: 1 },
        { id: "t4", title: "The Vanishing Glass", href: "ch2.xhtml", spineIndex: 4, level: 1 },
      ];
      expect(findFirstStorySpineIndex(mockToc, 10)).toBe(3);
    });
  });
});
