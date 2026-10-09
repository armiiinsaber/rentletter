// components/dashboard/StatusBadge.js
// Trial / subscription badge derived from the profile. Display only. Founder accounts show
// NOTHING here — founder status (and the signup number) is visible only on /admin. Access is
// decided by lib/entitlements.js; this only labels it.
import { C, R } from '../theme';
import { evaluateProfile } from '../../lib/accountStatus';
import { billingOff } from '../../lib/billingOff';

export default function StatusBadge({ profile }) {
  if (billingOff()) return null; // nobody pays (lib/billingOff.js): no trial, no plan, no badge
  const s = evaluateProfile(profile);
  // founding → nothing; none → nothing (no gating yet — that ships with checkout)
  if (s.status === 'founding' || s.status === 'unknown' || s.status === 'none') return null;
  let bg = C.paperDeep, fg = C.inkSoft, border = C.rule, label = 'not set';
  if (s.status === 'paid') {
    bg = C.paper; fg = C.ink; border = C.rule; label = 'Subscribed';
  } else if (s.status === 'trialing') {
    bg = C.paper; fg = C.ink; border = C.rule;
    label = `Trial · ${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'} left`;
  } else if (s.status === 'trial_expired') {
    bg = C.redTint; fg = C.red; border = C.red; label = 'Trial ended';
  } else if (s.status === 'past_due') {
    bg = C.dangerTint; fg = C.danger; border = C.danger; label = 'Payment past due';
  }
  return (
    <span style={{
      height: 34, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', flexShrink: 0,
      fontSize: 12, fontWeight: 700, padding: '0 12px', borderRadius: R.pill,
      background: bg, color: fg, border: `1px solid ${border}`, whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}
