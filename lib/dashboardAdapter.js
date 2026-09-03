// lib/dashboardAdapter.js
// The dashboard's ONE seam between UI and data. Every dashboard component and view reaches
// the network/database through `useAdapter()` instead of calling fetch()/Supabase directly.
//
// The adapter is TRANSPORT-level on purpose: `fetch(url, init)` with the same Response-like
// contract as window.fetch, and `supabase()` returning the same client the code already used.
// That way the real pages keep their exact requests, parsing and error handling (the real
// adapter IS window.fetch + the existing browser client), and a demo can route the very same
// calls into an in-memory fixture without the UI knowing.
//
// DASHBOARD_ROUTES is the contract: every route the dashboard UI can hit. A demo adapter must
// cover all of them (assertAdapterCoverage) — a missed one would throw for every prospect who
// clicked it, and no lint rule catches that.
import { createContext, useContext } from 'react';
import { getSupabaseBrowserClient } from './supabase/client';

export const DASHBOARD_ROUTES = [
  'GET /api/notifications', 'POST /api/notifications',
  'GET /api/referrals/inbox', 'GET /api/referrals/list', 'POST /api/referrals/assign', 'POST /api/referrals/create',
  'GET /api/listings/applicants', 'POST /api/listings/invite', 'POST /api/listings/add-applicant',
  'GET /api/listings/report-pdf', 'POST /api/listings/report-text', 'POST /api/listings/send-report',
  'GET /api/applicants/doc-request-status', 'POST /api/applicants/request-documents',
  'POST /api/applicants/analyze-documents', 'POST /api/applicants/insight', 'POST /api/applicants/manage-analysis',
  'POST /api/applicants/verify-confirm-pdf', 'POST /api/applicants/verify-confirm-text', 'POST /api/applicants/confirm',
  'POST /api/documents/open', 'POST /api/documents/delete',
  'GET /api/assistant/signals', 'GET /api/assistant/dismiss', 'POST /api/assistant/dismiss', 'GET /api/events', 'POST /api/events/read', 'POST /api/events/record',
];
// Supabase tables the dashboard writes/reads from the browser (RLS-scoped in the real app).
export const DASHBOARD_TABLES = ['listings', 'listing_applicants'];

// Where the dashboard navigates. The demo keeps these inside its own route.
export const realPaths = { home: '/landlord', listing: (id) => `/landlord/${id}`, profile: '/profile', signin: '/signin' };

export const realAdapter = {
  kind: 'real',
  fetch: (url, init) => fetch(url, init),
  supabase: () => getSupabaseBrowserClient(),
  paths: realPaths,
};

export function assertAdapterCoverage(adapter) {
  const missing = [];
  if (typeof adapter?.fetch !== 'function') missing.push('fetch()');
  if (typeof adapter?.supabase !== 'function') missing.push('supabase()');
  if (!adapter?.paths?.listing) missing.push('paths');
  if (adapter?.kind !== 'real') {
    const routes = adapter?.routes ? Object.keys(adapter.routes) : [];
    for (const r of DASHBOARD_ROUTES) if (!routes.includes(r)) missing.push(r);
    const tables = adapter?.tables ? Object.keys(adapter.tables) : [];
    for (const t of DASHBOARD_TABLES) if (!tables.includes(t)) missing.push(`table:${t}`);
  }
  if (missing.length) throw new Error(`Dashboard adapter "${adapter?.kind || '?'}" is missing: ${missing.join(', ')}`);
  return true;
}

export const DashboardAdapterContext = createContext(realAdapter);
export const useAdapter = () => useContext(DashboardAdapterContext);
