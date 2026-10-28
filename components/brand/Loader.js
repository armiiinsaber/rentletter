// components/brand/Loader.js
// The loading icon: the door mark alone (the bar and the R, no wordmark), looping on the
// production values (lib/motion.js DOOR), drawn by components/brand/DoorMark.js. It stands
// wherever the product showed a spinner, a busy indicator or loading text. Never smaller than
// LOADER_MIN. Under reduced motion it holds still and breathes, with no knob (DoorMark).
//   Loader   role status, named for what is loading (label), with the same words inside for screen
//            readers that read a live region's text. tone: 'paper' on paper and white (the
//            wordmark's colours: red door, ink R, ink knob); 'ink' on ink surfaces (the admin
//            colours: red door, paper R, ink knob); 'red' on a red pill (the realtor icon's
//            colours: ink door, white R, red knob). The ground is the surface it sits on.
//   Pending  a pending button's content: the resting label stays in place, unseen, so the button
//            keeps exactly its resting size and screen readers still have its name; the door sits
//            in the middle of the pill at LOADER_MIN while busy.
import DoorMark from './DoorMark';
import { DOOR } from '../../lib/motion';

export const LOADER_MIN = 28;
const KIND = { paper: 'paper', ink: 'ink', red: 'red' };
const LOOP = Object.freeze({ ...DOOR.defaults, play: 'loop' });
const UNSEEN = { position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, overflow: 'hidden', clip: 'rect(0 0 0 0)', clipPath: 'inset(50%)', whiteSpace: 'nowrap', border: 0 };

export default function Loader({ label, tone = 'paper', size = LOADER_MIN, style }) {
  const px = Math.max(LOADER_MIN, size);
  return (
    <span role="status" aria-label={label} data-loader={tone} style={{ position: 'relative', display: 'inline-flex', width: px, height: px, flexShrink: 0, ...style }}>
      <DoorMark kind={KIND[tone] || 'paper'} size={px} ground={false} label={null} settings={LOOP} />
      <span style={UNSEEN}>{label}</span>
    </span>
  );
}

export function Pending({ busy, label, tone = 'paper', children }) {
  return (
    <span data-pending={busy ? 'busy' : 'rest'} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'inherit', maxWidth: '100%' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'inherit', minWidth: 0, opacity: busy ? 0 : 1 }}>{children}</span>
      {busy ? <Loader label={label} tone={tone} style={{ position: 'absolute', left: '50%', top: '50%', marginLeft: -LOADER_MIN / 2, marginTop: -LOADER_MIN / 2 }} /> : null}
    </span>
  );
}
