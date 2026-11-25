// components/dashboard/HomeView.js
// The realtor dashboard HOME: extracted verbatim from pages/dashboard.js so the real page
// (Supabase SSR) and /demo/dashboard (in-memory fixture) render the SAME component. All I/O
// goes through useAdapter() (lib/dashboardAdapter). Business-model logic unchanged.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { GlobalStyle, Icon, StatusPills, ConfirmSheet } from '../../components/ui';
import Sheet from '../Sheet';
import { deleteCheck, archiveAvailable, isArchived, NOT_DELETABLE_LINE, skipLine } from '../../lib/listingArchiveRule';
import { getEntitlement } from '../../lib/entitlements';
import { billingOff } from '../../lib/billingOff';
import Paywall from './Paywall';
import { C, R, FONT } from '../../components/theme';
import { formatUnit } from '../../lib/unitType';
import { listingStatePills } from '../../lib/listingStateLine.js';
import DashShell, { viewOf, viewHref } from './DashShell';
import { DeskStats, ListingsTable, FILTERS } from './ListingsTable';
import NeedsYou from './NeedsYou';
import PipelineSoon from './PipelineSoon';
import { standingOf, rowOf, needsYouItems } from './homeData';
import { DEFAULT_SORT, SEARCH_FROM, orderIds, arrange, rowSet, headingSort, sortName, sameSort, choicesFor, validSort, readSort, writeSort, matchRows, searchWords } from './listingSort';
import { useCirclePending } from './MainNav';
import { navigateToAction } from './actionNav';
import InstallHint from '../../components/dashboard/InstallHint';
import { OPEN_EVENT } from '../../components/dashboard/AssistantBell';
import { greetingFor } from '../../lib/greeting.js';
import PeopleList from '../../components/dashboard/PeopleList';
import SharedWithMe, { useSharedWithMe } from './SharedWithMe';
import NewListingPanel from '../../components/listings/NewListingPanel';
import { go, goView, linkProps, cardProps, rememberListings, rememberProfile, rememberSignals, seenSignals, takeWarm, forgetWarm, SIGNALS_URL, rememberScreenView, prefetchCode, useTakeOver } from '../nav/routes';
import { useLoadWatch, LoadFailed } from '../nav/RouteLoader';
import { Reveal } from '../brand/Loader';
import { useAdapter } from '../../lib/dashboardAdapter';
import { listingOpen } from '../../lib/listingState';
import { referralsEnabled } from '../../lib/features';
import { displayLabel } from '../../lib/listingAddress';

// ── Presentation-only helpers (no data logic) ─────────────────

// Initials for the no-logo brand fallback (same derivation as the header avatar).
function initialsOf(profile) {
  const n = (profile?.full_name || '').trim();
  if (n) {
    const parts = n.split(/\s+/);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || n[0].toUpperCase();
  }
  return (profile?.email || '?')[0].toUpperCase();
}

// Dominant colour of the uploaded logo, sampled client-side on a downsampled canvas
// (no dependencies). Transparent and near-white/near-paper pixels are ignored; a
// too-light average (washes out on the cream card) or any failure (CORS taint,
// decode error, no logo) yields null → callers fall back to the product red.
function useLogoAccent(logoUrl) {
  const [accent, setAccent] = useState(null);
  useEffect(() => {
    setAccent(null);
    if (!logoUrl) return;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous'; // required for getImageData; logo storage is CORS-open
    img.onload = () => {
      if (cancelled) return;
      try {
        const N = 24;
        const canvas = document.createElement('canvas');
        canvas.width = N;
        canvas.height = N;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, N, N);
        const { data } = ctx.getImageData(0, 0, N, N);
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 128) continue;
          const R = data[i], G = data[i + 1], B = data[i + 2];
          if (R > 232 && G > 228 && B > 216) continue;
          r += R; g += G; b += B; n++;
        }
        if (n < 12) return; // logo is effectively white/empty, keep the red fallback
        r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
        if (0.2126 * r + 0.7152 * g + 0.0722 * b > 200) return; // insufficient contrast on the card
        setAccent(`rgb(${r}, ${g}, ${b})`);
      } catch (e) { /* tainted canvas / decode failure, red fallback stands */ }
    };
    img.src = logoUrl;
    return () => { cancelled = true; };
  }, [logoUrl]);
  return accent;
}

// The order of the listings, one for Active and one for Archived (components/dashboard/listingSort.js),
// kept on this device. A fresh page load draws the default, as the server did, and reads the
// device's choice right after; the orders as last read or chosen in this tab are kept here too, so
// a return to the dashboard inside the app draws them at once.
let sortsSeen = null;
const deviceStore = () => { try { return window.localStorage; } catch (e) { return null; } };
const useIsoLayout = typeof window === 'undefined' ? useEffect : useLayoutEffect;

// The start, for a realtor with no listing yet: one heading, one line, the button, three steps.
const START = {
  heading: 'Start with one listing.',
  line: 'Each listing gets a link. Tenants apply through it, and you read their applications here.',
  steps: [
    ['Add a listing', 'The address, the rent and your landlord client.'],
    ['Send the link', 'By text, by email or in your listing post.'],
    ['Read the applications', 'They arrive here as tenants apply.'],
  ],
};

export default function HomeView({ userId, userEmail, initialProfile, initialListings, listingsError: initialListingsError = null, entitlement: initialEntitlement = null, initialSignals = null }) {
  const adapter = useAdapter();
  const router = useRouter();
  const [profile, setProfile] = useState(initialProfile);
  useEffect(() => { rememberProfile(profile); }, [profile]);
  // listings: null = not known yet (the server query failed; the client retries below),
  // [] = known to be empty (the only state that may show the guided empty state).
  const [listings, setListings] = useState(Array.isArray(initialListings) ? initialListings : null);
  useEffect(() => { rememberListings(listings || []); }, [listings]);
  const [listingsError, setListingsError] = useState(initialListingsError);
  const [modalOpen, setModalOpen] = useState(false);
  // The listing a Duplicate starts from, and the button that opened the form, which takes the focus
  // back when it closes. The form and its saves are components/listings/NewListingPanel.js.
  const [dupe, setDupe] = useState(null);
  const opener = useRef(null);
  const openNew = (e) => { opener.current = (e && e.currentTarget) || null; setDupe(null); setModalOpen(true); };
  const closeModal = () => {
    setModalOpen(false); setDupe(null);
    const back = opener.current && document.contains(opener.current) && opener.current.getClientRects().length ? opener.current : [...document.querySelectorAll('[data-shell-new], .dash-new')].find((b) => b.getClientRects().length);
    if (back) setTimeout(() => back.focus({ preventScroll: true }), 0);
  };
  // ?new=1 opens the form (an old link to it); ?duplicate={id} opens it filled from that listing
  // with the unit left empty (a listing's Duplicate). Either is taken off the address.
  useEffect(() => {
    let q = null; try { q = new URLSearchParams(window.location.search); } catch (e) { return; }
    const dup = q.get('duplicate');
    if (q.get('new') === '1') { setDupe(null); setModalOpen(true); }
    else if (dup) {
      const from = (listings || []).find((l) => String(l.id) === dup);
      if (!from) return;
      setDupe({ ...from, unit: '' }); setModalOpen(true);
    } else return;
    q.delete('new'); q.delete('duplicate');
    const rest = q.toString(); goView(`${window.location.pathname}${rest ? `?${rest}` : ''}`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.new, router.query.duplicate, listings]);
  const [error, setError] = useState('');

  // Each retry of the first screen's loads (the load watch below) is a new round: a live request,
  // never the one that did not land.
  const [loadRound, setLoadRound] = useState(0);
  const listingsLoaded = Array.isArray(listings);
  const hasListings = listingsLoaded && listings.length > 0;
  // No listing yet, known (never while the listings could not be read): the start.
  const empty = listingsLoaded && !hasListings;
  // Archive (db/025-listing-archive.sql): the controls show only once the column exists. An archived
  // listing leaves Active (and the numbers, Needs you and the bell) and shows under Archived.
  const canArchive = archiveAvailable(listings);
  const liveListings = useMemo(() => (listings || []).filter((l) => !isArchived(l)), [listings]);
  const archivedListings = useMemo(() => (listings || []).filter((l) => isArchived(l)), [listings]);
  const openListings = liveListings.filter((l) => listingOpen(l));
  const closedListings = liveListings.filter((l) => !listingOpen(l));
  // Client retry when the server-side listings query failed (an expired access token being
  // refreshed under RLS is the usual reason). Until it resolves the page shows the door Loader,
  // never the empty state.
  useEffect(() => {
    if (listingsLoaded) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const supabase = adapter.supabase();
        const { data, error: qErr } = await supabase.from('listings').select('*').eq('profile_id', userId).order('created_at', { ascending: false });
        if (cancelled) return;
        if (qErr) { setListingsError(qErr.message || 'Could not load your listings.'); return; }
        setListingsError(null); setListings(data || []);
      } catch (e) { if (!cancelled) setListingsError('Could not load your listings.'); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingsLoaded, loadRound]);
  // ── Assistant data for "Rentletter noticed": the realtor's own applicants per listing,
  // notifications feed, referrals. Normally these arrive WITH the page (pages/dashboard.js loads
  // them server side as initialSignals) so the dashboard commits in one paint. Without them
  // (demo workspace, or a server side failure) they are fetched here and the page holds its
  // Loader until they land, so nothing ever appears after the rest. No AI involved.
  // After a tap inside the app the page comes without them (pages/dashboard.js): the signals seen
  // earlier this session show at once and the fetch below refreshes them.
  const [signals, setSignals] = useState(() => (initialSignals && initialSignals.loaded ? initialSignals : (seenSignals() || { applicantsByListing: {}, people: [], notifications: [], referralsInbox: [], referralsSent: [], loaded: false })));
  useEffect(() => { rememberSignals(signals); }, [signals]);
  // The page taking over this screen as it was seen (components/nav/RouteFrame.js keeps the screen):
  // what the server just sent replaces what it showed. New listings also run the signals read below
  // again, which refreshes them when the page came without them (a tap inside the app).
  useTakeOver([initialProfile, initialListings, initialSignals], () => {
    if (initialProfile) setProfile(initialProfile);
    if (Array.isArray(initialListings)) { setListingsError(null); setListings(initialListings); }
    if (initialSignals && initialSignals.loaded) setSignals(initialSignals);
  });
  useEffect(() => {
    if (signals.loaded && initialSignals) return undefined; // came with the page
    let cancelled = false;
    // Leaving the page cancels the reads in flight; that is not a failure to fall back from.
    const leaving = () => { cancelled = true; };
    window.addEventListener('pagehide', leaving);
    (async () => {
      // The app: one read, usually started on the touch that brought the realtor here
      // (components/nav/routes.js). The sandbox, or a failed read, takes the parts one by one.
      if (adapter.kind === 'real') {
        if (loadRound > 0) forgetWarm(SIGNALS_URL);
        const warmed = loadRound > 0 ? null : takeWarm(SIGNALS_URL);
        const got = warmed ? await warmed : await adapter.fetch(SIGNALS_URL).then(async (r) => ({ ok: r.ok, json: await r.json().catch(() => ({})) })).catch(() => ({ ok: false, json: {} }));
        if (cancelled) return;
        if (got.ok && got.json?.signals) { setSignals({ ...got.json.signals, loaded: true }); return; }
      }
      const get = (u) => adapter.fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const ls = (listings || []).slice(0, 12);
      const [notif, inbox, sent, ppl, ...apps] = await Promise.all([
        get('/api/notifications'),
        referralsEnabled() ? get('/api/referrals/inbox') : Promise.resolve(null), // lib/features.js
        referralsEnabled() ? get('/api/referrals/list') : Promise.resolve(null),
        get('/api/pipeline/people'),
        ...ls.map((l) => get(`/api/listings/applicants?listingId=${encodeURIComponent(l.id)}`)),
      ]);
      if (cancelled) return;
      const applicantsByListing = {};
      ls.forEach((l, i) => { applicantsByListing[l.id] = apps[i]?.applicants || []; });
      setSignals({ applicantsByListing, people: ppl?.people || [], notifications: notif?.items || [], referralsInbox: inbox?.referrals || [], referralsSent: Object.values(sent?.byLink || {}), latestEventAt: null, loaded: true });
    })();
    return () => { cancelled = true; window.removeEventListener('pagehide', leaving); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listings, loadRound]);
  // The first screen commits as one piece: listings known AND the assistant inputs in hand.
  const ready = listingsLoaded && signals.loaded;
  // Never an endless wait: a load that has not landed is retried once after 4 seconds, then the
  // line and the pill take the Loader's place (components/nav/RouteLoader.js). A page back from
  // the browser's cache, its reads cut off when it was hidden, is retried the same way.
  const loadWatch = useLoadWatch(!ready && !listingsError, () => setLoadRound((n) => n + 1));
  // This screen as it stands, so a return to it within the session shows at once
  // (components/nav/routes.js rememberScreenView). The app only: the sandbox draws its own views.
  useEffect(() => {
    if (adapter.kind !== 'real' || !ready) return;
    rememberScreenView('/dashboard', { userId, userEmail, initialProfile: profile, initialListings: listings, listingsError: null, entitlement: initialEntitlement, initialSignals: signals });
  }, [adapter.kind, ready, profile, listings, signals, initialEntitlement, userId, userEmail]);
  // Once on view: the code of the screens one tap away (a listing, the profile), when idle.
  const firstListing = listings && listings[0] ? listings[0].id : null;
  useEffect(() => { if (adapter.kind === 'real' && ready) prefetchCode([...(firstListing ? [`/listing/${encodeURIComponent(firstListing)}`] : []), '/profile']); }, [adapter.kind, ready, firstListing]);
  // The listings could not be read: said in the door's place, with a way to try again.
  const listingsFailed = (
    <section className="dash-card dash-block" style={{ padding: 'var(--s-4)' }} role="alert">
      <div className="dash-eyebrow">Your listings</div>
      <h2 className="dash-h2" style={{ marginBottom: 'var(--s-1)' }}>We couldn’t load your listings.</h2>
      <p style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft, lineHeight: 1.55, marginBottom: 'var(--s-3)', textWrap: 'balance' }}>They are still there. Give it a moment and try again.</p>
      <button type="button" className="dash-ghost" onClick={() => window.location.reload()}>Try again</button>
    </section>
  );
  // Derived, presentation-only summaries from data that already exists (no fabrication,
  // no new API calls — everything below comes from the listings/profile already loaded).
  // Event-type Noticed actions on the home page go to the listing page, which owns the applicant
  // cards: #docs=<linkId>[&renew] makes ListingView open that applicant (marking them reviewed),
  // scroll to them and light up the document-request panel.
  const openAssistant = () => window.dispatchEvent(new CustomEvent(OPEN_EVENT));
  const onNoticeAction = (a) => {
    if (a.type === 'panel') { openAssistant(); return; }
    if (a.event === 'request-docs' && a.listingId && a.linkId) go(`${adapter.paths.listing(a.listingId)}#docs=${encodeURIComponent(a.linkId)}${a.renew ? '&renew' : ''}`);
  };
  // "#referrals" deep link (the Assign action): the inbox mounts only after its own fetch, so a
  // plain hash jump on page load finds nothing — wait for the section, then scroll to it.
  useEffect(() => {
    if (!referralsEnabled() || window.location.hash !== '#referrals') return undefined; // lib/features.js
    const t = setTimeout(() => window.dispatchEvent(new CustomEvent(OPEN_EVENT)), 300);
    return () => clearTimeout(t);
  }, []);
  // The greeting line: the hour comes from the CLIENT after mount (lib/greeting.js), so the server's
  // clock never decides it; until then the line holds its height and is not shown. It carries no
  // name ("Good evening."), so it reads as one line at 320 whatever the realtor's name is.
  const [clientHour, setClientHour] = useState(null);
  useEffect(() => { setClientHour(new Date().getHours()); }, []);
  const greeting = clientHour == null ? '' : greetingFor(clientHour);
  // The bell receives one stable object per signals change: a fresh object every render would make
  // the bell's setSignals effect re render this page forever.
  // The standing: the listings that take applications, the applicants on them, and the listings
  // whose report has not gone yet (components/dashboard/homeData.js standingOf). On a phone the ink
  // card says the non zero ones as plain numbers; all three zero reads as nothing waiting. On a
  // desktop they are the three numbers that filter the table. Counted from the signals already
  // loaded, never a new call.
  const standing = useMemo(() => {
    if (!signals.loaded || !hasListings) return { listings: 0, applicants: 0, toSend: 0, items: [] };
    const n = standingOf(openListings, signals.applicantsByListing || {});
    const items = [
      n.listings ? [n.listings, n.listings === 1 ? 'listing' : 'listings'] : null,
      n.applicants ? [n.applicants, n.applicants === 1 ? 'applicant' : 'applicants'] : null,
      n.toSend ? [n.toSend, n.toSend === 1 ? 'report to send' : 'reports to send'] : null,
    ].filter(Boolean);
    return { ...n, items };
  }, [signals.loaded, signals.applicantsByListing, openListings, hasListings]);
  // The desktop views (components/dashboard/DashShell.js): Listings, Pipeline, Shared with you.
  const view = viewOf(router.query);
  // The stat a desktop realtor clicked: the rows it counts, or all of them.
  const [filter, setFilter] = useState('all');
  // The client's clock for the relative times, after mount (the server's render and the first
  // client render agree), once a minute after that.
  const [now, setNow] = useState(null);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t); }, []);
  const circlePending = useCirclePending();
  const shared = useSharedWithMe();
  const byListing = signals.applicantsByListing || {};
  const rows = useMemo(() => openListings.map((l) => rowOf(l, byListing[l.id] || [])), [openListings, byListing]);
  const closedRows = useMemo(() => closedListings.map((l) => rowOf(l, byListing[l.id] || [])), [closedListings, byListing]);
  const needs = useMemo(() => (signals.loaded ? needsYouItems({ listings: liveListings, applicantsByListing: byListing, people: signals.people || [], shares: shared || [], circlePending, now: now || Date.now(), paths: adapter.paths }) : []),
    // now is left out on purpose: the items change with the data, the times with the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signals.loaded, liveListings, byListing, signals.people, shared, circlePending, adapter.paths]);
  // ── Archive and delete. The shelf on view (Active or Archived), the rows picked for the bar,
  // the delete asked, the card whose menu is open (a phone), and the line that says what happened.
  const [shelf, setShelf] = useState('active');
  const [picked, setPicked] = useState(() => new Set());
  const [ask, setAsk] = useState(null); // { ids } a delete waiting for its yes
  const [menuFor, setMenuFor] = useState(null); // a listing, its card's menu open
  const [acting, setActing] = useState(false);
  const [actNote, setActNote] = useState('');
  const switchShelf = (to) => { setShelf(to); setPicked(new Set()); setFilter('all'); setActNote(''); };
  const togglePick = (id) => setPicked((cur) => { const next = new Set(cur); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  // The same check the route makes (lib/listingArchiveRule.js), from the applicants already loaded:
  // a listing whose applicants are not loaded is left to the route to decide.
  const blocked = (id) => (byListing[id] ? !deleteCheck(byListing[id].map((a) => a.application || {})).deletable : false);
  const post = async (url, body) => { const r = await adapter.fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { r, j: await r.json().catch(() => ({})) }; };
  const archiveIds = async (ids, archived) => {
    setActing(true); setActNote('');
    try {
      const { r, j } = await post('/api/listings/archive', { listingIds: ids, archived });
      if (!r.ok) { setActNote(j.error || 'Could not save that. Try again.'); return; }
      setListings((cur) => (cur || []).map((l) => (ids.includes(l.id) ? { ...l, archived_at: j.archivedAt || null } : l)));
      setPicked(new Set());
      setActNote(archived ? `Archived ${count(ids.length, 'listing', 'listings')}.` : `Restored ${count(ids.length, 'listing', 'listings')}.`);
    } catch (e) { setActNote('Could not save that. Try again.'); } finally { setActing(false); setAsk(null); setMenuFor(null); }
  };
  const deleteIds = async (ids) => {
    setActing(true); setActNote('');
    try {
      const { r, j } = await post('/api/listings/remove', { listingIds: ids });
      if (!r.ok) { setActNote(j.error || 'Could not delete that. Try again.'); return; }
      const gone = j.deleted || [];
      setListings((cur) => (cur || []).filter((l) => !gone.includes(l.id)));
      setPicked(new Set());
      setActNote([gone.length ? `Deleted ${count(gone.length, 'listing', 'listings')}.` : '', j.line || ''].filter(Boolean).join(' '));
    } catch (e) { setActNote('Could not delete that. Try again.'); } finally { setActing(false); setAsk(null); setMenuFor(null); }
  };
  // The delete asked for: what goes, what is skipped and why, or for one listing that cannot go,
  // the line and Archive in its place.
  const askInfo = ask ? (() => {
    const skip = ask.ids.filter(blocked); const n = ask.ids.length;
    if (n === 1 && skip.length === 1) return { title: 'This listing cannot be deleted', body: NOT_DELETABLE_LINE, confirm: canArchive && !isArchived((listings || []).find((l) => l.id === ask.ids[0])) ? 'Archive it' : 'Keep it', run: () => (canArchive && !isArchived((listings || []).find((l) => l.id === ask.ids[0])) ? archiveIds(ask.ids, true) : setAsk(null)), danger: false };
    return { title: n === 1 ? 'Delete this listing?' : `Delete ${n} listings?`, body: [n === 1 ? 'Its link stops working and any test applications go with it. This cannot be undone.' : 'Their links stop working and any test applications go with them. This cannot be undone.', skipLine(skip.length)].filter(Boolean).join(' '), confirm: 'Delete', run: () => deleteIds(ask.ids), danger: true };
  })() : null;
  const archivedRows = useMemo(() => archivedListings.map((l) => rowOf(l, byListing[l.id] || [])), [archivedListings, byListing]);
  // ── The order and the search, in the browser, on the rows above (components/dashboard/listingSort.js).
  // Each shelf keeps its own order on this device; a change never reloads, navigates or scrolls.
  // The selection is by id, so the rows picked stay picked whatever the order; Needs you and the
  // Pipeline have orders of their own.
  const [sorts, setSorts] = useState(() => sortsSeen || { active: DEFAULT_SORT, archived: DEFAULT_SORT });
  useIsoLayout(() => {
    const store = deviceStore();
    const kept = { active: readSort(store, 'active'), archived: readSort(store, 'archived') };
    sortsSeen = kept;
    setSorts((cur) => (sameSort(cur.active, kept.active) && sameSort(cur.archived, kept.archived) ? cur : kept));
  }, []);
  const sort = sorts[shelf] || DEFAULT_SORT;
  const setSort = (next) => {
    const s = validSort(next);
    setSorts((cur) => { const out = { ...cur, [shelf]: s }; sortsSeen = out; return out; });
    writeSort(deviceStore(), shelf, s);
  };
  const onHeading = (key) => setSort(headingSort(sort, key));
  const [sortOpen, setSortOpen] = useState(false); // the sheet, under 1024
  const [menuOpen, setMenuOpen] = useState(false); // the menu, 1024 and wider
  const menuRef = useRef(null); const menuBtn = useRef(null);
  // The order is set when the realtor sets one, when a listing comes or goes, and once the signals
  // are in; it holds while the rows' data changes under it (the server's answer taking over a
  // screen seen before, fresh signals), so no card moves under a finger and none is drawn again.
  // The data itself is always the newest: only the positions are held.
  const activeOrder = useMemo(() => orderIds(rows, sorts.active), [sorts.active, rowSet(rows), signals.loaded]);
  const closedOrder = useMemo(() => orderIds(closedRows, sorts.active), [sorts.active, rowSet(closedRows), signals.loaded]);
  const archivedOrder = useMemo(() => orderIds(archivedRows, sorts.archived), [sorts.archived, rowSet(archivedRows), signals.loaded]);
  const sortedRows = arrange(rows, activeOrder);
  const sortedClosed = arrange(closedRows, closedOrder);
  const sortedArchived = arrange(archivedRows, archivedOrder);
  // The search: past eight listings in the view, by address and unit as the realtor types.
  const [query, setQuery] = useState('');
  const inView = shelf === 'archived' ? archivedListings.length : liveListings.length;
  const canFind = inView >= SEARCH_FROM;
  const q = canFind ? query : '';
  const searched = searchWords(q).length > 0;
  const foundOpen = matchRows(sortedRows, q);
  const foundClosed = matchRows(sortedClosed, q);
  const foundArchived = matchRows(sortedArchived, q);
  const found = shelf === 'archived' ? foundArchived.length : foundOpen.length + foundClosed.length;
  const shownRows = FILTERS[filter] ? foundOpen.filter(FILTERS[filter]) : foundOpen;
  // A phone card draws its listing; the cards follow the rows' order.
  const listingById = useMemo(() => new Map((listings || []).map((l) => [l.id, l])), [listings]);
  const cardsOf = (list) => list.map((r) => listingById.get(r.id)).filter(Boolean);
  const openCards = cardsOf(foundOpen); const closedCards = cardsOf(foundClosed); const archivedCards = cardsOf(foundArchived);
  // The menu closes on a click outside it, on Escape (the focus back on its button) and on Tab; it
  // opens on the order on view, and the arrow keys move through it.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const outside = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    const keys = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setMenuOpen(false); if (menuBtn.current) menuBtn.current.focus({ preventScroll: true }); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', keys);
    const f = requestAnimationFrame(() => { const box = menuRef.current; const el = box && (box.querySelector('[role=menuitemradio][aria-checked="true"]') || box.querySelector('[role=menuitemradio]')); if (el) el.focus({ preventScroll: true }); });
    return () => { cancelAnimationFrame(f); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', keys); };
  }, [menuOpen]);
  const menuKeys = (e) => {
    if (e.key === 'Tab') { setMenuOpen(false); return; }
    const items = [...e.currentTarget.querySelectorAll('[role=menuitemradio]')];
    const at = items.indexOf(document.activeElement);
    const to = e.key === 'ArrowDown' ? (at + 1) % items.length : e.key === 'ArrowUp' ? (at - 1 + items.length) % items.length : e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : -1;
    if (to >= 0 && items[to]) { e.preventDefault(); items[to].focus({ preventScroll: true }); }
  };
  // A choice in the sheet: the order changes at once, its tick moves, and the sheet goes.
  const choose = (c) => { setSort(c); requestAnimationFrame(() => setSortOpen(false)); };
  const pickFromMenu = (c) => { setSort(c); setMenuOpen(false); if (menuBtn.current) menuBtn.current.focus({ preventScroll: true }); };
  // The Active and Archived switch, above the listings at every width (only once archive is set up).
  const shelfSwitch = (
    <div className="hv-shelf" role="group" aria-label="Show listings" data-shelf="">
      {[['active', 'Active'], ['archived', 'Archived']].map(([key, label]) => (
        <button key={key} type="button" aria-pressed={shelf === key ? 'true' : 'false'} onClick={() => switchShelf(key)} data-shelf-to={key}>{label}</button>
      ))}
    </div>
  );
  // The Sort control: under 1024 a button above the cards that opens the sheet, at 1024 and wider a
  // menu beside the switch. Each reads the order on view; the choices are the same eight.
  const sortLabel = sortName(sort);
  const sortChoices = choicesFor(sort);
  const sortButton = (
    <button type="button" className="ds-btn ds-btn-line hv-sort-btn" aria-haspopup="dialog" aria-label={`Sort, ${sortLabel}`} data-sort-open="" onClick={() => setSortOpen(true)}>
      <Icon name="sort" size={16} /><span>{sortLabel}</span>
    </button>
  );
  const sortMenu = (
    <span className="hv-sortmenu" ref={menuRef} data-sort-menu="">
      <button ref={menuBtn} type="button" className="ds-btn ds-btn-line hv-sort-btn" aria-haspopup="menu" aria-expanded={menuOpen ? 'true' : 'false'} aria-label={`Sort, ${sortLabel}`} data-sort-menu-open="" onClick={() => setMenuOpen((v) => !v)}>
        <Icon name="sort" size={16} /><span>{sortLabel}</span>
      </button>
      {menuOpen ? (
        <span className="hv-sortpop" role="menu" aria-label="Sort listings" data-sort-menu-list="" onKeyDown={menuKeys}>
          {sortChoices.map((c) => { const on = sameSort(c, sort); return (
            <button key={c.id} type="button" role="menuitemradio" aria-checked={on ? 'true' : 'false'} className="hv-sort-opt" data-sort-choice={c.id} onClick={() => pickFromMenu(c)}>
              <span>{c.label}</span>{on ? <Icon name="check" size={16} strokeWidth={2} /> : null}
            </button>
          ); })}
        </span>
      ) : null}
    </span>
  );
  // The search, past eight listings in the view: one field for each layout, the one query.
  const findField = (where) => (
    <span className="hv-find" data-listing-search={where}>
      <span className="hv-find-icon" aria-hidden="true"><Icon name="search" size={16} /></span>
      <input type="search" className="hv-find-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Address or unit" aria-label="Find a listing by address or unit" autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="search" data-listing-search-input={where} />
    </span>
  );
  const foundLine = searched && found > 0 ? <p className="hv-found" role="status" data-search-count="">{count(found, 'listing matches', 'listings match')}</p> : null;
  const noMatch = (
    <div className="hv-nomatch" data-search-empty="">
      <p role="status">No listing matches your search.</p>
      <button type="button" className="ds-btn ds-btn-quiet" onClick={() => setQuery('')} data-search-clear="">Clear</button>
    </div>
  );
  // The table's checkboxes: one a row, and the header's for all the rows shown.
  const rowSelect = (list) => ({
    header: <input type="checkbox" aria-label="Select all" checked={list.length > 0 && list.every((r) => picked.has(r.id))} onChange={(e) => setPicked((cur) => { const next = new Set(cur); for (const r of list) { if (e.target.checked) next.add(r.id); else next.delete(r.id); } return next; })} className="hv-check" />,
    cell: (r) => <input type="checkbox" aria-label={`Select ${r.label}`} checked={picked.has(r.id)} onChange={() => togglePick(r.id)} className="hv-check" data-row-check={r.id} />,
  });
  // A phone card's menu: a 44px button that opens the sheet with the card's actions; the tap is
  // the button's own, never the card's.
  const stop = (e) => { e.stopPropagation(); };
  const cardMenu = (l) => (
    <button type="button" className="dash-card-menu" aria-label={`Actions for ${displayLabel(l, 'this listing')}`} data-own-action="" data-card-menu={l.id}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActNote(''); setMenuFor(l); }} onKeyDown={stop} onPointerDown={stop} onTouchStart={stop}>
      <Icon name="more" size={20} />
    </button>
  );
  const onNeed = (it) => {
    if (it.go.kind === 'action') navigateToAction(it.go.item, adapter.paths);
    else if (it.go.kind === 'view') goView(viewHref(adapter.paths.home, it.go.view));
    else go(it.go.href);
  };
  // The Pipeline section's Open Pipeline: the view in place, from its top.
  const pipelineHref = viewHref(adapter.paths.home, 'pipeline');
  const openPipeline = () => { goView(pipelineHref); try { window.scrollTo({ top: 0, behavior: 'instant' }); } catch (e) { window.scrollTo(0, 0); } };
  const headerSignals = useMemo(() => (signals.loaded ? { ...signals, listings: liveListings } : null), [signals, liveListings]);
  // Access verdict (lib/entitlements.js) — from the server load, or derived from the profile
  // (demo workspace). Only READ here; nothing is gated yet (that ships with checkout).
  const entitlement = initialEntitlement || getEntitlement(profile);
  // Billing off (lib/billingOff.js): no paywall, and no trial on screen.
  const free = billingOff();
  const trialDays = !free && entitlement.status === 'trialing' && entitlement.daysLeft != null && entitlement.daysLeft <= 7 ? entitlement.daysLeft : null;
  // Back from Checkout before the webhook landed → "payment received" instead of the paywall.
  const checkoutFlag = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('checkout') : null;
  const locked = !free && !entitlement.canUseProduct;
  const brokerage = (profile?.brokerage || '').trim();
  // Branding is complete when there is a display name, a brokerage, and a logo (uploaded or
  // generated, both land in logo_url). Complete → the brand card leaves the dashboard; branding
  // is reached from the avatar menu instead.
  const brandComplete = !!((profile?.full_name || '').trim() && brokerage && profile?.logo_url);
  // Logo-derived accent for the brand card only; the soft ink when absent or too light (red is
  // the one main action on the view).
  const logoAccent = useLogoAccent(profile?.logo_url || '');
  const brandAccent = logoAccent || C.inkSoft;

  // Header note: the dashboard header is a plain in-flow element (position: static, see .dash-bg
  // override) that scrolls away with the page. Because nothing is fixed/sticky, there is no floating
  // bar for content to bleed under or be cut by — no measured content offset, no ResizeObserver, and
  // no scroll-fade are needed. The whole page (header included) simply scrolls as one.

  return (
    <>
      <Head>
        <title>Realtor Dashboard · Rentletter</title>
        <meta name="description" content="Your listings. Add a listing, share the invite link, review applicants." />
        {/* Tint the mobile browser chrome (status bar / toolbar) to the page eggshell so there is no
            white band at the very top or bottom edge. html/body/#__next backgrounds (below) cover the
            content, notch region (viewport-fit=cover), and overscroll canvas; this covers the chrome. */}
        <meta name="theme-color" content={C.paper} />
      </Head>
      <GlobalStyle />
      {/* overflow-x: clip contains any horizontal overflow without creating a scroll container.
          The canvas comes from the root (components/ui.js), so this wrapper paints no tone of its
          own; it only stretches to the viewport so a short page still reads as one surface. */}
      <div className="dash-bg" style={{ overflowX: 'clip' }}>
        {/* The shell (components/dashboard/DashShell.js): under 1024px the header as it always was,
            static and in flow (see .dash-bg .rl-header below), with the Listings and Circle tabs; at
            1024 and wider the sidebar and the main area. */}
        {/* On a desktop the greeting is the header row's lead, in line with the bell and the avatar,
            shown with the rest of the Listings view once it is in hand. */}
        <DashShell profile={profile} signals={headerSignals} onAssistantAction={onNoticeAction} nav={locked ? null : 'listings'} current={view} locked={locked} onNewListing={openNew} newPrimary={!empty}
          lead={!locked && ready && view === 'listings' ? <h1 className="hv-greet" style={{ visibility: greeting ? 'visible' : 'hidden' }}>{greeting || '\u00A0'}</h1> : null}>

        {locked && (
          <div className="hv-lock ds-col" style={{ maxWidth: 1100, margin: '0 auto', padding: '0 clamp(16px, 4vw, 32px)', '--ds-col': '1036px' }}>
            <Paywall entitlement={entitlement} profile={profile} pending={checkoutFlag === 'success'} />
          </div>
        )}
        {!locked && <div className="hv" data-view={view} style={{
          // The header is in normal flow directly above, so it takes its own space; a small top gap
          // is all that is needed. Ordinary bottom breathing room plus the home indicator inset.
          paddingTop: 'var(--s-2)',
          paddingBottom: 'max(var(--s-6), env(safe-area-inset-bottom, 0px))',
        }}>

          {/* One screen, shown in one step (components/brand/Loader.js Reveal): the door until the
              listings and the signals are both in hand, then everything at once. */}
          <Reveal ready={ready} label="Loading your workspace" failed={listingsError && !listingsLoaded ? listingsFailed : loadWatch.failed ? <LoadFailed onRetry={loadWatch.again} /> : null}>
          <div className="hv-cols">
          <div className="hv-primary">
          {/* PHONE. 1. THE INK CARD: the greeting (the hour from the client, lib/greeting.js) over the
              standing as plain numbers, counted from the loaded signals. No rows, no verbs, no links:
              what is next lives in the bell. Then the one red action on the page: New listing.
              With no listing yet it is the start: the heading and its line on the card, the button
              right under it, and the three steps; all of it on one screen at 390. */}
          <div className="hv-phone">
          <section className="dash-ink" aria-label="Welcome" style={{ background: C.inst, color: C.instText, borderRadius: R.card, padding: 'var(--card-pad)' }}>
            <h1 className="dash-greet" aria-live="polite" style={{ color: C.paper, margin: 0, minHeight: 'calc(var(--t-d1) * var(--lh-display))', visibility: greeting ? 'visible' : 'hidden', overflowWrap: 'anywhere' }}>{greeting || '\u00A0'}</h1>
            {empty ? (
              <div data-get-started="phone">
                <h2 className="dash-start-h">{START.heading}</h2>
                <p className="dash-start-line">{START.line}</p>
              </div>
            ) : standing.items.length ? (
              <ul className="dash-standing" aria-label="Your workspace">
                {standing.items.map(([n, label]) => <li key={label}><span className="dash-standing-n">{n}</span> {label}</li>)}
              </ul>
            ) : (
              <div style={{ marginTop: 'var(--s-2)', display: 'flex', alignItems: 'center', gap: 'var(--s-2)', fontSize: 'var(--t-body-2)', color: C.instText, lineHeight: 'var(--lh-body)' }}>
                <Icon name="check" size={15} color={C.instText} strokeWidth={2.5} /> Nothing waiting on you.
              </div>
            )}
          </section>
          <button type="button" onClick={openNew} className="dash-new" style={{ marginTop: 'var(--s-3)' }}>
            <Icon name="plus" size={17} /> New listing
          </button>
          {/* The three steps, under the button, while there is no listing. */}
          {empty ? <ol className="dash-steps" data-get-started-steps="">{START.steps.map(([title, line], i) => <li key={title}><span className="dash-step-n" aria-hidden="true">{i + 1}</span><span><span className="dash-step-t">{title}</span><span className="dash-step-l">{line}</span></span></li>)}</ol> : null}
          {/* iOS Safari only, until dismissed once on this device (components/dashboard/InstallHint.js).
              Held back while there is no listing, so the start fits one screen. */}
          {!empty && <InstallHint />}
          </div>

          {/* DESKTOP. The three numbers that filter the table, one row across the listings column (the
              greeting is in the header row, above), or with no listing yet the start, filling it. */}
          <div className="hv-desk hv-part-listings">
            {hasListings ? <DeskStats standing={standing} filter={filter} onFilter={setFilter} /> : null}
            {empty ? (
              <div className="hv-start" data-get-started="desktop">
                <h2 className="hv-start-h">{START.heading}</h2>
                <p className="hv-start-line">{START.line}</p>
                <button type="button" onClick={openNew} className="ds-btn ds-btn-primary hv-start-new" data-get-started-new="">
                  <Icon name="plus" size={16} /> New listing
                </button>
                <ol className="hv-steps">{START.steps.map(([title, line], i) => <li key={title}><span className="hv-step-n" aria-hidden="true">{i + 1}</span><span className="hv-step-t">{title}</span><span className="hv-step-l">{line}</span></li>)}</ol>
              </div>
            ) : null}
          </div>
          {trialDays != null && <p className="dash-note dash-data">{trialDays === 1 ? '1 day' : `${trialDays} days`} left on your trial. <a href="/billing" style={{ color: C.ink, fontWeight: 700 }}>See plans</a></p>}

          {/* 2. YOUR LISTINGS. On a phone each card is its address, rent, beds and its state; on a
              desktop, one row a listing in the table. */}
          {error && (
            <div className="dash-block" role="alert" style={{ padding: 'var(--s-3) var(--s-4)', background: C.dangerTint, borderRadius: R.ctrl, borderLeft: `3px solid ${C.danger}`, fontSize: 'var(--t-body-2)', color: C.ink }}>
              {error}
            </div>
          )}
          {hasListings && (
            <div className="dash-block hv-part-listings hv-phone">
              <div className="dash-section-head">
                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 'var(--s-2)', minWidth: 0 }}>
                  <h2 className="dash-h2">Your listings</h2>
                  <span className="dash-count">{shelf === 'archived' ? archivedListings.length : openListings.length}</span>
                </span>
                {canArchive ? shelfSwitch : null}
              </div>
              {actNote ? <p className="hv-act-note" role="status">{actNote}</p> : null}
              {/* The search past eight listings, then the Sort control and how many match. */}
              <div className="hv-tools" data-listing-tools="phone">
                {canFind ? findField('phone') : null}
                <div className="hv-tools-row">{sortButton}{foundLine}</div>
              </div>
              {shelf === 'archived' ? (
                <div className="dash-grid" data-archived-cards="">
                  {archivedListings.length === 0 ? <p className="hv-quiet-phone">Nothing archived.</p> : searched && !found ? noMatch : null}
                  {archivedCards.map((l) => (
                    <div key={l.id} role="link" tabIndex={0} aria-label={displayLabel(l, 'Untitled listing')} data-press="card" className="dash-card dash-card-int"
                      {...cardProps(adapter.paths.listing(l.id))}
                      style={{ cursor: 'pointer', color: C.ink, padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 'var(--gap-line)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--s-3)', minWidth: 0 }}>
                        <div className="t-d3" style={{ color: C.inkSoft, minWidth: 0, overflowWrap: 'anywhere', textWrap: 'balance' }}>{displayLabel(l, 'Untitled listing')}</div>
                        <div className="num" style={{ fontSize: 'var(--t-body)', fontWeight: 700, color: C.inkSoft, whiteSpace: 'nowrap', textAlign: 'right', flexShrink: 0 }}>{l.monthly_rent ? `$${Number(l.monthly_rent).toLocaleString()}` : 'No rent'}</div>
                      </div>
                      <div className="dash-card-foot">
                        <StatusPills label="Listing status" items={['Archived']} />
                        {cardMenu(l)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
              <div className="dash-grid">
                {searched && !found ? noMatch : null}
                {openCards.map((l) => (
                  <div key={l.id} role="link" tabIndex={0} aria-label={displayLabel(l, 'Untitled listing')} className="dash-card dash-card-int" data-press="card"
                    {...cardProps(adapter.paths.listing(l.id))}
                    style={{ cursor: 'pointer', color: C.ink, padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 'var(--gap-line)' }}>
                    {/* Name left, the rent right in tabular numerals, so the rents line up down the column. */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--s-3)', minWidth: 0 }}>
                      <div className="t-d3" style={{ color: C.ink, minWidth: 0, overflowWrap: 'anywhere', textWrap: 'balance' }}>{displayLabel(l, 'Untitled listing')}</div>
                      <div className="num" style={{ fontSize: 'var(--t-body)', fontWeight: 700, color: C.ink, whiteSpace: 'nowrap', textAlign: 'right', flexShrink: 0 }}>{l.monthly_rent ? `$${Number(l.monthly_rent).toLocaleString()}` : 'No rent'}</div>
                    </div>
                    <div style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft, lineHeight: 'var(--lh-body)' }}>
                      {l.monthly_rent ? 'per month' : 'Rent not set'}{formatUnit(l.bedrooms) ? `, ${formatUnit(l.bedrooms)}` : ''}
                    </div>
                    {/* The state as pills, all in the one status style: the applicants by what they
                        need, then the report (lib/listingStateLine.js); beside them the card's menu. */}
                    <div className="dash-card-foot">
                      <StatusPills label="Listing status" items={listingStatePills(l, signals.applicantsByListing[l.id] || []).map((x) => x.text)} />
                      {cardMenu(l)}
                    </div>
                  </div>
                ))}
                {/* Rented and closed listings, below the active ones under one muted word. */}
                {closedCards.length > 0 && (
                  <div className="dash-eyebrow" role="separator" aria-label="Rented listings" style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)', color: C.inkMute, gridColumn: '1 / -1' }}>
                    <span>Rented</span><span aria-hidden="true" style={{ flex: 1, height: 1, background: C.rule }} />
                  </div>
                )}
                {closedCards.map((l) => (
                  <div key={l.id} role="link" tabIndex={0} aria-label={displayLabel(l, 'Untitled listing')} data-press="card" className="dash-card dash-card-int"
                    {...cardProps(adapter.paths.listing(l.id))}
                    style={{ cursor: 'pointer', color: C.ink, padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 'var(--gap-line)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--s-3)', minWidth: 0 }}>
                      <div className="t-d3" style={{ color: C.inkSoft, minWidth: 0, overflowWrap: 'anywhere', textWrap: 'balance' }}>{displayLabel(l, 'Untitled listing')}</div>
                      <div className="num" style={{ fontSize: 'var(--t-body)', fontWeight: 700, color: C.inkSoft, whiteSpace: 'nowrap', textAlign: 'right', flexShrink: 0 }}>{l.monthly_rent ? `$${Number(l.monthly_rent).toLocaleString()}` : 'No rent'}</div>
                    </div>
                    <div className="dash-card-foot">
                      <StatusPills label="Listing status" items={listingStatePills(l, signals.applicantsByListing[l.id] || []).map((x) => x.text)} />
                      {cardMenu(l)}
                    </div>
                  </div>
                ))}
                {openListings.length === 0 && closedListings.length === 0 ? <p className="hv-quiet-phone">No active listings.</p> : null}
              </div>
              )}
            </div>
          )}
          {hasListings && (
            <div className="hv-desk hv-part-listings hv-section" data-listings-view="">
              <div className="hv-head">
                <h2 className="dash-h2">Your listings</h2>
                <span className="hv-count" aria-label={`${shelf === 'archived' ? foundArchived.length : shownRows.length} shown`}>{shelf === 'archived' ? foundArchived.length : shownRows.length}</span>
                {filter !== 'all' && shelf === 'active' ? (
                  <span className="hv-filter">
                    {filter === 'applicants' ? 'With applicants' : 'With a report to send'}
                    <button type="button" className="ds-btn ds-btn-quiet" onClick={() => setFilter('all')}>Show all</button>
                  </span>
                ) : null}
                {/* The switch, then the Sort menu with the eight orders (two of them no column holds). */}
                <span className="hv-head-tools">{canArchive ? shelfSwitch : null}{sortMenu}</span>
              </div>
              {canFind ? <div className="hv-find-row">{findField('desk')}{foundLine}</div> : null}
              {/* The bar for the rows picked: archive (or restore) them, or delete the ones that can go. */}
              {picked.size ? (
                <div className="hv-bulk rl-glass" role="region" aria-label="Selected listings" data-bulk-bar="" data-stuck="">
                  <span className="hv-bulk-n">{picked.size} selected</span>
                  {canArchive ? <button type="button" className="ds-btn ds-btn-line" disabled={acting} onClick={() => archiveIds([...picked], shelf !== 'archived')}>{shelf === 'archived' ? 'Restore' : 'Archive'}</button> : null}
                  <button type="button" className="ds-btn ds-btn-line hv-danger" disabled={acting} onClick={() => setAsk({ ids: [...picked] })} data-bulk-delete="">Delete</button>
                  <button type="button" className="ds-btn ds-btn-quiet" onClick={() => setPicked(new Set())}>Clear</button>
                </div>
              ) : null}
              {actNote ? <p className="hv-act-note" role="status" data-act-note="">{actNote}</p> : null}
              {shelf === 'archived' ? (
                !archivedRows.length ? <p className="hv-quiet" data-archived-empty="">Nothing archived.</p>
                  : foundArchived.length ? <ListingsTable rows={foundArchived} now={now} paths={adapter.paths} label="Archived listings" select={rowSelect(foundArchived)} sort={sorts.archived} onSort={onHeading} /> : noMatch
              ) : searched && !found ? noMatch : (
                <>
                  {shownRows.length ? <ListingsTable rows={shownRows} now={now} paths={adapter.paths} select={rowSelect(shownRows)} sort={sorts.active} onSort={onHeading} /> : searched && filter === 'all' ? null : <p className="hv-quiet">{rows.length ? <>No listing matches. <button type="button" className="ds-btn ds-btn-quiet" onClick={() => setFilter('all')}>Show all</button></> : 'No active listings.'}</p>}
                  {filter === 'all' && foundClosed.length > 0 && (
                    <div className="hv-rented">
                      <div className="hv-head"><h3 className="hv-h3">Rented</h3><span className="hv-count">{foundClosed.length}</span></div>
                      <ListingsTable rows={foundClosed} now={now} paths={adapter.paths} label="Rented listings" select={rowSelect(foundClosed)} sort={sorts.active} onSort={onHeading} />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* DESKTOP. The Pipeline under the listings (components/dashboard/PipelineSoon.js): the same
              people as the Pipeline view, soonest first, and the way to the full view. With no
              listing, and on Archived, too, so the column is never a lone table on an empty page. */}
          <div className="hv-desk hv-part-listings hv-section">
            <PipelineSoon people={signals.people || []} href={pipelineHref} onOpen={openPipeline} />
          </div>

          {/* 3. PIPELINE (components/dashboard/PeopleList.js): under the listings on a phone; on a
              desktop its own view, and its soonest items feed Needs you. */}
          {(hasListings || view === 'pipeline') && <div className="hv-part-pipeline hv-section-phone"><PeopleList people={signals.people || []} /></div>}

          {/* Profiles tenants shared with this realtor as listing agent (components/dashboard/SharedWithMe.js): nothing when there are none. */}
          <div className="hv-part-shared">
            <SharedWithMe />
            {Array.isArray(shared) && shared.length === 0 ? (
              <div className="hv-desk" data-shared-empty="">
                <h2 className="dash-h2">Shared with you</h2>
                <p className="hv-quiet">No tenant has shared a profile with you yet.</p>
              </div>
            ) : null}
          </div>

          {/* 4. BRAND CARD, only while branding is incomplete and there is a listing (the zero
              listing state is one card, nothing else). Whole card opens the profile. */}
          {hasListings && !brandComplete && (
            <a {...linkProps(adapter.paths.profile)} data-press="card" className="dash-card dash-card-int dash-brand dash-block hv-part-listings" style={{ borderLeft: `3px solid ${brandAccent}` }}
              title="You and your brand" aria-label="Set up your profile and branding">
              <div className="dash-eyebrow">Your brand</div>
              <div className="dash-brand-identity">
                {profile?.logo_url
                  ? <img src={profile.logo_url} alt="" className="dash-brand-logo" />
                  : <span className="dash-brand-initials" aria-hidden="true">{initialsOf(profile)}</span>}
                <span className="dash-brand-id">
                  <span className="dash-brand-name">{profile?.full_name || 'Your name'}</span>
                  <span className="dash-brand-brok">{brokerage || 'Add your brokerage'}</span>
                  <span className="dash-brand-desc">Your logo, name, and brokerage appear on every report you send.</span>
                </span>
              </div>
              <span className="dash-brand-foot">
                {profile?.full_name && brokerage ? 'Add your logo' : 'Set up branding'} <span className="rl-arrow" style={{ display: 'inline-flex' }}><Icon name="arrow" size={15} /></span>
              </span>
            </a>
          )}
          </div>

          {/* DESKTOP. NEEDS YOU: the next things to do, newest first (components/dashboard/NeedsYou.js). */}
          <div className="hv-aside hv-desk" data-stuck="">
            <NeedsYou items={needs} now={now} onGo={onNeed} />
          </div>
          </div>
          </Reveal>
        </div>}

        </DashShell>
        {/* A phone card's actions, in the one sheet (components/Sheet.js). */}
        <Sheet open={!!menuFor} onClose={() => setMenuFor(null)} label={menuFor ? displayLabel(menuFor, 'This listing') : 'Listing'} maxWidth={480}>
          {menuFor ? (
            <div className="hv-menu" data-card-menu-sheet="">
              <h3 data-sheet-drag="" className="hv-menu-t">{displayLabel(menuFor, 'This listing')}</h3>
              {canArchive ? <button type="button" className="ds-btn ds-btn-line" disabled={acting} onClick={() => archiveIds([menuFor.id], !isArchived(menuFor))}>{isArchived(menuFor) ? 'Restore' : 'Archive'}</button> : null}
              <button type="button" className="ds-btn ds-btn-line hv-danger" disabled={acting} onClick={() => { const id = menuFor.id; setMenuFor(null); setAsk({ ids: [id] }); }}>Delete</button>
              <button type="button" className="ds-btn ds-btn-quiet" onClick={() => setMenuFor(null)}>Cancel</button>
            </div>
          ) : null}
        </Sheet>
        {/* The order of the cards, under 1024 (the same eight choices as the menu at 1024 and wider). */}
        <Sheet open={sortOpen} onClose={() => setSortOpen(false)} label="Sort listings" maxWidth={480}>
          {sortOpen ? (
            <div className="hv-menu" data-sort-sheet="">
              <h3 data-sheet-drag="" className="hv-menu-t">Sort listings</h3>
              <div className="hv-sort-list" role="radiogroup" aria-label="Sort listings">
                {sortChoices.map((c) => { const on = sameSort(c, sort); return (
                  <button key={c.id} type="button" role="radio" aria-checked={on ? 'true' : 'false'} className="hv-sort-opt" data-sort-choice={c.id} onClick={() => choose(c)}>
                    <span>{c.label}</span>{on ? <Icon name="check" size={18} strokeWidth={2} /> : null}
                  </button>
                ); })}
              </div>
            </div>
          ) : null}
        </Sheet>
        <ConfirmSheet open={!!askInfo} danger={askInfo ? askInfo.danger : false} title={askInfo ? askInfo.title : ''} body={askInfo ? askInfo.body : ''} confirmLabel={askInfo ? askInfo.confirm : 'Delete'} cancelLabel="Keep it" busy={acting} busyLabel="Working" onConfirm={() => askInfo && askInfo.run()} onCancel={() => setAsk(null)} />
        <NewListingPanel open={modalOpen} initial={dupe} profile={profile} userId={userId} onClose={closeModal} onError={setError}
          onProfile={(saved, province) => setProfile((p) => ({ ...(saved || p), province }))}
          onCreated={(data) => setListings((cur) => [data, ...(cur || []).filter((l) => l.id !== data.id)])} />
      </div>

      <style jsx>{`
        /* ── Base canvas: ONE flat, uniform tone, painted at the root as var(--paper)
           (components/ui.js), no glows and no gradients. The header carries the same token (below),
           so header and page read as a single surface top to bottom: no distinct header band,
           nothing to flash on scroll, and the notch region matches too. The white cards (C.card)
           sit raised on that canvas. ── */
        .dash-bg {
          /* No background here: the canvas is painted at the root (components/ui.js var(--paper)),
             so there is nothing to stop at the last card. Short pages still fill the viewport. */
          min-height: 100vh;
          min-height: 100dvh;
        }
        /* The dashboard header is a NORMAL, STATIC, in-flow element — it scrolls up and off with the
           page like any other content, NOT fixed/sticky. With no floating bar, there is no fixed layer
           for content to bleed under or be cut by, which eliminates the entire class of iOS fixed-vs-
           scrolling compositing bug (the half-cut title) at the source. It carries the exact page canvas
           tone (var(--paper)) so it reads as a seamless top strip of the page. Scoped here; the
           shared ScrollHeader (sticky) is unchanged on every other page. */
        .dash-bg :global(.rl-header) {
          position: static !important;            /* was fixed, now scrolls away with the page */
          background: var(--paper) !important;  /* the one canvas tone, seamless with the page */
          -webkit-backdrop-filter: none !important;
          backdrop-filter: none !important;
          border-bottom-color: transparent !important;
          box-shadow: none !important;
          /* As the topmost in-flow element, pad by the safe-area inset so the wordmark/controls clear
             the iPhone notch/status bar at the top of the page; the solid bg fills that region too.
             0 on non-notch browsers. */
          padding-top: env(safe-area-inset-top, 0px);
        }
        /* Keep the header height constant when the shared scroll-shrink class toggles at ~8px scroll
           (it tightens the inner padding) so the in-flow content below doesn't jump as you start
           scrolling. */
        .dash-bg :global(.rl-header.rl-shrink) .rl-header-inner {
          padding-top: 18px;
          padding-bottom: 18px;
        }
        /* ── One tasteful elevation tier — crafted card, soft rounded corners ── */
        .dash-card {
          background: ${C.card};
          border: 1px solid var(--rule);
          border-radius: var(--card-radius);
          box-shadow: 0 1px 2px rgba(15, 15, 16, 0.04), 0 10px 30px rgba(15, 15, 16, 0.05);
        }

        /* ── Type scale: three tiers on this screen ──
           display  (.dash-greet at --t-d1, .dash-h2 at --t-d3)  Fraunces serif
           body     (inherited) Inter 400/500 · everything else
           data     (.dash-data) Inter 800 + tabular-nums, every number that must line up */
        .dash-greet { font-family: var(--f-display); font-size: var(--t-d1); font-weight: 600; letter-spacing: -0.02em; line-height: var(--lh-display); }
        .dash-h2 { font-family: var(--f-display); font-size: var(--t-d3); font-weight: 600; letter-spacing: -0.01em; line-height: var(--lh-display); color: ${C.ink}; }
        .dash-data { font-weight: 800; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
        .dash-eyebrow { display: inline-flex; align-items: center; gap: var(--s-2); font-size: var(--t-eyebrow); font-weight: 700; letter-spacing: 0.1em; line-height: var(--lh-eyebrow); text-transform: uppercase; color: ${C.inkMute}; margin-bottom: var(--s-2); }

        /* ── The one red action on the page: New listing, a full width 44px row, the radius and
           padding every dashboard button has (components/dashboard/DashShell.js .ds-btn) ── */
        .dash-new { width: 100%; min-height: 44px; background: ${C.red}; color: ${C.paper}; border: none; border-radius: var(--btn-radius); padding: 0 var(--gap-card); font-size: var(--t-body-2); font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: var(--s-2); font-family: inherit; }
        /* The standing on the ink card: plain numbers with their words, no pills. */
        .dash-standing { list-style: none; margin: var(--s-3) 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--s-1) var(--s-4); font-size: var(--t-body-2); color: ${C.instText}; line-height: var(--lh-body); }
        .dash-standing li { white-space: nowrap; }
        .dash-standing-n { font-weight: 800; color: ${C.paper}; font-variant-numeric: tabular-nums; }

        /* ── Branding tile — identity moment, whole card → /profile. The card's 3px left edge
           (inline style) carries the colour sampled from the uploaded logo, red otherwise. ── */
        .dash-brand { display: flex; flex-direction: column; gap: var(--s-3); padding: var(--s-4); text-decoration: none; color: ${C.ink}; }
        /* The name and brokerage beside the logo while they keep 280px; on a phone, under it, the card's width. */
        .dash-brand-identity { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-3); min-width: 0; }
        /* Transparent logo art sits straight on the card surface — no tile, no frame. */
        .dash-brand-logo { width: clamp(72px, 20vw, 96px); height: clamp(72px, 20vw, 96px); object-fit: contain; flex-shrink: 0; }
        /* Neutral backing exists ONLY as the no-logo fallback (initials as a placeholder mark). */
        .dash-brand-initials { width: clamp(64px, 18vw, 84px); height: clamp(64px, 18vw, 84px); border-radius: 14px; background: ${C.paperDeep}; border: 1px solid ${C.rule}; display: inline-flex; align-items: center; justify-content: center; font-family: ${FONT.serif}; font-weight: 600; font-size: var(--t-d3); color: ${C.inkSoft}; flex-shrink: 0; }
        .dash-brand-id { display: flex; flex-direction: column; gap: var(--s-1); min-width: 0; flex: 1 1 280px; }
        /* Masthead byline: name in the display serif, brokerage muted below. */
        .dash-brand-name { font-family: ${FONT.serif}; font-size: var(--t-d3); font-weight: 600; color: ${C.ink}; letter-spacing: -0.015em; line-height: 1.15; overflow-wrap: anywhere; text-wrap: balance; }
        .dash-brand-brok { font-size: var(--t-body-2); color: ${C.inkMute}; overflow-wrap: anywhere; }
        /* Below 345px a long name takes the body size (16px), so it holds two words a line at 320. */
        @media (max-width: 344.98px) { .dash-brand-name { font-size: var(--t-body); } }
        .dash-brand-desc { font-size: var(--t-body-2); color: ${C.inkSoft}; line-height: 1.5; margin-top: var(--s-1); text-wrap: balance; white-space: normal; }
        .dash-brand-foot { margin-top: auto; display: inline-flex; align-items: center; gap: var(--s-1); font-size: var(--t-body-2); font-weight: 700; color: ${C.ink}; }

        /* ── Section rhythm: one gap between blocks, and a short note under the greeting ── */
        .dash-block { margin-top: var(--gap-card); }
        .dash-note { font-size: var(--t-body-2); color: ${C.inkMute}; font-variant-numeric: tabular-nums; margin: var(--s-2) var(--s-1) 0; }
        .dash-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: var(--s-4); }
        /* ── Listing invite-link status chip (real data) ── */
        .dash-lchip { display: inline-flex; align-items: center; gap: var(--s-1); font-size: var(--t-eyebrow); font-weight: 600; color: ${C.inkMute}; }
        .dash-lchip-on { color: ${C.ink}; }
        .dash-lchip-dot { width: 6px; height: 6px; border-radius: 50%; background: ${C.ink}; flex-shrink: 0; }
        .dash-lchip-dot-off { background: ${C.ruleDark}; }

        /* ── Section head + ghost button ── */
        .dash-section-head { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); flex-wrap: wrap; margin: var(--gap-section) 0 var(--s-4); }
        .dash-count { font-size: var(--t-body-2); font-weight: 700; color: ${C.inkMute}; font-variant-numeric: tabular-nums; }
        .dash-ghost { background: ${C.card}; color: ${C.ink}; border: 1px solid ${C.ruleDark}; border-radius: var(--btn-radius); min-height: 44px; padding: 0 var(--gap-card); font-size: var(--t-body-2); font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: var(--s-1); }

        /* Instant (motion-independent) hover colour states — safe for reduced-motion */
        .dash-ghost:hover { background: ${C.paperDeep}; border-color: ${C.ink}; }
        /* The listing cards never move: a pointer that hovers darkens the border, at once. */
        @media (hover: hover) { .dash-card-int:hover { border-color: ${C.ruleDark}; } }

        /* The press is the shared one (lib/motion.js installPress); a pointer that hovers gets a shadow, at once. */
        @media (hover: hover) { .dash-new:hover { box-shadow: 0 8px 22px rgba(215, 32, 39, 0.28); } }

        /* ── The start (no listing yet): on the ink card the heading and its line; the steps under
           the button, numbered, each a title and a short line. ── */
        .dash-start-h { font-family: var(--f-display); font-size: var(--t-d2); font-weight: 600; letter-spacing: -0.015em; line-height: var(--lh-display); color: ${C.paper}; margin: var(--s-3) 0 0; text-wrap: balance; }
        .dash-start-line { font-size: var(--t-body-2); color: ${C.instText}; line-height: var(--lh-body); margin: var(--s-2) 0 0; text-wrap: balance; }
        .dash-steps { list-style: none; margin: var(--s-4) 0 0; padding: 0; display: grid; gap: var(--s-3); }
        .dash-steps li { display: flex; align-items: flex-start; gap: var(--s-3); }
        .dash-step-n, .hv-step-n { flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; border: 1px solid ${C.ruleDark}; font-size: var(--t-body-2); font-weight: 700; color: ${C.ink}; font-variant-numeric: tabular-nums; }
        .dash-step-t { display: block; font-size: var(--t-body); font-weight: 700; color: ${C.ink}; line-height: 1.35; padding-top: 3px; }
        .dash-step-l { display: block; font-size: var(--t-body-2); color: ${C.inkSoft}; line-height: 1.4; margin-top: 2px; text-wrap: balance; }
        .hv-start-h { font-family: var(--f-display); font-size: 40px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.1; color: ${C.ink}; margin: 0; text-wrap: balance; }
        .hv-start-line { font-size: var(--t-body); color: ${C.inkSoft}; line-height: var(--lh-body); margin: var(--s-3) 0 0; max-width: 34em; text-wrap: balance; }
        .hv-start-new { margin-top: var(--s-5); }
        .hv-steps { list-style: none; margin: var(--gap-section) 0 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s-4); }
        .hv-steps li { display: flex; flex-direction: column; gap: var(--s-2); padding: var(--s-5); background: ${C.card}; border: 1px solid ${C.rule}; border-radius: var(--card-radius); }
        .hv-step-t { font-size: var(--t-body); font-weight: 700; color: ${C.ink}; line-height: 1.35; margin-top: var(--s-2); }
        .hv-step-l { font-size: var(--t-body-2); color: ${C.inkSoft}; line-height: var(--lh-body); text-wrap: balance; }
        @media (min-width: 1920px) { .hv-start-h { font-size: 48px; } .hv-start-line { font-size: 18px; } .hv-steps li { padding: var(--s-6); } .hv-step-t { font-size: 18px; } .hv-step-l { font-size: var(--t-body); } }

        /* ── Archive and delete: the Active and Archived switch, the line that says what happened,
           the bar for the picked rows, the checkboxes, a card's menu button and its sheet. ── */
        /* The switch, the checkboxes and the card's menu are built outside the returned tree, so
           their classes are global (and unique to this screen). */
        .dash-section-head :global(.hv-shelf), .hv-head :global(.hv-shelf) { margin-left: auto; }
        :global(.hv-shelf) { display: inline-flex; padding: 2px; border-radius: var(--btn-radius); border: 1px solid ${C.ruleDark}; background: ${C.card}; }
        /* 38px inside 2px of padding and the 1px border: the 44px every control on the view has. */
        :global(.hv-shelf button) { min-height: 38px; padding: 0 var(--gap-card); border-radius: var(--btn-radius); font-family: inherit; font-size: var(--t-body-2); font-weight: 600; color: ${C.inkSoft}; background: transparent; border: none; cursor: pointer; }
        :global(.hv-shelf button[aria-pressed='true']) { background: ${C.paperDeep}; color: ${C.ink}; font-weight: 700; }
        :global(.hv-shelf button:focus-visible) { outline: none; box-shadow: 0 0 0 2px ${C.ink}; }
        .hv-act-note { font-size: var(--t-body-2); color: ${C.inkSoft}; line-height: var(--lh-body); margin: 0 0 var(--s-3); text-wrap: balance; }
        .hv-bulk { position: sticky; top: var(--s-2); z-index: 5; display: flex; align-items: center; flex-wrap: wrap; gap: var(--s-2) var(--s-3); padding: var(--s-2) var(--s-2) var(--s-2) var(--s-4); margin-bottom: var(--s-3); border-radius: var(--card-radius); }
        /* It floats over the rows as the page scrolls: the glass (components/ui.js), its text ink. */
        .hv-bulk-n { font-size: var(--t-body-2); font-weight: 700; color: ${C.ink}; margin-right: auto; font-variant-numeric: tabular-nums; }
        :global(.ds-btn.hv-danger) { color: ${C.danger}; }
        :global(.hv-check) { width: 18px; height: 18px; margin: 0; accent-color: ${C.ink}; cursor: pointer; }
        .dash-card-foot { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--s-2); }
        .dash-card-foot :global(.rl-pills) { flex: 1 1 auto; min-width: 0; }
        :global(.dash-card-menu) { flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; margin: -8px -10px -10px 0; border-radius: 50%; color: ${C.inkSoft}; background: transparent; border: none; cursor: pointer; }
        :global(.dash-card-menu:focus-visible) { outline: none; box-shadow: 0 0 0 2px ${C.ink}; }
        .hv-quiet-phone { font-size: var(--t-body-2); color: ${C.inkMute}; line-height: var(--lh-body); margin: 0; grid-column: 1 / -1; }
        :global(.hv-menu) { display: grid; gap: var(--s-2); padding: 4px 20px 20px; }
        :global(.hv-menu-t) { font-size: 18px; font-weight: 800; color: ${C.ink}; letter-spacing: -0.015em; margin: 0 0 var(--s-2); overflow-wrap: anywhere; text-wrap: balance; }
        :global(.hv-menu .ds-btn) { width: 100%; }
        @media (min-width: 1024px) { .hv-head { align-items: center; } }

        /* ── The order and the search: the Sort control (a button and its sheet under 1024, a menu at
           1024 and wider), the search field past eight listings, how many match, and the line when
           none does. Every control the 44px height and the radius every dashboard button has
           (components/dashboard/DashShell.js .ds-btn). Built outside the returned tree, so their
           classes are global (and unique to this screen). ── */
        :global(.hv-tools) { display: grid; gap: var(--s-3); margin: 0 0 var(--s-4); }
        :global(.hv-tools-row) { display: flex; align-items: center; flex-wrap: wrap; gap: var(--s-2) var(--s-4); min-width: 0; }
        :global(.hv-find) { position: relative; display: block; min-width: 0; }
        :global(.hv-find-icon) { position: absolute; left: var(--gap-card); top: 0; bottom: 0; display: flex; align-items: center; color: ${C.inkMute}; pointer-events: none; }
        :global(.hv-find-input) { display: block; width: 100%; box-sizing: border-box; min-height: 44px; margin: 0; padding: 0 var(--gap-card) 0 calc(var(--gap-card) + 24px); border: 1px solid ${C.ruleDark}; border-radius: var(--btn-radius); background: ${C.card}; color: ${C.ink}; font-family: inherit; font-size: 16px; line-height: 1.2; -webkit-appearance: none; appearance: none; }
        :global(.hv-find-input::-webkit-search-decoration), :global(.hv-find-input::-webkit-search-cancel-button) { -webkit-appearance: none; appearance: none; }
        :global(.hv-find-input::placeholder) { color: ${C.inkMute}; opacity: 1; }
        :global(.hv-found) { margin: 0; font-size: var(--t-body-2); font-weight: 600; color: ${C.inkSoft}; line-height: var(--lh-body); font-variant-numeric: tabular-nums; white-space: nowrap; }
        :global(.hv-nomatch) { display: flex; align-items: center; flex-wrap: wrap; gap: var(--s-1) var(--s-2); grid-column: 1 / -1; min-width: 0; }
        :global(.hv-nomatch p) { margin: 0; font-size: var(--t-body-2); color: ${C.inkMute}; line-height: var(--lh-body); }
        :global(.hv-nomatch .ds-btn) { margin-left: calc(-1 * var(--s-2)); }
        :global(.hv-head-tools) { margin-left: auto; display: inline-flex; align-items: center; flex-wrap: wrap; justify-content: flex-end; gap: var(--s-2); }
        .hv-head :global(.hv-head-tools .hv-shelf) { margin-left: 0; }
        :global(.hv-find-row) { display: flex; align-items: center; flex-wrap: wrap; gap: var(--s-2) var(--s-4); margin: 0 0 var(--s-3); }
        :global(.hv-find-row .hv-find) { flex: 0 1 420px; }
        /* The menu: under its button, at the button's right edge, over the table. */
        :global(.hv-sortmenu) { position: relative; display: inline-flex; }
        :global(.hv-sortpop) { position: absolute; right: 0; top: calc(100% + var(--s-1)); z-index: 30; display: grid; gap: 2px; min-width: 248px; padding: var(--s-1); background: ${C.card}; border: 1px solid ${C.rule}; border-radius: var(--card-radius); box-shadow: 0 1px 2px rgba(15, 15, 16, 0.06), 0 12px 32px rgba(15, 15, 16, 0.12); }
        :global(.hv-sort-list) { display: grid; gap: 2px; }
        :global(.hv-sort-opt) { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); width: 100%; min-height: 44px; margin: 0; padding: 0 var(--gap-card); border: none; border-radius: var(--btn-radius); background: transparent; color: ${C.ink}; font-family: inherit; font-size: var(--t-body-2); font-weight: 600; line-height: 1.2; text-align: left; cursor: pointer; white-space: nowrap; }
        :global(.hv-sort-opt[aria-checked='true']) { background: ${C.paperDeep}; font-weight: 700; }
        :global(.hv-sort-opt:focus-visible) { outline: none; box-shadow: inset 0 0 0 2px ${C.ink}; }
        @media (hover: hover) { :global(.hv-sort-opt:hover) { background: ${C.paper}; } :global(.hv-sort-opt[aria-checked='true']:hover) { background: ${C.paperDeep}; } }
        :global(.hv-menu .hv-sort-opt) { font-size: var(--t-body); }

        /* ── Phone and desktop: both are in the markup, the width picks one ── */
        .hv { max-width: 1100px; margin: 0 auto; padding-left: clamp(16px, 4vw, 32px); padding-right: clamp(16px, 4vw, 32px); }
        .hv-desk { display: none; }
        .hv-section-phone { margin-top: var(--gap-section); }
        @media (min-width: 1024px) {
          /* The main area's whole width, its sides the shell's padding (components/dashboard/DashShell.js). */
          .hv { max-width: none; padding-left: var(--ds-pad); padding-right: var(--ds-pad); }
          .hv-phone { display: none; }
          .hv-desk { display: block; }
          .hv-cols { display: grid; grid-template-columns: minmax(0, 1fr); row-gap: var(--gap-section); }
          .hv-primary { min-width: 0; }
          .hv-section-phone { margin-top: 0; }
          /* The views: Listings, Pipeline, Shared with you (components/dashboard/DashShell.js). */
          .hv:not([data-view='listings']) .hv-part-listings { display: none; }
          .hv:not([data-view='pipeline']) .hv-part-pipeline { display: none; }
          .hv:not([data-view='shared']) .hv-part-shared { display: none; }
          /* The greeting, the header row's lead: built for the shell, so its class is global (and
             unique to this screen). */
          :global(.hv-greet) { font-family: var(--f-display); font-size: var(--t-d2); font-weight: 600; letter-spacing: -0.015em; line-height: var(--lh-display); color: ${C.inkSoft}; margin: 0; white-space: nowrap; }
          .hv-section { margin-top: var(--gap-section); }
          .hv-head { display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--s-2) var(--s-3); margin-bottom: var(--s-3); }
          .hv-count { font-size: var(--t-body-2); font-weight: 700; color: ${C.inkMute}; font-variant-numeric: tabular-nums; }
          .hv-filter { display: inline-flex; align-items: center; gap: var(--s-2); font-size: var(--t-body-2); color: ${C.inkSoft}; }
          .hv-quiet { font-size: var(--t-body-2); color: ${C.inkMute}; line-height: var(--lh-body); margin: 0; }
          .hv-rented { margin-top: var(--gap-section); }
          .hv-h3 { font-size: var(--t-eyebrow); font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${C.inkMute}; margin: 0; }
          .hv-part-shared :global([data-shared-with-me]) { margin-top: 0; }
          .hv-part-shared [data-shared-empty] .dash-h2 { margin-bottom: var(--s-2); }
          .dash-brand { margin-top: var(--gap-section); }
        }
        /* Needs you at the main area's right edge from 1280: about 340px wide there, growing with the
           window to 440px at 2560, the gap to it the main area's padding. Under 1280 it sits under
           the listings. */
        @media (min-width: 1280px) {
          .hv-cols { grid-template-columns: minmax(0, 1fr) clamp(340px, calc(240px + 7.8125vw), 440px); column-gap: calc(var(--ds-pad) - 8px); align-items: start; }
          .hv-aside { position: sticky; top: var(--s-4); }
        }
        /* 1280 to 1399, the listings column at its narrowest: the three steps of the start one under
           another, so each title keeps its line. */
        @media (min-width: 1280px) and (max-width: 1399.98px) { .hv-steps { grid-template-columns: minmax(0, 1fr); } }
        /* A large screen: the headings and the greeting a size up, the sections a little further apart. */
        @media (min-width: 1920px) {
          :global(.hv-greet) { font-size: 26px; }
          .dash-h2 { font-size: 20px; }
          .hv-section, .hv-rented, .dash-brand { margin-top: var(--s-7); }
          .hv-head { margin-bottom: var(--s-4); }
          .hv-count { font-size: var(--t-body); }
        }
      `}</style>
    </>
  );
}
