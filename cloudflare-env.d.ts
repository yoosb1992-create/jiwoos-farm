declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    FAMILY_ROOM: DurableObjectNamespace;
  }
}
