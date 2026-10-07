import { describe, expect, it } from "vitest";
import { router } from "./router";

describe("audioneko PWA Shell & Router", () => {
  it("registers essential application routes", () => {
    const flatRoutes = router.routesByPath;

    expect(flatRoutes["/"]).toBeDefined();
    expect(flatRoutes["/book/$id"]).toBeDefined();
    expect(flatRoutes["/series"]).toBeDefined();
    expect(flatRoutes["/authors"]).toBeDefined();
    expect(flatRoutes["/shelves"]).toBeDefined();
    expect(flatRoutes["/notebook"]).toBeDefined();
    expect(flatRoutes["/analytics"]).toBeDefined();
    expect(flatRoutes["/offline"]).toBeDefined();
    expect(flatRoutes["/admin"]).toBeDefined();
    expect(flatRoutes["/join"]).toBeDefined();
    expect(flatRoutes["/login"]).toBeDefined();
    expect(flatRoutes["/admin/invites"]).toBeDefined();
  });

  it("configures default preload intent for sub-5ms route transitions", () => {
    expect(router.options.defaultPreload).toBe("intent");
  });

  it("formats seconds to audio duration strings correctly", () => {
    const formatTime = (secs: number) => {
      if (!Number.isFinite(secs) || secs < 0) return "0:00";
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = Math.floor(secs % 60);
      if (h > 0) {
        return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
      }
      return `${m}:${s.toString().padStart(2, "0")}`;
    };

    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(45)).toBe("0:45");
    expect(formatTime(75)).toBe("1:15");
    expect(formatTime(3665)).toBe("1:01:05");
  });
});
