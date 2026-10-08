import { describe, expect, it } from "vitest";
import { normalizeAuthor, parseBookInfo } from "./scanner";

describe("Drive Library Scanner - parseBookInfo & normalizeAuthor", () => {
  it("normalizes inverted author names", () => {
    expect(normalizeAuthor("Tomforde, Liz")).toBe("Liz Tomforde");
    expect(normalizeAuthor("Maas, Sarah J.")).toBe("Sarah J. Maas");
    expect(normalizeAuthor("Liz Tomforde")).toBe("Liz Tomforde");
    expect(normalizeAuthor("Unknown Author")).toBe("Unknown Author");
  });

  it("parses series and index from bracketed filenames", () => {
    const res = parseBookInfo("Liz Tomforde - The Right Move [Windy City Series, Book 2].mp3");
    expect(res.title).toBe("The Right Move");
    expect(res.author).toBe("Liz Tomforde");
    expect(res.series).toBe("Windy City");
    expect(res.seriesIndex).toBe(2);
    expect(res.format).toBe("mp3");
  });

  it("parses Windy City books 3 and 4 with brackets", () => {
    const b3 = parseBookInfo("Liz Tomforde - Caught Up [Windy City Series, Book 3].mp3");
    expect(b3.title).toBe("Caught Up");
    expect(b3.author).toBe("Liz Tomforde");
    expect(b3.series).toBe("Windy City");
    expect(b3.seriesIndex).toBe(3);

    const b4 = parseBookInfo("Liz Tomforde - Play Along [Windy City Series, Book 4].mp3");
    expect(b4.title).toBe("Play Along");
    expect(b4.author).toBe("Liz Tomforde");
    expect(b4.series).toBe("Windy City");
    expect(b4.seriesIndex).toBe(4);
  });

  it("parses Rewind It Back with inverted author and applies series heuristic", () => {
    const res = parseBookInfo("Tomforde, Liz - Rewind It Back.mp3");
    expect(res.title).toBe("Rewind It Back");
    expect(res.author).toBe("Liz Tomforde");
    expect(res.series).toBe("Windy City");
    expect(res.seriesIndex).toBe(5);
  });

  it("parses In Her Own League by Liz Tomforde", () => {
    const res = parseBookInfo("Liz Tomforde - In Her Own League.mp3");
    expect(res.title).toBe("In Her Own League");
    expect(res.author).toBe("Liz Tomforde");
    expect(res.series).toBe("Windy City");
  });

  it("parses Series #Index - Title by Author pattern", () => {
    const res = parseBookInfo("Windy City #1 - Mile High by Liz Tomforde.m4b");
    expect(res.title).toBe("Mile High");
    expect(res.author).toBe("Liz Tomforde");
    expect(res.series).toBe("Windy City");
    expect(res.seriesIndex).toBe(1);
    expect(res.format).toBe("m4b");
  });

  it("parses GraphicAudio and Crescent City folder cues", () => {
    const res = parseBookInfo("01 - House of Earth and Blood.m4b", "GraphicAudio - Crescent City");
    expect(res.title).toBe("House of Earth and Blood");
    expect(res.author).toBe("Sarah J. Maas");
    expect(res.series).toBe("Crescent City");
    expect(res.seriesIndex).toBe(1);
    expect(res.narrator).toBeUndefined();
  });

  it("parses B-number prefixed titles", () => {
    const res = parseBookInfo("B01 Addicted to You.mp3", "Addicted series by Krista Ritchie");
    expect(res.title).toBe("Addicted to You");
    expect(res.author).toBe("Krista Ritchie");
    expect(res.series).toBe("Addicted");
    expect(res.seriesIndex).toBe(1);
  });

  it("parses The Empyrean series books (Fourth Wing, Iron Flame, Onyx Storm)", () => {
    const b1 = parseBookInfo("01 - Fourth Wing.m4b");
    expect(b1.title).toBe("Fourth Wing");
    expect(b1.author).toBe("Rebecca Yarros");
    expect(b1.series).toBe("The Empyrean");
    expect(b1.seriesIndex).toBe(1);
    expect(b1.narrator).toBeUndefined();

    const b2 = parseBookInfo("02 - Iron Flame.m4b");
    expect(b2.title).toBe("Iron Flame");
    expect(b2.author).toBe("Rebecca Yarros");
    expect(b2.series).toBe("The Empyrean");
    expect(b2.seriesIndex).toBe(2);

    const b3 = parseBookInfo("03 - Onyx Storm.m4b");
    expect(b3.title).toBe("Onyx Storm");
    expect(b3.author).toBe("Rebecca Yarros");
    expect(b3.series).toBe("The Empyrean");
    expect(b3.seriesIndex).toBe(3);
  });

  it("parses Pierce Brown Red Rising series audiobooks accurately", () => {
    const rr1 = parseBookInfo(
      "Red Rising (Part 1 of 2) (Dramatized Adaptation)_ Red Rising, Book 1 [B0BVGTFDWN].m4b",
    );
    expect(rr1.title).toBe("Red Rising (Part 1 of 2) (Dramatized Adaptation)");
    expect(rr1.author).toBe("Pierce Brown");
    expect(rr1.series).toBe("Red Rising");
    expect(rr1.seriesIndex).toBe(1.1);
    expect(rr1.narrator).toBeUndefined();

    const gs1 = parseBookInfo(
      "Golden Son (Part 1 of 2) (Dramatized Adaptation)_ Red Rising Saga, Book 2 [B0CGFYB9ZZ].m4b",
    );
    expect(gs1.title).toBe("Golden Son (Part 1 of 2) (Dramatized Adaptation)");
    expect(gs1.author).toBe("Pierce Brown");
    expect(gs1.series).toBe("Red Rising");
    expect(gs1.seriesIndex).toBe(2.1);

    const da3 = parseBookInfo("Dark Age (3 of 3) _ Red Rising 5.m4b");
    expect(da3.title).toBe("Dark Age (Part 3 of 3)");
    expect(da3.author).toBe("Pierce Brown");
    expect(da3.series).toBe("Red Rising");
    expect(da3.seriesIndex).toBe(5.3);
  });
});
