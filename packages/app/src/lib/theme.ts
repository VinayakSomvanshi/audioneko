/**
 * audioneko: Theme & Color Palette System
 * Provides curated aesthetic palettes that render with optimal contrast in both Dark and Light modes.
 */

import { useEffect, useState } from "react";

export type ThemePalette = "crimson" | "amber" | "amethyst" | "nordic" | "emerald" | "rose";
export type ThemeMode = "dark" | "light";

export interface PaletteInfo {
  id: ThemePalette;
  name: string;
  subtitle: string;
  swatchDark: string;
  swatchLight: string;
  accentHex: string;
  bgDark: string;
  bgLight: string;
}

export const THEME_PALETTES: PaletteInfo[] = [
  {
    id: "crimson",
    name: "Crimson",
    subtitle: "Classic Obsidian & Vermilion",
    swatchDark: "#e04838",
    swatchLight: "#b83224",
    accentHex: "#e04838",
    bgDark: "#101012",
    bgLight: "#f8f8f9",
  },
  {
    id: "amber",
    name: "Amber",
    subtitle: "Warm Honey & Vintage Ochre",
    swatchDark: "#d49727",
    swatchLight: "#99650d",
    accentHex: "#d49727",
    bgDark: "#16140e",
    bgLight: "#f9f7f0",
  },
  {
    id: "amethyst",
    name: "Amethyst",
    subtitle: "Royal Dusk Violet & Velvet Plum",
    swatchDark: "#aa6bd6",
    swatchLight: "#7836a3",
    accentHex: "#aa6bd6",
    bgDark: "#140f17",
    bgLight: "#f9f6fa",
  },
  {
    id: "nordic",
    name: "Nordic",
    subtitle: "Arctic Slate & Fjord Frost",
    swatchDark: "#7fb4ca",
    swatchLight: "#4c78a0",
    accentHex: "#7fb4ca",
    bgDark: "#171b22",
    bgLight: "#f3f6fa",
  },
  {
    id: "emerald",
    name: "Emerald",
    subtitle: "Deep Evergreen & Botanical Sage",
    swatchDark: "#46b57d",
    swatchLight: "#267950",
    accentHex: "#46b57d",
    bgDark: "#101512",
    bgLight: "#f5f8f6",
  },
  {
    id: "rose",
    name: "Rose Pine",
    subtitle: "Dusky Terracotta & Blush Wine",
    swatchDark: "#de6f8b",
    swatchLight: "#a83e5c",
    accentHex: "#de6f8b",
    bgDark: "#161113",
    bgLight: "#f9f6f6",
  },
];

const STORAGE_PALETTE_KEY = "audioneko-theme-palette";
const STORAGE_MODE_KEY = "audioneko-theme-mode";
const LEGACY_STORAGE_KEY = "audioneko-theme";

export function getStoredThemePalette(): ThemePalette {
  if (typeof window === "undefined") return "crimson";
  const stored = localStorage.getItem(STORAGE_PALETTE_KEY);
  if (stored && ["crimson", "amber", "amethyst", "nordic", "emerald", "rose"].includes(stored)) {
    return stored as ThemePalette;
  }
  return "crimson";
}

export function getStoredThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem(STORAGE_MODE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
  if (stored === "light") return "light";
  return "dark";
}

export function applyTheme(palette: ThemePalette, mode: ThemeMode): void {
  if (typeof document === "undefined") return;

  const root = document.documentElement;

  // Apply palette via data-theme attribute
  root.setAttribute("data-theme", palette);

  // Apply mode via dark class
  if (mode === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }

  // Synchronize mobile PWA status bar theme-color
  const pal = THEME_PALETTES.find((p) => p.id === palette) || THEME_PALETTES[0];
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor && pal) {
    metaThemeColor.setAttribute("content", mode === "dark" ? pal.bgDark : pal.bgLight);
  }

  // Persist to storage
  localStorage.setItem(STORAGE_PALETTE_KEY, palette);
  localStorage.setItem(STORAGE_MODE_KEY, mode);
  localStorage.setItem(LEGACY_STORAGE_KEY, mode);

  // Notify active listeners across tabs/components
  window.dispatchEvent(
    new CustomEvent("audioneko-theme-change", {
      detail: { palette, mode },
    }),
  );
}

/**
 * React hook for consuming and updating the application theme state.
 */
export function useTheme() {
  const [palette, setPaletteState] = useState<ThemePalette>(getStoredThemePalette);
  const [mode, setModeState] = useState<ThemeMode>(getStoredThemeMode);

  useEffect(() => {
    // Initial sync with DOM in case modified during render
    const currentPalette =
      (document.documentElement.getAttribute("data-theme") as ThemePalette) ||
      getStoredThemePalette();
    const isDark = document.documentElement.classList.contains("dark");
    const currentMode: ThemeMode = isDark ? "dark" : "light";

    setPaletteState(currentPalette);
    setModeState(currentMode);

    const handleThemeChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ palette: ThemePalette; mode: ThemeMode }>;
      if (customEvent.detail) {
        setPaletteState(customEvent.detail.palette);
        setModeState(customEvent.detail.mode);
      } else {
        setPaletteState(getStoredThemePalette());
        setModeState(getStoredThemeMode());
      }
    };

    window.addEventListener("audioneko-theme-change", handleThemeChange);
    window.addEventListener("storage", handleThemeChange);

    return () => {
      window.removeEventListener("audioneko-theme-change", handleThemeChange);
      window.removeEventListener("storage", handleThemeChange);
    };
  }, []);

  const setPalette = (newPalette: ThemePalette) => {
    setPaletteState(newPalette);
    applyTheme(newPalette, mode);
  };

  const setMode = (newMode: ThemeMode) => {
    setModeState(newMode);
    applyTheme(palette, newMode);
  };

  const toggleMode = () => {
    const nextMode = mode === "dark" ? "light" : "dark";
    setMode(nextMode);
  };

  return {
    palette,
    mode,
    isDark: mode === "dark",
    setPalette,
    setMode,
    toggleMode,
    palettes: THEME_PALETTES,
  };
}
