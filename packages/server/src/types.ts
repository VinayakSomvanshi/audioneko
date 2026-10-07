export interface ShelfQueueMessage {
  type: "precache" | "evict";
  bookId?: string;
  requiredBytes?: number;
  timestamp: number;
}

export interface Env {
  DB: D1Database;
  R2?: R2Bucket;
  KV: KVNamespace;
  SYNC_ROOM: DurableObjectNamespace;
  LISTEN_ALONG_ROOM?: DurableObjectNamespace;
  ASSETS: Fetcher;
  BETTER_AUTH_SECRET: string;
  APP_URL: string;
  GOOGLE_SA_KEY?: string;
  GOOGLE_DRIVE_FOLDER_ID?: string;
  STREAM_SIGNING_SECRET?: string;
  SHELF_QUEUE?: Queue<ShelfQueueMessage>;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  BREVO_API_KEY?: string;
  BREVO_SENDER_EMAIL?: string;
  POSTMARK_API_KEY?: string;
}
