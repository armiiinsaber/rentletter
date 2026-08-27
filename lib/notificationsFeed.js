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
// junction and application rows of those listings only.
export async function notificationsFor({ supabase, admin, userId }) {
  const { data: listings } = await supabase.from('listings').select('id, name, address').eq('profile_id', userId);
  const owned = listings || [];
  if (owned.length === 0) return { ...EMPTY_FEED };
  const listingIds = owned.map((l) => l.id);
  const listingName = Object.fromEntries(owned.map((l) => [String(l.id), l.name || l.address || 'your listing']));

  let lastSeenIso = null;
  try {
    const { data: profile } = await supabase.from('profiles').select('notifications_last_seen').eq('id', userId).maybeSingle();
    lastSeenIso = profile?.notifications_last_seen || null;
  } catch (e) { lastSeenIso = null; }
  const lastSeen = lastSeenIso ? new Date(lastSeenIso).getTime() : (Date.now() - FIRST_RUN_WINDOW_MS);

  const linksQ = (cols) => admin.from('listing_applicants').select(cols).in('listing_id', listingIds).order('created_at', { ascending: false }).limit(MAX_ROWS);
  let linksRes = await linksQ('id, listing_id, application_id, created_at, withdrawn_at');
  // Before db/listing-applicants-vocabulary.sql has run the column is absent: fall back so the
  // "new application" events still work; withdrawal events start the moment it exists.
  if (linksRes.error) linksRes = await linksQ('id, listing_id, application_id, created_at');
  const links = linksRes.data || [];

  const appIds = [...new Set(links.map((r) => r.application_id).filter((v) => v != null))];
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

  // Document uploads: isolated and best effort so a not yet migrated column cannot break the feed.
  try {
    const { data: docRows } = await admin.from('listing_applicants')
      .select('id, listing_id, application_id, docs_submitted_at, docs_verified')
      .in('listing_id', listingIds).not('docs_submitted_at', 'is', null)
      .order('docs_submitted_at', { ascending: false }).limit(MAX_ROWS);
    const drows = docRows || [];
    const missing = [...new Set(drows.map((r) => r.application_id).filter((v) => v != null && !(String(v) in nameById)))];
    if (missing.length) {
      const { data: apps2 } = await admin.from('applications').select('id, full_name').in('id', missing);
      for (const a of (apps2 || [])) nameById[String(a.id)] = a.full_name || 'An applicant';
    }
    for (const r of drows) {
      const ts = r.docs_submitted_at ? new Date(r.docs_submitted_at).getTime() : 0;
      if (!ts) continue;
      const name = nameById[String(r.application_id)] || 'An applicant';
      const lname = listingName[String(r.listing_id)] || 'your listing';
      items.push({ id: `docs:${r.id}`, type: 'docs', name, listingId: r.listing_id, listingName: lname, title: r.docs_verified ? `Documents received & verified for ${name}` : `Documents received for ${name}`, ts, unread: ts > lastSeen });
    }
  } catch (e) {
    console.warn('[notifications] docs events skipped:', e?.message || e);
  }

  items.sort((a, b) => b.ts - a.ts);
  return { items: items.slice(0, MAX_ITEMS), unreadCount: items.filter((i) => i.unread).length, lastSeen: lastSeenIso };
}
