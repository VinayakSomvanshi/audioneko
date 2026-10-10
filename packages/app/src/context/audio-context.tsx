import type { Book, BookProgressRecord, Chapter } from "@audioneko/shared";
import { useQueryClient } from "@tanstack/react-query";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { EqualizerModal } from "../components/player/EqualizerModal";
import { HeadsetSettingsModal } from "../components/player/HeadsetSettingsModal";
import { ResumeBanner } from "../components/player/ResumeBanner";
import { audioEngine } from "../lib/audio-engine";
import { useCurrentUser } from "../lib/auth-client";
import type { EqualizerBands, EqualizerPresetId } from "../lib/equalizer";
import {
  type HeadsetRemappingSettings,
  loadHeadsetSettings,
  saveHeadsetSettings,
} from "../lib/headset-remapping";
import {
  registerMediaSessionHandlers,
  setMediaSessionMetadata,
  setMediaSessionPlaybackState,
  setMediaSessionPositionState,
} from "../lib/media-session";
import { pipManager } from "../lib/pip-visualizer";
import { triggerPredictivePrecache } from "../lib/predictive-precache";
import {
  PROGRESS_CHANGE_EVENT,
  clearProgress,
  getProgress,
  progressTracker,
  setProgress,
} from "../lib/progress-store";
import { SleepTimer, type SleepTimerPreset, type SleepTimerState } from "../lib/sleep-timer";
import {
  computeSmartRewind,
  loadSmartRewindSettings,
  saveSmartRewindSettings,
} from "../lib/smart-rewind";
import { SyncClient } from "../lib/sync-client";

export interface AudioContextType {
  currentBook: Book | null;
  chapters: Chapter[];
  currentChapter: Chapter | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  bufferedTime: number;
  playbackRate: number;
  volume: number;
  isMuted: boolean;
  voiceBoost: boolean;
  loudnessNormalization: boolean;
  smartSpeed: boolean;
  smartRewind: boolean;
  equalizerPreset: EqualizerPresetId;
  equalizerBands: EqualizerBands;
  setEqualizerPreset: (preset: EqualizerPresetId) => void;
  setEqualizerBands: (bands: EqualizerBands) => void;
  isEqualizerOpen: boolean;
  setIsEqualizerOpen: (open: boolean) => void;
  headsetSettings: HeadsetRemappingSettings;
  setHeadsetSettings: (settings: HeadsetRemappingSettings) => void;
  isHeadsetSettingsOpen: boolean;
  setIsHeadsetSettingsOpen: (open: boolean) => void;
  isFullPlayerOpen: boolean;
  isPiPActive: boolean;
  sleepTimerState: SleepTimerState;
  remoteResumePrompt: BookProgressRecord | null;
  isSyncConnected: boolean;
  dismissResumePrompt: () => void;
  jumpToRemotePosition: () => void;
  setIsFullPlayerOpen: (open: boolean) => void;
  playBook: (book: Book, initialPosition?: number, bookChapters?: Chapter[]) => void;
  prewarmBook: (book: Book, initialPosition?: number) => void;
  pause: () => void;
  resume: () => void;
  togglePlay: () => void;
  seekTo: (seconds: number) => void;
  skipBy: (seconds: number) => void;
  nextChapter: () => void;
  previousChapter: () => void;
  setRate: (rate: number) => void;
  setVol: (vol: number) => void;
  toggleMute: () => void;
  toggleVoiceBoost: () => void;
  toggleLoudnessNormalization: () => void;
  toggleSmartSpeed: () => void;
  toggleSmartRewind: () => void;
  startSleepTimer: (preset: SleepTimerPreset) => void;
  extendSleepTimer: (minutes?: number) => void;
  cancelSleepTimer: () => void;
  setShakeToExtend: (enabled: boolean) => void;
  togglePiP: () => Promise<boolean>;
  getSavedProgress: (bookId: string) => { position: number; duration: number } | null;
  resetProgress: (bookId: string) => Promise<void>;
}

const AudioContext = createContext<AudioContextType | null>(null);

export function AudioProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { user, isLoading: isUserLoading } = useCurrentUser();
  const [currentBook, setCurrentBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [volume, setVolume] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [bufferedTime, setBufferedTime] = useState(0);
  const [isFullPlayerOpen, setIsFullPlayerOpen] = useState(false);
  const [isPiPActive, setIsPiPActive] = useState(false);

  const [remoteResumePrompt, setRemoteResumePrompt] = useState<BookProgressRecord | null>(null);
  const [isSyncConnected, setIsSyncConnected] = useState(false);
  const syncClientRef = useRef<SyncClient | null>(null);

  const [voiceBoost, setVoiceBoostState] = useState(false);
  const [loudnessNormalization, setLoudnessNormState] = useState(true);
  const [smartSpeed, setSmartSpeedState] = useState(false);
  const [smartRewind, setSmartRewindState] = useState(() => loadSmartRewindSettings().enabled);
  const pausedAtMsRef = useRef<number | null>(null);

  const sleepTimerRef = useRef<SleepTimer | null>(null);
  const [sleepTimerState, setSleepTimerState] = useState<SleepTimerState>({
    isActive: false,
    preset: null,
    remainingSeconds: 0,
    endsAt: null,
    isFadingOut: false,
    volumeMultiplier: 1.0,
    shakeToExtendEnabled: true,
  });

  const [equalizerPreset, setEqualizerPresetState] = useState<EqualizerPresetId>(
    () => audioEngine.getSettings().equalizerPreset,
  );
  const [equalizerBands, setEqualizerBandsState] = useState<EqualizerBands>(
    () => audioEngine.getSettings().equalizerBands,
  );
  const [isEqualizerOpen, setIsEqualizerOpen] = useState(false);

  const [headsetSettings, setHeadsetSettingsState] = useState<HeadsetRemappingSettings>(() =>
    loadHeadsetSettings(),
  );
  const [isHeadsetSettingsOpen, setIsHeadsetSettingsOpen] = useState(false);

  // Stable audio element ref - created ONCE, never replaced
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Refs for latest values - eliminates stale closure bugs without adding deps
  const currentBookRef = useRef<Book | null>(null);
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);
  const playbackRateRef = useRef(1.0);
  const isPlayingRef = useRef(false);
  const chaptersRef = useRef<Chapter[]>([]);
  const currentChapterRef = useRef<Chapter | null>(null);
  const sleepTimerStateRef = useRef(sleepTimerState);
  const volumeRef = useRef(1.0);
  const isMutedRef = useRef(false);
  const prevVolumeRef = useRef(1.0);

  const userRef = useRef(user);
  const isUserLoadingRef = useRef(isUserLoading);
  const queryClientRef = useRef(queryClient);

  // Keep refs in sync
  useEffect(() => {
    queryClientRef.current = queryClient;
  }, [queryClient]);
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  useEffect(() => {
    isUserLoadingRef.current = isUserLoading;
  }, [isUserLoading]);
  useEffect(() => {
    currentBookRef.current = currentBook;
  }, [currentBook]);
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);
  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);
  useEffect(() => {
    playbackRateRef.current = playbackRate;
  }, [playbackRate]);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);
  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);
  useEffect(() => {
    chaptersRef.current = chapters;
  }, [chapters]);
  useEffect(() => {
    sleepTimerStateRef.current = sleepTimerState;
  }, [sleepTimerState]);

  const lastListenTickRef = useRef<{
    time: number;
    position: number;
    bookId: string;
  } | null>(null);

  const flushListeningEvent = useCallback(
    (bookId: string, startPos: number, endPos: number, elapsedWallSecs: number, rate: number) => {
      if (elapsedWallSecs < 3) return;
      fetch("/api/analytics/listen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId,
          startTimeSeconds: Math.round(startPos),
          endTimeSeconds: Math.round(endPos),
          durationListenedSeconds: Math.round(elapsedWallSecs),
          playbackRate: rate,
        }),
      }).catch(() => {});
    },
    [],
  );

  // Core controls - all use refs so they never go stale
  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    pausedAtMsRef.current = Date.now();
    audioEngine.pauseWithRamp(audio);
    setMediaSessionPlaybackState("paused");
    const book = currentBookRef.current;
    const ct = audio.currentTime;
    if (book && ct > 3) {
      setProgress(book.id, ct, audio.duration || durationRef.current || 0);
    }
    if (book) {
      syncClientRef.current?.sendUpdate({
        bookId: book.id,
        currentTime: ct,
        duration: durationRef.current,
        playbackRate: playbackRateRef.current,
        isPlaying: false,
      });
      if (lastListenTickRef.current?.bookId === book.id) {
        const elapsed = (Date.now() - lastListenTickRef.current.time) / 1000;
        flushListeningEvent(
          book.id,
          lastListenTickRef.current.position,
          ct,
          elapsed,
          playbackRateRef.current,
        );
        lastListenTickRef.current = null;
      }
    }
  }, [flushListeningEvent]);

  const playBookRef = useRef<
    ((book: Book, initialPosition?: number, bookChapters?: Chapter[]) => void) | null
  >(null);

  const resume = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Smart Resume Rewind evaluation
    if (pausedAtMsRef.current && currentTimeRef.current > 0) {
      const settings = loadSmartRewindSettings();
      const rewindRes = computeSmartRewind(
        pausedAtMsRef.current,
        currentTimeRef.current,
        Date.now(),
        settings,
      );
      if (rewindRes.shouldRewind) {
        currentTimeRef.current = rewindRes.targetPositionSeconds;
        setCurrentTime(rewindRes.targetPositionSeconds);
      }
    }
    pausedAtMsRef.current = null;

    const book = currentBookRef.current;
    if (
      book &&
      (!audio.src ||
        audio.src === "" ||
        audio.src === window.location.href ||
        audio.src.endsWith("/"))
    ) {
      playBookRef.current?.(book, currentTimeRef.current);
      return;
    }
    if (
      currentTimeRef.current > 0 &&
      Math.abs(audio.currentTime - currentTimeRef.current) > 1.5 &&
      audio.readyState >= 1
    ) {
      try {
        audio.currentTime = currentTimeRef.current;
      } catch (e) {
        console.warn("[audioneko] Resume seek error:", e);
      }
    }
    audioEngine
      .playWithRamp(audio)
      .then(() => {
        setMediaSessionPlaybackState("playing");
        if (book) {
          lastListenTickRef.current = {
            time: Date.now(),
            position: audio.currentTime,
            bookId: book.id,
          };
          syncClientRef.current?.sendUpdate({
            bookId: book.id,
            currentTime: audio.currentTime,
            duration: durationRef.current,
            playbackRate: playbackRateRef.current,
            isPlaying: true,
          });
        }
      })
      .catch(console.warn);
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlayingRef.current) {
      pause();
    } else {
      resume();
    }
  }, [pause, resume]);

  const seekTo = useCallback((seconds: number) => {
    if (!Number.isFinite(seconds)) return;
    const audio = audioRef.current;
    if (!audio) return;
    const rawDur = durationRef.current || audio.duration || 0;
    const dur = Number.isFinite(rawDur) ? Math.max(0, rawDur) : 0;
    const clamped = Math.max(0, dur > 0 ? Math.min(seconds, dur) : Math.max(0, seconds));
    audio.currentTime = clamped;
    setCurrentTime(clamped);
    currentTimeRef.current = clamped;
    setMediaSessionPositionState({
      duration: dur,
      playbackRate: playbackRateRef.current,
      position: clamped,
    });
    const book = currentBookRef.current;
    if (book) {
      syncClientRef.current?.sendUpdate({
        bookId: book.id,
        currentTime: clamped,
        duration: dur,
        playbackRate: playbackRateRef.current,
        isPlaying: isPlayingRef.current,
        isExplicitSeek: true,
      });
    }
  }, []);

  const skipBy = useCallback(
    (seconds: number) => {
      if (!Number.isFinite(seconds)) return;
      const audio = audioRef.current;
      if (!audio) return;
      const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
      seekTo(current + seconds);
    },
    [seekTo],
  );

  const nextChapter = useCallback(() => {
    const chs = chaptersRef.current;
    const curCh = currentChapterRef.current;
    if (!chs || chs.length === 0) {
      skipBy(30);
      return;
    }
    const idx = curCh ? chs.findIndex((c) => c.id === curCh.id) : -1;
    if (idx >= 0 && idx < chs.length - 1) {
      seekTo(chs[idx + 1]!.startTime);
    } else {
      skipBy(30);
    }
  }, [seekTo, skipBy]);

  const previousChapter = useCallback(() => {
    const chs = chaptersRef.current;
    const curCh = currentChapterRef.current;
    const ct = audioRef.current?.currentTime ?? currentTimeRef.current;
    if (!chs || chs.length === 0) {
      skipBy(-15);
      return;
    }
    const idx = curCh ? chs.findIndex((c) => c.id === curCh.id) : -1;
    if (idx > 0 && ct - (curCh?.startTime || 0) < 3) {
      seekTo(chs[idx - 1]!.startTime);
    } else if (curCh) {
      seekTo(curCh.startTime);
    } else {
      skipBy(-15);
    }
  }, [seekTo, skipBy]);

  // Initialize the Audio element ONCE - stable empty dep array
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audio.setAttribute("playsinline", "true");
    audio.setAttribute("webkit-playsinline", "true");
    (audio as unknown as { playsInline?: boolean }).playsInline = true;
    // NO crossOrigin="anonymous" - Drive proxy doesn't send CORS headers,
    // setting this would block playback in Chromium via CORS error
    audioRef.current = audio;

    audioEngine.init(audio).catch(console.warn);

    const timer = new SleepTimer({
      onExpire: () => {
        const a = audioRef.current;
        if (a) audioEngine.pauseWithRamp(a);
      },
    });
    sleepTimerRef.current = timer;
    const unsubTimer = timer.subscribe(setSleepTimerState);

    const updateBufferedRange = () => {
      if (audio.buffered.length > 0) {
        const ct = audio.currentTime;
        let highest = 0;
        let matched = false;
        for (let i = 0; i < audio.buffered.length; i++) {
          const start = audio.buffered.start(i);
          const end = audio.buffered.end(i);
          if (ct >= start && ct <= end) {
            setBufferedTime(end);
            matched = true;
            break;
          }
          if (end > highest) highest = end;
        }
        if (!matched && highest > 0) {
          setBufferedTime(highest);
        }
      }
    };

    const onProgress = () => {
      updateBufferedRange();
    };

    const onTimeUpdate = () => {
      const t = audio.currentTime;
      setCurrentTime(t);
      currentTimeRef.current = t;
      updateBufferedRange();

      // Audio engine watchdog: verify Web Audio graph has not suspended or muted while audio element is playing
      if (!audio.paused && audioEngine.isSuspended()) {
        audioEngine.ensureContext().catch(() => {});
      }

      setMediaSessionPositionState({
        duration: audio.duration || 0,
        playbackRate: audio.playbackRate || 1.0,
        position: t,
      });
      // Throttled localStorage save (every 5s)
      const book = currentBookRef.current;
      if (book && t > 3) {
        progressTracker.tick(book.id, t, audio.duration || durationRef.current || 0);
      }
    };

    const onDurationChange = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
        durationRef.current = audio.duration;
        setMediaSessionPositionState({
          duration: audio.duration,
          playbackRate: audio.playbackRate || 1.0,
          position: audio.currentTime,
        });
      }
    };

    const onPlay = () => {
      setIsPlaying(true);
      isPlayingRef.current = true;
      audioEngine.ensureContext().catch(() => {});
      setMediaSessionPlaybackState("playing");
    };

    const onPlaying = () => {
      audioEngine.ensureContext().catch(() => {});
    };

    const onPause = () => {
      setIsPlaying(false);
      isPlayingRef.current = false;
      setMediaSessionPlaybackState("paused");
    };

    const onEnded = () => {
      setIsPlaying(false);
      isPlayingRef.current = false;
      setMediaSessionPlaybackState("none");
      // Clear saved progress — book finished
      const book = currentBookRef.current;
      if (book) {
        clearProgress(book.id);
        // Series auto-queue: if book has seriesId and seriesIndex, check for next book in series
        if (book.seriesId && typeof book.seriesIndex === "number") {
          const allBooks = queryClientRef.current.getQueryData<Book[]>(["books"]) || [];
          const seriesBooks = allBooks
            .filter((b) => b.seriesId === book.seriesId && typeof b.seriesIndex === "number")
            .sort((a, b) => (a.seriesIndex || 0) - (b.seriesIndex || 0));
          const currentIndex = seriesBooks.findIndex((b) => b.id === book.id);
          if (currentIndex !== -1 && currentIndex < seriesBooks.length - 1) {
            const nextBook = seriesBooks[currentIndex + 1];
            if (nextBook) {
              console.log("[audioneko] Auto-playing next book in series:", nextBook.title);
              setTimeout(() => {
                playBookRef.current?.(nextBook, 0);
              }, 1200);
            }
          }
        }
      }
    };

    const onAudioError = () => {
      const err = audio.error;
      console.warn("[audioneko] Audio error:", err?.code, err?.message);
      setIsPlaying(false);
      isPlayingRef.current = false;
      if (typeof window !== "undefined") {
        fetch("/api/auth/get-session")
          .then((res) => {
            if (res.status === 401) {
              window.location.href = "/login";
            }
          })
          .catch(() => {});
      }
    };

    // Auto-resume AudioContext when phone screen unlocks, tab changes, or app regains focus
    const onVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        const a = audioRef.current;
        if (a && (!a.paused || isPlayingRef.current)) {
          audioEngine.ensureContext().catch(() => {});
        }
      }
    };

    const onWindowFocus = () => {
      const a = audioRef.current;
      if (a && (!a.paused || isPlayingRef.current)) {
        audioEngine.ensureContext().catch(() => {});
      }
    };

    // Flush position to localStorage on tab close / navigation
    const onBeforeUnload = () => {
      const book = currentBookRef.current;
      const a = audioRef.current;
      if (book && a && a.currentTime > 3) {
        progressTracker.flush(book.id, a.currentTime, a.duration || durationRef.current || 0);
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onWindowFocus);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("progress", onProgress);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onAudioError);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onWindowFocus);
      unsubTimer();
      timer.cancel();
      audio.pause();
      audio.src = "";
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("progress", onProgress);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onAudioError);
      audioRef.current = null;
    };
  }, []); // EMPTY - runs once for the app lifetime

  // Sync client - stable, accesses data via refs
  useEffect(() => {
    const client = new SyncClient();
    syncClientRef.current = client;
    const unsubConn = client.onConnectionChange(setIsSyncConnected);
    const unsubRemote = client.onRemoteProgress((record) => {
      // 1. Save remote progress into localStorage so library/shelves know immediately
      const existing = getProgress(record.bookId);
      if (!existing || (record.updatedAt || 0) >= (existing.updatedAt || 0)) {
        setProgress(record.bookId, record.currentTime, record.duration, record.updatedAt);
      }
      // 2. Dispatch event for UI updates across the app
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(PROGRESS_CHANGE_EVENT, { detail: record }));
      }
      if (currentBookRef.current?.id === record.bookId) {
        const timeDiff = Math.abs(record.currentTime - currentTimeRef.current);
        if (timeDiff > 5) setRemoteResumePrompt(record);
      }
    });
    const unsubInitial = client.onInitialState((books) => {
      for (const b of books) {
        const existing = getProgress(b.bookId);
        if (!existing || (b.updatedAt || 0) > (existing.updatedAt || 0)) {
          setProgress(b.bookId, b.currentTime, b.duration, b.updatedAt);
        }
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(PROGRESS_CHANGE_EVENT));
      }
    });
    client.connect();
    return () => {
      unsubConn();
      unsubRemote();
      unsubInitial();
      client.disconnect();
      syncClientRef.current = null;
    };
  }, []); // EMPTY - stable via refs

  // Periodic sync + analytics
  useEffect(() => {
    if (!isPlaying || !currentBook) return;
    const interval = setInterval(() => {
      const ct = audioRef.current?.currentTime ?? currentTimeRef.current;
      syncClientRef.current?.sendUpdate({
        bookId: currentBook.id,
        currentTime: ct,
        duration: durationRef.current,
        playbackRate: playbackRateRef.current,
        isPlaying: true,
      });
      if (lastListenTickRef.current?.bookId === currentBook.id) {
        const elapsed = (Date.now() - lastListenTickRef.current.time) / 1000;
        if (elapsed >= 60) {
          flushListeningEvent(
            currentBook.id,
            lastListenTickRef.current.position,
            ct,
            elapsed,
            playbackRateRef.current,
          );
          lastListenTickRef.current = { time: Date.now(), position: ct, bookId: currentBook.id };
        }
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [isPlaying, currentBook, flushListeningEvent]);

  // Current chapter derived from time
  const currentChapter = useMemo(() => {
    if (!chapters || chapters.length === 0) return null;
    const ch =
      chapters.find(
        (c) => currentTime >= (c.startTime ?? 0) && currentTime < (c.endTime ?? duration),
      ) ??
      chapters[0] ??
      null;
    currentChapterRef.current = ch;
    return ch;
  }, [chapters, currentTime, duration]);

  // Media session handlers with headset remapping
  const lastPauseClickMsRef = useRef<number>(0);
  const headsetSettingsRef = useRef(headsetSettings);
  useEffect(() => {
    headsetSettingsRef.current = headsetSettings;
  }, [headsetSettings]);

  useEffect(() => {
    const cleanup = registerMediaSessionHandlers({
      onPlay: resume,
      onPause: () => {
        const now = Date.now();
        if (
          headsetSettingsRef.current.doubleTapBookmark &&
          now - lastPauseClickMsRef.current < 650
        ) {
          const book = currentBookRef.current;
          const pos = currentTimeRef.current;
          if (book) {
            fetch(`/api/books/${book.id}/bookmarks`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: `Headset Bookmark at ${Math.floor(pos / 60)}:${String(Math.floor(pos % 60)).padStart(2, "0")}`,
                position: pos,
              }),
            }).catch(() => {});
          }
        }
        lastPauseClickMsRef.current = now;
        pause();
      },
      onStop: pause,
      onSeekBackward: (offset) =>
        skipBy(-(offset || headsetSettingsRef.current.seekBackwardSeconds)),
      onSeekForward: (offset) => skipBy(offset || headsetSettingsRef.current.seekForwardSeconds),
      onSeekTo: (pos) => seekTo(pos),
      onPreviousTrack: () => {
        if (headsetSettingsRef.current.prevTrackAction === "skip-seconds") {
          skipBy(-headsetSettingsRef.current.seekBackwardSeconds);
        } else {
          previousChapter();
        }
      },
      onNextTrack: () => {
        if (headsetSettingsRef.current.nextTrackAction === "skip-seconds") {
          skipBy(headsetSettingsRef.current.seekForwardSeconds);
        } else {
          nextChapter();
        }
      },
    });
    return cleanup;
  }, [resume, pause, skipBy, seekTo, previousChapter, nextChapter]);

  // Media session metadata
  useEffect(() => {
    if (!currentBook) return;
    setMediaSessionMetadata({
      title: currentBook.title,
      artist: currentBook.author,
      album:
        currentChapter?.title ||
        (currentBook.seriesIndex ? `Series #${currentBook.seriesIndex}` : "audioneko"),
      artworkUrl: currentBook.coverR2Key ? `/api/covers/${currentBook.id}` : undefined,
    });
  }, [currentBook, currentChapter]);

  // Sleep timer volume
  useEffect(() => {
    const effectiveVolume = volume * sleepTimerState.volumeMultiplier;
    audioEngine.setVolume(effectiveVolume);
  }, [volume, sleepTimerState.volumeMultiplier]);

  // prewarmBook - Preloads audio data into the browser cache/RAM for instant playback
  const prewarmBook = useCallback((book: Book, initialPosition?: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    // CRITICAL: Never interrupt or hijack active playback
    if (isPlayingRef.current) return;
    // If another book is already loaded in player, do not hijack it
    if (currentBookRef.current && currentBookRef.current.id !== book.id) return;
    if (
      currentBookRef.current?.id === book.id &&
      audio.src &&
      audio.src.includes(`/api/stream/${book.id}`)
    ) {
      return;
    }

    let startPos = 0;
    if (initialPosition !== undefined && initialPosition > 0 && Number.isFinite(initialPosition)) {
      startPos = initialPosition;
    } else if (initialPosition === undefined) {
      const saved = getProgress(book.id);
      if (saved && saved.position > 0) {
        startPos = saved.position;
      }
    }

    setCurrentBook(book);
    currentBookRef.current = book;
    setCurrentTime(startPos);
    currentTimeRef.current = startPos;
    setDuration(book.durationSeconds || 0);
    durationRef.current = book.durationSeconds || 0;

    const streamUrl = `/api/stream/${book.id}`;
    const targetUrl = startPos > 0 ? `${streamUrl}#t=${startPos}` : streamUrl;
    audio.preload = "auto";
    audio.src = targetUrl;
    if (startPos > 0) {
      const onMeta = () => {
        audio.removeEventListener("loadedmetadata", onMeta);
        if (Math.abs(audio.currentTime - startPos) > 1.0) {
          try {
            audio.currentTime = startPos;
          } catch {}
        }
      };
      if (audio.readyState >= 1) {
        onMeta();
      } else {
        audio.addEventListener("loadedmetadata", onMeta, { once: true });
      }
    }
  }, []);

  // playBook - Instant playback triggered directly in user gesture
  const playBook = useCallback(
    (book: Book, initialPosition?: number, bookChapters: Chapter[] = []) => {
      const audio = audioRef.current;
      if (!audio) return;

      if (!isUserLoadingRef.current && !userRef.current) {
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
        return;
      }

      // Determine target playback start position
      let startPos = 0;
      if (
        initialPosition !== undefined &&
        initialPosition > 0 &&
        Number.isFinite(initialPosition)
      ) {
        startPos = initialPosition;
      } else if (initialPosition === undefined) {
        const saved = getProgress(book.id);
        if (saved && saved.position > 0) {
          startPos = saved.position;
        }
      }

      setCurrentBook(book);
      currentBookRef.current = book;
      setChapters(bookChapters);
      chaptersRef.current = bookChapters;
      setCurrentTime(startPos);
      currentTimeRef.current = startPos;
      setDuration(book.durationSeconds || 0);
      durationRef.current = book.durationSeconds || 0;

      const streamUrl = `/api/stream/${book.id}`;
      const targetUrl = startPos > 0 ? `${streamUrl}#t=${startPos}` : streamUrl;
      const isSameBook = audio.src?.includes(`/api/stream/${book.id}`);

      audio.preload = "auto";
      audio.playbackRate = playbackRateRef.current;
      audioEngine.setBasePlaybackRate(playbackRateRef.current, audio);

      if (isSameBook) {
        // Fast path: already on this book! Just seek if needed and play instantly!
        if (startPos > 0 && Math.abs(audio.currentTime - startPos) > 1.5) {
          try {
            audio.currentTime = startPos;
          } catch (e) {
            console.warn("[audioneko] Fast path seek error:", e);
          }
        }
        audioEngine
          .playWithRamp(audio)
          .then(() => {
            setMediaSessionPlaybackState("playing");
            syncClientRef.current?.sendUpdate({
              bookId: book.id,
              currentTime: audio.currentTime,
              duration: audio.duration || book.durationSeconds || 0,
              playbackRate: playbackRateRef.current,
              isPlaying: true,
              isExplicitSeek: true,
            });
            lastListenTickRef.current = {
              time: Date.now(),
              position: audio.currentTime,
              bookId: book.id,
            };
          })
          .catch((err) => console.warn("Playback resume error:", err));
      } else {
        // New book: set src directly with fragment and start playing IMMEDIATELY in user gesture
        audio.src = targetUrl;
        if (startPos > 0 && Number.isFinite(startPos)) {
          try {
            audio.currentTime = startPos;
          } catch {
            // Browser will apply via #t or loadedmetadata
          }
        }

        // Trigger playback immediately in the user gesture
        audioEngine
          .playWithRamp(audio)
          .then(() => {
            setMediaSessionPlaybackState("playing");
            syncClientRef.current?.sendUpdate({
              bookId: book.id,
              currentTime: audio.currentTime,
              duration: audio.duration || book.durationSeconds || 0,
              playbackRate: playbackRateRef.current,
              isPlaying: true,
              isExplicitSeek: true,
            });
            lastListenTickRef.current = {
              time: Date.now(),
              position: audio.currentTime,
              bookId: book.id,
            };
          })
          .catch((err) => console.warn("Auto-playback deferred:", err));

        // Precision sync: verify position once metadata loads
        const onMeta = () => {
          audio.removeEventListener("loadedmetadata", onMeta);
          if (startPos > 0 && Math.abs(audio.currentTime - startPos) > 1.5) {
            try {
              audio.currentTime = startPos;
            } catch {}
          }
        };
        audio.addEventListener("loadedmetadata", onMeta, { once: true });
      }

      setMediaSessionMetadata({
        title: book.title,
        artist: book.author,
        album: book.seriesIndex ? `Series #${book.seriesIndex}` : "audioneko",
        artworkUrl: book.coverR2Key ? `/api/covers/${book.id}` : undefined,
      });

      // Trigger predictive offline pre-caching across cellular and Wi-Fi networks
      triggerPredictivePrecache(book, bookChapters).catch(() => {});
    },
    [],
  );
  playBookRef.current = playBook;

  const setRate = useCallback((rate: number) => {
    const validRate = Number.isFinite(rate) ? Math.max(0.25, Math.min(3.0, rate)) : 1.0;
    setPlaybackRate(validRate);
    playbackRateRef.current = validRate;
    audioEngine.setBasePlaybackRate(validRate, audioRef.current || undefined);
    setMediaSessionPositionState({
      duration: durationRef.current,
      playbackRate: validRate,
      position: audioRef.current?.currentTime ?? currentTimeRef.current,
    });
    const book = currentBookRef.current;
    if (book) {
      syncClientRef.current?.sendUpdate({
        bookId: book.id,
        currentTime: audioRef.current?.currentTime ?? currentTimeRef.current,
        duration: durationRef.current,
        playbackRate: validRate,
        isPlaying: isPlayingRef.current,
      });
    }
  }, []);

  const setVol = useCallback((vol: number) => {
    const validVol = Number.isFinite(vol) ? vol : 1.0;
    const clamped = Math.max(0, Math.min(1, validVol));
    setVolume(clamped);
    if (clamped > 0) {
      setIsMuted(false);
      prevVolumeRef.current = clamped;
    } else {
      setIsMuted(true);
    }
    const effectiveVolume = clamped * sleepTimerStateRef.current.volumeMultiplier;
    audioEngine.setVolume(effectiveVolume);
  }, []);

  const toggleMute = useCallback(() => {
    if (isMutedRef.current) {
      const restoreVol = prevVolumeRef.current > 0 ? prevVolumeRef.current : 1.0;
      setVol(restoreVol);
    } else {
      prevVolumeRef.current = volumeRef.current > 0 ? volumeRef.current : 1.0;
      setVol(0);
    }
  }, [setVol]);

  const setEqualizerPreset = useCallback((preset: EqualizerPresetId) => {
    audioEngine.setEqualizerPreset(preset);
    setEqualizerPresetState(preset);
    setEqualizerBandsState(audioEngine.getSettings().equalizerBands);
    setVoiceBoostState(preset === "vocal-clarity");
  }, []);

  const setEqualizerBands = useCallback((bands: EqualizerBands) => {
    audioEngine.setEqualizerBands(bands);
    setEqualizerBandsState(bands);
    setEqualizerPresetState("custom");
    setVoiceBoostState(false);
  }, []);

  const setHeadsetSettings = useCallback((settings: HeadsetRemappingSettings) => {
    setHeadsetSettingsState(settings);
    saveHeadsetSettings(settings);
  }, []);

  const toggleVoiceBoost = useCallback(() => {
    setVoiceBoostState((prev) => {
      const next = !prev;
      setEqualizerPreset(next ? "vocal-clarity" : "flat");
      return next;
    });
  }, [setEqualizerPreset]);

  const toggleLoudnessNormalization = useCallback(() => {
    setLoudnessNormState((prev) => {
      audioEngine.setLoudnessNormalization(!prev);
      return !prev;
    });
  }, []);

  const toggleSmartSpeed = useCallback(() => {
    setSmartSpeedState((prev) => {
      audioEngine.setSmartSpeed(!prev, audioRef.current || undefined);
      return !prev;
    });
  }, []);

  const toggleSmartRewind = useCallback(() => {
    setSmartRewindState((prev) => {
      const next = !prev;
      saveSmartRewindSettings({ enabled: next });
      return next;
    });
  }, []);

  const startSleepTimer = useCallback((preset: SleepTimerPreset) => {
    const chapterEnd = currentChapterRef.current?.endTime ?? durationRef.current;
    sleepTimerRef.current?.start(preset, {
      currentPosition: audioRef.current?.currentTime ?? currentTimeRef.current,
      chapterEnd,
    });
  }, []);

  const extendSleepTimer = useCallback((minutes = 15) => {
    sleepTimerRef.current?.extend(minutes);
  }, []);

  const cancelSleepTimer = useCallback(() => {
    sleepTimerRef.current?.cancel();
  }, []);

  const setShakeToExtend = useCallback((enabled: boolean) => {
    sleepTimerRef.current?.setShakeToExtendEnabled(enabled);
  }, []);

  const togglePiP = useCallback(async (): Promise<boolean> => {
    const book = currentBookRef.current;
    if (!book) return false;
    const active = await pipManager.toggle({
      title: book.title,
      author: book.author,
      chapterTitle: currentChapterRef.current?.title,
      coverUrl: book.coverR2Key ? `/api/covers/${book.id}` : undefined,
      getCurrentTime: () => audioRef.current?.currentTime ?? currentTimeRef.current,
      getDuration: () => durationRef.current,
      getIsPlaying: () => isPlayingRef.current,
    });
    setIsPiPActive(active);
    return active;
  }, []);

  const dismissResumePrompt = useCallback(() => {
    setRemoteResumePrompt(null);
  }, []);

  const resetProgress = useCallback(
    async (bookId: string) => {
      // 1. Clear local progress store
      clearProgress(bookId);

      // 2. If resetting currently active/playing book, reset audio element & position
      if (currentBookRef.current?.id === bookId) {
        setCurrentTime(0);
        currentTimeRef.current = 0;
        if (audioRef.current) {
          audioRef.current.currentTime = 0;
        }
      }

      // 3. Inform sync client with explicit seek to 0 so DO HLC conflict resolution accepts 0
      syncClientRef.current?.sendUpdate({
        bookId,
        currentTime: 0,
        duration: durationRef.current || 0,
        playbackRate: playbackRateRef.current,
        isPlaying: false,
        isExplicitSeek: true,
      });

      // 4. Delete on server sync room
      try {
        await fetch(`/api/sync/progress/${encodeURIComponent(bookId)}`, { method: "DELETE" });
      } catch (err) {
        console.warn("[audioneko] Failed to delete progress on server:", err);
      }

      // 5. Invalidate TanStack queries so UI updates immediately
      queryClient.invalidateQueries({ queryKey: ["syncState"] });
      queryClient.invalidateQueries({ queryKey: ["book", bookId] });
      queryClient.invalidateQueries({ queryKey: ["books"] });
    },
    [queryClient],
  );

  const jumpToRemotePosition = useCallback(() => {
    setRemoteResumePrompt((prompt) => {
      if (prompt) {
        seekTo(prompt.currentTime);
        if (prompt.isPlaying && !isPlayingRef.current) resume();
      }
      return null;
    });
  }, [seekTo, resume]);

  // Global Desktop Keyboard Hotkeys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is inside an input, textarea, select, or contenteditable element
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      // Ignore when modifier keys (Cmd, Ctrl, Alt) are pressed
      if (e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }

      switch (e.code) {
        case "Space": {
          e.preventDefault();
          togglePlay();
          break;
        }
        case "ArrowLeft": {
          e.preventDefault();
          skipBy(-15);
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          skipBy(30);
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          setVol(Math.min(1, volumeRef.current + 0.05));
          break;
        }
        case "ArrowDown": {
          e.preventDefault();
          setVol(Math.max(0, volumeRef.current - 0.05));
          break;
        }
        case "KeyM": {
          e.preventDefault();
          toggleMute();
          break;
        }
        case "BracketLeft": {
          e.preventDefault();
          previousChapter();
          break;
        }
        case "BracketRight": {
          e.preventDefault();
          nextChapter();
          break;
        }
        case "KeyF": {
          e.preventDefault();
          setIsFullPlayerOpen((prev) => !prev);
          break;
        }
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay, skipBy, setVol, toggleMute, previousChapter, nextChapter]);

  return (
    <AudioContext.Provider
      value={{
        currentBook,
        chapters,
        currentChapter,
        isPlaying,
        currentTime,
        duration,
        bufferedTime,
        playbackRate,
        volume,
        isMuted,
        voiceBoost,
        loudnessNormalization,
        smartSpeed,
        isFullPlayerOpen,
        isPiPActive,
        sleepTimerState,
        remoteResumePrompt,
        isSyncConnected,
        dismissResumePrompt,
        jumpToRemotePosition,
        setIsFullPlayerOpen,
        playBook,
        prewarmBook,
        pause,
        resume,
        togglePlay,
        seekTo,
        skipBy,
        nextChapter,
        previousChapter,
        setRate,
        setVol,
        toggleMute,
        toggleVoiceBoost,
        toggleLoudnessNormalization,
        toggleSmartSpeed,
        smartRewind,
        toggleSmartRewind,
        equalizerPreset,
        equalizerBands,
        setEqualizerPreset,
        setEqualizerBands,
        isEqualizerOpen,
        setIsEqualizerOpen,
        headsetSettings,
        setHeadsetSettings,
        isHeadsetSettingsOpen,
        setIsHeadsetSettingsOpen,
        startSleepTimer,
        extendSleepTimer,
        cancelSleepTimer,
        setShakeToExtend,
        togglePiP,
        getSavedProgress: (bookId: string) => getProgress(bookId),
        resetProgress,
      }}
    >
      {children}
      <ResumeBanner
        remoteRecord={remoteResumePrompt}
        bookTitle={currentBook?.title}
        onJump={jumpToRemotePosition}
        onDismiss={dismissResumePrompt}
      />
      <EqualizerModal
        isOpen={isEqualizerOpen}
        onClose={() => setIsEqualizerOpen(false)}
        currentPreset={equalizerPreset}
        currentBands={equalizerBands}
        onApplyPreset={setEqualizerPreset}
        onUpdateBands={setEqualizerBands}
      />
      <HeadsetSettingsModal
        isOpen={isHeadsetSettingsOpen}
        onClose={() => setIsHeadsetSettingsOpen(false)}
        settings={headsetSettings}
        onUpdateSettings={setHeadsetSettings}
      />
    </AudioContext.Provider>
  );
}

export function useAudio() {
  const ctx = useContext(AudioContext);
  if (!ctx) {
    throw new Error("useAudio must be used within an AudioProvider");
  }
  return ctx;
}
