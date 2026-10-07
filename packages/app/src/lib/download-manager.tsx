import type { Book, Chapter } from "@audioneko/shared";
import type React from "react";
import { createContext, useContext, useEffect, useState } from "react";
import {
  type OfflineBookMeta,
  downloadBookToOpfs,
  getPartialDownloadBytes,
  isBookDownloaded,
  isOpfsSupported,
  removePartialDownload,
} from "./opfs";

export type DownloadTaskStatus = "queued" | "downloading" | "paused" | "completed" | "error";

export interface DownloadTask {
  bookId: string;
  title: string;
  author: string;
  coverR2Key?: string | null;
  coverUrl?: string | null;
  durationSeconds: number;
  format?: "m4b" | "mp3" | "m4a" | "flac" | "opus";
  mimeType?: string;
  chapters?: Chapter[];
  fileSizeBytes: number;

  status: DownloadTaskStatus;
  downloadedBytes: number;
  totalBytes: number;
  progressPercent: number;
  speedBytesPerSec?: number;
  estimatedTimeSeconds?: number;
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_QUEUE_KEY = "audioneko_download_queue";
const MAX_CONCURRENT_DOWNLOADS = 2;

class DownloadManager {
  private tasks: Map<string, DownloadTask> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();
  private listeners: Set<() => void> = new Set();
  private isProcessing = false;
  private isInitialized = false;

  constructor() {
    this.init();
  }

  private async init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    if (typeof window === "undefined") return;

    // Load persisted queue from localStorage
    try {
      const raw = localStorage.getItem(STORAGE_QUEUE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DownloadTask[];
        for (const item of parsed) {
          // Verify if already fully downloaded
          const alreadyDone = await isBookDownloaded(item.bookId);
          if (alreadyDone) {
            continue;
          }

          // Check partial bytes already on disk
          const existingBytes = await getPartialDownloadBytes(item.bookId);
          const downloadedBytes = Math.max(item.downloadedBytes || 0, existingBytes);
          const totalBytes = item.totalBytes || item.fileSizeBytes || 0;
          const progressPercent =
            totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : 0;

          // If was downloading when page refreshed, set to queued so it continues automatically!
          const status: DownloadTaskStatus =
            item.status === "paused" ? "paused" : item.status === "error" ? "error" : "queued";

          this.tasks.set(item.bookId, {
            ...item,
            downloadedBytes,
            progressPercent,
            status,
            speedBytesPerSec: undefined,
            estimatedTimeSeconds: undefined,
          });
        }
      }
    } catch (err) {
      console.warn("Failed to restore download queue from storage:", err);
    }

    this.notify();
    this.pumpQueue();
  }

  private persist() {
    if (typeof window === "undefined") return;
    try {
      const list = Array.from(this.tasks.values()).filter((t) => t.status !== "completed");
      localStorage.setItem(STORAGE_QUEUE_KEY, JSON.stringify(list));
    } catch {
      // Ignore quota errors
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.persist();
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error("Error in download manager listener:", err);
      }
    }
  }

  public getTasks(): DownloadTask[] {
    return Array.from(this.tasks.values());
  }

  public getTask(bookId: string): DownloadTask | undefined {
    return this.tasks.get(bookId);
  }

  public getActiveTasks(): DownloadTask[] {
    return Array.from(this.tasks.values()).filter(
      (t) => t.status === "downloading" || t.status === "queued" || t.status === "paused",
    );
  }

  public getActiveCount(): number {
    return this.getActiveTasks().length;
  }

  public async enqueue(meta: OfflineBookMeta): Promise<void> {
    if (!isOpfsSupported()) {
      throw new Error("Origin Private File System (OPFS) is not supported on this browser.");
    }

    const existing = this.tasks.get(meta.bookId);
    if (existing) {
      if (existing.status === "paused" || existing.status === "error") {
        this.resume(meta.bookId);
      }
      return;
    }

    // Check if already on disk
    const downloaded = await isBookDownloaded(meta.bookId);
    if (downloaded) {
      return;
    }

    const partialBytes = await getPartialDownloadBytes(meta.bookId);

    const task: DownloadTask = {
      bookId: meta.bookId,
      title: meta.title,
      author: meta.author,
      coverR2Key: meta.coverR2Key,
      coverUrl: meta.coverUrl,
      durationSeconds: meta.durationSeconds,
      format: meta.format,
      mimeType: meta.mimeType,
      chapters: meta.chapters,
      fileSizeBytes: meta.fileSizeBytes || 0,
      status: "queued",
      downloadedBytes: partialBytes,
      totalBytes: meta.fileSizeBytes || 0,
      progressPercent:
        meta.fileSizeBytes > 0
          ? Math.min(100, Math.round((partialBytes / meta.fileSizeBytes) * 100))
          : 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.tasks.set(meta.bookId, task);
    this.notify();
    this.pumpQueue();
  }

  public pause(bookId: string): void {
    const task = this.tasks.get(bookId);
    if (!task) return;

    if (task.status === "downloading") {
      const controller = this.abortControllers.get(bookId);
      if (controller) {
        controller.abort();
        this.abortControllers.delete(bookId);
      }
    }

    task.status = "paused";
    task.speedBytesPerSec = undefined;
    task.estimatedTimeSeconds = undefined;
    task.updatedAt = Date.now();
    this.notify();
    this.pumpQueue();
  }

  public resume(bookId: string): void {
    const task = this.tasks.get(bookId);
    if (!task) return;

    task.status = "queued";
    task.errorMessage = undefined;
    task.updatedAt = Date.now();
    this.notify();
    this.pumpQueue();
  }

  public async cancel(bookId: string): Promise<void> {
    const task = this.tasks.get(bookId);
    if (task && task.status === "downloading") {
      const controller = this.abortControllers.get(bookId);
      if (controller) {
        controller.abort();
        this.abortControllers.delete(bookId);
      }
    }

    this.tasks.delete(bookId);
    await removePartialDownload(bookId);
    this.notify();
    this.pumpQueue();
  }

  public pauseAll(): void {
    for (const task of this.tasks.values()) {
      if (task.status === "downloading" || task.status === "queued") {
        this.pause(task.bookId);
      }
    }
  }

  public resumeAll(): void {
    for (const task of this.tasks.values()) {
      if (task.status === "paused" || task.status === "error") {
        task.status = "queued";
      }
    }
    this.notify();
    this.pumpQueue();
  }

  public async cancelAll(): Promise<void> {
    const ids = Array.from(this.tasks.keys());
    for (const id of ids) {
      await this.cancel(id);
    }
  }

  private async pumpQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const activeDownloadingCount = Array.from(this.tasks.values()).filter(
        (t) => t.status === "downloading",
      ).length;

      const availableSlots = MAX_CONCURRENT_DOWNLOADS - activeDownloadingCount;
      if (availableSlots <= 0) return;

      const queuedTasks = Array.from(this.tasks.values()).filter((t) => t.status === "queued");

      const toStart = queuedTasks.slice(0, availableSlots);
      for (const task of toStart) {
        this.runTask(task);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async runTask(task: DownloadTask): Promise<void> {
    task.status = "downloading";
    task.updatedAt = Date.now();
    const controller = new AbortController();
    this.abortControllers.set(task.bookId, controller);
    this.notify();

    const offlineMeta: OfflineBookMeta = {
      bookId: task.bookId,
      title: task.title,
      author: task.author,
      durationSeconds: task.durationSeconds,
      coverR2Key: task.coverR2Key,
      coverUrl: task.coverUrl,
      fileSizeBytes: task.totalBytes || task.fileSizeBytes,
      downloadedAt: Date.now(),
      format: task.format,
      mimeType: task.mimeType,
      chapters: task.chapters,
    };

    try {
      await downloadBookToOpfs(offlineMeta, {
        signal: controller.signal,
        onProgress: (p) => {
          const current = this.tasks.get(task.bookId);
          if (!current || current.status === "paused") return;

          current.downloadedBytes = p.downloadedBytes;
          current.totalBytes = p.totalBytes;
          current.progressPercent = p.progressPercent;
          current.speedBytesPerSec = p.speedBytesPerSec;
          current.estimatedTimeSeconds = p.estimatedTimeSeconds;
          current.updatedAt = Date.now();
          this.notify();
        },
      });

      // Complete
      task.status = "completed";
      task.downloadedBytes = task.totalBytes;
      task.progressPercent = 100;
      task.speedBytesPerSec = undefined;
      task.estimatedTimeSeconds = undefined;
      task.updatedAt = Date.now();
      this.abortControllers.delete(task.bookId);

      // Remove completed from active queue after brief delay
      setTimeout(() => {
        this.tasks.delete(task.bookId);
        this.notify();
      }, 1500);

      this.notify();
    } catch (err: unknown) {
      this.abortControllers.delete(task.bookId);
      const isAbort =
        err instanceof Error && (err.name === "AbortError" || err.message.includes("aborted"));

      if (isAbort) {
        task.status = "paused";
        task.speedBytesPerSec = undefined;
        task.estimatedTimeSeconds = undefined;
      } else {
        task.status = "error";
        task.errorMessage = err instanceof Error ? err.message : "Download failed";
      }
      task.updatedAt = Date.now();
      this.notify();
    } finally {
      this.pumpQueue();
    }
  }
}

export const downloadManager = new DownloadManager();

export interface DownloadContextType {
  tasks: DownloadTask[];
  activeTasks: DownloadTask[];
  activeCount: number;
  getTask: (bookId: string) => DownloadTask | undefined;
  enqueue: (meta: OfflineBookMeta) => Promise<void>;
  enqueueBook: (book: Book) => Promise<void>;
  pause: (bookId: string) => void;
  resume: (bookId: string) => void;
  cancel: (bookId: string) => Promise<void>;
  pauseAll: () => void;
  resumeAll: () => void;
  cancelAll: () => Promise<void>;
}

const DownloadContext = createContext<DownloadContextType | null>(null);

export const DownloadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tasks, setTasks] = useState<DownloadTask[]>([]);

  useEffect(() => {
    setTasks(downloadManager.getTasks());
    const unsubscribe = downloadManager.subscribe(() => {
      setTasks(downloadManager.getTasks());
    });
    return unsubscribe;
  }, []);

  const activeTasks = tasks.filter((t) => t.status !== "completed");
  const activeCount = activeTasks.length;

  const enqueue = async (meta: OfflineBookMeta) => {
    await downloadManager.enqueue(meta);
  };

  const enqueueBook = async (book: Book) => {
    const meta: OfflineBookMeta = {
      bookId: book.id,
      title: book.title,
      author: book.author,
      durationSeconds: book.durationSeconds,
      coverR2Key: book.coverR2Key,
      coverUrl: book.coverR2Key ? `/api/covers/${book.id}` : undefined,
      fileSizeBytes: book.fileSizeBytes,
      downloadedAt: Date.now(),
      format: book.format,
    };
    await downloadManager.enqueue(meta);
  };

  const pause = (bookId: string) => downloadManager.pause(bookId);
  const resume = (bookId: string) => downloadManager.resume(bookId);
  const cancel = async (bookId: string) => await downloadManager.cancel(bookId);
  const pauseAll = () => downloadManager.pauseAll();
  const resumeAll = () => downloadManager.resumeAll();
  const cancelAll = async () => await downloadManager.cancelAll();
  const getTask = (bookId: string) => downloadManager.getTask(bookId);

  return (
    <DownloadContext.Provider
      value={{
        tasks,
        activeTasks,
        activeCount,
        getTask,
        enqueue,
        enqueueBook,
        pause,
        resume,
        cancel,
        pauseAll,
        resumeAll,
        cancelAll,
      }}
    >
      {children}
    </DownloadContext.Provider>
  );
};

export function useDownloads(): DownloadContextType {
  const ctx = useContext(DownloadContext);
  if (!ctx) {
    throw new Error("useDownloads must be used within a DownloadProvider");
  }
  return ctx;
}
