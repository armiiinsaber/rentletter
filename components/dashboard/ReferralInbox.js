// components/dashboard/ReferralInbox.js
// Realtor 2's "Referred to you" — approved referrals addressed to the signed-in realtor's
// email. Assigning one to a listing turns it into an ordinary applicant there, ranked against
// THAT listing. Renders nothing when the inbox is empty.
import { useState, useEffect } from 'react';
import { C, R } from '../theme';
import { Icon } from '../ui';
import ReferralCaution from './ReferralCaution';
import { useAdapter } from '../../lib/dashboardAdapter';

const money = (n) => (n ? `$${Number(n).toLocaleString('en-CA')}` : null);
const EMP = { 'full-time': 'Full-time', 'part-time': 'Part-time', contract: 'Contract', 'self-employed': 'Self-employed' };

export default function ReferralInbox({ listings }) {
  const adapter = useAdapter();
  const [items, setItems] = useState(null);
  const [choice, setChoice] = useState({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const load = async () => { try { const r = await adapter.fetch('/api/referrals/inbox'); if (r.ok) setItems((await r.json()).referrals || []); else setItems([]); } catch (e) { setItems([]); } };
  useEffect(() => { load(); }, []);
  if (!items || items.length === 0) return null;

  const assign = async (ref) => {
    const listingId = choice[ref.id]; if (!listingId) return;
    setBusy(ref.id); setError('');
    try {
      const r = await adapter.fetch('/api/referrals/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ referralId: ref.id, listingId }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || 'Could not assign.');
      await load();
    } catch (e) { setError(e.message); }
    setBusy('');
  };

  return (
    <section id="referrals" className="dash-card span-4" style={{ padding: 'clamp(16px, 3vw, 24px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span aria-hidden="true" style={{ width: 22, height: 2, background: C.red, borderRadius: 1 }} />
        <span style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Referred to you</span>
      </div>
      <h2 style={{ fontSize: 'clamp(18px, 3vw, 22px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.015em', marginBottom: 4 }}>{items.length} applicant{items.length === 1 ? '' : 's'} sent your way</h2>
      <p style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.55, marginBottom: 14 }}>Each approved sharing their application with you. Assign one to a listing and it’s ranked against that unit like any other applicant.</p>
      {error && <div role="alert" style={{ marginBottom: 12, padding: '10px 12px', background: C.redTint, borderLeft: `3px solid ${C.danger}`, borderRadius: R.ctrl, fontSize: 13 }}>{error}</div>}
      <div style={{ display: 'grid', gap: 12 }}>
        {items.map((ref) => {
          const a = ref.applicant;
          const assignedListing = listings.find((l) => l.id === ref.assignedListingId);
          return (
            <div key={ref.id} style={{ border: `1px solid ${C.rule}`, borderRadius: R.card, padding: 'clamp(12px, 3vw, 16px)', background: C.card }}>
              {ref.revoked || !a ? (
                <div style={{ fontSize: 13.5, color: C.inkSoft, lineHeight: 1.55 }}><strong style={{ color: C.ink }}>Referral revoked.</strong> The applicant withdrew their consent; their details are no longer available. Referred by {ref.from?.name || 'another realtor'}.</div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: C.ink, letterSpacing: '-0.01em' }}>{a.name || 'Applicant'}</div>
                      <div style={{ fontSize: 13, color: C.inkSoft, marginTop: 2, overflowWrap: 'anywhere' }}>
                        {[a.jobTitle, a.employer].filter(Boolean).join(' at ') || 'Role not listed'}{EMP[a.employmentType] ? ` · ${EMP[a.employmentType]}` : ''}{a.annualIncome ? ` · ${money(a.annualIncome)}/yr before tax` : ''}{a.netIncome ? ` · ~${money(a.netIncome)} after tax` : ''}
                      </div>
                      <div style={{ fontSize: 12.5, color: C.inkMute, marginTop: 3 }}>
                        {[a.yearsAtJob ? `${a.yearsAtJob} yrs in role` : null, a.rentalYears ? `${a.rentalYears} yrs renting${a.hasLandlordRef ? ' · landlord ref' : ''}` : null, a.occupants ? `${a.occupants} occupant(s)` : null, a.pets ? `pets: ${a.pets}` : null, a.moveInDate ? `move-in ${a.moveInDate}` : null].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    {assignedListing
                      ? <a href={adapter.paths.listing(assignedListing.id)} style={{ fontSize: 12.5, fontWeight: 700, color: C.green, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}><Icon name="check" size={14} color={C.green} strokeWidth={2.5} /> On {assignedListing.name || 'your listing'}</a>
                      : <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.ink, background: C.paperDeep, padding: '3px 8px', borderRadius: R.pill, flexShrink: 0 }}>Not yet assigned</span>}
                  </div>
                  <ReferralCaution meta={{ fromName: ref.from?.name, fromBrokerage: ref.from?.brokerage, approvedAt: ref.approvedAt, note: ref.note, verification: ref.verification }} compact />
                  {!assignedListing && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
                      <select value={choice[ref.id] || ''} onChange={(e) => setChoice((c) => ({ ...c, [ref.id]: e.target.value }))} aria-label="Assign to listing"
                        style={{ flex: '1 1 200px', minWidth: 0, padding: '10px 12px', fontSize: 14, border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, background: C.card, color: C.ink, minHeight: 42 }}>
                        <option value="">Assign to a listing…</option>
                        {listings.map((l) => <option key={l.id} value={l.id}>{l.name || l.address}{l.monthly_rent ? ` · $${Number(l.monthly_rent).toLocaleString('en-CA')}/mo` : ''}</option>)}
                      </select>
                      <button type="button" onClick={() => assign(ref)} disabled={!choice[ref.id] || busy === ref.id}
                        style={{ background: C.ink, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '10px 16px', fontSize: 13.5, fontWeight: 700, cursor: !choice[ref.id] ? 'not-allowed' : 'pointer', opacity: !choice[ref.id] ? 0.5 : 1, minHeight: 42 }}>
                        {busy === ref.id ? 'Assigning…' : 'Assign & rank'}
                      </button>
                      {listings.length === 0 && <span style={{ fontSize: 12.5, color: C.inkMute }}>Create a listing first.</span>}
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
