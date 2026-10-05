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
    expect(res.narrator).toBe("GraphicAudio");
  });

  it("parses B-number prefixed titles", () => {
    const res = parseBookInfo("B01 Addicted to You.mp3", "Addicted series by Krista Ritchie");
    expect(res.title).toBe("Addicted to You");
    expect(res.author).toBe("Krista Ritchie");
    expect(res.series).toBe("Addicted");
    expect(res.seriesIndex).toBe(1);
  });
});
