// lib/demoAdapter.js — CLIENT-ONLY. The /demo/dashboard adapter: the SAME dashboard components
// the realtor uses, fed by lib/demoFixture.js through an in-memory store (persisted to
// sessionStorage so home ↔ listing navigation keeps your sandbox; "Reset" clears it).
//
// WRITE INTERCEPTIONS — nothing here reaches a real store and no email is ever sent:
//   reviewed_at / decision_* / decision_priority   → fake Supabase .update() on the store
//   listings .update() (preferences / edit)         → store      .insert() → store   .delete() → store
//   POST /api/listings/invite                      → fixed demo token, no KV
//   POST /api/applicants/request-documents         → store status 'requested', demo link, emailed:false
//   POST /api/applicants/analyze-documents         → the fixture's sample report (no files leave the browser)
//   POST /api/applicants/insight / manage-analysis → canned insight / archive-delete on the store
//   POST /api/referrals/create / assign            → store; no consent email, no real referral
//   POST /api/listings/send-report                 → preview:true — NOTHING SENT
//   GET  /api/listings/report-pdf, verify-confirm-pdf, report-text, verify-confirm-text
//                                                  → demo-only API routes that build from the fixture
//   /api/chat                                      → not routed here: ChatWidget calls the REAL
//                                                    how-to assistant; only its ACTIONS run through
//                                                    this adapter (so they land in the fixture).
import { buildDemoApplicants, DEMO_LISTINGS, DEMO_PROFILE, DEMO_NOTIFICATIONS, DEMO_REFERRAL_INBOX, DEMO_REFERRALS_SENT, SAMPLE_DOCINTEL, SAMPLE_INSIGHT, referredApplicationForAssign } from './demoFixture';
import { DECISION_STATUS, DECISION_PRIORITY, ADDED_VIA } from './listingApplicantsVocabulary';
import { kvAppToRow } from './applicationMap';
import { withActiveReport, withArchivedActive, withoutActive, withoutArchived, normalizeDocV } from './docVerifications';
import { DASHBOARD_ROUTES, DASHBOARD_TABLES, assertAdapterCoverage } from './dashboardAdapter';

const KEY = 'rl_demo_state_v1';
export const DEMO_PATHS = { home: '/demo/dashboard', listing: (id) => `/demo/dashboard?listing=${encodeURIComponent(id)}`, profile: '/demo/dashboard#branding', signin: '/' };

export function freshState() {
  return {
    profile: DEMO_PROFILE,
    listings: DEMO_LISTINGS.map((l) => ({ ...l })),
    applicantsByListing: buildDemoApplicants(),
    notifications: DEMO_NOTIFICATIONS.map((n) => ({ ...n })),
    referralsInbox: DEMO_REFERRAL_INBOX.map((r) => ({ ...r })),
    referralsSent: { ...DEMO_REFERRALS_SENT },
    docRequests: {},
    events: [], // the sandbox timeline (db/events.sql in the product); starts empty like the real one
    eventsReadAt: null,
    seq: 100, // fixture ids use low numbers
  };
}
export function loadState() {
  try { const raw = sessionStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch (e) { /* ignore */ }
  return freshState();
}
export function resetState() { try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ } }

const json = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body), blob: async () => new Blob([JSON.stringify(body)], { type: 'application/json' }) });
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export function createDemoAdapter(initial) {
  let state = initial || loadState();
  const listeners = new Set();
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } listeners.forEach((fn) => fn(state)); };
  const findLink = (linkId) => { for (const [lid, apps] of Object.entries(state.applicantsByListing)) { const a = apps.find((x) => x.linkId === linkId); if (a) return { listingId: lid, a }; } return null; };
  const applicant = (linkId) => findLink(linkId)?.a || null;
  // The sandbox timeline. Same shape as a row of public.events; the demo writes the few it can see.
  const record = (type, { listingId = null, linkId = null, payload = {} } = {}) => {
    const l = listingId ? state.listings.find((x) => x.id === listingId) : null;
    const a = linkId ? applicant(linkId) : null;
    state.events = state.events || [];
    state.events.unshift({ id: `demo-ev-${state.seq++}`, type, listing_id: listingId, application_id: a?.application?.id || null, created_at: new Date().toISOString(),
      payload: { ...payload, listingName: l ? (l.name || l.address) : payload.listingName || null, applicantName: a?.application?.full_name || payload.applicantName || null, linkId } });
    save();
  };

  // ── routes: 'METHOD /path' → (query, body) → Response-like ──
  const routes = {
    'GET /api/assistant/signals': () => json(200, { signals: { listings: state.listings, applicantsByListing: state.applicantsByListing, notifications: state.notifications, referralsInbox: state.referralsInbox, referralsSent: Object.values(state.referralsSent), loaded: true } }),
    'GET /api/events': (q) => { const all = state.events || []; const before = q.before ? new Date(q.before).getTime() : null; const rows = before ? all.filter((e) => new Date(e.created_at).getTime() < before) : all; return json(200, { events: rows.slice(0, 30), lastReadAt: state.eventsReadAt || null, nextBefore: rows.length > 30 ? rows[29].created_at : null }); },
    'POST /api/events/read': () => { state.eventsReadAt = new Date().toISOString(); save(); return json(200, { ok: true, lastReadAt: state.eventsReadAt }); },
    'POST /api/events/record': (q, b) => { if (!b?.type) return json(400, { error: 'Not a reportable event.' }); record(b.type, { listingId: b.listingId || findLink(b.linkId)?.listingId || null, linkId: b.linkId || null, payload: b.payload || {} }); return json(200, { ok: true }); },
    'GET /api/notifications': () => json(200, { items: state.notifications, unreadCount: state.notifications.filter((n) => n.unread).length, lastSeen: null }),
    'POST /api/notifications': () => { state.notifications = state.notifications.map((n) => ({ ...n, unread: false })); save(); return json(200, { ok: true }); },
    'GET /api/referrals/inbox': () => json(200, { referrals: state.referralsInbox }),
    'GET /api/referrals/list': () => json(200, { byLink: state.referralsSent }),
    'POST /api/referrals/assign': (q, b) => {
      const ref = state.referralsInbox.find((r) => r.id === b.referralId); const listing = state.listings.find((l) => l.id === b.listingId);
      if (!ref || !listing) return json(404, { error: 'Referral or listing not found.' });
      if (ref.assignedListingId) return json(400, { error: 'This referral is already assigned to a listing.' });
      const app = referredApplicationForAssign();
      app.apartment = { address: listing.address, description: `${listing.bedrooms} BR · $${Number(listing.monthly_rent).toLocaleString('en-CA')}/mo`, estimatedRent: listing.monthly_rent, rentToIncomeRatio: Math.round(listing.monthly_rent / (app.employment.annualIncome / 12) * 100) };
      const row = { id: `demo-app-ref-${state.seq}`, ...kvAppToRow(app), created_at: new Date().toISOString() }; delete row.owner_token; delete row.cover_letter;
      const linkId = `demo-link-ref-${state.seq++}`;
      (state.applicantsByListing[listing.id] = state.applicantsByListing[listing.id] || []).push({ linkId, decisionStatus: DECISION_STATUS.NONE, decisionPriority: DECISION_PRIORITY.NORMAL, withdrawnAt: null, decisionNotes: '', decisionReasonCode: null, decisionChangedAt: null, addedVia: ADDED_VIA.REFERRAL, reviewedAt: null, reviewTracking: true, application: row, docVerifications: [], docArchived: [], aiInsight: null });
      ref.assignedListingId = listing.id; ref.assignedAt = new Date().toISOString(); save();
      record('referral_accepted', { listingId: listing.id, linkId, payload: { fromName: ref.from?.name || null } });
      return json(200, { ok: true, listingId: listing.id });
    },
    'POST /api/referrals/create': (q, b) => {
      if (!applicant(b.linkId)) return json(404, { error: 'Applicant not found on this listing.' });
      const ref = { id: `demo-ref-${state.seq++}`, status: 'pending', to: { name: b.toName, email: String(b.toEmail || '').toLowerCase(), hasAccount: false }, createdAt: new Date().toISOString(), decidedAt: null, assigned: false };
      state.referralsSent[b.linkId] = ref; save();
      return json(200, { ok: true, referral: ref }); // no consent email in the sandbox
    },
    'GET /api/listings/applicants': (q) => json(200, { applicants: state.applicantsByListing[q.listingId] || [] }),
    'POST /api/listings/invite': (q, b) => {
      const l = state.listings.find((x) => x.id === b.listingId); if (!l) return json(404, { error: 'Listing not found.' });
      if (!l.invite_token || b.regenerate) { l.invite_token = `demo${String(state.seq++).padStart(16, '0')}`; l.invite_url = `https://rentletter.ca/apply/${l.invite_token}`; save(); }
      return json(200, { url: l.invite_url, token: l.invite_token, demo: true });
    },
    'POST /api/listings/add-applicant': (q, b) => json(404, { error: 'Sandbox: adding by application number needs a real submission. Try the invite link in the real product.' }),
    'GET /api/listings/report-pdf': (q) => realFetch(`/api/demo/report-pdf?listing=${encodeURIComponent(q.listingId)}&decisions=${encodeURIComponent(JSON.stringify(decisionsFor(q.listingId)))}`),
    'POST /api/listings/report-text': (q, b) => realFetch(`/api/demo/report-text?listing=${encodeURIComponent(b.listingId)}&decisions=${encodeURIComponent(JSON.stringify(decisionsFor(b.listingId)))}`),
    'POST /api/listings/send-report': (q, b) => { const l = state.listings.find((x) => x.id === b.listingId); if (!l?.landlord_email) return json(400, { error: 'This listing has no landlord email.' }); record('report_sent', { listingId: l.id, payload: { landlordEmail: l.landlord_email, landlordName: l.landlord_name || null } }); return json(200, { ok: true, sentTo: l.landlord_email, preview: true }); },
    'GET /api/applicants/doc-request-status': (q) => json(200, state.docRequests[q.linkId] || { status: null }),
    'POST /api/applicants/request-documents': (q, b) => {
      const a = applicant(b.linkId); if (!a) return json(404, { error: 'Applicant not found.' });
      const rec = { status: 'requested', url: `https://rentletter.ca/upload/demo${String(state.seq++).padStart(28, '0')}`, requestedAt: new Date().toISOString(), receivedAt: null, tenantEmail: a.application.email };
      state.docRequests[b.linkId] = rec; save();
      record('documents_requested', { listingId: findLink(b.linkId)?.listingId || null, linkId: b.linkId });
      return json(200, { ...rec, emailed: false, emailError: 'Sandbox: no email is sent — in the product this goes to the tenant. Share the link instead.' });
    },
    'POST /api/applicants/analyze-documents': async (q, b) => {
      await delay(1800); // feels like the real read
      const f = findLink(b.linkId); if (!f) return json(404, { error: 'Applicant not found.' });
      const name = f.a.application.full_name;
      const run = { ...SAMPLE_DOCINTEL, analyzedAt: new Date().toISOString(), source: 'realtor', documents: SAMPLE_DOCINTEL.documents.map((d) => ({ ...d, extracted: { ...d.extracted, applicantName: name, employer: f.a.application.employer || d.extracted.employer } })), comparisons: [{ field: 'Income', stated: `$${Number(f.a.application.annual_income).toLocaleString('en-CA')}`, found: `$${Number(f.a.application.annual_income).toLocaleString('en-CA')}`, status: 'match' }, { field: 'Employer', stated: f.a.application.employer, found: f.a.application.employer, status: 'match' }, { field: 'Job title', stated: f.a.application.job_title, found: f.a.application.job_title, status: 'match' }] };
      const next = withActiveReport({ active: f.a.docVerifications[0] || null, archived: f.a.docArchived }, run);
      f.a.docVerifications = [run]; f.a.docArchived = next.archived; f.a.aiInsight = null; save();
      return json(200, { result: run, verifications: [run], saved: true });
    },
    'POST /api/applicants/insight': async (q, b) => { await delay(1200); const a = applicant(b.linkId); if (a) { a.aiInsight = SAMPLE_INSIGHT; save(); } return json(200, { insight: SAMPLE_INSIGHT }); },
    'POST /api/applicants/manage-analysis': (q, b) => {
      const a = applicant(b.linkId); if (!a) return json(404, { error: 'Applicant not found.' });
      const raw = { active: a.docVerifications[0] || null, archived: a.docArchived };
      const next = b.action === 'archive' ? withArchivedActive(raw, a.aiInsight) : b.action === 'delete' ? withoutActive(raw) : b.action === 'delete-archived' ? withoutArchived(raw, b.archivedId) : raw;
      const n = normalizeDocV(next); a.docVerifications = n.active ? [n.active] : []; a.docArchived = n.archived; if (b.action !== 'delete-archived') a.aiInsight = null; save();
      return json(200, { docVerifications: a.docVerifications, docArchived: a.docArchived });
    },
    'POST /api/applicants/verify-confirm-pdf': (q, b) => realFetch(`/api/demo/verify-pdf?linkId=${encodeURIComponent(b.linkId)}&analyzed=${encodeURIComponent(applicant(b.linkId)?.docVerifications?.[0]?.analyzedAt || '')}`),
    'POST /api/applicants/verify-confirm-text': (q, b) => realFetch(`/api/demo/verify-text?linkId=${encodeURIComponent(b.linkId)}`),
  };
  const realFetch = (url) => fetch(url); // demo-only server routes (fixture-built, no user data)
  const decisionsFor = (listingId) => Object.fromEntries((state.applicantsByListing[listingId] || []).map((a) => [a.linkId, { status: a.decisionStatus, withdrawnAt: a.withdrawnAt || null }]));

  async function demoFetch(url, init = {}) {
    const u = new URL(url, 'http://demo.local');
    const key = `${(init.method || 'GET').toUpperCase()} ${u.pathname}`;
    const handler = routes[key];
    if (!handler) return json(404, { error: `Sandbox: ${key} is not available in the demo.` });
    const query = Object.fromEntries(u.searchParams.entries());
    let body = {}; try { body = init.body ? JSON.parse(init.body) : {}; } catch (e) { body = {}; }
    try { return await handler(query, body); } catch (e) { return json(500, { error: e?.message || 'Sandbox error.' }); }
  }

  // ── fake Supabase: exactly the query shapes the dashboard uses, resolved against the store ──
  function supabase() {
    const builder = (table) => {
      const st = { op: null, patch: null, filters: [], wantSelect: false };
      const run = () => {
        if (table === 'listing_applicants') {
          const id = st.filters.find((f) => f.col === 'id')?.val; const f = findLink(id);
          if (!f) return { data: null, error: { message: 'Row not found' } };
          if (st.op === 'update') {
            const p = st.patch || {};
            if ('decision_status' in p) f.a.decisionStatus = p.decision_status;
            if ('decision_reason_code' in p) f.a.decisionReasonCode = p.decision_reason_code;
            if ('decision_notes' in p) f.a.decisionNotes = p.decision_notes;
            if ('decision_changed_at' in p) f.a.decisionChangedAt = p.decision_changed_at;
            if ('decision_priority' in p) f.a.decisionPriority = p.decision_priority;
            if ('withdrawn_at' in p) f.a.withdrawnAt = p.withdrawn_at;
            if ('reviewed_at' in p) f.a.reviewedAt = p.reviewed_at;
            save(); return { data: null, error: null };
          }
        }
        if (table === 'listings') {
          if (st.op === 'insert') { const row = { id: `demo-listing-${state.seq++}`, created_at: new Date().toISOString(), invite_token: null, invite_url: null, ...st.patch }; state.listings.unshift(row); save(); return { data: row, error: null }; }
          const id = st.filters.find((f) => f.col === 'id')?.val; const l = state.listings.find((x) => x.id === id);
          if (!l) return { data: null, error: { message: 'Listing not found' } };
          if (st.op === 'update') { Object.assign(l, st.patch); save(); return { data: { ...l }, error: null }; }
          if (st.op === 'delete') { state.listings = state.listings.filter((x) => x.id !== id); delete state.applicantsByListing[id]; save(); return { data: null, error: null }; }
        }
        return { data: null, error: { message: `Sandbox: ${st.op} on ${table} is not available.` } };
      };
      const api = {
        update(p) { st.op = 'update'; st.patch = p; return api; }, insert(p) { st.op = 'insert'; st.patch = p; return api; }, delete() { st.op = 'delete'; return api; },
        select() { st.wantSelect = true; return api; }, eq(col, val) { st.filters.push({ col, val }); return api; },
        single() { return Promise.resolve(run()); }, maybeSingle() { return Promise.resolve(run()); },
        then(res, rej) { return Promise.resolve(run()).then(res, rej); },
      };
      return api;
    };
    return { from: builder, auth: { signOut: async () => { resetState(); return { error: null }; } } };
  }

  const adapter = {
    kind: 'demo', fetch: demoFetch, supabase, paths: DEMO_PATHS,
    routes, tables: { listings: true, listing_applicants: true },
    getState: () => state, subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    reset: () => { resetState(); state = freshState(); save(); },
  };
  assertAdapterCoverage(adapter); // throws at construction if any dashboard route/table is unhandled
  void DASHBOARD_ROUTES; void DASHBOARD_TABLES;
  return adapter;
}
