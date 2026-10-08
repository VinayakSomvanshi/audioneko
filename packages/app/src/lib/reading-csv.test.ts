import type { Book, BookProgressRecord } from "@audioneko/shared";
import { describe, expect, it } from "vitest";
import {
  exportGoodreadsCsv,
  exportStoryGraphCsv,
  matchCsvWithLibrary,
  parseReadingCsv,
} from "./reading-csv";

const mockBooks: Book[] = [
  {
    id: "book-1",
    driveFolderId: "drive-folder-1",
    title: "Project Hail Mary",
    author: "Andy Weir",
    narrator: "Ray Porter",
    durationSeconds: 57600,
    fileSizeBytes: 500000000,
    format: "m4b",
    isActiveShelf: true,
    createdAt: 1700000000,
    updatedAt: 1700000000,
  },
  {
    id: "book-2",
    driveFolderId: "drive-folder-2",
    title: "The Way of Kings: The Stormlight Archive",
    author: "Brandon Sanderson",
    narrator: "Michael Kramer, Kate Reading",
    durationSeconds: 162000,
    fileSizeBytes: 1200000000,
    format: "m4b",
    isActiveShelf: true,
    createdAt: 1700000000,
    updatedAt: 1700000000,
  },
];

const mockProgress: Record<string, BookProgressRecord> = {
  "book-1": {
    bookId: "book-1",
    currentTime: 57600,
    duration: 57600,
    playbackRate: 1.0,
    isPlaying: false,
    hlc: { timeMs: 1705000000000, counter: 0, nodeId: "node-1" },
    deviceId: "dev-1",
    updatedAt: 1705000000,
  },
  "book-2": {
    bookId: "book-2",
    currentTime: 40000,
    duration: 162000,
    playbackRate: 1.0,
    isPlaying: false,
    hlc: { timeMs: 1706000000000, counter: 0, nodeId: "node-1" },
    deviceId: "dev-1",
    updatedAt: 1706000000,
  },
};

describe("Reading CSV Export & Import Engine", () => {
  it("exports valid RFC 4180 Goodreads CSV", () => {
    const csv = exportGoodreadsCsv(mockBooks, mockProgress);
    expect(csv).toContain("Book Id,Title,Author");
    expect(csv).toContain("Project Hail Mary");
    expect(csv).toContain("Andy Weir");
    expect(csv).toContain("read");
    expect(csv).toContain("The Way of Kings: The Stormlight Archive");
    expect(csv).toContain("currently-reading");
  });

  it("exports valid StoryGraph CSV format", () => {
    const csv = exportStoryGraphCsv(mockBooks, mockProgress);
    expect(csv).toContain("Title,Authors,ISBN/UID,Format,Read Status");
    expect(csv).toContain("Project Hail Mary");
    expect(csv).toContain("Audiobook");
    expect(csv).toContain("read");
    expect(csv).toContain("currently-reading");
  });

  it("parses exported Goodreads CSV and extracts records", () => {
    const sampleCsv = `Book Id,Title,Author,Exclusive Shelf,My Rating,Date Read
123,"Project Hail Mary","Andy Weir",read,5,2024/01/15
456,"Dune","Frank Herbert",to-read,0,
`;
    const records = parseReadingCsv(sampleCsv);
    expect(records.length).toBe(2);
    expect(records[0]!.title).toBe("Project Hail Mary");
    expect(records[0]!.author).toBe("Andy Weir");
    expect(records[0]!.readStatus).toBe("read");
    expect(records[0]!.rating).toBe(5);
    expect(records[0]!.source).toBe("goodreads");

    expect(records[1]!.title).toBe("Dune");
    expect(records[1]!.readStatus).toBe("to-read");
  });

  it("parses StoryGraph CSV format with custom headers", () => {
    const sgCsv = `Title,Authors,Read Status,Star Rating,Date Added
"The Way of Kings","Brandon Sanderson",currently-reading,4.5,2024/02/01
`;
    const records = parseReadingCsv(sgCsv);
    expect(records.length).toBe(1);
    expect(records[0]!.title).toBe("The Way of Kings");
    expect(records[0]!.author).toBe("Brandon Sanderson");
    expect(records[0]!.readStatus).toBe("currently-reading");
    expect(records[0]!.source).toBe("storygraph");
  });

  it("matches imported CSV records against library books fuzzy logic", () => {
    const records = [
      {
        title: "Project Hail Mary",
        author: "Andy Weir",
        readStatus: "read" as const,
        source: "goodreads" as const,
        originalRow: {},
      },
      {
        // Subtitle in library book: "The Way of Kings: The Stormlight Archive" matches "The Way of Kings"
        title: "The Way of Kings",
        author: "Brandon Sanderson",
        readStatus: "currently-reading" as const,
        source: "storygraph" as const,
        originalRow: {},
      },
      {
        title: "Nonexistent Sci-Fi Odyssey",
        author: "Unknown Writer",
        readStatus: "to-read" as const,
        source: "generic" as const,
        originalRow: {},
      },
    ];

    const matchResult = matchCsvWithLibrary(records, mockBooks);
    expect(matchResult.matched.length).toBe(2);
    expect(matchResult.matched[0]!.book.id).toBe("book-1");
    expect(matchResult.matched[1]!.book.id).toBe("book-2");
    expect(matchResult.unmatchedRecords.length).toBe(1);
    expect(matchResult.unmatchedRecords[0]!.title).toBe("Nonexistent Sci-Fi Odyssey");
  });
});
