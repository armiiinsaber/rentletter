// lib/inviteRent.js  PURE. The rent an application arrived under: the invite record's listing
// rent (linvite:{token}.unit.monthlyRent, written by pages/api/listings/invite.js), or null when
// the application did not come through an invite link. Nothing is parsed out of free text.
export function rentFromInvite(record) {
  const n = parseInt(String(record?.unit?.monthlyRent ?? '').replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}
