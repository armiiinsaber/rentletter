// components/tenant/ProfilePersonal.js
// On the tenant's profile page (pages/my-application.js), under their own session and one route,
// /api/tenant/personal (lib/profilePersonal.js, db/022-full-tenant-profile.sql):
//   · Profile strength: a percent and a checklist of next steps, each with what it adds in one
//     line. Only the tenant ever sees it; no realtor, landlord or score reads it;
//   · About you: one photo (optional, replaceable, removable), a few words in the tenant's own
//     voice (up to 600 characters, with "Help me write this", which only suggests wording from
//     what they typed and changes nothing until they accept it), an offer to prepay rent (their
//     own offer, never a deposit, never a requirement), and whether a realtor may put the words
//     and the offer on a landlord report;
//   · Download my profile: a PDF of the profile (pages/api/tenant/export.js).
// Every piece is the tenant's choice and none is required anywhere. On the realtor tokens
// (components/tenant/ProfileFacts.js ProfileStyles); the few rules of its own are at the foot.
// Before db/022 has run the route answers not available and the page says so in one line.
import { useCallback, useEffect, useRef, useState } from 'react';
import { noWidow, dateLong } from '../../lib/typeset';
import { C } from '../theme';
import { StatusPills } from '../ui';
import { Pending } from '../brand/Loader';
import { ABOUT_MAX, PREPAY_MIN, PREPAY_MAX, PHOTO_NOTE, ABOUT_PROMPTS, ABOUT_NOTE, PREPAY_FIELD, PREPAY_NOTE, LANDLORD_SWITCH, PHOTO_MAX_BYTES, aboutLength } from '../../lib/profilePersonal';

const MONTHS = Array.from({ length: PREPAY_MAX - PREPAY_MIN + 1 }, (_, i) => PREPAY_MIN + i);
// The photo made small in the browser before it is sent: the longer side 640px, JPEG.
async function smallPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => { const i = new window.Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('That photo could not be opened.')); i.src = url; });
    const k = Math.min(1, 640 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(img.naturalWidth * k)); canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const q of [0.85, 0.7, 0.55]) { const data = canvas.toDataURL('image/jpeg', q).split(',')[1] || ''; if (Math.floor((data.length * 3) / 4) <= PHOTO_MAX_BYTES) return data; }
    throw new Error('This photo is too large. Try a smaller one.');
  } finally { URL.revokeObjectURL(url); }
}

const Switch = ({ on, onChange, label, busy, ...rest }) => (
  <button type="button" role="switch" aria-checked={on} disabled={busy} onClick={() => onChange(!on)} className="pp-switch" {...rest}>
    <span className="pp-switch-label">{label}</span>
    <span className="pp-track" data-on={on ? '1' : '0'} aria-hidden="true"><span className="pp-knob" /></span>
  </button>
);

export default function ProfilePersonal({ profile }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState(null); // { where, tone, text }
  const [text, setText] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [asking, setAsking] = useState(false); // remove the photo?
  const file = useRef(null);

  const load = useCallback(async () => {
    try { const r = await fetch('/api/tenant/personal'); if (!r.ok) { setData({ failed: true }); return; } const j = await r.json(); setData(j); setText((t) => t || j.about || ''); } catch (e) { setData({ failed: true }); }
  }, []);
  useEffect(() => { load(); }, [load, profile && profile.factsUpdatedAt]);

  const post = async (body) => {
    const r = await fetch('/api/tenant/personal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.error) throw new Error(j?.error || 'Something went wrong. Please try again.');
    return j;
  };
  const act = async (key, where, body, done) => {
    if (busy) return null;
    setBusy(key); setNote(null);
    try { const j = await post(body); await load(); if (done) setNote({ where, tone: 'ok', text: done }); setBusy(''); return j; }
    catch (e) { setNote({ where, tone: 'warn', text: e.message }); setBusy(''); return null; }
  };
  const pickPhoto = async (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = '';
    if (!f || busy) return;
    setBusy('photo'); setNote(null);
    try { const small = await smallPhoto(f); await post({ action: 'photo', type: 'image/jpeg', data: small }); await load(); setNote({ where: 'photo', tone: 'ok', text: 'Photo saved.' }); }
    catch (err) { setNote({ where: 'photo', tone: 'warn', text: err.message }); }
    setBusy('');
  };
  const suggest = async () => {
    if (busy) return;
    setBusy('suggest'); setNote(null); setSuggestion('');
    try { const j = await post({ action: 'suggest', text }); setSuggestion(j.suggestion || ''); }
    catch (e) { setNote({ where: 'about', tone: 'warn', text: e.message }); }
    setBusy('');
  };

  if (!data || data.failed) return null;
  const s = data.strength; const available = !!data.available;
  const said = (where) => (note && note.where === where ? <p role="status" className={note.tone === 'ok' ? 'mp-note' : 'mp-alert'} style={{ marginTop: 'var(--gap-line)' }}>{noWidow(note.text)}</p> : null);
  const count = aboutLength(text);
  const changed = text.trim() !== String(data.about || '').trim();

  return (
    <div className="mp-stack" data-personal="" data-personal-available={available ? 'yes' : 'no'}>
      {/* Profile strength: the tenant's own, never shown to a realtor or a landlord. */}
      {s && (
        <section className="rl-card mp-card" data-strength="" aria-labelledby="pp-strength-h">
          <h2 id="pp-strength-h" className="mp-h2">Profile strength</h2>
          <div className="pp-percent" data-strength-percent="">{s.percent}%</div>
          <div className="pp-bar" aria-hidden="true"><span style={{ width: `${s.percent}%` }} /></div>
          <p className="mp-p" style={{ marginTop: 'var(--gap-line)' }}>{noWidow('Only you see this. It is never shown to a realtor or a landlord, and never used to score you.')}</p>
          <ul className="pp-steps" data-strength-steps="">
            {s.steps.map((step) => (
              <li key={step.key} data-strength-step={step.key} data-done={step.done ? 'yes' : 'no'} className="pp-step">
                <span className="pp-mark" data-done={step.done ? 'yes' : 'no'} aria-hidden="true" />
                <div style={{ minWidth: 0 }}>
                  <div className="pp-step-title">{noWidow(step.done ? `${step.title}: done` : step.title)}{step.optional && !step.done ? <span className="pp-optional"> (optional)</span> : null}</div>
                  <div className="mp-source">{noWidow(step.adds)}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rl-card mp-card" data-personal-card="" aria-labelledby="pp-about-h">
        <h2 id="pp-about-h" className="mp-h2">About you</h2>
        {!available ? <p role="status" data-personal-absent="" className="mp-note" style={{ marginTop: 'var(--gap-line)' }}>{noWidow('A photo, a few words about you and an offer to prepay rent are not available yet.')}</p> : (
          <>
            <p className="mp-p" style={{ marginTop: 'var(--gap-line)' }}>{noWidow('All of this is optional and yours to change. A realtor sees it only when you share your profile with them.')}</p>

            {/* The photo. */}
            <div className="pp-part" data-photo={data.photo ? 'yes' : 'no'}>
              <div className="mp-label">Photo</div>
              <div className="pp-photo-row">
                {data.photo ? <img className="pp-photo" data-photo-preview="" src={data.photo} alt="Your photo" width={84} height={84} /> : <span className="pp-photo pp-photo-none" aria-hidden="true" />}
                <p className="mp-p pp-photo-note" data-photo-note="">{noWidow(PHOTO_NOTE)}</p>
              </div>
              <input ref={file} type="file" accept="image/jpeg,image/png" onChange={pickPhoto} style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} />
              {asking ? (
                <div className="mp-actions" data-photo-confirm="">
                  <p className="mp-p" style={{ flex: '1 1 100%' }}>{noWidow('Remove your photo? The file is deleted now.')}</p>
                  <button type="button" data-destructive="" className="mp-btn" disabled={!!busy} onClick={async () => { const j = await act('photo-delete', 'photo', { action: 'photo-delete' }, 'Photo removed. The file is gone.'); if (j) setAsking(false); }}><Pending busy={busy === 'photo-delete'} label="Removing">Remove photo</Pending></button>
                  <button type="button" className="mp-link" disabled={!!busy} onClick={() => setAsking(false)}>Keep it</button>
                </div>
              ) : (
                <div className="mp-actions">
                  {!data.photosPaused && <button type="button" data-photo-add="" className="mp-btn" disabled={!!busy} onClick={() => file.current && file.current.click()}><Pending busy={busy === 'photo'} label="Saving your photo">{data.photo ? 'Replace photo' : 'Add a photo'}</Pending></button>}
                  {data.photo && <button type="button" data-destructive="" className="mp-link" disabled={!!busy} onClick={() => setAsking(true)}>Remove photo</button>}
                </div>
              )}
              {said('photo')}
              {/* The tenant's own photo lines from their log: added, removed. */}
              {Array.isArray(data.photoLog) && data.photoLog.length > 0 && (
                <ul className="pp-photo-log" data-photo-log="">
                  {data.photoLog.map((l, i) => <li key={`${l.at}-${i}`} className="mp-source" data-photo-line={l.action}>{noWidow(`${l.action === 'photo_added' ? 'Photo added' : 'Photo removed'}${dateLong(l.at) ? ` on ${dateLong(l.at)}` : ''}${l.action === 'photo_removed' && l.by === 'system' ? ', after 12 months away' : ''}`)}</li>)}
                </ul>
              )}
            </div>

            {/* About me. */}
            <div className="pp-part" data-about="">
              <label htmlFor="pp-about" className="mp-label" style={{ display: 'block' }}>About me</label>
              <p className="mp-p" style={{ marginTop: 'var(--gap-line)' }}>{noWidow('A few lines in your own words. You could say:')}</p>
              <StatusPills label="You could say" items={[...ABOUT_PROMPTS]} style={{ marginTop: 'var(--s-2)' }} />
              <textarea id="pp-about" className="mp-input pp-area" data-about-text="" rows={6} value={text} onChange={(e) => { setText(e.target.value); setNote(null); }} style={{ fontSize: 'var(--t-body)' }} />
              <div className="mp-source" data-about-count="" style={{ marginTop: 'var(--s-1)', color: count > ABOUT_MAX ? C.danger : undefined }}>{`${count} of ${ABOUT_MAX}`}</div>
              <p className="mp-p" data-about-note="" style={{ marginTop: 'var(--gap-line)' }}>{noWidow(ABOUT_NOTE)}</p>
              <div className="mp-actions">
                <button type="button" data-about-save="" className="mp-btn" disabled={!!busy || !changed || count > ABOUT_MAX} onClick={() => act('about', 'about', { action: 'about', text }, text.trim() ? 'Saved.' : 'Removed.')}><Pending busy={busy === 'about'} label="Saving">Save</Pending></button>
                <button type="button" data-about-help="" className="mp-link" disabled={!!busy || count < 20 || count > ABOUT_MAX} onClick={suggest}><Pending busy={busy === 'suggest'} label="Writing a suggestion">Help me write this</Pending></button>
              </div>
              {suggestion ? (
                <div className="pp-suggestion" data-about-suggestion="">
                  <div className="mp-label">A suggestion, from what you wrote</div>
                  <p className="mp-p" style={{ marginTop: 'var(--gap-line)', whiteSpace: 'pre-line', textWrap: 'wrap' }}>{suggestion}</p>
                  <div className="mp-actions">
                    <button type="button" data-about-accept="" className="mp-btn" onClick={() => { setText(suggestion); setSuggestion(''); setNote({ where: 'about', tone: 'ok', text: 'In the box. Save it when it reads right.' }); }}>Use this</button>
                    <button type="button" className="mp-link" onClick={() => setSuggestion('')}>Keep mine</button>
                  </div>
                </div>
              ) : null}
              {said('about')}
            </div>

            {/* The tenant's own offer to prepay rent. */}
            <div className="pp-part" data-prepay={data.prepayMonths != null ? 'on' : 'off'}>
              <Switch on={data.prepayMonths != null} busy={busy === 'prepay'} label={PREPAY_FIELD} data-prepay-switch="" onChange={(on) => act('prepay', 'prepay', { action: 'prepay', months: on ? 2 : null })} />
              {data.prepayMonths != null && (
                <div style={{ marginTop: 'var(--gap-line)' }}>
                  <label htmlFor="pp-months" className="mp-label" style={{ display: 'block' }}>How many months</label>
                  <select id="pp-months" className="mp-input" data-prepay-months="" value={data.prepayMonths} disabled={!!busy} onChange={(e) => act('prepay', 'prepay', { action: 'prepay', months: Number(e.target.value) })} style={{ fontSize: 'var(--t-body)', marginTop: 'var(--gap-line)' }}>
                    {MONTHS.map((m) => <option key={m} value={m}>{m === 1 ? '1 month' : `${m} months`}</option>)}
                  </select>
                </div>
              )}
              <p className="mp-p" data-prepay-note="" style={{ marginTop: 'var(--gap-line)' }}>{noWidow(PREPAY_NOTE)}</p>
              {said('prepay')}
            </div>

            {/* Whether the words and the offer may go on a report to a landlord. */}
            <div className="pp-part" data-landlord={data.landlordReportOk ? 'on' : 'off'}>
              <Switch on={!!data.landlordReportOk} busy={busy === 'landlord'} label={LANDLORD_SWITCH} data-landlord-switch="" onChange={(ok) => act('landlord', 'landlord', { action: 'landlord', ok })} />
              <p className="mp-p" style={{ marginTop: 'var(--gap-line)' }}>{noWidow('Your own words and your offer only, and only from a realtor you share with. Your photo is never on a report.')}</p>
              {said('landlord')}
            </div>
          </>
        )}

        {/* Download. */}
        <div className="pp-part" data-export="">
          <div className="mp-label">Your copy</div>
          <p className="mp-p" style={{ marginTop: 'var(--gap-line)' }}>{noWidow('A PDF of your details, your words, your photo and the list of your documents with their dates.')}</p>
          <div className="mp-actions"><a className="mp-btn" data-export-link="" href="/api/tenant/export" download="my-rentletter-profile.pdf" style={{ textDecoration: 'none' }}>Download my profile</a></div>
        </div>
      </section>

      <style jsx global>{`
        .pp-percent { font-family: var(--f-display); font-size: var(--t-d1); font-weight: 600; line-height: var(--lh-display); color: ${C.ink}; font-variant-numeric: tabular-nums; margin-top: var(--gap-line); }
        .pp-bar { height: 4px; background: var(--rule); border-radius: 2px; margin-top: var(--gap-line); overflow: hidden; }
        .pp-bar span { display: block; height: 100%; background: ${C.ink}; border-radius: 2px; }
        .pp-steps { list-style: none; margin: var(--gap-card) 0 0; padding: 0; display: grid; gap: var(--gap-card); text-align: left; }
        .pp-step { display: flex; align-items: flex-start; justify-content: flex-start; gap: var(--s-3); min-width: 0; text-align: left; }
        .pp-step > div { flex: 1 1 auto; text-align: left; }
        .pp-mark { width: 18px; height: 18px; border-radius: 50%; border: 1.5px solid ${C.ruleDark}; flex-shrink: 0; margin-top: 1px; }
        .pp-mark[data-done='yes'] { background: ${C.ink}; border-color: ${C.ink}; }
        .pp-step-title { font-size: var(--t-body-2); font-weight: 700; color: ${C.ink}; line-height: var(--lh-body); text-wrap: balance; }
        .pp-step[data-done='yes'] .pp-step-title { color: ${C.inkMute}; }
        .pp-optional { font-weight: 500; color: ${C.inkMute}; }
        .pp-part { margin-top: var(--gap-card); padding-top: var(--gap-card); border-top: 1px solid var(--rule); min-width: 0; }
        .pp-photo-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-3); margin-top: var(--gap-line); min-width: 0; }
        .pp-photo { width: 84px; height: 84px; border-radius: 12px; object-fit: cover; flex-shrink: 0; border: 1px solid var(--rule); background: ${C.paperDeep}; display: block; }
        .pp-photo-note { flex: 1 1 200px; min-width: 0; }
        .pp-photo-log { list-style: none; margin: var(--gap-line) 0 0; padding: 0; display: grid; gap: 2px; }
        .pp-area { height: auto; min-height: 132px; padding: var(--s-3); line-height: var(--lh-body); resize: vertical; margin-top: var(--gap-line); font-family: inherit; }
        .pp-suggestion { margin-top: var(--gap-card); padding: var(--s-3); background: ${C.paperDeep}; border-radius: var(--card-radius); }
        .pp-switch { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); width: 100%; min-height: 44px; padding: 0; background: transparent; border: none; border-radius: 12px; color: ${C.ink}; font-family: inherit; font-size: var(--t-body-2); font-weight: 700; line-height: var(--lh-body); text-align: left; cursor: pointer; }
        .pp-switch-label { min-width: 0; text-wrap: balance; }
        .pp-switch:focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.paper}, 0 0 0 4px ${C.red}; }
        .pp-track { position: relative; width: 48px; height: 28px; border-radius: 999px; background: ${C.ruleDark}; flex-shrink: 0; }
        .pp-track[data-on='1'] { background: ${C.ink}; }
        .pp-knob { position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%; background: ${C.paper}; }
        .pp-track[data-on='1'] .pp-knob { transform: translateX(20px); }
        @media (prefers-reduced-motion: no-preference) { .pp-knob { transition: transform 160ms ease; } }
      `}</style>
    </div>
  );
}
