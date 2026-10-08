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
    expect(res.narrator).toBe("Elizabeth Evans");
  });

  it("parses B-number prefixed titles", () => {
    const res = parseBookInfo("B01 Addicted to You.mp3", "Addicted series by Krista Ritchie");
    expect(res.title).toBe("Addicted to You");
    expect(res.author).toBe("Krista Ritchie & Becca Ritchie");
    expect(res.series).toBe("Addicted");
    expect(res.seriesIndex).toBe(1);
    expect(res.narrator).toBe("Victoria Connolly & Teddy Hamilton");
  });

  it("parses The Empyrean series books (Fourth Wing, Iron Flame, Onyx Storm)", () => {
    const b1 = parseBookInfo("01 - Fourth Wing.m4b");
    expect(b1.title).toBe("Fourth Wing");
    expect(b1.author).toBe("Rebecca Yarros");
    expect(b1.series).toBe("The Empyrean");
    expect(b1.seriesIndex).toBe(1);
    expect(b1.narrator).toBe("Rebecca Soler & Teddy Hamilton");

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
    expect(rr1.narrator).toBe("GraphicAudio Full Cast");

    const gs1 = parseBookInfo(
      "Golden Son (Part 1 of 2) (Dramatized Adaptation)_ Red Rising Saga, Book 2 [B0CGFYB9ZZ].m4b",
    );
    expect(gs1.title).toBe("Golden Son (Part 1 of 2) (Dramatized Adaptation)");
    expect(gs1.author).toBe("Pierce Brown");
    expect(rr1.series).toBe("Red Rising");
    expect(gs1.seriesIndex).toBe(2.1);

    const da3 = parseBookInfo("Dark Age (3 of 3) _ Red Rising 5.m4b");
    expect(da3.title).toBe("Dark Age (Part 3 of 3)");
    expect(da3.author).toBe("Pierce Brown");
    expect(da3.series).toBe("Red Rising");
    expect(da3.seriesIndex).toBe(5.3);
  });

  it("parses Sarah J. Maas Throne of Glass series books accurately", () => {
    const tog1 = parseBookInfo("01 - Throne of Glass.m4b");
    expect(tog1.title).toBe("Throne of Glass");
    expect(tog1.author).toBe("Sarah J. Maas");
    expect(tog1.series).toBe("Throne of Glass");
    expect(tog1.seriesIndex).toBe(1);
    expect(tog1.narrator).toBe("Elizabeth Evans");

    const ab3 = parseBookInfo("03 - The Assassin's Blade.m4b");
    expect(ab3.title).toBe("The Assassin's Blade");
    expect(ab3.author).toBe("Sarah J. Maas");
    expect(ab3.series).toBe("Throne of Glass");
    expect(ab3.seriesIndex).toBe(3);

    const hof4 = parseBookInfo("04 - Heir of Fire.m4b");
    expect(hof4.title).toBe("Heir of Fire");
    expect(hof4.author).toBe("Sarah J. Maas");
    expect(hof4.series).toBe("Throne of Glass");
    expect(hof4.seriesIndex).toBe(4);
    expect(hof4.narrator).toBe("Elizabeth Evans");

    const qos5 = parseBookInfo("05 - Queen of Shadows.m4b");
    expect(qos5.title).toBe("Queen of Shadows");
    expect(qos5.author).toBe("Sarah J. Maas");
    expect(qos5.series).toBe("Throne of Glass");
    expect(qos5.seriesIndex).toBe(5);

    const tod7 = parseBookInfo("07 - Tower of Dawn.m4b");
    expect(tod7.title).toBe("Tower of Dawn");
    expect(tod7.author).toBe("Sarah J. Maas");
    expect(tod7.series).toBe("Throne of Glass");
    expect(tod7.seriesIndex).toBe(7);

    const koa8 = parseBookInfo("08 - Kingdom of Ash.m4b");
    expect(koa8.title).toBe("Kingdom of Ash");
    expect(koa8.author).toBe("Sarah J. Maas");
    expect(koa8.series).toBe("Throne of Glass");
    expect(koa8.seriesIndex).toBe(8);
  });

  it("parses standalones and newly added series with enriched narrators and clean titles", () => {
    const lh = parseBookInfo(
      "The Love Hypothesis (The Love Hypothesis #1) (Updated Version).m4b",
    );
    expect(lh.title).toBe("The Love Hypothesis");
    expect(lh.author).toBe("Ali Hazelwood");
    expect(lh.narrator).toBe("Callie Dalton & Teddy Hamilton");

    const fs = parseBookInfo("Fan Service.m4b");
    expect(fs.title).toBe("Fan Service");
    expect(fs.author).toBe("Rosie Danan");
    expect(fs.narrator).toBe("Brittany Pressley & Aaron Shedlock");

    const nanny = parseBookInfo("The Nanny.m4b");
    expect(nanny.title).toBe("The Nanny");
    expect(nanny.author).toBe("Lana Ferguson");
    expect(nanny.narrator).toBe("Samantha Summers & Jameson Adams");

    const rfts = parseBookInfo("Rules for the Summer.m4b");
    expect(rfts.title).toBe("Rules for the Summer");
    expect(rfts.author).toBe("Meghan Quinn");
    expect(rfts.narrator).toBe("Shane East, Stella Hunter, Gary Furlong & Cassandra Medcalf");

    const fd = parseBookInfo("Fever Dream.m4b");
    expect(fd.title).toBe("Fever Dream");
    expect(fd.author).toBe("Elsie Silver");
    expect(fd.series).toBe("Emerald Lake");
    expect(fd.seriesIndex).toBe(1);
    expect(fd.narrator).toBe("Teddy Hamilton, Julia Goldani Telles & Emma Wilder");

    const league = parseBookInfo("Liz Tomforde - In Her Own League.mp3");
    expect(league.title).toBe("In Her Own League");
    expect(league.author).toBe("Liz Tomforde");
    expect(league.series).toBe("Windy City");
    expect(league.seriesIndex).toBe(6);
    expect(league.narrator).toBe("Samantha Brentmoor & Jason Clarke");
  });
});
