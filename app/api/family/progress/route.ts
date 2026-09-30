import { publishedWorldMaps } from "@/server/world/preset";
import { familyBody, familyRequest } from "@/server/family/http";
import { FamilyProgress } from "@/server/family/progress";
export const dynamic="force-dynamic";
export const GET=(request:Request)=>familyRequest(request,async(db,userId)=>new FamilyProgress(db,undefined,await publishedWorldMaps(db)).readProgress(userId,new URL(request.url).searchParams.get("roomId")??""));
export const POST=(request:Request)=>familyRequest(request,async(db,userId)=>{const body=await familyBody(request);return new FamilyProgress(db,undefined,await publishedWorldMaps(db)).interact(userId,String(body.roomId??""),body.expectedRevision,body.action,body.pose);});
