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
import { ResumeBanner } from "../components/player/ResumeBanner";
import { audioEngine } from "../lib/audio-engine";
import { useCurrentUser } from "../lib/auth-client";
import {
  registerMediaSessionHandlers,
  setMediaSessionMetadata,
  setMediaSessionPlaybackState,
  setMediaSessionPositionState,
} from "../lib/media-session";
import { pipManager } from "../lib/pip-visualizer";
import { clearProgress, getProgress, progressTracker, setProgress } from "../lib/progress-store";
import { SleepTimer, type SleepTimerPreset, type SleepTimerState } from "../lib/sleep-timer";
import { SyncClient } from "../lib/sync-client";

export interface AudioContextType {
  currentBook: Book | null;
  chapters: Chapter[];
  currentChapter: Chapter | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  volume: number;
  voiceBoost: boolean;
  loudnessNormalization: boolean;
  smartSpeed: boolean;
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
  toggleVoiceBoost: () => void;
  toggleLoudnessNormalization: () => void;
  toggleSmartSpeed: () => void;
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
  const [isFullPlayerOpen, setIsFullPlayerOpen] = useState(false);
  const [isPiPActive, setIsPiPActive] = useState(false);

  const [remoteResumePrompt, setRemoteResumePrompt] = useState<BookProgressRecord | null>(null);
  const [isSyncConnected, setIsSyncConnected] = useState(false);
  const syncClientRef = useRef<SyncClient | null>(null);

  const [voiceBoost, setVoiceBoostState] = useState(false);
  const [loudnessNormalization, setLoudnessNormState] = useState(true);
  const [smartSpeed, setSmartSpeedState] = useState(false);

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

  const userRef = useRef(user);
  const isUserLoadingRef = useRef(isUserLoading);

  // Keep refs in sync
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
  // Flush to localStorage on explicit pause too
  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
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
    const audio = audioRef.current;
    if (!audio) return;
    const dur = durationRef.current || audio.duration || 0;
    const clamped = Math.max(0, Math.min(seconds, dur || seconds));
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
      const audio = audioRef.current;
      if (!audio) return;
      seekTo(audio.currentTime + seconds);
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

    const onTimeUpdate = () => {
      const t = audio.currentTime;
      setCurrentTime(t);
      currentTimeRef.current = t;
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
      setMediaSessionPlaybackState("playing");
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
      if (book) clearProgress(book.id);
    };

    const onAudioError = () => {
      const err = audio.error;
      console.warn("[audioneko] Audio error:", err?.code, err?.message);
      setIsPlaying(false);
      isPlayingRef.current = false;
      if (typeof window !== "undefined") {
        fetch("/api/admin/me")
          .then((res) => {
            if (!res.ok) {
              window.location.href = "/login";
            }
          })
          .catch(() => {});
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

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onAudioError);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      unsubTimer();
      timer.cancel();
      audio.pause();
      audio.src = "";
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("play", onPlay);
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
      if (currentBookRef.current?.id === record.bookId) {
        const timeDiff = Math.abs(record.currentTime - currentTimeRef.current);
        if (timeDiff > 5) setRemoteResumePrompt(record);
      }
    });
    client.connect();
    return () => {
      unsubConn();
      unsubRemote();
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

  // Media session handlers
  useEffect(() => {
    const cleanup = registerMediaSessionHandlers({
      onPlay: resume,
      onPause: pause,
      onStop: pause,
      onSeekBackward: (offset) => skipBy(-offset),
      onSeekForward: (offset) => skipBy(offset),
      onSeekTo: (pos) => seekTo(pos),
      onPreviousTrack: previousChapter,
      onNextTrack: nextChapter,
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
    },
    [],
  );
  playBookRef.current = playBook;

  const setRate = useCallback((rate: number) => {
    setPlaybackRate(rate);
    playbackRateRef.current = rate;
    audioEngine.setBasePlaybackRate(rate, audioRef.current || undefined);
    setMediaSessionPositionState({
      duration: durationRef.current,
      playbackRate: rate,
      position: audioRef.current?.currentTime ?? currentTimeRef.current,
    });
    const book = currentBookRef.current;
    if (book) {
      syncClientRef.current?.sendUpdate({
        bookId: book.id,
        currentTime: audioRef.current?.currentTime ?? currentTimeRef.current,
        duration: durationRef.current,
        playbackRate: rate,
        isPlaying: isPlayingRef.current,
      });
    }
  }, []);

  const setVol = useCallback((vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    setVolume(clamped);
    const effectiveVolume = clamped * sleepTimerStateRef.current.volumeMultiplier;
    audioEngine.setVolume(effectiveVolume);
  }, []);

  const toggleVoiceBoost = useCallback(() => {
    setVoiceBoostState((prev) => {
      audioEngine.setVoiceBoost(!prev);
      return !prev;
    });
  }, []);

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

  return (
    <AudioContext.Provider
      value={{
        currentBook,
        chapters,
        currentChapter,
        isPlaying,
        currentTime,
        duration,
        playbackRate,
        volume,
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
        toggleVoiceBoost,
        toggleLoudnessNormalization,
        toggleSmartSpeed,
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
