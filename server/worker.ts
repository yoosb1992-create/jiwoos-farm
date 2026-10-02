import handler from "vinext/server/fetch-handler";
import { DIRECT_FAMILY_REALTIME_PATH, handleDirectFamilyRealtime } from "./family/directRealtime";

export { FamilyRoomDurableObject } from "./family/FamilyRoomDurableObject";

export default {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext): Promise<Response> {
    if (new URL(request.url).pathname === DIRECT_FAMILY_REALTIME_PATH) {
      return handleDirectFamilyRealtime(request, env);
    }
    return handler.fetch(request, env, ctx);
  },
};
