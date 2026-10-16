import type { Member, World } from "./world.js";

export interface Shipment { id: string; itemId: string; quantity: number; unitPrice: number; day: number }
export interface ShippingReport { day: number; lines: Shipment[]; total: number }
export interface ShippingLedger { pending: Shipment[]; reports: ShippingReport[]; settledThrough: number }
export const shippingLedger = (member: Member): ShippingLedger =>
  member.shipping ??= { pending: [], reports: [], settledThrough: 0 };

/** Called inside the same world + receipt transaction as the day transition.
 * The ledger belongs to the member, never the physical crate or its position. */
export function settleShipping(world: World, shippingDay: number): void {
  for (const member of Object.values(world.members)) {
    if (!member.shipping || member.shipping.settledThrough >= shippingDay) continue;
    const ledger = member.shipping;
    const lines = ledger.pending.filter(line => line.day <= shippingDay);
    const total = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
    if (!Number.isSafeInteger(total) || !Number.isSafeInteger(member.money + total))
      throw new Error("정산 금액 한도를 확인해 주세요");
    member.money += total;
    ledger.pending = ledger.pending.filter(line => line.day > shippingDay);
    ledger.settledThrough = shippingDay;
    if (lines.length) ledger.reports = [...ledger.reports, { day: shippingDay + 1, lines, total }].slice(-30);
  }
}
