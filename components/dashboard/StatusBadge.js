// components/dashboard/StatusBadge.js
// Founder / trial / subscription badge derived from the profile. Display only.
import { C, R } from '../theme';
import { evaluateProfile } from '../../lib/accountStatus';

export default function StatusBadge({ profile }) {
  const s = evaluateProfile(profile);
  let bg = C.paperDeep, fg = C.inkSoft, border = C.rule, label = '—';
  if (s.status === 'founder') {
    bg = C.greenTint; fg = C.green; border = C.green;
    label = s.signupNumber ? `Founder · #${s.signupNumber} of 50` : 'Founder · free forever';
  } else if (s.status === 'active') {
    bg = C.greenTint; fg = C.green; border = C.green; label = 'Subscribed';
  } else if (s.status === 'trial') {
    bg = C.amberTint; fg = C.amber; border = C.amber;
    label = `Trial · ${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'} left`;
  } else if (s.status === 'lapsed') {
    bg = C.redTint; fg = C.red; border = C.red; label = 'Trial ended';
  } else if (s.status === 'pending') {
    bg = C.paperDeep; fg = C.inkMute; border = C.rule; label = 'Confirm your email';
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
