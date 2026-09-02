// lib/documentRetention.js
// How long a held document lives. Every path (store, expire, the "Deleted in N days" line, the
// tenant and realtor copy) reads the number from here and nowhere else. Pure, isomorphic.
export const RETENTION_DAYS = 14;
const DAY = 86400000;

// ISO timestamp RETENTION_DAYS after uploadedAt (now when omitted).
export function expiryFor(uploadedAt) {
  const t = uploadedAt ? new Date(uploadedAt).getTime() : Date.now();
  return new Date(t + RETENTION_DAYS * DAY).toISOString();
}

// Whole days until expiresAt, never below 0.
export function daysUntil(expiresAt, now = Date.now()) {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / DAY));
}

// A document kind that shows identity (the checklist's Identity row offers "View ID" for these).
export function isIdKind(kind) {
  return /\bid\b|identification|passport|licen[cs]e|driver/i.test(String(kind || ''));
}
