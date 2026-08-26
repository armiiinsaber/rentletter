// components/onboarding/OnboardingFlow.js
// First run onboarding, one question per screen. Pure UI: every write goes through the callbacks
// the page passes in (pages/onboarding.js owns Supabase). Paper treatment, generous type, a quiet
// step count instead of a progress bar. Reuses the existing branding editor (logo only) and the
// existing create listing form; nothing here is a second copy of either.
//
//   steps: identity → province → branding (skippable) → listing (skippable) → done
import { useEffect, useRef, useState } from 'react';
import { C, R, FONT } from '../theme';
import { Icon } from '../ui';
import ProfileEditorBody from '../dashboard/ProfileEditorBody';
import ListingSetupModal from '../listings/ListingSetupModal';
import PromoEntry from '../dashboard/PromoEntry';
import { PROVINCE_OPTIONS } from '../../lib/provinces';
import { STEPS } from '../../lib/onboarding';

const NAME_MAX = 80; const BROKERAGE_MAX = 120;
const input = { width: '100%', padding: '13px 14px', fontSize: 17, border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, background: C.card, color: C.ink, minHeight: 52, outline: 'none' };
const label = { display: 'block', fontSize: 12, color: C.inkSoft, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8 };

function Shell({ step, title, lead, children, aside }) {
  const idx = STEPS.indexOf(step);
  return (
    <main className="ob-main">
      <div className="ob-count">{idx >= 0 ? `Step ${idx + 1} of ${STEPS.length}` : 'All set'}</div>
      <h1 className="ob-h1">{title}</h1>
      {lead && <p className="ob-lead">{lead}</p>}
      <div className="ob-body">{children}</div>
      {aside}
    </main>
  );
}
const Primary = ({ children, ...p }) => <button type="submit" className="ob-primary" {...p}>{children}</button>;
const Skip = ({ children = 'Skip for now', ...p }) => <button type="button" className="ob-skip" {...p}>{children}</button>;

export function IdentityStep({ profile, onSave }) {
  const [name, setName] = useState((profile?.full_name || '').trim());
  const [brokerage, setBrokerage] = useState((profile?.brokerage || '').trim());
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const ref = useRef(null); useEffect(() => { ref.current?.focus(); }, []);
  const ok = name.trim().length > 1 && brokerage.trim().length > 1;
  const submit = async (e) => { e.preventDefault(); if (!ok || busy) return; setBusy(true); setErr(''); const r = await onSave({ full_name: name.trim().slice(0, NAME_MAX), brokerage: brokerage.trim().slice(0, BROKERAGE_MAX) }); setBusy(false); if (r?.error) setErr(r.error); };
  return (
    <Shell step="identity" title="Who should landlords see on your reports?" lead="This is the name that signs each report. It can be changed on any individual report later.">
      <form onSubmit={submit} className="ob-form">
        <div><label style={label} htmlFor="ob-name">Name on reports</label><input ref={ref} id="ob-name" style={input} value={name} onChange={(e) => setName(e.target.value)} maxLength={NAME_MAX} autoCapitalize="words" autoComplete="name" enterKeyHint="next" placeholder="Jordan Lee" /></div>
        <div><label style={label} htmlFor="ob-brokerage">Brokerage</label><input id="ob-brokerage" style={input} value={brokerage} onChange={(e) => setBrokerage(e.target.value)} maxLength={BROKERAGE_MAX} autoCapitalize="words" autoComplete="organization" enterKeyHint="done" placeholder="Right at Home Realty" /></div>
        {err && <p role="alert" className="ob-err">{err}</p>}
        <Primary disabled={!ok || busy}>{busy ? 'Saving…' : 'Continue'}</Primary>
      </form>
    </Shell>
  );
}

export function ProvinceStep({ profile, onSave }) {
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const pick = async (v) => { if (busy) return; setBusy(v); setErr(''); const r = await onSave({ province: v }); if (r?.error) { setErr(r.error); setBusy(''); } };
  return (
    <Shell step="province" title="Where do you work?" lead="This sets the rules the questionnaire follows.">
      <div className="ob-choices" role="group" aria-label="Province">
        {PROVINCE_OPTIONS.map((p) => (
          <button key={p.value} type="button" className={`ob-choice ${profile?.province === p.value ? 'on' : ''}`} onClick={() => pick(p.value)} disabled={!!busy} aria-pressed={profile?.province === p.value}>
            <span className="ob-choice-code">{p.value}</span>
            <span className="ob-choice-name">{p.label}</span>
            {busy === p.value && <span className="ob-choice-busy">Saving…</span>}
          </button>
        ))}
      </div>
      {err && <p role="alert" className="ob-err">{err}</p>}
    </Shell>
  );
}

export function BrandingStep({ profile, onProfile, onDone, onSkip }) {
  const hasLogo = !!profile?.logo_url;
  return (
    <Shell step="branding" title="Put your logo on every report." lead="Upload one, or make one here. Landlords see it on the report masthead.">
      <div className="ob-card"><ProfileEditorBody profile={profile} onSaved={onProfile} logoOnly /></div>
      <div className="ob-actions">
        <Primary type="button" onClick={onDone}>{hasLogo ? 'Continue' : 'Continue without a logo'}</Primary>
        {!hasLogo && <Skip onClick={onSkip} />}
      </div>
    </Shell>
  );
}

export function ListingStep({ onCreate, onSkip, saving, error }) {
  return (
    <Shell step="listing" title="Add your first listing." lead="A listing holds one unit, its invite link, and every application that comes in.">
      {error && <p role="alert" className="ob-err">{error}</p>}
      <ListingSetupModal mode="create" inline onCancel={onSkip} onSave={onCreate} saving={saving} />
      <div className="ob-actions"><Skip onClick={onSkip}>Skip for now, I’ll add one later</Skip></div>
    </Shell>
  );
}

export function DoneStep({ inviteUrl, listingHref, dashboardHref, onNewListing }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(inviteUrl); setCopied(true); setTimeout(() => setCopied(false), 2200); } catch (e) { /* the field stays selectable */ } };
  return (
    <Shell step="done" title={inviteUrl ? 'Your invite link is ready.' : 'You’re set up.'} lead={inviteUrl ? 'Send this link to everyone who wants to apply. Applications land on the listing, ranked.' : 'Your first listing is one step away.'}
      aside={<div className="ob-foot"><PromoEntry compact /><a href={dashboardHref} className="ob-quiet">Go to your dashboard</a></div>}>
      {inviteUrl ? (
        <>
          <div className="ob-link" aria-label="Invite link"><span>{inviteUrl}</span></div>
          <Primary type="button" onClick={copy}><Icon name="copy" size={17} /> {copied ? 'Copied' : 'Copy invite link'}</Primary>
          {listingHref && <a href={listingHref} className="ob-quiet">Open the listing</a>}
        </>
      ) : (
        <Primary type="button" onClick={onNewListing}><Icon name="plus" size={17} /> Create a listing</Primary>
      )}
    </Shell>
  );
}

export function OnboardingStyles() {
  return (
    <style jsx global>{`
      .ob-main { max-width: 560px; margin: 0 auto; padding: clamp(28px, 7vw, 64px) clamp(16px, 4vw, 32px) max(48px, env(safe-area-inset-bottom)); }
      .ob-count { font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: ${C.inkMute}; margin-bottom: 14px; }
      .ob-h1 { font-family: ${FONT.serif}; font-weight: 600; font-size: clamp(28px, 7.2vw, 40px); letter-spacing: -0.025em; line-height: 1.08; color: ${C.ink}; text-wrap: balance; margin-bottom: 12px; }
      .ob-lead { font-size: clamp(15px, 4vw, 17px); color: ${C.inkSoft}; line-height: 1.55; text-wrap: pretty; margin-bottom: 24px; }
      .ob-form { display: grid; gap: 18px; }
      .ob-primary { display: inline-flex; align-items: center; justify-content: center; gap: 8px; width: 100%; min-height: 54px; padding: 0 22px; background: ${C.red}; color: ${C.paper}; border: none; border-radius: ${R.ctrl}px; font: inherit; font-size: 16px; font-weight: 700; cursor: pointer; }
      .ob-primary:disabled { background: ${C.ruleDark}; cursor: not-allowed; }
      .ob-skip { width: 100%; min-height: 50px; background: ${C.card}; color: ${C.ink}; border: 1px solid ${C.ruleDark}; border-radius: ${R.ctrl}px; font: inherit; font-size: 15px; font-weight: 700; cursor: pointer; }
      .ob-actions { display: grid; gap: 10px; margin-top: 18px; }
      .ob-err { font-size: 14px; color: ${C.danger}; line-height: 1.5; text-wrap: balance; margin: 0; }
      .ob-choices { display: grid; gap: 12px; }
      .ob-choice { display: flex; align-items: center; gap: 16px; width: 100%; min-height: 84px; padding: 18px 20px; background: ${C.card}; border: 1px solid ${C.ruleDark}; border-radius: ${R.card}px; font: inherit; color: ${C.ink}; text-align: left; cursor: pointer; }
      .ob-choice.on { border-color: ${C.ink}; box-shadow: inset 0 0 0 1px ${C.ink}; }
      .ob-choice:disabled { cursor: wait; }
      .ob-choice-code { font-family: ${FONT.serif}; font-weight: 600; font-size: 26px; letter-spacing: -0.02em; width: 52px; flex-shrink: 0; }
      .ob-choice-name { font-size: 17px; font-weight: 700; flex: 1; }
      .ob-choice-busy { font-size: 12.5px; color: ${C.inkMute}; }
      .ob-card { background: ${C.card}; border: 1px solid ${C.rule}; border-radius: ${R.card}px; padding: clamp(14px, 3vw, 20px); }
      .ob-link { background: ${C.card}; border: 1px solid ${C.ruleDark}; border-radius: ${R.ctrl}px; padding: 14px 16px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 14px; color: ${C.ink}; overflow-wrap: anywhere; margin-bottom: 12px; user-select: all; }
      .ob-quiet { display: inline-block; margin-top: 16px; font-size: 14px; color: ${C.inkSoft}; font-weight: 600; text-decoration: underline; min-height: 32px; }
      .ob-foot { margin-top: 36px; padding-top: 20px; border-top: 1px solid ${C.rule}; display: grid; gap: 6px; justify-items: start; }
      @media (prefers-reduced-motion: no-preference) { .ob-primary, .ob-skip, .ob-choice { transition: background 140ms ease, border-color 140ms ease; } }
    `}</style>
  );
}
