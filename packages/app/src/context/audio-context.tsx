import type { Book, Chapter } from "@audioneko/shared";
import { type ReactNode, createContext, useContext, useEffect, useRef, useState } from "react";
import { audioEngine } from "../lib/audio-engine";

export interface AudioContextType {
  currentBook: Book | null;
  currentChapter: Chapter | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  volume: number;
  voiceBoost: boolean;
  loudnessNormalization: boolean;
  smartSpeed: boolean;
  playBook: (book: Book, initialPosition?: number) => void;
  pause: () => void;
  resume: () => void;
  togglePlay: () => void;
  seekTo: (seconds: number) => void;
  skipBy: (seconds: number) => void;
  setRate: (rate: number) => void;
  setVol: (vol: number) => void;
  toggleVoiceBoost: () => void;
  toggleLoudnessNormalization: () => void;
  toggleSmartSpeed: () => void;
}

const AudioContext = createContext<AudioContextType | null>(null);

export function AudioProvider({ children }: { children: ReactNode }) {
  const [currentBook, setCurrentBook] = useState<Book | null>(null);
  const [currentChapter] = useState<Chapter | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [volume, setVolume] = useState(1.0);

  // DSP States
  const [voiceBoost, setVoiceBoostState] = useState(false);
  const [loudnessNormalization, setLoudnessNormState] = useState(true);
  const [smartSpeed, setSmartSpeedState] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audio.crossOrigin = "anonymous";
    audioRef.current = audio;

    // Attach Web Audio API DSP pipeline
    audioEngine.init(audio).catch(console.warn);

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const onDurationChange = () => {
      if (Number.isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audioRef.current = null;
    };
  }, []);

  const playBook = (book: Book, initialPosition = 0) => {
    setCurrentBook(book);
    setDuration(book.durationSeconds || 0);

    if (audioRef.current) {
      audioRef.current.src = `/api/stream/${book.id}`;
      audioRef.current.currentTime = initialPosition;
      audioRef.current.playbackRate = playbackRate;
      audioEngine.setBasePlaybackRate(playbackRate, audioRef.current);
      audioEngine
        .playWithRamp(audioRef.current)
        .then(() => setIsPlaying(true))
        .catch((err) => console.warn("Auto-playback deferred:", err));
    }
  };

  const pause = () => {
    if (audioRef.current) {
      audioEngine.pauseWithRamp(audioRef.current);
    }
    setIsPlaying(false);
  };

  const resume = () => {
    if (audioRef.current) {
      audioEngine
        .playWithRamp(audioRef.current)
        .then(() => setIsPlaying(true))
        .catch(console.warn);
    }
  };

  const togglePlay = () => {
    if (isPlaying) {
      pause();
    } else {
      resume();
    }
  };

  const seekTo = (seconds: number) => {
    if (audioRef.current) {
      const clamped = Math.max(0, Math.min(seconds, duration || seconds));
      audioRef.current.currentTime = clamped;
      setCurrentTime(clamped);
    }
  };

  const skipBy = (seconds: number) => {
    if (audioRef.current) {
      seekTo(audioRef.current.currentTime + seconds);
    }
  };

  const setRate = (rate: number) => {
    setPlaybackRate(rate);
    audioEngine.setBasePlaybackRate(rate, audioRef.current || undefined);
  };

  const setVol = (vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    setVolume(clamped);
    audioEngine.setVolume(clamped);
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

  return (
    <AudioContext.Provider
      value={{
        currentBook,
        currentChapter,
        isPlaying,
        currentTime,
        duration,
        playbackRate,
        volume,
        voiceBoost,
        loudnessNormalization,
        smartSpeed,
        playBook,
        pause,
        resume,
        togglePlay,
        seekTo,
        skipBy,
        setRate,
        setVol,
        toggleVoiceBoost,
        toggleLoudnessNormalization,
        toggleSmartSpeed,
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
