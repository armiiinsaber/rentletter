// components/dashboard/RealtorCard.js
// One realtor as other realtors see them in Circle (components/dashboard/CircleView.js): the
// initials, the name and the brokerage, then whatever the card is for (an action, the record, the
// history). The realtor's Profile (components/dashboard/ProfileView.js) shows the same card as its
// live preview of how they appear in Circle search. What a card may hold is set on the server
// (lib/circle.js publicCard): a name, a brokerage and initials, never an email, a phone or a number.
//   who       { name, brokerage, initials }
//   children  what follows the name: lines, pills, the card's buttons
// Each card is a list item: render it inside a list.
import { C } from '../theme';

// The initials lib/circle.js gives a card (initialsOf there, a server file the browser never
// loads): the first letter of the first two words, upper case, or a question mark.
export const initialsOf = (name) => { const parts = String(name || '').trim().split(/\s+/).filter(Boolean); return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?'; };

export default function RealtorCard({ who, children, className = '', ...rest }) {
  return (
    <li className={`cv-person${className ? ` ${className}` : ''}`} {...rest}>
      <div className="cv-who">
        <span className="cv-avatar" aria-hidden="true">{who.initials}</span>
        <div style={{ minWidth: 0 }}>
          <div className="cv-name" style={{ '--n': Math.max(8, String(who.name || '').length) }}>{who.name}</div>
          {who.brokerage ? <div className="cv-brok">{who.brokerage}</div> : null}
        </div>
      </div>
      {children}
      <style jsx global>{`
        .cv-person { container-type: inline-size; background: ${C.card}; border: 1px solid ${C.rule}; border-radius: var(--card-radius); padding: var(--card-pad); min-width: 0; }
        .cv-who { --cv-room: calc(100cqi - 56px); --cv-size: var(--t-body); display: flex; align-items: center; gap: var(--s-3); min-width: 0; }
        .cv-avatar { width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; background: ${C.paperDeep}; border: 1px solid ${C.rule}; color: ${C.ink}; font-size: var(--t-body-2); font-weight: 800; letter-spacing: 0.02em; }
        .cv-name { font-size: var(--t-body); font-weight: 700; color: ${C.ink}; line-height: 1.3; overflow-wrap: anywhere; text-wrap: balance; }
        /* A name in a card is one line: a long one steps down in size to fit the room beside the
           initials (or under them), never a word alone. --n is the name's length in characters. */
        .cv-person .cv-name { white-space: nowrap; overflow-wrap: normal; font-size: min(var(--cv-size), calc(var(--cv-room) / (var(--n, 16) * 0.6))); }
        .cv-brok { font-size: var(--t-body-2); color: ${C.inkSoft}; line-height: 1.4; margin-top: 2px; overflow-wrap: anywhere; text-wrap: balance; }
        /* A narrow card (a phone at 320, two across at 1280, a preview): the initials stand above
           the name, so the name has the card's whole width. */
        @container (max-width: 315.98px) {
          .cv-who { --cv-room: 100cqi; flex-direction: column; align-items: flex-start; gap: var(--s-2); }
        }
        @media (max-width: 344.98px) {
          .cv-who { --cv-size: 15px; flex-direction: column; align-items: flex-start; gap: var(--s-2); }
          .cv-name { font-size: 15px; }
        }
      `}</style>
    </li>
  );
}
