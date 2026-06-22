// lib/validation.js
// Shared client-side validators. isValidEmail mirrors the regex used across the
// app (was inline in landlord.js): trim + standard email shape.
export const isValidEmail = (e) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());
