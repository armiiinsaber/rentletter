// lib/notificationsFeed.js
// The realtor's notification feed, DERIVED on load from existing listing_applicants timestamps
// (no realtime): new applications (created_at), withdrawals (withdrawn_at) and document uploads
// (docs_submitted_at). Shared by /api/notifications (the bell) and the dashboard's server load
// (pages/landlord.js), so the first paint of the dashboard already has the feed and nothing
// arrives late. Ownership: scoped to the signed in realtor's own listings; owner_token is never
// selected.
const FIRST_RUN_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_ROWS = 60;
const MAX_ITEMS = 40;
export const EMPTY_FEED = Object.freeze({ items: [], unreadCount: 0, lastSeen: null });

// supabase: the realtor's RLS client (owns listings + profile); admin: service role for the
// junction and application rows of those listings only. listings: the realtor's listing rows
// when the caller already has them (the dashboard load), so they are not selected again.
//
// The chain, was: listings -> profile -> links -> applications -> docs -> applications again,
// six round trips one after another. Now: [listings when not given] -> [profile, links, docs
// side by side] -> one applications lookup for the names both need. Same items, same order.
export async function notificationsFor({ supabase, admin, userId, listings = null }) {
  let owned = Array.isArray(listings) ? listings : null;
  if (!owned) { const { data } = await supabase.from('listings').select('id, name, address').eq('profile_id', userId); owned = data || []; }
  if (owned.length === 0) return { ...EMPTY_FEED };
  const listingIds = owned.map((l) => l.id);
  const listingName = Object.fromEntries(owned.map((l) => [String(l.id), l.name || l.address || 'your listing']));

  const linksQ = (cols) => admin.from('listing_applicants').select(cols).in('listing_id', listingIds).order('created_at', { ascending: false }).limit(MAX_ROWS);
  const [profileRes, linksFirst, docsRes] = await Promise.all([
    supabase.from('profiles').select('notifications_last_seen').eq('id', userId).maybeSingle().then((r) => r, () => ({ data: null })),
    linksQ('id, listing_id, application_id, created_at, withdrawn_at'),
    // Document uploads: isolated and best effort so a not yet migrated column cannot break the feed.
    admin.from('listing_applicants').select('id, listing_id, application_id, docs_submitted_at, docs_verified').in('listing_id', listingIds).not('docs_submitted_at', 'is', null).order('docs_submitted_at', { ascending: false }).limit(MAX_ROWS).then((r) => r, (e) => ({ data: null, error: e })),
  ]);
  const lastSeenIso = profileRes?.data?.notifications_last_seen || null;
  const lastSeen = lastSeenIso ? new Date(lastSeenIso).getTime() : (Date.now() - FIRST_RUN_WINDOW_MS);
  // Before db/listing-applicants-vocabulary.sql has run the column is absent: fall back so the
  // "new application" events still work; withdrawal events start the moment it exists.
  const linksRes = linksFirst.error ? await linksQ('id, listing_id, application_id, created_at') : linksFirst;
  const links = linksRes.data || [];
  if (docsRes?.error) console.warn('[notifications] docs events skipped:', docsRes.error?.message || docsRes.error);
  const drows = docsRes?.error ? [] : (docsRes?.data || []);

  const appIds = [...new Set([...links, ...drows].map((r) => r.application_id).filter((v) => v != null))];
  let nameById = {};
  if (appIds.length) {
    const { data: apps } = await admin.from('applications').select('id, full_name').in('id', appIds);
    nameById = Object.fromEntries((apps || []).map((a) => [String(a.id), a.full_name || 'An applicant']));
  }

  const items = [];
  for (const r of links) {
    const name = nameById[String(r.application_id)] || 'An applicant';
    const lname = listingName[String(r.listing_id)] || 'your listing';
    const createdTs = r.created_at ? new Date(r.created_at).getTime() : 0;
    if (createdTs) items.push({ id: `new:${r.id}`, type: 'new', name, listingId: r.listing_id, listingName: lname, title: `New application from ${name}`, ts: createdTs, unread: createdTs > lastSeen });
    if (r.withdrawn_at) {
      const wTs = new Date(r.withdrawn_at).getTime();
      items.push({ id: `wd:${r.id}`, type: 'withdrawn', name, listingId: r.listing_id, listingName: lname, title: `${name} withdrew`, ts: wTs, unread: wTs > lastSeen });
    }
  }

  for (const r of drows) {
    const ts = r.docs_submitted_at ? new Date(r.docs_submitted_at).getTime() : 0;
    if (!ts) continue;
    const name = nameById[String(r.application_id)] || 'An applicant';
    const lname = listingName[String(r.listing_id)] || 'your listing';
    items.push({ id: `docs:${r.id}`, type: 'docs', name, listingId: r.listing_id, listingName: lname, title: r.docs_verified ? `Documents received & verified for ${name}` : `Documents received for ${name}`, ts, unread: ts > lastSeen });
  }

  items.sort((a, b) => b.ts - a.ts);
  return { items: items.slice(0, MAX_ITEMS), unreadCount: items.filter((i) => i.unread).length, lastSeen: lastSeenIso };
}
