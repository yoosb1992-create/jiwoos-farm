declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    FAMILY_ROOM: DurableObjectNamespace;
    FAMILY_REALTIME_URL?: string;
    FAMILY_REALTIME_SECRET?: string;
  }
}
