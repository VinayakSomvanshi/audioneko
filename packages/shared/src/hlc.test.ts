import { describe, expect, it } from "vitest";
import type { BookProgressRecord } from "./contracts";
import { compareHlc, createHlc, packHlc, resolveProgressConflict, tickHlc, unpackHlc } from "./hlc";

describe("Hybrid Logical Clock (HLC) & Monotonic Progress Vector", () => {
  it("packs and unpacks HLC losslessly", () => {
    const clock = {
      timeMs: 1728000000123,
      counter: 42,
      nodeId: "device_laptop_xyz",
    };

    const packed = packHlc(clock);
    expect(packed).toBe("1728000000123:42:device_laptop_xyz");

    const unpacked = unpackHlc(packed);
    expect(unpacked).toEqual(clock);
  });

  it("handles malformed unpack safely", () => {
    const unpacked = unpackHlc("invalid_hlc");
    expect(unpacked.timeMs).toBe(0);
    expect(unpacked.counter).toBe(0);
    expect(unpacked.nodeId).toBe("invalid_hlc");
  });

  it("compares clocks by physical time first, then logical counter, then node ID", () => {
    const a = { timeMs: 1000, counter: 5, nodeId: "nodeA" };
    const b = { timeMs: 2000, counter: 1, nodeId: "nodeA" };
    expect(compareHlc(a, b)).toBeLessThan(0);
    expect(compareHlc(b, a)).toBeGreaterThan(0);

    const c = { timeMs: 1000, counter: 8, nodeId: "nodeA" };
    expect(compareHlc(a, c)).toBeLessThan(0);

    const d = { timeMs: 1000, counter: 5, nodeId: "nodeB" };
    expect(compareHlc(a, d)).toBeLessThan(0); // "nodeA" < "nodeB"

    const identical = { timeMs: 1000, counter: 5, nodeId: "nodeA" };
    expect(compareHlc(a, identical)).toBe(0);
  });

  it("advances local HLC strictly forward", () => {
    let local = createHlc("client-1", 1000);

    // Wall clock moves forward
    local = tickHlc(local, undefined, 2000);
    expect(local.timeMs).toBe(2000);
    expect(local.counter).toBe(0);

    // Wall clock same/skewed backward: increment logical counter
    local = tickHlc(local, undefined, 1999);
    expect(local.timeMs).toBe(2000);
    expect(local.counter).toBe(1);

    local = tickHlc(local, undefined, 2000);
    expect(local.timeMs).toBe(2000);
    expect(local.counter).toBe(2);
  });

  it("merges remote HLC establishing causal ordering", () => {
    const local = { timeMs: 2000, counter: 3, nodeId: "local-dev" };
    const remote = { timeMs: 2500, counter: 1, nodeId: "phone-dev" };

    const updated = tickHlc(local, remote, 2100);
    expect(updated.timeMs).toBe(2500);
    expect(updated.counter).toBe(2);
    expect(updated.nodeId).toBe("local-dev");
  });

  describe("resolveProgressConflict", () => {
    const baseRecord: BookProgressRecord = {
      bookId: "book-1",
      currentTime: 1200,
      duration: 3600,
      playbackRate: 1.0,
      isPlaying: false,
      hlc: { timeMs: 10000, counter: 0, nodeId: "phone" },
      deviceId: "phone",
      deviceName: "iPhone 15",
      updatedAt: 10000,
    };

    it("accepts incoming record when no existing record exists", () => {
      const result = resolveProgressConflict(null, baseRecord);
      expect(result.updated).toBe(true);
      expect(result.record).toEqual(baseRecord);
    });

    it("rejects incoming record when incoming HLC is older than existing HLC", () => {
      const incoming: BookProgressRecord = {
        ...baseRecord,
        currentTime: 1800,
        hlc: { timeMs: 9000, counter: 0, nodeId: "old-tablet" },
      };

      const result = resolveProgressConflict(baseRecord, incoming);
      expect(result.updated).toBe(false);
      expect(result.record).toEqual(baseRecord);
    });

    it("accepts forward progress when incoming HLC is newer", () => {
      const incoming: BookProgressRecord = {
        ...baseRecord,
        currentTime: 1450,
        isPlaying: true,
        hlc: { timeMs: 12000, counter: 0, nodeId: "phone" },
      };

      const result = resolveProgressConflict(baseRecord, incoming);
      expect(result.updated).toBe(true);
      expect(result.record.currentTime).toBe(1450);
      expect(result.record.isPlaying).toBe(true);
    });

    it("monotonic safeguard: protects forward progress from stale idle tab pause event", () => {
      // iPhone listened up to 2500 seconds
      const activeMobile: BookProgressRecord = {
        ...baseRecord,
        currentTime: 2500,
        isPlaying: true,
        hlc: { timeMs: 15000, counter: 0, nodeId: "phone" },
      };

      // Desktop tab was left paused at 1200 seconds, and when closing or blurring sends a pause update with newer wall time
      const staleDesktopPause: BookProgressRecord = {
        ...baseRecord,
        currentTime: 1200,
        isPlaying: false,
        hlc: { timeMs: 16000, counter: 0, nodeId: "desktop" },
        deviceId: "desktop",
      };

      const result = resolveProgressConflict(activeMobile, staleDesktopPause);
      expect(result.updated).toBe(true);
      // Key assertion: currentTime must NOT regress to 1200!
      expect(result.record.currentTime).toBe(2500);
      expect(result.record.isPlaying).toBe(false);
      expect(result.record.hlc.timeMs).toBe(16000);
    });

    it("allows backward seek when isExplicitSeek option is true", () => {
      // User explicitly scrubbed back from 2500 to 500
      const activeState: BookProgressRecord = {
        ...baseRecord,
        currentTime: 2500,
        hlc: { timeMs: 15000, counter: 0, nodeId: "phone" },
      };

      const intentionalRewind: BookProgressRecord = {
        ...baseRecord,
        currentTime: 500,
        isPlaying: false,
        hlc: { timeMs: 16000, counter: 0, nodeId: "phone" },
      };

      const result = resolveProgressConflict(activeState, intentionalRewind, {
        isExplicitSeek: true,
      });
      expect(result.updated).toBe(true);
      expect(result.record.currentTime).toBe(500);
    });
  });
});
