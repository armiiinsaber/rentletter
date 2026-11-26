// components/dashboard/HomeView.js
// The realtor dashboard HOME: the real page (pages/dashboard.js, Supabase SSR) and /demo/dashboard
// (in-memory fixture) render the SAME component. All I/O goes through useAdapter()
// (lib/dashboardAdapter). Business-model logic unchanged.
// THE LISTINGS VIEW, in the shell (components/dashboard/DashShell.js): the status board (the date and
// four tiles, components/dashboard/StatusBoard.js), the listings as cards (components/dashboard/
// ListingCard.js) or, switched next to Active and Archived and kept on this device, the Compact
// table (components/dashboard/ListingsTable.js), Needs you beside them from 1280px (under them
// between 1024 and 1279, the bell's on a phone), and the Pipeline under them. Every count and next
// step on it comes from one function, components/dashboard/board.js boardOf: the tiles, the cards,
// Needs you, the sidebar's count and the Needs attention first order. While the data loads the page
// shows its own shape in pale placeholders (components/dashboard/BoardSkeleton.js).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { GlobalStyle, Icon, ConfirmSheet } from '../../components/ui';
import Sheet from '../Sheet';
import SendReportSheet from './SendReportSheet';
import ListingSetupModal from '../listings/ListingSetupModal';
import { NATIVE, prefersReducedMotion } from '../../lib/motion';
import { deleteCheck, archiveAvailable, isArchived, NOT_DELETABLE_LINE, skipLine } from '../../lib/listingArchiveRule';
import { getEntitlement } from '../../lib/entitlements';
import { billingOff } from '../../lib/billingOff';
import Paywall from './Paywall';
import { C, FONT } from '../../components/theme';
import DashShell, { viewOf, viewHref, SHELF_EVENT } from './DashShell';
import { ListingsTable, FILTERS } from './ListingsTable';
import NeedsYou from './NeedsYou';
import PipelineSoon from './PipelineSoon';
import StatusBoard from './StatusBoard';
import ListingCard, { ListingCardStyles } from './ListingCard';
import BoardSkeleton from './BoardSkeleton';
import { rowOf, needsYouItems } from './homeData';
import { boardOf } from './board';
import { DEFAULT_SORT, SEARCH_FROM, orderIds, arrange, rowSet, headingSort, sortName, sameSort, choicesFor, validSort, readSort, writeSort, matchRows, searchWords } from './listingSort';
import { useCirclePending } from './MainNav';
import { navigateToAction } from './actionNav';
import InstallHint from '../../components/dashboard/InstallHint';
import { OPEN_EVENT } from '../../components/dashboard/AssistantBell';
import PeopleList from '../../components/dashboard/PeopleList';
import SharedWithMe, { useSharedWithMe } from './SharedWithMe';
import NewListingPanel from '../../components/listings/NewListingPanel';
import { go, goView, linkProps, rememberListings, rememberProfile, rememberSignals, seenSignals, takeWarm, forgetWarm, SIGNALS_URL, rememberScreenView, prefetchCode, useTakeOver } from '../nav/routes';
import { useLoadWatch, LoadFailed } from '../nav/RouteLoader';
import { Reveal } from '../brand/Loader';
import { useAdapter } from '../../lib/dashboardAdapter';
import { listingOpen } from '../../lib/listingState';
import { referralsEnabled } from '../../lib/features';
import { displayLabel } from '../../lib/listingAddress';
import { isWithdrawn, isSetAside } from '../../lib/listingApplicantsVocabulary';

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
// The Listings view as cards or as the Compact table, kept on this device the same way.
let modeSeen = null;
const MODE_STORE = 'rl-listing-view';
const readMode = (store) => { try { return store && store.getItem(MODE_STORE) === 'compact' ? 'compact' : 'cards'; } catch (e) { return 'cards'; } };
const writeMode = (store, mode) => { try { if (store) store.setItem(MODE_STORE, mode === 'compact' ? 'compact' : 'cards'); } catch (e) { /* kept for this visit only */ } };
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
    const back = opener.current && document.contains(opener.current) && opener.current.getClientRects().length ? opener.current : [...document.querySelectorAll('[data-shell-new], [data-tab-new], [data-get-started-new]')].find((b) => b.getClientRects().length);
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
  const openListings = useMemo(() => liveListings.filter((l) => listingOpen(l)), [liveListings]);
  const closedListings = useMemo(() => liveListings.filter((l) => !listingOpen(l)), [liveListings]);
  // Client retry when the server-side listings query failed (an expired access token being
  // refreshed under RLS is the usual reason). Until it resolves the page shows its placeholders,
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
  // ── The signals: the realtor's own applicants per listing, notifications, referrals, the Pipeline.
  // Normally these arrive WITH the page (pages/dashboard.js loads them server side as
  // initialSignals) so the dashboard commits in one paint. Without them (demo workspace, or a
  // server side failure) they are fetched here and the page holds its placeholders until they land,
  // so nothing ever appears after the rest. No AI involved. After a tap inside the app the page
  // comes without them (pages/dashboard.js): the signals seen earlier this session show at once and
  // the fetch below refreshes them.
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
  // line and the pill take the placeholders' place (components/nav/RouteLoader.js). A page back
  // from the browser's cache, its reads cut off when it was hidden, is retried the same way.
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
  // The listings could not be read: said in the placeholders' place, with a way to try again.
  const listingsFailed = (
    <section className="hv-failed" role="alert">
      <h2 className="hv-h2">We couldn’t load your listings.</h2>
      <p className="hv-quiet">They are still there. Give it a moment and try again.</p>
      <button type="button" className="ds-btn ds-btn-line" onClick={() => window.location.reload()}>Try again</button>
    </section>
  );
  // Event-type Noticed actions go to the listing page, which owns the applicant cards:
  // #docs=<linkId>[&renew] makes ListingView open that applicant (marking them reviewed), scroll to
  // them and light up the document-request panel.
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
  // The views: Listings, Pipeline, Shared with you (components/dashboard/DashShell.js).
  const view = viewOf(router.query);
  // The tile a realtor pressed: the cards it counts, or all of them.
  const [filter, setFilter] = useState('all');
  // The client's clock for the date, the waits and the relative times, after mount (the server's
  // render and the first client render agree), once a minute after that.
  const [now, setNow] = useState(null);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t); }, []);
  const circlePending = useCirclePending();
  const shared = useSharedWithMe();
  const byListing = useMemo(() => signals.applicantsByListing || {}, [signals.applicantsByListing]);
  // THE BOARD: every count and next step on the page (components/dashboard/board.js).
  const board = useMemo(() => boardOf({ listings: liveListings, applicantsByListing: byListing, people: signals.people || [], now }), [liveListings, byListing, signals.people, now]);
  const cardFor = (l) => board.byId[l.id] || boardOf({ listings: [l], applicantsByListing: { [l.id]: byListing[l.id] || [] }, now }).byId[l.id];
  const rows = useMemo(() => openListings.map((l) => rowOf(l, byListing[l.id] || [], board.byId[l.id])), [openListings, byListing, board]);
  const closedRows = useMemo(() => closedListings.map((l) => rowOf(l, byListing[l.id] || [], board.byId[l.id])), [closedListings, byListing, board]);
  const needs = useMemo(() => (signals.loaded ? needsYouItems({ board, people: signals.people || [], shares: shared || [], circlePending, now: now || Date.now(), paths: adapter.paths }) : []),
    // now is left out on purpose beyond the board: the items change with the data, the times with the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signals.loaded, board, signals.people, shared, circlePending, adapter.paths]);
  // ── Archive and delete. The shelf on view (Active or Archived), Select mode, the cards picked for
  // the bar, the delete asked, and the line that says what happened.
  const [shelf, setShelf] = useState('active');
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState(() => new Set());
  const [ask, setAsk] = useState(null); // { ids } a delete waiting for its yes
  const [acting, setActing] = useState(false);
  const [actNote, setActNote] = useState('');
  // Select mode ends with a change of shelf and once the bar's action is done.
  const switchShelf = (to) => { setShelf(to); setPicked(new Set()); setSelecting(false); setFilter('all'); setActNote(''); };
  // Archived, asked for from the command menu: while the page is open, and on arrival (?shelf=archived).
  useEffect(() => {
    const on = (e) => { if (e.detail && e.detail.to === 'archived') { switchShelf('archived'); try { window.scrollTo({ top: 0, behavior: 'instant' }); } catch (x) { window.scrollTo(0, 0); } } };
    window.addEventListener(SHELF_EVENT, on);
    let q = null; try { q = new URLSearchParams(window.location.search); } catch (e) { q = null; }
    if (q && q.get('shelf') === 'archived') { switchShelf('archived'); q.delete('shelf'); const rest = q.toString(); goView(`${window.location.pathname}${rest ? `?${rest}` : ''}`, { replace: true }); }
    return () => window.removeEventListener(SHELF_EVENT, on);
  }, []);
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
      setPicked(new Set()); setSelecting(false);
      setActNote(archived ? `Archived ${count(ids.length, 'listing', 'listings')}.` : `Restored ${count(ids.length, 'listing', 'listings')}.`);
    } catch (e) { setActNote('Could not save that. Try again.'); } finally { setActing(false); setAsk(null); }
  };
  const deleteIds = async (ids) => {
    setActing(true); setActNote('');
    try {
      const { r, j } = await post('/api/listings/remove', { listingIds: ids });
      if (!r.ok) { setActNote(j.error || 'Could not delete that. Try again.'); return; }
      const gone = j.deleted || [];
      setListings((cur) => (cur || []).filter((l) => !gone.includes(l.id)));
      setPicked(new Set()); setSelecting(false);
      setActNote([gone.length ? `Deleted ${count(gone.length, 'listing', 'listings')}.` : '', j.line || ''].filter(Boolean).join(' '));
    } catch (e) { setActNote('Could not delete that. Try again.'); } finally { setActing(false); setAsk(null); }
  };
  // The delete asked for: what goes, what is skipped and why, or for one listing that cannot go,
  // the line and Archive in its place.
  const askInfo = ask ? (() => {
    const skip = ask.ids.filter(blocked); const n = ask.ids.length;
    if (n === 1 && skip.length === 1) return { title: 'This listing cannot be deleted', body: NOT_DELETABLE_LINE, confirm: canArchive && !isArchived((listings || []).find((l) => l.id === ask.ids[0])) ? 'Archive it' : 'Keep it', run: () => (canArchive && !isArchived((listings || []).find((l) => l.id === ask.ids[0])) ? archiveIds(ask.ids, true) : setAsk(null)), danger: false };
    return { title: n === 1 ? 'Delete this listing?' : `Delete ${n} listings?`, body: [n === 1 ? 'Its link stops working and any test applications go with it. This cannot be undone.' : 'Their links stop working and any test applications go with them. This cannot be undone.', skipLine(skip.length)].filter(Boolean).join(' '), confirm: 'Delete', run: () => deleteIds(ask.ids), danger: true };
  })() : null;
  const archivedRows = useMemo(() => archivedListings.map((l) => rowOf(l, byListing[l.id] || [], cardFor(l))), [archivedListings, byListing, board]); // eslint-disable-line react-hooks/exhaustive-deps
  // ── The order and the search, in the browser, on the rows above (components/dashboard/listingSort.js).
  // Each shelf keeps its own order on this device; a change never reloads, navigates or scrolls.
  // The selection is by id, so the cards picked stay picked whatever the order; Needs you and the
  // Pipeline have orders of their own.
  const [sorts, setSorts] = useState(() => sortsSeen || { active: DEFAULT_SORT, archived: DEFAULT_SORT });
  const [mode, setModeState] = useState(() => modeSeen || 'cards');
  useIsoLayout(() => {
    const store = deviceStore();
    const kept = { active: readSort(store, 'active'), archived: readSort(store, 'archived') };
    sortsSeen = kept;
    setSorts((cur) => (sameSort(cur.active, kept.active) && sameSort(cur.archived, kept.archived) ? cur : kept));
    const m = readMode(store); modeSeen = m; setModeState(m);
  }, []);
  const setMode = (m) => { modeSeen = m; setModeState(m); writeMode(deviceStore(), m); };
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
  const activeOrder = useMemo(() => orderIds(rows, sorts.active), [sorts.active, rowSet(rows), signals.loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  const closedOrder = useMemo(() => orderIds(closedRows, sorts.active), [sorts.active, rowSet(closedRows), signals.loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  const archivedOrder = useMemo(() => orderIds(archivedRows, sorts.archived), [sorts.archived, rowSet(archivedRows), signals.loaded]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const listingById = useMemo(() => new Map((listings || []).map((l) => [l.id, l])), [listings]);
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
  // ── Send report, from a card, the Ready to send tile or Needs you: the send sheet first
  // (components/dashboard/SendReportSheet.js), with the address, the landlord, the signing name,
  // the applicants in the report in its order with their Fit word, and Preview. Nothing is sent
  // until the realtor presses Send to the landlord; Cancel, Escape and a tap outside send nothing.
  // Once it is sent the sheet closes and the card shows Sent in place, a tick, then its status
  // follows. A missing landlord email opens the listing's setup form (the one the listing page's
  // Edit listing opens) and comes back to the sheet; a missing signing name is asked in the sheet.
  const [sends, setSends] = useState({});
  const [sendFor, setSendFor] = useState(null); // the listing whose report waits for the realtor's yes
  const [sendBusy, setSendBusy] = useState(false);
  const [sendNote, setSendNote] = useState('');
  const sendListing = sendFor ? listingById.get(sendFor) || null : null;
  const askSend = (l) => { if (!l || !l.id) return false; setSendNote(''); setSendFor(l.id); return true; };
  const closeSend = () => { setSendFor(null); setSendNote(''); };
  // One sheet at a time: the next rises once the last has gone (components/Sheet.js gives the focus
  // back to what opened it as it leaves).
  const afterSheet = (fn) => setTimeout(fn, (prefersReducedMotion() ? NATIVE.fade : NATIVE.sheet) + 60);
  const sendFrom = async () => {
    const l = sendListing; if (!l || sendBusy) return;
    setSendBusy(true); setSendNote('');
    setSends((s) => ({ ...s, [l.id]: { state: 'sending' } }));
    const drop = () => setSends((s) => { const { [l.id]: gone, ...rest } = s; return rest; });
    try {
      const r = await adapter.fetch('/api/listings/send-report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listingId: l.id }) });
      const j = await r.json().catch(() => ({}));
      // Not sent: the route's line in the sheet, which stays open to try again or cancel.
      if (!r.ok) { drop(); setSendNote(j.error || 'The report did not go. Try again.'); return; }
      setSendFor(null);
      if (j.preview) { setSends((s) => ({ ...s, [l.id]: { state: 'failed', note: 'Sandbox: nothing sent.' } })); return; }
      setSends((s) => ({ ...s, [l.id]: { state: 'sent' } }));
      // The route set last_sent_at on every applicant in the report (the ones still in the running):
      // the same here, so the card, the tiles and Needs you follow at once.
      const at = new Date().toISOString();
      setTimeout(() => {
        setSignals((cur) => ({ ...cur, applicantsByListing: { ...cur.applicantsByListing, [l.id]: (cur.applicantsByListing[l.id] || []).map((a) => (a && !isWithdrawn(a) && !isSetAside(a) ? { ...a, lastSentAt: at } : a)) } }));
        drop();
      }, 1400);
    } catch (e) { drop(); setSendNote('The report did not go. Try again.'); } finally { setSendBusy(false); }
  };
  // The signing name, asked in the sheet: saved to the profile as the listing page saves it.
  const saveSignature = async (value) => {
    try {
      const r = await adapter.fetch('/api/profile/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ report_signature: value }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) return j.error || 'Could not save the signing name.';
      setProfile((p) => ({ ...(j.profile || p), report_signature: value }));
      return null;
    } catch (e) { return 'Could not save the signing name.'; }
  };
  // The landlord's email, added in the listing's setup form; saved or cancelled, back to the sheet.
  const [editFor, setEditFor] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const editListing = editFor ? listingById.get(editFor) || null : null;
  const addEmail = () => { const id = sendFor; if (!id) return; closeSend(); afterSheet(() => { setEditFor(id); setEditOpen(true); }); };
  const backToSend = (id) => { setEditOpen(false); afterSheet(() => setSendFor(id)); };
  const saveEdit = async (values) => {
    const id = editFor; if (!id) return;
    setEditSaving(true); setError('');
    try {
      const r = await adapter.fetch('/api/listings/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listingId: id, ...values }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) { setError(j.error || 'Could not save changes.'); return; }
      setListings((cur) => (cur || []).map((x) => (x.id === id ? { ...x, ...(j.listing || values) } : x)));
      // Fit reads the listing's rent: the applicants read again, so the sheet lists them as the report will.
      adapter.fetch(`/api/listings/applicants?listingId=${encodeURIComponent(id)}`).then((x) => (x.ok ? x.json() : null)).then((a) => {
        if (a && Array.isArray(a.applicants)) setSignals((cur) => ({ ...cur, applicantsByListing: { ...cur.applicantsByListing, [id]: a.applicants } }));
      }).catch(() => {});
      backToSend(id);
    } catch (e) { setError('Could not save changes.'); } finally { setEditSaving(false); }
  };
  const onTile = (item) => { if (item && item.kind === 'ready' && askSend(listingById.get(item.listingId))) return; navigateToAction(item, adapter.paths); };
  // The Active and Archived switch (only once archive is set up).
  const shelfSwitch = (
    <div className="hv-seg" role="group" aria-label="Show listings" data-shelf="">
      {[['active', 'Active'], ['archived', 'Archived']].map(([key, label]) => (
        <button key={key} type="button" aria-pressed={shelf === key ? 'true' : 'false'} onClick={() => switchShelf(key)} data-shelf-to={key}>{label}</button>
      ))}
    </div>
  );
  // Cards or the Compact table, at 1024 and wider; kept on this device.
  const modeSwitch = (
    <div className="hv-seg hv-only-desk" role="group" aria-label="Show listings as" data-view-mode="">
      {[['cards', 'Cards'], ['compact', 'Compact']].map(([key, label]) => (
        <button key={key} type="button" aria-pressed={mode === key ? 'true' : 'false'} onClick={() => { setMode(key); setSelecting(false); }} data-view-mode-to={key}>{label}</button>
      ))}
    </div>
  );
  // The Sort control: under 1024 a button that opens the sheet, at 1024 and wider a menu. Each reads
  // the order on view; the choices are the same eight.
  const sortLabel = sortName(sort);
  const sortChoices = choicesFor(sort);
  const sortButton = (
    <button type="button" className="ds-btn ds-btn-line hv-sort-btn hv-only-phone" aria-haspopup="dialog" aria-label={`Sort, ${sortLabel}`} data-sort-open="" onClick={() => setSortOpen(true)}>
      <Icon name="sort" size={16} /><span>{sortLabel}</span>
    </button>
  );
  const sortMenu = (
    <span className="hv-sortmenu hv-only-desk" ref={menuRef} data-sort-menu="">
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
  // Select: a checkbox on every card, for the bar. The Compact table always has its checkboxes.
  const selectButton = (
    <button type="button" className={`ds-btn ${selecting ? 'ds-btn-ink' : 'ds-btn-line'} hv-select${mode === 'compact' ? ' hv-only-phone' : ''}`} aria-pressed={selecting ? 'true' : 'false'} onClick={() => { setSelecting((v) => !v); setPicked(new Set()); }} data-select-mode="">
      {selecting ? 'Done' : 'Select'}
    </button>
  );
  // The search, past eight listings in the view.
  const findField = (
    <span className="hv-find" data-listing-search="">
      <span className="hv-find-icon" aria-hidden="true"><Icon name="search" size={16} /></span>
      <input type="search" className="hv-find-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Address or unit" aria-label="Find a listing by address or unit" autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="search" data-listing-search-input="" />
    </span>
  );
  const foundLine = searched && found > 0 ? <p className="hv-found" role="status" data-search-count="">{count(found, 'listing matches', 'listings match')}</p> : null;
  const noMatch = (
    <div className="hv-nomatch" data-search-empty="">
      <p role="status">No listing matches your search.</p>
      <button type="button" className="ds-btn ds-btn-quiet" onClick={() => setQuery('')} data-search-clear="">Clear</button>
    </div>
  );
  // The Compact table's checkboxes: one a row, and the header's for all the rows shown.
  const rowSelect = (list) => ({
    header: <input type="checkbox" aria-label="Select all" checked={list.length > 0 && list.every((r) => picked.has(r.id))} onChange={(e) => setPicked((cur) => { const next = new Set(cur); for (const r of list) { if (e.target.checked) next.add(r.id); else next.delete(r.id); } return next; })} className="hv-check" />,
    cell: (r) => <input type="checkbox" aria-label={`Select ${r.label}`} checked={picked.has(r.id)} onChange={() => togglePick(r.id)} className="hv-check" data-row-check={r.id} />,
  });
  const cardsOf = (list) => list.map((r) => {
    const l = listingById.get(r.id); if (!l) return null;
    return <ListingCard key={r.id} listing={l} row={r} card={cardFor(l)} paths={adapter.paths} selecting={selecting} picked={picked.has(r.id)} onPick={togglePick} onSend={askSend} send={sends[r.id] || null} />;
  });
  const onNeed = (it) => {
    if (it.go.kind === 'action' && it.go.item && it.go.item.kind === 'ready' && askSend(listingById.get(it.go.item.listingId))) return;
    if (it.go.kind === 'action') navigateToAction(it.go.item, adapter.paths);
    else if (it.go.kind === 'view') goView(viewHref(adapter.paths.home, it.go.view));
    else go(it.go.href);
  };
  // The Pipeline section's Open Pipeline: the view in place, from its top.
  const pipelineHref = viewHref(adapter.paths.home, 'pipeline');
  const openPipeline = () => { goView(pipelineHref); try { window.scrollTo({ top: 0, behavior: 'instant' }); } catch (e) { window.scrollTo(0, 0); } };
  // The bell and the command menu: the signals, the listings on Active, and every listing.
  const headerSignals = useMemo(() => (signals.loaded ? { ...signals, listings: liveListings, allListings: listings || [] } : null), [signals, liveListings, listings]);
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
  // is reached from the sidebar and the Profile tab instead.
  const brandComplete = !!((profile?.full_name || '').trim() && brokerage && profile?.logo_url);
  // Logo-derived accent for the brand card only; the soft ink when absent or too light (red is
  // the one main action on the view).
  const logoAccent = useLogoAccent(profile?.logo_url || '');
  const brandAccent = logoAccent || C.inkSoft;
  const people = signals.people || [];
  const listCount = shelf === 'archived' ? foundArchived.length : filter !== 'all' ? shownRows.length : foundOpen.length + foundClosed.length;
  const FILTER_WORDS = { applicants: 'With applicants', toSend: 'With a report ready to send', toCheck: 'With documents to check' };

  return (
    <>
      <Head>
        <title>Realtor Dashboard · Rentletter</title>
        <meta name="description" content="Your listings. Add a listing, share the invite link, review applicants." />
        {/* Tint the mobile browser chrome (status bar / toolbar) to the page eggshell so there is no
            white band at the very top or bottom edge. */}
        <meta name="theme-color" content={C.paper} />
      </Head>
      <GlobalStyle />
      <ListingCardStyles />
      {/* overflow-x: clip contains any horizontal overflow without creating a scroll container.
          The canvas comes from the root (components/ui.js), so this wrapper paints no tone of its
          own; it only stretches to the viewport so a short page still reads as one surface. */}
      <div className="dash-bg" style={{ overflowX: 'clip' }}>
        <DashShell profile={profile} signals={headerSignals} onAssistantAction={onNoticeAction} nav={locked ? null : 'listings'} current={view} locked={locked} onNewListing={openNew} newPrimary={!empty} listingsCount={ready && !locked ? board.tiles.active : null}>

        {locked && (
          <div className="hv-lock ds-col" style={{ maxWidth: 1100, margin: '0 auto', padding: '0 clamp(16px, 4vw, 32px)', '--ds-col': '1036px' }}>
            <Paywall entitlement={entitlement} profile={profile} pending={checkoutFlag === 'success'} />
          </div>
        )}
        {!locked && <div className="hv" data-view={view}>

          {/* One screen, shown in one step (components/brand/Loader.js Reveal): its shape in pale
              placeholders until the listings and the signals are both in hand, then everything at once. */}
          <Reveal ready={ready} label="Loading your workspace" placeholder={<BoardSkeleton label="Loading your workspace" />} failed={listingsError && !listingsLoaded ? listingsFailed : loadWatch.failed ? <LoadFailed onRetry={loadWatch.again} /> : null}>
          <div className="hv-part-listings" data-listings-home="">
            {/* THE STATUS BOARD: the date and the four tiles, across the main area's whole width. */}
            {hasListings ? <StatusBoard tiles={board.tiles} now={now} filter={filter} onFilter={(f) => { setFilter(f); if (shelf !== 'active') switchShelf('active'); }} paths={adapter.paths} onJump={onTile} /> : null}
            {trialDays != null && <p className="hv-note">{trialDays === 1 ? '1 day' : `${trialDays} days`} left on your trial. <a href="/billing" style={{ color: C.ink, fontWeight: 700 }}>See plans</a></p>}
            {error && <div className="hv-error" role="alert">{error}</div>}

            <div className="hv-cols">
            <div className="hv-primary">
            {/* No listing yet: the start. */}
            {empty ? (
              <div className="hv-start" data-get-started="">
                <h2 className="hv-start-h">{START.heading}</h2>
                <p className="hv-start-line">{START.line}</p>
                <button type="button" onClick={openNew} className="ds-btn hv-start-new" data-get-started-new="">
                  <Icon name="plus" size={16} strokeWidth={2} /> New listing
                </button>
                <ol className="hv-steps" data-get-started-steps="">{START.steps.map(([title, line], i) => <li key={title}><span className="hv-step-n" aria-hidden="true">{i + 1}</span><span className="hv-step-body"><span className="hv-step-t">{title}</span><span className="hv-step-l">{line}</span></span></li>)}</ol>
              </div>
            ) : null}
            {hasListings && (
              <section className="hv-section" aria-labelledby="hv-listings-h" data-listings-view="">
                <div className="hv-head">
                  <span className="hv-title">
                    <h2 className="hv-h2" id="hv-listings-h">{shelf === 'archived' ? 'Archived' : 'Your listings'}</h2>
                    <span className="hv-count" aria-label={`${listCount} shown`} data-listing-count="">{listCount}</span>
                  </span>
                  {filter !== 'all' && shelf === 'active' ? (
                    <span className="hv-filter" data-filter-on={filter}>
                      <span>{FILTER_WORDS[filter]}</span>
                      <button type="button" className="ds-btn ds-btn-quiet" onClick={() => setFilter('all')} data-filter-clear="">Show all</button>
                    </span>
                  ) : null}
                  <span className="hv-tools" data-listing-tools="">
                    {canArchive ? shelfSwitch : null}
                    {modeSwitch}
                    {sortMenu}{sortButton}
                    {selectButton}
                  </span>
                </div>
                {canFind ? <div className="hv-find-row">{findField}{foundLine}</div> : null}
                {/* The bar for the cards picked: archive (or restore) them, or delete the ones that can go. */}
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
                    : !foundArchived.length ? noMatch : (
                      <>
                        <div className={`hv-cards${mode === 'compact' ? ' hv-only-phone' : ''}`} data-archived-cards="">{cardsOf(foundArchived)}</div>
                        {mode === 'compact' ? <div className="hv-only-desk"><ListingsTable rows={foundArchived} now={now} paths={adapter.paths} label="Archived listings" select={rowSelect(foundArchived)} sort={sorts.archived} onSort={onHeading} /></div> : null}
                      </>
                    )
                ) : searched && !found ? noMatch : (
                  <>
                    {shownRows.length ? (
                      <>
                        <div className={`hv-cards${mode === 'compact' ? ' hv-only-phone' : ''}`} data-listing-cards="">{cardsOf(shownRows)}</div>
                        {mode === 'compact' ? <div className="hv-only-desk"><ListingsTable rows={shownRows} now={now} paths={adapter.paths} select={rowSelect(shownRows)} sort={sorts.active} onSort={onHeading} /></div> : null}
                      </>
                    ) : searched && filter === 'all' ? null : (
                      <p className="hv-quiet" data-filter-empty="">{rows.length ? <>No listing here right now. <button type="button" className="ds-btn ds-btn-quiet" onClick={() => setFilter('all')}>Show all</button></> : 'No active listings.'}</p>
                    )}
                    {filter === 'all' && foundClosed.length > 0 && (
                      <div className="hv-rented" data-rented-listings="">
                        <div className="hv-head"><span className="hv-title"><h3 className="hv-h3">Rented</h3><span className="hv-count">{foundClosed.length}</span></span></div>
                        <div className={`hv-cards${mode === 'compact' ? ' hv-only-phone' : ''}`}>{cardsOf(foundClosed)}</div>
                        {mode === 'compact' ? <div className="hv-only-desk"><ListingsTable rows={foundClosed} now={now} paths={adapter.paths} label="Rented listings" select={rowSelect(foundClosed)} sort={sorts.active} onSort={onHeading} /></div> : null}
                      </div>
                    )}
                  </>
                )}
              </section>
            )}

            {/* THE PIPELINE under the cards (components/dashboard/PipelineSoon.js): the people soonest
                first and the way to the full view, or with nobody in it, one quiet line. On a phone
                with people in it, the list as it was. */}
            {hasListings ? (
              <div className="hv-section hv-pipe">
                {people.length ? (
                  <>
                    <div className="hv-only-desk"><PipelineSoon people={people} href={pipelineHref} onOpen={openPipeline} /></div>
                    {/* One Pipeline list on the page at a time: this one on the Listings view, the view's own on Pipeline. */}
                    {view === 'listings' ? <div className="hv-only-phone"><PeopleList people={people} /></div> : null}
                  </>
                ) : <PipelineSoon people={people} href={pipelineHref} onOpen={openPipeline} />}
              </div>
            ) : null}

            {/* BRAND CARD, only while branding is incomplete and there is a listing. Whole card opens the profile. */}
            {hasListings && !brandComplete && (
              <a {...linkProps(adapter.paths.profile)} data-press="card" className="dash-brand hv-section" style={{ '--brand-accent': brandAccent }}
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
            {/* iOS Safari only, until dismissed once on this device (components/dashboard/InstallHint.js). */}
            {!empty ? <div className="hv-only-phone hv-install"><InstallHint /></div> : null}
            </div>

            {/* NEEDS YOU (components/dashboard/NeedsYou.js): beside the cards from 1280, under them from
                1024; on a phone what is next lives in the bell. */}
            <div className="hv-aside hv-only-desk" data-stuck="">
              <NeedsYou items={needs} now={now} onGo={onNeed} />
            </div>
            </div>
          </div>

          {/* PIPELINE (components/dashboard/PeopleList.js): its own view. */}
          <div className="hv-part-pipeline">{view === 'pipeline' ? <PeopleList people={people} /> : null}</div>

          {/* Profiles tenants shared with this realtor as listing agent (components/dashboard/SharedWithMe.js):
              its own view; on a phone under the Listings view too, as it always was, when there are any. */}
          <div className="hv-part-shared">
            <SharedWithMe />
            {Array.isArray(shared) && shared.length === 0 ? (
              <div className="hv-shared-empty" data-shared-empty="">
                <h2 className="hv-h2">Shared with you</h2>
                <p className="hv-quiet">No tenant has shared a profile with you yet.</p>
              </div>
            ) : null}
          </div>
          </Reveal>
        </div>}

        </DashShell>
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
        {/* Send report's sheet: nothing goes to the landlord until Send to the landlord is pressed. */}
        <SendReportSheet listing={sendListing} applicants={sendListing ? byListing[sendListing.id] || [] : []} profile={profile} busy={sendBusy} note={sendNote}
          onSend={sendFrom} onClose={closeSend} onAddEmail={addEmail} onSaveSignature={saveSignature} />
        {editFor ? (
          <ListingSetupModal open={editOpen && !!editListing} mode="edit" initial={editListing} activeApplicants={(byListing[editFor] || []).filter((a) => a && !isWithdrawn(a) && !isSetAside(a)).length}
            realtorProvince={profile?.province || null} prefill={{ listing_brokerage_name: profile?.brokerage || null, listing_brokerage_address: profile?.brokerage_address || null, listing_brokerage_phone: profile?.phone || null }}
            onCancel={() => backToSend(editFor)} onSave={saveEdit} saving={editSaving} />
        ) : null}
        <NewListingPanel open={modalOpen} initial={dupe} profile={profile} userId={userId} onClose={closeModal} onError={setError}
          onProfile={(saved, province) => setProfile((p) => ({ ...(saved || p), province }))}
          onCreated={(data) => setListings((cur) => [data, ...(cur || []).filter((l) => l.id !== data.id)])} />
      </div>

      <style jsx>{`
        /* The canvas is painted at the root (components/ui.js var(--canvas)); this wrapper paints no
           tone of its own and stretches to the window so a short page still reads as one surface. */
        .dash-bg { min-height: 100vh; min-height: 100dvh; }
        /* Under 1024px the dashboard's header is static, in flow: it scrolls away with the page, so
           there is no fixed layer for content to pass under (the half cut title on iOS). Clear, so
           the colour fields show through; its round controls are the glass. At 1024 and wider the
           shell floats its search and bell (components/dashboard/DashShell.js). */
        @media (max-width: 1023.98px) {
          .dash-bg :global(.rl-header) {
            position: static !important;
            background: transparent !important;
            -webkit-backdrop-filter: none !important;
            backdrop-filter: none !important;
            border-bottom-color: transparent !important;
            box-shadow: none !important;
            padding-top: env(safe-area-inset-top, 0px);
          }
          .dash-bg :global(.rl-header.rl-shrink .rl-header-inner) { padding-top: 18px; padding-bottom: 18px; }
        }

        /* ── The page: its gutters, and room under it for the floating tab bar on a phone ── */
        .hv { padding: 0 var(--page-gutter) var(--s-5); }
        .hv-only-desk { display: none; }
        .hv-part-pipeline, .hv-part-shared { display: none; }
        .hv[data-view='pipeline'] .hv-part-pipeline, .hv[data-view='shared'] .hv-part-shared { display: block; }
        .hv[data-view='listings'] .hv-part-shared { display: block; margin-top: var(--gap-section); }
        .hv[data-view='listings'] .hv-shared-empty { display: none; }
        .hv:not([data-view='listings']) .hv-part-listings { display: none; }
        .hv-section { margin-top: var(--gap-section); }
        .hv-section:first-child { margin-top: 0; }
        .hv-h2 { font-family: var(--f-display); font-size: 22px; font-weight: 600; letter-spacing: -0.015em; line-height: var(--lh-display); color: ${C.ink}; margin: 0; }
        .hv-h3 { font-size: var(--t-eyebrow); font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${C.inkSoft}; margin: 0; }
        .hv-quiet { font-size: var(--t-body-2); color: ${C.inkSoft}; line-height: var(--lh-body); margin: 0; }
        .hv-note { font-size: var(--t-body-2); color: ${C.inkSoft}; margin: 0 0 var(--s-4); }
        .hv-error { margin: 0 0 var(--s-4); padding: var(--s-3) var(--s-4); background: ${C.dangerTint}; border-radius: 16px; border-left: 3px solid ${C.danger}; font-size: var(--t-body-2); color: ${C.ink}; }
        .hv-failed { display: grid; gap: var(--s-2); justify-items: start; padding: var(--s-5); border-radius: 24px; background: ${C.card}; }
        .hv-shared-empty { display: grid; gap: var(--s-2); }
        .hv-install :global(*) { max-width: 100%; }

        /* The listings' head: the title and count, the filter a tile set, then the tools. */
        .hv-head { display: flex; align-items: center; flex-wrap: wrap; gap: var(--s-3); margin-bottom: var(--s-4); }
        .hv-title { display: inline-flex; align-items: baseline; gap: var(--s-2); min-width: 0; }
        .hv-count { font-size: var(--t-body-2); font-weight: 700; color: ${C.inkSoft}; font-variant-numeric: tabular-nums; }
        .hv-filter { display: inline-flex; align-items: center; gap: var(--s-1); font-size: var(--t-body-2); color: ${C.inkSoft}; }
        .hv-tools { margin-left: auto; display: inline-flex; align-items: center; flex-wrap: wrap; justify-content: flex-end; gap: var(--s-2); }
        .hv-cards { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--s-3); }
        .hv-rented { margin-top: var(--gap-section); }
        .hv-act-note { font-size: var(--t-body-2); color: ${C.inkSoft}; line-height: var(--lh-body); margin: 0 0 var(--s-3); text-wrap: balance; }
        .hv-bulk { position: sticky; top: var(--s-2); z-index: 5; display: flex; align-items: center; flex-wrap: wrap; gap: var(--s-2) var(--s-3); padding: var(--s-2) var(--s-2) var(--s-2) var(--s-4); margin-bottom: var(--s-3); border-radius: 999px; }
        .hv-bulk-n { font-size: var(--t-body-2); font-weight: 700; color: ${C.ink}; margin-right: auto; font-variant-numeric: tabular-nums; }
        .hv-pipe { margin-top: var(--s-6); }

        /* The start (no listing yet): the heading, its line, the button, the three steps. */
        .hv-start { padding: var(--s-2) 0 var(--s-5); }
        .hv-start-h { font-family: var(--f-display); font-size: var(--t-d1); font-weight: 600; letter-spacing: -0.02em; line-height: 1.12; color: ${C.ink}; margin: 0; text-wrap: balance; }
        .hv-start-line { font-size: var(--t-body); color: ${C.inkSoft}; line-height: var(--lh-body); margin: var(--s-3) 0 0; max-width: 34em; text-wrap: balance; }
        /* On a phone the tab bar holds the red New listing: this one is ink. */
        .hv :global(.hv-start-new) { margin-top: var(--s-5); background: ${C.ink}; color: ${C.paper}; border: 1px solid ${C.ink}; }
        .hv-steps { list-style: none; margin: var(--s-5) 0 0; padding: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--s-2); }
        /* On a phone each step is a row: its number beside its words. From 1024 a card each. */
        .hv-steps li { display: flex; align-items: flex-start; gap: var(--s-3); padding: var(--s-3) var(--s-4); background: ${C.card}; border-radius: 22px; box-shadow: 0 1px 2px rgba(15, 15, 16, 0.04), 0 10px 30px rgba(15, 15, 16, 0.05); }
        .hv-step-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; padding-top: 2px; }
        .hv-step-n { flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; border: 1px solid ${C.ruleDark}; font-size: var(--t-body-2); font-weight: 700; color: ${C.ink}; font-variant-numeric: tabular-nums; }
        .hv-step-t { font-size: var(--t-body); font-weight: 700; color: ${C.ink}; line-height: 1.35; }
        .hv-step-l { font-size: var(--t-body-2); color: ${C.inkSoft}; line-height: var(--lh-body); text-wrap: balance; }

        /* ── The brand card: identity, whole card → /profile; its left edge the colour of the logo. ── */
        .dash-brand { display: flex; flex-direction: column; gap: var(--s-3); padding: var(--s-5); text-decoration: none; color: ${C.ink}; background: ${C.card}; border-radius: 24px; box-shadow: inset 3px 0 0 var(--brand-accent), 0 1px 2px rgba(15, 15, 16, 0.04), 0 10px 30px rgba(15, 15, 16, 0.05); }
        .dash-eyebrow { font-size: var(--t-eyebrow); font-weight: 700; letter-spacing: 0.1em; line-height: var(--lh-eyebrow); text-transform: uppercase; color: ${C.inkSoft}; }
        .dash-brand-identity { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-3); min-width: 0; }
        .dash-brand-logo { width: clamp(72px, 20vw, 96px); height: clamp(72px, 20vw, 96px); object-fit: contain; flex-shrink: 0; }
        .dash-brand-initials { width: clamp(64px, 18vw, 84px); height: clamp(64px, 18vw, 84px); border-radius: 18px; background: ${C.paperDeep}; display: inline-flex; align-items: center; justify-content: center; font-family: ${FONT.serif}; font-weight: 600; font-size: var(--t-d3); color: ${C.inkSoft}; flex-shrink: 0; }
        .dash-brand-id { display: flex; flex-direction: column; gap: var(--s-1); min-width: 0; flex: 1 1 280px; }
        .dash-brand-name { font-family: ${FONT.serif}; font-size: var(--t-d3); font-weight: 600; color: ${C.ink}; letter-spacing: -0.015em; line-height: 1.15; overflow-wrap: anywhere; text-wrap: balance; }
        .dash-brand-brok { font-size: var(--t-body-2); color: ${C.inkSoft}; overflow-wrap: anywhere; }
        @media (max-width: 344.98px) { .dash-brand-name { font-size: var(--t-body); } }
        .dash-brand-desc { font-size: var(--t-body-2); color: ${C.inkSoft}; line-height: 1.5; margin-top: var(--s-1); text-wrap: balance; white-space: normal; }
        .dash-brand-foot { margin-top: auto; display: inline-flex; align-items: center; gap: var(--s-1); font-size: var(--t-body-2); font-weight: 700; color: ${C.ink}; }

        /* ── The order and the search: the Sort control (a button and its sheet under 1024, a menu at
           1024 and wider), the switches, the search field past eight listings, how many match, and
           the line when none does; the bar's buttons and the checkboxes. Every control the 44px
           height and the radius every dashboard button has (components/dashboard/DashShell.js
           .ds-btn). Built outside the returned tree, so their classes are global (and unique to this
           screen). ── */
        :global(.hv-seg) { display: inline-flex; padding: 2px; border-radius: var(--btn-radius); border: 1px solid ${C.ruleDark}; background: ${C.card}; }
        :global(.hv-seg button) { min-height: 38px; padding: 0 var(--gap-card); border-radius: var(--btn-radius); font-family: inherit; font-size: var(--t-body-2); font-weight: 600; color: ${C.inkSoft}; background: transparent; border: none; cursor: pointer; }
        :global(.hv-seg button[aria-pressed='true']) { background: ${C.ink}; color: ${C.paper}; font-weight: 700; }
        :global(.hv-seg button:focus-visible) { outline: none; box-shadow: 0 0 0 2px ${C.ink}; }
        :global(.ds-btn.hv-danger) { color: ${C.danger}; }
        :global(.hv-check) { width: 18px; height: 18px; margin: 0; accent-color: ${C.ink}; cursor: pointer; }
        :global(.hv-menu) { display: grid; gap: var(--s-2); padding: 4px 20px 20px; }
        :global(.hv-menu-t) { font-size: 18px; font-weight: 800; color: ${C.ink}; letter-spacing: -0.015em; margin: 0 0 var(--s-2); overflow-wrap: anywhere; text-wrap: balance; }
        :global(.hv-menu .ds-btn) { width: 100%; }
        :global(.hv-find-row) { display: flex; align-items: center; flex-wrap: wrap; gap: var(--s-2) var(--s-4); margin: 0 0 var(--s-3); }
        :global(.hv-find) { position: relative; display: block; min-width: 0; flex: 1 1 320px; max-width: 420px; }
        :global(.hv-find-icon) { position: absolute; left: var(--gap-card); top: 0; bottom: 0; display: flex; align-items: center; color: ${C.inkSoft}; pointer-events: none; }
        :global(.hv-find-input) { display: block; width: 100%; box-sizing: border-box; min-height: 44px; margin: 0; padding: 0 var(--gap-card) 0 calc(var(--gap-card) + 24px); border: 1px solid ${C.ruleDark}; border-radius: var(--btn-radius); background: ${C.card}; color: ${C.ink}; font-family: inherit; font-size: 16px; line-height: 1.2; -webkit-appearance: none; appearance: none; }
        :global(.hv-find-input::-webkit-search-decoration), :global(.hv-find-input::-webkit-search-cancel-button) { -webkit-appearance: none; appearance: none; }
        :global(.hv-find-input::placeholder) { color: ${C.inkMute}; opacity: 1; }
        :global(.hv-found) { margin: 0; font-size: var(--t-body-2); font-weight: 600; color: ${C.inkSoft}; line-height: var(--lh-body); font-variant-numeric: tabular-nums; white-space: nowrap; }
        :global(.hv-nomatch) { display: flex; align-items: center; flex-wrap: wrap; gap: var(--s-1) var(--s-2); min-width: 0; }
        :global(.hv-nomatch p) { margin: 0; font-size: var(--t-body-2); color: ${C.inkSoft}; line-height: var(--lh-body); }
        :global(.hv-nomatch .ds-btn) { margin-left: calc(-1 * var(--s-2)); }
        /* The menu: under its button, at the button's right edge, over the cards. */
        :global(.hv-sortmenu) { position: relative; display: inline-flex; }
        :global(.hv-sortpop) { position: absolute; right: 0; top: calc(100% + var(--s-1)); z-index: 30; display: grid; gap: 2px; min-width: 248px; padding: var(--s-1); background: ${C.card}; border-radius: 20px; box-shadow: 0 0 0 1px ${C.rule}, 0 12px 32px rgba(15, 15, 16, 0.14); }
        :global(.hv-sort-list) { display: grid; gap: 2px; }
        :global(.hv-sort-opt) { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); width: 100%; min-height: 44px; margin: 0; padding: 0 var(--gap-card); border: none; border-radius: var(--btn-radius); background: transparent; color: ${C.ink}; font-family: inherit; font-size: var(--t-body-2); font-weight: 600; line-height: 1.2; text-align: left; cursor: pointer; white-space: nowrap; }
        :global(.hv-sort-opt[aria-checked='true']) { background: ${C.paperDeep}; font-weight: 700; }
        :global(.hv-sort-opt:focus-visible) { outline: none; box-shadow: inset 0 0 0 2px ${C.ink}; }
        @media (hover: hover) { :global(.hv-sort-opt:hover) { background: ${C.paper}; } :global(.hv-sort-opt[aria-checked='true']:hover) { background: ${C.paperDeep}; } }
        :global(.hv-menu .hv-sort-opt) { font-size: var(--t-body); }
        /* ── Phone and desktop: both are in the markup, the width picks one ── */
        @media (max-width: 1023.98px) {
          .hv :global(.hv-only-desk) { display: none !important; }
          .hv-tools { margin-left: 0; justify-content: flex-start; width: 100%; }
        }

        /* ── 1024 and wider: the main area's whole width, its sides the shell's padding; Needs you
           under the cards, then beside them from 1280. ── */
        @media (min-width: 1024px) {
          .hv { padding: var(--s-2) var(--ds-pad) var(--s-7); }
          .hv :global(.hv-only-desk) { display: block; }
          .hv :global(span.hv-only-desk), .hv :global(div.hv-seg.hv-only-desk) { display: inline-flex; }
          .hv :global(.hv-only-phone) { display: none !important; }
          .hv:not([data-view='shared']) .hv-part-shared { display: none; }
          .hv-cols { display: grid; grid-template-columns: minmax(0, 1fr); row-gap: var(--gap-section); }
          .hv-primary { min-width: 0; }
          .hv-cards { gap: var(--s-4); }
          .hv-h2 { font-size: 24px; }
          /* Stuck under the floating search bar, never behind it. */
          .hv-bulk { top: calc(var(--s-4) * 2 + 48px + var(--s-2)); }
          /* The start beside Needs you: the red New listing (the sidebar's is outlined while there is none). */
          .hv :global(.hv-start-new) { background: ${C.red}; color: ${C.paper}; border-color: ${C.red}; }
          .hv-start-h { font-size: 40px; line-height: 1.1; }
          .hv-steps { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s-4); }
          .hv-steps { margin-top: var(--s-6); }
          .hv-steps li { flex-direction: column; gap: var(--s-2); padding: var(--s-5); border-radius: 24px; }
          .hv-step-body { gap: var(--s-2); padding-top: 0; }
        }
        @media (min-width: 1280px) {
          .hv-cols { grid-template-columns: minmax(0, 1fr) clamp(360px, calc(130px + 18vw), 420px); column-gap: var(--s-5); align-items: start; }
          /* It stays in view under the floating search bar as the page scrolls. */
          .hv-aside { position: sticky; top: calc(var(--s-4) * 2 + 48px); }
        }
        /* 1280 to 1399, the cards' column at its narrowest: the three steps of the start one under
           another, so each title keeps its line. */
        @media (min-width: 1280px) and (max-width: 1399.98px) { .hv-steps { grid-template-columns: minmax(0, 1fr); } }
        /* Two cards a row only where each keeps the room for the strip's names (about 700px). */
        @media (min-width: 2200px) { .hv-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (min-width: 1920px) {
          .hv-h2 { font-size: 26px; }
          .hv-section { margin-top: var(--s-7); }
          .hv-section:first-child { margin-top: 0; }
          .hv-count { font-size: var(--t-body); }
          .hv-start-h { font-size: 48px; } .hv-start-line { font-size: 18px; } .hv-steps li { padding: var(--s-6); } .hv-step-t { font-size: 18px; } .hv-step-l { font-size: var(--t-body); }
        }
      `}</style>
    </>
  );
}
