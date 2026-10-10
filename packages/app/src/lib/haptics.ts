/**
 * audioneko: Native-like subtle haptic feedback for mobile devices.
 * Uses navigator.vibrate with short millisecond pulses to provide crisp physical
 * confirmation on chapter skips, jumps, and player controls without sound.
 */

export function triggerHapticFeedback(pattern: number | number[] = 10): void {
  try {
    if (
      typeof navigator !== "undefined" &&
      "vibrate" in navigator &&
      typeof navigator.vibrate === "function"
    ) {
      navigator.vibrate(pattern);
    }
  } catch {
    // Fail silently on browsers that restrict vibration permissions
  }
}
