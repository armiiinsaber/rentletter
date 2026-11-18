// components/dashboard/ReferralCaution.js
// PURE PRESENTATIONAL. Shown wherever a REFERRED applicant appears in the receiving realtor's
// views: who referred them, when the applicant approved, and that no document check came with
// them. A note from the referring realtor and that realtor's document read are never read here,
// even where an older row still holds them (lib/referrals.js).
import { C, R } from '../theme';

const dateLong = (iso) => { try { return new Date(iso).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }); } catch (e) { return 'not set'; } };

export default function ReferralCaution({ meta, compact = false }) {
  if (!meta) return null;
  return (
    <div style={{ marginTop: compact ? 8 : 12, padding: compact ? '8px 12px' : '10px 14px', background: C.paperDeep, border: `1px solid ${C.rule}`, borderLeft: `3px solid ${C.ink}`, borderRadius: R.ctrl, fontSize: 'var(--t-body-2)', color: C.inkSoft, lineHeight: 1.55 }}>
      <div style={{ color: C.ink, fontWeight: 700, textWrap: 'balance' }}>Referred by {meta.fromName || 'another realtor'}{meta.fromBrokerage ? `, ${meta.fromBrokerage}` : ''}.{meta.approvedAt ? ` The applicant approved on ${dateLong(meta.approvedAt)}.` : ''}</div>
      <div style={{ marginTop: 'var(--s-1)', textWrap: 'balance' }}>No document check was shared. Request documents as you would for any applicant.</div>
    </div>
  );
}
