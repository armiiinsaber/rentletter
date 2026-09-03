// components/dashboard/ReferralInbox.js
// Realtor 2's "Referred to you" — approved referrals addressed to the signed-in realtor's
// email. Assigning one to a listing turns it into an ordinary applicant there, ranked against
// THAT listing. Renders nothing when the inbox is empty.
import { useState, useEffect, useRef } from 'react';
import { C, R } from '../theme';
import { Icon } from '../ui';
import ReferralCaution from './ReferralCaution';
import { useAdapter } from '../../lib/dashboardAdapter';

const money = (n) => (n ? `$${Number(n).toLocaleString('en-CA')}` : null);
const EMP = { 'full-time': 'Full-time', 'part-time': 'Part-time', contract: 'Contract', 'self-employed': 'Self-employed' };

// initialItems: the inbox as loaded with the page (HomeView's signals), so this block is part of
// the first paint instead of mounting after its own fetch. Refetches only after an assignment.
export default function ReferralInbox({ listings, initialItems = null, onChanged, embedded = false }) {
  const adapter = useAdapter();
  const [items, setItems] = useState(Array.isArray(initialItems) ? initialItems : null);
  const [choice, setChoice] = useState({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const load = async () => { try { const r = await adapter.fetch('/api/referrals/inbox'); if (r.ok) setItems((await r.json()).referrals || []); else setItems([]); } catch (e) { setItems([]); } };
  useEffect(() => { if (!Array.isArray(initialItems)) load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // The claim by profile id moved out of the read path: once, when unclaimed referrals are shown.
  const claimedOnce = useRef(false);
  useEffect(() => {
    if (claimedOnce.current || !Array.isArray(items) || !items.some((r) => r && r.claimed === false)) return;
    claimedOnce.current = true;
    adapter.fetch('/api/referrals/claim', { method: 'POST' }).catch(() => {});
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!items || items.length === 0) return null;

  const assign = async (ref) => {
    const listingId = choice[ref.id]; if (!listingId) return;
    setBusy(ref.id); setError('');
    try {
      const r = await adapter.fetch('/api/referrals/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ referralId: ref.id, listingId }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || 'Could not assign.');
      await load();
      onChanged?.();
    } catch (e) { setError(e.message); }
    setBusy('');
  };

  return (
    <section id="referrals" className={embedded ? '' : 'dash-card span-4'} style={{ padding: embedded ? '4px 0 0' : 'clamp(16px, 3vw, 24px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', marginBottom: 'var(--s-1)' }}>
        <span aria-hidden="true" style={{ width: 22, height: 2, background: C.red, borderRadius: 1 }} />
        <span style={{ fontSize: 'var(--t-eyebrow)', color: C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Referred to you</span>
      </div>
      <h2 style={{ fontSize: 'var(--t-d3)', fontWeight: 800, color: C.ink, letterSpacing: '-0.015em', marginBottom: 'var(--s-1)' }}>{items.length} applicant{items.length === 1 ? '' : 's'} sent your way</h2>
      <p style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft, lineHeight: 1.55, marginBottom: 'var(--s-3)' }}>Each approved sharing their application with you. Assign one to a listing and it’s ranked against that unit like any other applicant.</p>
      {error && <div role="alert" style={{ marginBottom: 'var(--s-3)', padding: 'var(--s-2) var(--s-3)', background: C.redTint, borderLeft: `3px solid ${C.danger}`, borderRadius: R.ctrl, fontSize: 'var(--t-body-2)' }}>{error}</div>}
      <div style={{ display: 'grid', gap: 'var(--s-3)' }}>
        {items.map((ref) => {
          const a = ref.applicant;
          const assignedListing = listings.find((l) => l.id === ref.assignedListingId);
          return (
            <div key={ref.id} style={{ border: `1px solid ${C.rule}`, borderRadius: R.card, padding: 'var(--card-pad)', background: C.card }}>
              {ref.revoked || !a ? (
                <div style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft, lineHeight: 1.55 }}><strong style={{ color: C.ink }}>Referral revoked.</strong> The applicant withdrew their consent; their details are no longer available. Referred by {ref.from?.name || 'another realtor'}.</div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--s-3)', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 'var(--t-body)', fontWeight: 800, color: C.ink, letterSpacing: '-0.01em' }}>{a.name || 'Applicant'}</div>
                      <div style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft, marginTop: 'var(--s-1)', overflowWrap: 'anywhere' }}>
                        {[a.jobTitle, a.employer].filter(Boolean).join(' at ') || 'Role not listed'}{EMP[a.employmentType] ? ` · ${EMP[a.employmentType]}` : ''}{a.annualIncome ? ` · ${money(a.annualIncome)}/yr before tax` : ''}{a.netIncome ? ` · ~${money(a.netIncome)} after tax` : ''}
                      </div>
                      <div style={{ fontSize: 'var(--t-body-2)', color: C.inkMute, marginTop: 'var(--s-1)' }}>
                        {[a.yearsAtJob ? `${a.yearsAtJob} yrs in role` : null, a.rentalYears ? `${a.rentalYears} yrs renting${a.hasLandlordRef ? ' · landlord ref' : ''}` : null, a.occupants ? `${a.occupants} occupant(s)` : null, a.pets ? `pets: ${a.pets}` : null, a.moveInDate ? `move in ${a.moveInDate}` : null].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    {assignedListing
                      ? <a href={adapter.paths.listing(assignedListing.id)} style={{ fontSize: 'var(--t-body-2)', fontWeight: 700, color: C.green, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 'var(--s-1)', flexShrink: 0 }}><Icon name="check" size={14} color={C.green} strokeWidth={2.5} /> On {assignedListing.name || 'your listing'}</a>
                      : <span style={{ fontSize: 'var(--t-eyebrow)', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.ink, background: C.paperDeep, padding: 'var(--s-1) var(--s-2)', borderRadius: R.pill, flexShrink: 0 }}>Not yet assigned</span>}
                  </div>
                  <ReferralCaution meta={{ fromName: ref.from?.name, fromBrokerage: ref.from?.brokerage, approvedAt: ref.approvedAt, note: ref.note, verification: ref.verification }} compact />
                  {!assignedListing && (
                    <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', alignItems: 'center', marginTop: 'var(--s-3)' }}>
                      <select value={choice[ref.id] || ''} onChange={(e) => setChoice((c) => ({ ...c, [ref.id]: e.target.value }))} aria-label="Assign to listing"
                        style={{ flex: '1 1 200px', minWidth: 0, padding: 'var(--s-2) var(--s-3)', fontSize: 'var(--t-body-2)', border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, background: C.card, color: C.ink, minHeight: 42 }}>
                        <option value="">Assign to a listing…</option>
                        {listings.map((l) => <option key={l.id} value={l.id}>{l.name || l.address}{l.monthly_rent ? ` · $${Number(l.monthly_rent).toLocaleString('en-CA')}/mo` : ''}</option>)}
                      </select>
                      <button type="button" onClick={() => assign(ref)} disabled={!choice[ref.id] || busy === ref.id}
                        style={{ background: C.ink, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: 'var(--s-2) var(--s-4)', fontSize: 'var(--t-body-2)', fontWeight: 700, cursor: !choice[ref.id] ? 'not-allowed' : 'pointer', opacity: !choice[ref.id] ? 0.5 : 1, minHeight: 42 }}>
                        {busy === ref.id ? 'Assigning…' : 'Assign & rank'}
                      </button>
                      {listings.length === 0 && <span style={{ fontSize: 'var(--t-body-2)', color: C.inkMute }}>Create a listing first.</span>}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
