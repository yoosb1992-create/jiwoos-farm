export interface FamilyRoom { id: string; name: string; inviteCode: string; playerId: string; nickname: string }
export interface FamilyMember { playerId: string; nickname: string }
export interface FamilyRoomDetail { room: FamilyRoom; members: FamilyMember[] }
