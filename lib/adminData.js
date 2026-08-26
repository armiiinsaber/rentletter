// lib/adminData.js
// SERVER-ONLY read model + actions for the founder admin. Service-role Supabase only.
// PRIVACY RULE: tenants appear here as ONE COUNT. No tenant names, emails, rows, or tokens
// ever leave this module — the realtor table strips applications down to a number.
import { getSupabaseAdminClient } from './supabase/admin';
import { isSupabaseConfigured } from './supabase/server';
import { getEntitlement } from './entitlements';

export const ACTIVE_WINDOW_DAYS = 30;
const since = () => new Date(Date.now() - ACTIVE_WINDOW_DAYS * 86400000);

export function adminDb() {
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return getSupabaseAdminClient();
}

// All auth users (email + last sign-in) keyed by id. Paginates; fine at founder scale.
async function listAuthUsers(admin) {
  const out = new Map();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) break;
    for (const u of data.users) out.set(u.id, { email: u.email || null, lastSignInAt: u.last_sign_in_at || null, createdAt: u.created_at || null, banned: !!(u.banned_until && new Date(u.banned_until) > new Date()) });
    if (data.users.length < 200) break;
  }
  return out;
}

export async function loadOverview() {
  const admin = adminDb();
  if (!admin) throw new Error('Supabase is not configured.');
  const [{ data: profiles, error: pe }, { data: listings, error: le }, users] = await Promise.all([
    admin.from('profiles').select('*').order('created_at', { ascending: true }),
    admin.from('listings').select('id, profile_id, name, address, created_at, invite_token'),
    listAuthUsers(admin),
  ]);
  if (pe) throw pe; if (le) throw le;
  const listingIds = (listings || []).map((l) => l.id);
  let links = [];
  if (listingIds.length) {
    const { data } = await admin.from('listing_applicants').select('listing_id, application_id, created_at, decision_changed_at').in('listing_id', listingIds);
    links = data || [];
  }
  const { count: applicationsTotal } = await admin.from('applications').select('id', { count: 'exact', head: true });

  // Tenant count — ONE number. tenant_profiles when migrated; else distinct applicant emails.
  let tenants = { count: null, basis: null };
  const tp = await admin.from('tenant_profiles').select('id', { count: 'exact', head: true });
  if (!tp.error) tenants = { count: tp.count || 0, basis: 'tenant profiles' };
  else {
    const { data: emails } = await admin.from('applications').select('email');
    tenants = { count: new Set((emails || []).map((r) => String(r.email || '').trim().toLowerCase()).filter(Boolean)).size, basis: 'distinct applicant emails (run db/tenant-profiles.sql for profile count)' };
  }

  const byProfile = new Map();
  for (const l of listings || []) { const a = byProfile.get(l.profile_id) || { listings: [], links: [] }; a.listings.push(l); byProfile.set(l.profile_id, a); }
  const listingOwner = new Map((listings || []).map((l) => [l.id, l.profile_id]));
  for (const k of links) { const pid = listingOwner.get(k.listing_id); if (!pid) continue; const a = byProfile.get(pid) || { listings: [], links: [] }; a.links.push(k); byProfile.set(pid, a); }

  const cutoff = since();
  const realtors = (profiles || []).map((p) => {
    const u = users.get(p.id) || {};
    const agg = byProfile.get(p.id) || { listings: [], links: [] };
    const dates = [u.lastSignInAt, ...agg.listings.map((l) => l.created_at), ...agg.links.map((k) => k.decision_changed_at), ...agg.links.map((k) => k.created_at), p.notifications_last_seen].filter(Boolean).map((d) => new Date(d));
    const lastActivity = dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;
    const suspended = !!p.suspended_at || !!u.banned;
    return {
      id: p.id,
      name: p.full_name || null, brokerage: p.brokerage || null, email: u.email || p.email || null,
      province: p.province || null, signupAt: p.created_at || u.createdAt || null,
      listings: agg.listings.length, applications: agg.links.length,
      lastActivity: lastActivity ? lastActivity.toISOString() : null,
      active: !suspended && !!lastActivity && lastActivity >= cutoff,
      suspended, suspendedAt: p.suspended_at || null,
      accountStatus: getEntitlement(p).status, // 'founding' | 'trialing' | 'trial_expired' | 'paid' | 'past_due' | 'none'
      plan: p.plan || 'none', promoCodeUsed: p.promo_code_used || null,
      signupNumber: p.signup_number ?? null,
      signupNumberHistory: Array.isArray(p.signup_number_history) ? p.signup_number_history : [],
    };
  });

  // Brokerage grouping (normalized on trimmed, case-folded name).
  const brokerages = new Map();
  for (const r of realtors) {
    const key = String(r.brokerage || '').trim().toLowerCase(); if (!key) continue;
    const g = brokerages.get(key) || { name: r.brokerage.trim(), realtors: 0, active: 0, listings: 0, applications: 0 };
    g.realtors += 1; g.active += r.active ? 1 : 0; g.listings += r.listings; g.applications += r.applications; brokerages.set(key, g);
  }

  return {
    generatedAt: new Date().toISOString(),
    activeDefinition: `signed in, created a listing, received an application, or made a decision in the last ${ACTIVE_WINDOW_DAYS} days (and not suspended)`,
    counts: {
      realtors: realtors.length, activeRealtors: realtors.filter((r) => r.active).length, suspended: realtors.filter((r) => r.suspended).length,
      listings: (listings || []).length, applications: applicationsTotal || 0, tenants: tenants.count, tenantsBasis: tenants.basis,
    },
    realtors,
    brokerages: [...brokerages.values()].filter((g) => g.realtors > 1).sort((a, b) => b.realtors - a.realtors),
    suspendColumn: Object.prototype.hasOwnProperty.call((profiles || [])[0] || { suspended_at: undefined }, 'suspended_at'),
  };
}

// What a delete WOULD remove — shown in the confirmation modal. Same logic the delete uses.
export async function cascadePreview(ids) {
  const admin = adminDb(); if (!admin) throw new Error('Supabase is not configured.');
  const { data: profiles } = await admin.from('profiles').select('id, full_name, brokerage').in('id', ids);
  const users = await listAuthUsers(admin);
  const { data: listings } = await admin.from('listings').select('id, profile_id, name, invite_token').in('profile_id', ids);
  const listingIds = (listings || []).map((l) => l.id);
  let links = [];
  if (listingIds.length) { const { data } = await admin.from('listing_applicants').select('id, listing_id, application_id').in('listing_id', listingIds); links = data || []; }
  const appIds = [...new Set(links.map((k) => k.application_id).filter(Boolean))];
  // Applications that would be orphaned = linked ONLY to these listings.
  let orphanAppIds = [];
  if (appIds.length) {
    const { data: others } = await admin.from('listing_applicants').select('application_id, listing_id').in('application_id', appIds);
    const stillLinked = new Set((others || []).filter((k) => !listingIds.includes(k.listing_id)).map((k) => k.application_id));
    orphanAppIds = appIds.filter((id) => !stillLinked.has(id));
  }
  return {
    accounts: (profiles || []).map((p) => ({ id: p.id, name: p.full_name || null, brokerage: p.brokerage || null, email: users.get(p.id)?.email || null })),
    listings: (listings || []).length, junctionRows: links.length, applicationsLinked: appIds.length, applicationsOrphaned: orphanAppIds.length,
    applicationsSharedElsewhere: appIds.length - orphanAppIds.length,
    _internal: { listingIds, orphanAppIds, inviteTokens: (listings || []).map((l) => l.invite_token).filter(Boolean) },
  };
}

// ── Founder numbering ───────────────────────────────────────────────────────────────────────
// Founder numbers are a scarcity mechanism (first 50 → free forever), so they must read as a
// contiguous 1..N. The cohort is the stored founder FLAG (is_founder / subscription_status =
// 'founder', frozen at signup) — never "signup_number ≤ 50" — so renumbering can only relabel a
// founder, never turn a trial account into one or vice versa. Accounts outside the cohort keep
// whatever plain number they have.
const isFounderRow = (p) => getEntitlement(p).status === 'founding';
// Pure: given the surviving founders, the shifts that close the gaps (earliest signup lowest).
export function planFounderRenumber(founders) {
  const ordered = [...founders].filter((p) => p.signup_number != null)
    .sort((a, b) => (a.signup_number - b.signup_number) || (new Date(a.created_at || 0) - new Date(b.created_at || 0)));
  return ordered.map((p, i) => ({ id: p.id, from: p.signup_number, to: i + 1 })).filter((s) => s.from !== s.to);
}
// Renumber ONCE (after a whole batch), ascending so each target number is already vacant if
// signup_number is unique. Appends to signup_number_history (db/founder-renumber.sql); if that
// column doesn't exist yet the number still moves and historyColumnMissing is reported.
export async function renumberFounders(admin, { deletedIds = [], at = new Date().toISOString() } = {}) {
  const out = { shifts: [], historyColumnMissing: false, errors: [] };
  const { data, error } = await admin.from('profiles').select('id, signup_number, is_founder, subscription_status, plan, created_at, signup_number_history');
  if (error) {
    if (!/signup_number_history/.test(error.message || '')) { out.errors.push(error.message); return out; }
    out.historyColumnMissing = true;
    const r2 = await admin.from('profiles').select('id, signup_number, is_founder, subscription_status, plan, created_at');
    if (r2.error) { out.errors.push(r2.error.message); return out; }
    return applyShifts(admin, r2.data, out, { deletedIds, at });
  }
  return applyShifts(admin, data, out, { deletedIds, at });
}
async function applyShifts(admin, rows, out, { deletedIds, at }) {
  const founders = (rows || []).filter(isFounderRow);
  const byId = new Map(founders.map((p) => [p.id, p]));
  for (const s of planFounderRenumber(founders)) {
    const p = byId.get(s.id);
    const entry = { from: s.from, to: s.to, at, reason: 'renumber', deleted: deletedIds };
    const patch = out.historyColumnMissing ? { signup_number: s.to } : { signup_number: s.to, signup_number_history: [...(Array.isArray(p.signup_number_history) ? p.signup_number_history : []), entry] };
    const { error } = await admin.from('profiles').update(patch).eq('id', s.id);
    if (error) { out.errors.push(`renumber ${s.id}: ${error.message}`); break; } // stop: a partial shift must not leapfrog
    out.shifts.push(s);
  }
  return out;
}

// Explicit, ordered cascade. Returns per-account results. Never touches KV app:{RL}, tenant
// profiles, or any listing/junction not owned by these accounts. If any deleted account was a
// founder, the remaining founders are renumbered once after the whole batch.
export async function deleteRealtors(ids, { deleteOrphanApplications }) {
  const admin = adminDb(); if (!admin) throw new Error('Supabase is not configured.');
  const pre = await cascadePreview(ids);
  const { data: numbered } = await admin.from('profiles').select('id, signup_number, is_founder, subscription_status, plan').in('id', ids);
  const foundersDeleted = (numbered || []).filter(isFounderRow).map((p) => ({ id: p.id, number: p.signup_number ?? null }));
  const { listingIds, orphanAppIds, inviteTokens } = pre._internal;
  const result = { listings: 0, junctionRows: 0, applications: 0, profiles: 0, authUsers: 0, kvKeys: 0, storage: 0, errors: [] };
  const step = async (label, fn) => { try { await fn(); } catch (e) { result.errors.push(`${label}: ${e?.message || e}`); } };

  if (listingIds.length) {
    await step('listing_applicants', async () => { const { error, count } = await admin.from('listing_applicants').delete({ count: 'exact' }).in('listing_id', listingIds); if (error) throw error; result.junctionRows = count || 0; });
    if (deleteOrphanApplications && orphanAppIds.length) {
      await step('applications', async () => { const { error, count } = await admin.from('applications').delete({ count: 'exact' }).in('id', orphanAppIds); if (error) throw error; result.applications = count || 0; });
    }
    await step('kv invite tokens', async () => {
      const base = (process.env.KV_REST_API_URL || '').replace(/\/+$/, ''); if (!base) return;
      const h = { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` };
      for (const t of inviteTokens) { await fetch(`${base}/del/linvite:${t}`, { method: 'POST', headers: h }); await fetch(`${base}/del/invite_submissions:${t}`, { method: 'POST', headers: h }); result.kvKeys += 2; }
    });
    await step('listings', async () => { const { error, count } = await admin.from('listings').delete({ count: 'exact' }).in('id', listingIds); if (error) throw error; result.listings = count || 0; });
  }
  for (const id of ids) {
    await step(`storage ${id}`, async () => {
      const { data: files } = await admin.storage.from('logos').list(id);
      if (files?.length) { await admin.storage.from('logos').remove(files.map((f) => `${id}/${f.name}`)); result.storage += files.length; }
    });
    await step(`profile ${id}`, async () => { const { error, count } = await admin.from('profiles').delete({ count: 'exact' }).eq('id', id); if (error) throw error; result.profiles += count || 0; });
    await step(`auth ${id}`, async () => { const { error } = await admin.auth.admin.deleteUser(id); if (error && !/not found/i.test(error.message || '')) throw error; if (!error) result.authUsers += 1; });
  }
  // Once per batch, not per account: close the founder sequence only if a founder went.
  let renumber = null;
  if (foundersDeleted.length) {
    renumber = await renumberFounders(admin, { deletedIds: foundersDeleted.map((f) => f.id) });
    for (const e of renumber.errors) result.errors.push(`founder renumber: ${e}`);
  }
  return { foundersDeleted, renumber, preview: { accounts: pre.accounts, listings: pre.listings, junctionRows: pre.junctionRows, applicationsOrphaned: pre.applicationsOrphaned, applicationsSharedElsewhere: pre.applicationsSharedElsewhere }, result };
}

export async function setSuspended(ids, suspended) {
  const admin = adminDb(); if (!admin) throw new Error('Supabase is not configured.');
  const out = { updated: 0, banned: 0, errors: [], columnMissing: false };
  const { error } = await admin.from('profiles').update({ suspended_at: suspended ? new Date().toISOString() : null }).in('id', ids);
  if (error) { if (/suspended_at/.test(error.message || '')) out.columnMissing = true; else out.errors.push(error.message); } else out.updated = ids.length;
  for (const id of ids) {
    // Auth-layer enforcement: ban = refuses new sign-ins and token refreshes. 'none' lifts it.
    const { error: be } = await admin.auth.admin.updateUserById(id, { ban_duration: suspended ? '87600h' : 'none' });
    if (be) out.errors.push(`auth ${id}: ${be.message}`); else out.banned += 1;
  }
  return out;
}
