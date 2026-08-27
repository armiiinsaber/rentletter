// components/dashboard/Paywall.js
// The paywall (a full-page state, in place of the dashboard) and the plan picker it is built
// from. Paper treatment; two options side by side at 390px; one primary action each, straight
// to Stripe Checkout; a quiet portal link for anyone with a customer record. No countdown, no
// urgency styling, no red. Copy keys off the entitlement — this component decides nothing.
import { useEffect, useState } from 'react';
import { C, R } from '../theme';
import { PLANS, money, annualSaving } from '../../lib/billingConfig';

const COPY = {
  trial_expired: { title: 'Your trial has ended.', body: 'Your listings and applicants are exactly where you left them. Pick a plan to keep going.' },
  past_due: { title: 'Your last payment didn’t go through.', body: 'Update your card in the billing portal and everything picks up where it was.' },
  canceled: { title: 'Your subscription has ended.', body: 'Everything is still here. Start a new plan whenever you want it back.' },
  none: { title: 'Choose a plan to open your workspace.', body: 'Monthly or annual, cancel any time from the billing portal.' },
  pending: { title: 'Payment received.', body: 'Your workspace is being unlocked — this usually takes a few seconds.' },
};
const copyFor = (e) => (e.status === 'past_due' ? COPY.past_due : e.status === 'trial_expired' ? COPY.trial_expired : e.canceled ? COPY.canceled : COPY.none);

async function post(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'That didn’t work. Try again in a minute, or write to info@rentletter.ca.');
  return j;
}

export function PlanPicker({ hasCustomer, showPortal = true, compact = false }) {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const go = async (interval) => { if (busy) return; setBusy(interval); setErr(''); try { const { url } = await post('/api/billing/checkout', { interval }); window.location.href = url; } catch (e) { setErr(e.message); setBusy(''); } };
  const portal = async () => { if (busy) return; setBusy('portal'); setErr(''); try { const { url } = await post('/api/billing/portal'); window.location.href = url; } catch (e) { setErr(e.message); setBusy(''); } };
  const saving = annualSaving();
  return (
    <div>
      <div className="pw-plans">
        {[PLANS.month, PLANS.year].map((p) => { const annual = p.key === 'year'; return (
          <div key={p.key} className={`pw-plan ${annual ? 'annual' : ''}`}>
            <div className="pw-plan-h">
              <span className="pw-plan-l">{p.label}</span>
              {annual && <span className="pw-badge">2 months free</span>}
            </div>
            <div className="pw-price"><span className="pw-amt">{money(p.amount)}</span><span className="pw-per"> / {p.per}</span></div>
            <div className="pw-sub">{annual ? 'Covers the slow season.' : 'Cancel any time.'}</div>
            {annual && <div className="pw-sub" style={{ color: C.inkMute }}>Saves {money(saving)} a year.</div>}
            <button type="button" className="pw-btn" disabled={!!busy} onClick={() => go(p.key)}>{busy === p.key ? 'Opening checkout…' : annual ? 'Choose annual' : 'Choose monthly'}</button>
          </div>
        ); })}
      </div>
      {err && <p role="alert" className="pw-err">{err}</p>}
      <p className="pw-fine">{PLANS.month.per === 'month' ? 'Prices in Canadian dollars, tax added at checkout. ' : ''}Payments are handled by Stripe.</p>
      {showPortal && hasCustomer && <p className="pw-fine"><button type="button" className="pw-link" disabled={!!busy} onClick={portal}>{busy === 'portal' ? 'Opening…' : 'Open the billing portal'}</button> to update your card, see invoices or cancel.</p>}
      <style jsx global>{`
        .pw-plans { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: ${compact ? 8 : 10}px; }
        .pw-plan { background: ${C.card}; border: 1px solid ${C.rule}; border-radius: ${R.card}px; padding: clamp(14px, 3.5vw, 22px) clamp(12px, 3vw, 20px); display: flex; flex-direction: column; gap: 6px; min-width: 0; }
        .pw-plan.annual { border-color: ${C.ruleDark}; }
        .pw-plan-h { display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-wrap: wrap; min-height: 22px; }
        .pw-plan-l { font-size: 12px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${C.inkMute}; }
        .pw-badge { font-size: 10.5px; font-weight: 700; letter-spacing: 0.04em; color: ${C.inkSoft}; background: ${C.paperDeep}; border: 1px solid ${C.rule}; border-radius: ${R.pill}px; padding: 2px 8px; white-space: nowrap; }
        .pw-price { display: flex; align-items: baseline; flex-wrap: wrap; gap: 2px; margin-top: 4px; }
        .pw-amt { font-family: 'Fraunces', Georgia, serif; font-weight: 600; font-size: clamp(24px, 6.5vw, 34px); letter-spacing: -0.02em; color: ${C.ink}; font-variant-numeric: tabular-nums; line-height: 1; }
        .pw-per { font-size: 13px; color: ${C.inkMute}; }
        .pw-sub { font-size: 13px; color: ${C.inkSoft}; line-height: 1.45; text-wrap: balance; }
        .pw-btn { margin-top: auto; padding-top: 0; min-height: 48px; border: none; border-radius: ${R.ctrl}px; background: ${C.ink}; color: ${C.paper}; font: inherit; font-size: 15px; font-weight: 700; cursor: pointer; margin-top: 12px; }
        .pw-btn:disabled { opacity: 0.6; cursor: wait; }
        .pw-err { margin-top: 12px; font-size: 13.5px; color: ${C.danger}; text-wrap: balance; }
        .pw-fine { margin-top: 12px; font-size: 12.5px; color: ${C.inkMute}; line-height: 1.55; text-wrap: balance; }
        .pw-link { background: none; border: none; padding: 0; font: inherit; font-size: 12.5px; color: ${C.ink}; font-weight: 700; text-decoration: underline; cursor: pointer; }
        @media (prefers-reduced-motion: no-preference) { .pw-btn { transition: opacity 140ms ease; } }
      `}</style>
    </div>
  );
}

// The full-page state. `pending` = arrived back from Checkout with ?checkout=success before the
// webhook landed: say so, poll once or twice, no plan cards.
export default function Paywall({ entitlement, profile, pending = false }) {
  const c = pending ? COPY.pending : copyFor(entitlement);
  const [tries, setTries] = useState(0);
  useEffect(() => { if (!pending || tries >= 4) return undefined; const t = setTimeout(() => { setTries((n) => n + 1); window.location.reload(); }, 3500); return () => clearTimeout(t); }, [pending, tries]);
  return (
    <section aria-label="Plans" style={{ maxWidth: 640, margin: '0 auto', padding: 'clamp(24px, 6vw, 56px) 0 48px', textAlign: 'center' }}>
      <span aria-hidden="true" style={{ display: 'block', width: 26, height: 3, background: C.ink, borderRadius: 1, margin: '0 auto 18px' }} />
      <h1 className="rl-serif" style={{ fontSize: 'clamp(26px, 6vw, 38px)', color: C.ink, letterSpacing: '-0.025em', lineHeight: 1.08, marginBottom: 12, textWrap: 'balance' }}>{c.title}</h1>
      <p style={{ fontSize: 16, color: C.inkSoft, lineHeight: 1.55, marginBottom: 26, textWrap: 'balance' }}>{c.body}</p>
      {pending ? (
        <p style={{ fontSize: 13.5, color: C.inkMute }}>Not unlocked after a minute? <button type="button" className="pw-link" onClick={() => window.location.reload()}>Refresh</button> or write to info@rentletter.ca.</p>
      ) : (
        <div style={{ textAlign: 'left' }}><PlanPicker hasCustomer={!!profile?.stripe_customer_id} /></div>
      )}
    </section>
  );
}
