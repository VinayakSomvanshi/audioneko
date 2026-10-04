import type { Book, Chapter } from "@audioneko/shared";
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
import { audioEngine } from "../lib/audio-engine";
import {
  registerMediaSessionHandlers,
  setMediaSessionMetadata,
  setMediaSessionPlaybackState,
  setMediaSessionPositionState,
} from "../lib/media-session";
import { pipManager } from "../lib/pip-visualizer";
import { SleepTimer, type SleepTimerPreset, type SleepTimerState } from "../lib/sleep-timer";

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

  // DSP States
  const [voiceBoost, setVoiceBoostState] = useState(false);
  const [loudnessNormalization, setLoudnessNormState] = useState(true);
  const [smartSpeed, setSmartSpeedState] = useState(false);

  // Sleep Timer instance
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

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Determine current chapter from currentTime
  const currentChapter = useMemo(() => {
    if (!chapters || chapters.length === 0) return null;
    return (
      chapters.find(
        (c) => currentTime >= (c.startTime ?? 0) && currentTime < (c.endTime ?? duration),
      ) ??
      chapters[0] ??
      null
    );
  }, [chapters, currentTime, duration]);

  const pause = useCallback(() => {
    if (audioRef.current) {
      audioEngine.pauseWithRamp(audioRef.current);
    }
    setIsPlaying(false);
    setMediaSessionPlaybackState("paused");
  }, []);

  const resume = useCallback(() => {
    if (audioRef.current) {
      audioEngine
        .playWithRamp(audioRef.current)
        .then(() => {
          setIsPlaying(true);
          setMediaSessionPlaybackState("playing");
        })
        .catch(console.warn);
    }
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      resume();
    }
  }, [isPlaying, pause, resume]);

  const seekTo = useCallback(
    (seconds: number) => {
      if (audioRef.current) {
        const clamped = Math.max(0, Math.min(seconds, duration || seconds));
        audioRef.current.currentTime = clamped;
        setCurrentTime(clamped);
        setMediaSessionPositionState({
          duration,
          playbackRate,
          position: clamped,
        });
      }
    },
    [duration, playbackRate],
  );

  const skipBy = useCallback(
    (seconds: number) => {
      if (audioRef.current) {
        seekTo(audioRef.current.currentTime + seconds);
      }
    },
    [seekTo],
  );

  const nextChapter = useCallback(() => {
    if (!chapters || chapters.length === 0) {
      skipBy(30);
      return;
    }
    const idx = currentChapter ? chapters.findIndex((c) => c.id === currentChapter.id) : -1;
    if (idx >= 0 && idx < chapters.length - 1) {
      seekTo(chapters[idx + 1]!.startTime);
    } else {
      skipBy(30);
    }
  }, [chapters, currentChapter, seekTo, skipBy]);

  const previousChapter = useCallback(() => {
    if (!chapters || chapters.length === 0) {
      skipBy(-15);
      return;
    }
    const idx = currentChapter ? chapters.findIndex((c) => c.id === currentChapter.id) : -1;
    if (idx > 0 && currentTime - (currentChapter?.startTime || 0) < 3) {
      seekTo(chapters[idx - 1]!.startTime);
    } else if (currentChapter) {
      seekTo(currentChapter.startTime);
    } else {
      skipBy(-15);
    }
  }, [chapters, currentChapter, currentTime, seekTo, skipBy]);

  // Initialize Audio & Sleep Timer
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audio.crossOrigin = "anonymous";
    audioRef.current = audio;

    audioEngine.init(audio).catch(console.warn);

    // Sleep Timer setup
    const timer = new SleepTimer({
      onExpire: () => {
        pause();
      },
    });
    sleepTimerRef.current = timer;
    const unsubTimer = timer.subscribe(setSleepTimerState);

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      setMediaSessionPositionState({
        duration: audio.duration || 0,
        playbackRate: audio.playbackRate || 1.0,
        position: audio.currentTime,
      });
    };

    const onDurationChange = () => {
      if (Number.isFinite(audio.duration)) {
        setDuration(audio.duration);
        setMediaSessionPositionState({
          duration: audio.duration,
          playbackRate: audio.playbackRate || 1.0,
          position: audio.currentTime,
        });
      }
    };

    const onPlay = () => {
      setIsPlaying(true);
      setMediaSessionPlaybackState("playing");
    };

    const onPause = () => {
      setIsPlaying(false);
      setMediaSessionPlaybackState("paused");
    };

    const onEnded = () => {
      setIsPlaying(false);
      setMediaSessionPlaybackState("none");
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);

    return () => {
      unsubTimer();
      timer.cancel();
      audio.pause();
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audioRef.current = null;
    };
  }, [pause]);

  // Bind Hardware & OS Media Session Action Handlers
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

  // Update Media Session Metadata when Book or Chapter changes
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

  // Adjust volume when Sleep Timer is fading out
  useEffect(() => {
    const effectiveVolume = volume * sleepTimerState.volumeMultiplier;
    audioEngine.setVolume(effectiveVolume);
  }, [volume, sleepTimerState.volumeMultiplier]);

  const playBook = (book: Book, initialPosition = 0, bookChapters: Chapter[] = []) => {
    setCurrentBook(book);
    setChapters(bookChapters);
    setDuration(book.durationSeconds || 0);

    if (audioRef.current) {
      audioRef.current.src = `/api/stream/${book.id}`;
      audioRef.current.currentTime = initialPosition;
      audioRef.current.playbackRate = playbackRate;
      audioEngine.setBasePlaybackRate(playbackRate, audioRef.current);
      audioEngine
        .playWithRamp(audioRef.current)
        .then(() => {
          setIsPlaying(true);
          setMediaSessionPlaybackState("playing");
        })
        .catch((err) => console.warn("Auto-playback deferred:", err));
    }
  };

  const setRate = (rate: number) => {
    setPlaybackRate(rate);
    audioEngine.setBasePlaybackRate(rate, audioRef.current || undefined);
    setMediaSessionPositionState({
      duration,
      playbackRate: rate,
      position: currentTime,
    });
  };

  const setVol = (vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    setVolume(clamped);
    const effectiveVolume = clamped * sleepTimerState.volumeMultiplier;
    audioEngine.setVolume(effectiveVolume);
  };

  const toggleVoiceBoost = () => {
    const nextVal = !voiceBoost;
    setVoiceBoostState(nextVal);
    audioEngine.setVoiceBoost(nextVal);
  };

  const toggleLoudnessNormalization = () => {
    const nextVal = !loudnessNormalization;
    setLoudnessNormState(nextVal);
    audioEngine.setLoudnessNormalization(nextVal);
  };

  const toggleSmartSpeed = () => {
    const nextVal = !smartSpeed;
    setSmartSpeedState(nextVal);
    audioEngine.setSmartSpeed(nextVal, audioRef.current || undefined);
  };

  const startSleepTimer = (preset: SleepTimerPreset) => {
    const chapterEnd = currentChapter?.endTime ?? duration;
    sleepTimerRef.current?.start(preset, {
      currentPosition: currentTime,
      chapterEnd,
    });
  };

  const extendSleepTimer = (minutes = 15) => {
    sleepTimerRef.current?.extend(minutes);
  };

  const cancelSleepTimer = () => {
    sleepTimerRef.current?.cancel();
  };

  const setShakeToExtend = (enabled: boolean) => {
    sleepTimerRef.current?.setShakeToExtendEnabled(enabled);
  };

  const togglePiP = async (): Promise<boolean> => {
    if (!currentBook) return false;
    const active = await pipManager.toggle({
      title: currentBook.title,
      author: currentBook.author,
      chapterTitle: currentChapter?.title,
      coverUrl: currentBook.coverR2Key ? `/api/covers/${currentBook.id}` : undefined,
      getCurrentTime: () => currentTime,
      getDuration: () => duration,
      getIsPlaying: () => isPlaying,
    });
    setIsPiPActive(active);
    return active;
  };

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
