import type { Book, BookProgressRecord, Chapter } from "@audioneko/shared";
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
import {
  registerMediaSessionHandlers,
  setMediaSessionMetadata,
  setMediaSessionPlaybackState,
  setMediaSessionPositionState,
} from "../lib/media-session";
import { pipManager } from "../lib/pip-visualizer";
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
}

const AudioContext = createContext<AudioContextType | null>(null);

export function AudioProvider({ children }: { children: ReactNode }) {
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

  // Keep refs in sync
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
  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audioEngine.pauseWithRamp(audio);
    setMediaSessionPlaybackState("paused");
    const book = currentBookRef.current;
    const ct = audio.currentTime;
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

  const resume = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audioEngine
      .playWithRamp(audio)
      .then(() => {
        setMediaSessionPlaybackState("playing");
        const book = currentBookRef.current;
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
    audio.preload = "metadata";
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
    };

    const onAudioError = () => {
      const err = audio.error;
      console.warn("[audioneko] Audio error:", err?.code, err?.message);
      setIsPlaying(false);
      isPlayingRef.current = false;
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onAudioError);

    return () => {
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

  // playBook - waits for canplay before seeking/playing
  const playBook = useCallback((book: Book, initialPosition = 0, bookChapters: Chapter[] = []) => {
    const audio = audioRef.current;
    if (!audio) return;

    setCurrentBook(book);
    currentBookRef.current = book;
    setChapters(bookChapters);
    chaptersRef.current = bookChapters;
    setCurrentTime(0);
    currentTimeRef.current = 0;
    setDuration(book.durationSeconds || 0);
    durationRef.current = book.durationSeconds || 0;
    setIsPlaying(false);
    isPlayingRef.current = false;

    audio.src = `/api/stream/${book.id}`;
    audio.playbackRate = playbackRateRef.current;
    audioEngine.setBasePlaybackRate(playbackRateRef.current, audio);

    const onCanPlay = () => {
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("loadedmetadata", onCanPlay);

      if (initialPosition > 0 && Number.isFinite(initialPosition)) {
        audio.currentTime = initialPosition;
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
          });
          lastListenTickRef.current = {
            time: Date.now(),
            position: audio.currentTime,
            bookId: book.id,
          };
        })
        .catch((err) => console.warn("Auto-playback deferred:", err));
    };

    audio.addEventListener("canplay", onCanPlay, { once: true });
    audio.addEventListener("loadedmetadata", onCanPlay, { once: true });
    audio.load();

    setMediaSessionMetadata({
      title: book.title,
      artist: book.author,
      album: book.seriesIndex ? `Series #${book.seriesIndex}` : "audioneko",
      artworkUrl: book.coverR2Key ? `/api/covers/${book.id}` : undefined,
    });
  }, []);

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
