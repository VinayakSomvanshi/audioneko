export interface Env {
  DB: D1Database;
  R2: R2Bucket;
  KV: KVNamespace;
  SYNC_ROOM: DurableObjectNamespace;
  ASSETS: Fetcher;
  BETTER_AUTH_SECRET: string;
  APP_URL: string;
  GOOGLE_SA_KEY?: string;
  GOOGLE_DRIVE_FOLDER_ID?: string;
  STREAM_SIGNING_SECRET?: string;
}
