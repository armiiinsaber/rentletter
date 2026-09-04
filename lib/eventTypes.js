// lib/eventTypes.js
// The timeline vocabulary, PURE (no server imports, no React): every allowed events.type, which
// of them a browser may report through /api/events/record, and how an event reads and links.
//
// EVENT_TYPES MUST match the check constraint in db/events.sql and db/schema-reference.sql;
// tests/events.test.mjs parses the SQL and fails when they differ. Add a type in all three.
export const EVENT_TYPES = Object.freeze([
  'applicant_applied',
  'documents_requested',
  'documents_uploaded',
  'documents_nudged',
  'verification_completed',
  'verification_failed',
  'document_stored',
  'document_opened',
  'document_deleted',
  'documents_expired',
  'retention_run',
  'report_generated',
  'report_sent',
  'applicant_set_aside',
  'applicant_restored',
  'applicant_withdrew',
  'applicant_marked_finalist',
  'applicant_confirmed',
  'applicant_not_selected',
  'referral_received',
  'referral_accepted',
  'invite_link_created',
  'profile_edited_after_verification',
  'listing_created',
  'listing_updated',
  'branding_updated',
]);

// Actions the realtor takes in the browser, written to Supabase directly under RLS (no API
// route in the path). The browser REPORTS them to POST /api/events/record, which checks the
// realtor owns the listing or applicant named, stamps profile_id from the session, and records
// through the service role. Nothing else may be reported from a client.
export const CLIENT_EVENT_TYPES = Object.freeze([
  'applicant_set_aside',
  'applicant_restored',
  'applicant_withdrew',
  'applicant_marked_finalist',
  'listing_created',
  'listing_updated',
  'branding_updated',
]);

const who = (p) => (p && p.applicantName) || 'An applicant';
const where = (p) => (p && p.listingName) || 'a listing';

// One line per event. Payload keys are set at write time (applicantName, listingName, and a
// few per type) so reads never join.
export function eventTitle(e) {
  const p = (e && e.payload) || {};
  switch (e && e.type) {
    case 'applicant_applied': return `${who(p)} applied to ${where(p)}`;
    case 'documents_requested': return `You asked ${who(p)} for documents`;
    case 'documents_uploaded': return `${who(p)} uploaded documents`;
    case 'documents_nudged': return `You reminded ${who(p)} about documents${p.nudge === 2 ? ', last reminder' : ''}`;
    case 'verification_completed': return `${who(p)} verified`;
    case 'verification_failed': return `${who(p)}: documents did not verify`;
    case 'document_stored': return `${p.count === 1 ? 'A document' : `${p.count || ''} documents`.trim()} from ${who(p)} held for your review`;
    case 'document_opened': return `You viewed a document of ${who(p)}`;
    case 'document_deleted': return `You deleted ${who(p)}'s documents`;
    case 'documents_expired': return `${who(p)}'s documents were deleted after 14 days`;
    case 'retention_run': return `${p.count || 0} application${p.count === 1 ? '' : 's'} older than twelve months were deleted`;
    case 'report_generated': return `Report generated for ${where(p)}`;
    case 'report_sent': return `Report sent to ${p.landlordName || p.landlordEmail || 'the landlord'} for ${where(p)}`;
    case 'applicant_set_aside': return `You set aside ${who(p)}${p.reason ? ` (${p.reason})` : ''}`;
    case 'applicant_restored': return `You restored ${who(p)}`;
    case 'applicant_withdrew': return `${who(p)} withdrew`;
    case 'applicant_confirmed': { const what = ({ id: 'ID', employer: 'the employer', landlord: 'the previous landlord', reference: 'a reference' })[p.key] || 'a fact'; return p.on === false ? `You removed a confirmation for ${who(p)} (${what})` : `You confirmed ${what} for ${who(p)}`; }
    case 'applicant_not_selected': return `You let ${who(p)} know ${where(p)} was rented`;
    case 'applicant_marked_finalist': return p.removed ? `You removed the finalist mark from ${who(p)}` : `You marked ${who(p)} as a finalist`;
    case 'referral_received': return `${p.fromName || 'A realtor'} referred ${who(p)} to you`;
    case 'referral_accepted': return `You added ${who(p)} to ${where(p)} from a referral`;
    case 'invite_link_created': return `${p.regenerated ? 'New invite link' : 'Invite link created'} for ${where(p)}`;
    case 'profile_edited_after_verification': return `${who(p)} edited their profile after verification`;
    case 'listing_created': return `You created ${where(p)}`;
    case 'listing_updated': return `You updated ${where(p)}`;
    case 'branding_updated': return 'You updated your branding';
    default: return 'Something happened';
  }
}

// Where tapping the event goes. `paths` is the dashboard adapter's paths (real or demo).
export function eventHref(e, paths) {
  const p = (e && e.payload) || {};
  if (!e) return null;
  if (e.type === 'branding_updated') return paths.profile;
  if (e.listing_id) return `${paths.listing(e.listing_id)}${p.linkId ? `#applicant-${p.linkId}` : ''}`;
  return paths.home;
}

// Reverse chronological groups by calendar day: Today, Yesterday, then the date.
export function groupByDay(events, now = Date.now()) {
  const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
  const today = dayKey(now); const yesterday = dayKey(now - 86400000);
  const label = (t) => { const k = dayKey(t); if (k === today) return 'Today'; if (k === yesterday) return 'Yesterday'; return new Date(t).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' }); };
  const groups = [];
  for (const e of [...(events || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))) {
    const t = new Date(e.created_at).getTime();
    const k = dayKey(t);
    const g = groups[groups.length - 1];
    if (g && g.key === k) g.items.push(e); else groups.push({ key: k, label: label(t), items: [e] });
  }
  return groups;
}
