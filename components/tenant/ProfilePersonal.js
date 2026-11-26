// components/tenant/ProfilePersonal.js
// On the tenant's profile page (pages/my-application.js), under their own session and one route,
// /api/tenant/personal (lib/profilePersonal.js, db/022-full-tenant-profile.sql):
//   · Profile strength is read here (usePersonal) and shown by components/tenant/ProfileStrength.js:
//     a percent and a checklist of next steps. Only the tenant ever sees it; no realtor, landlord
//     or score reads it;
//   · About you: one photo (optional, replaceable, removable), a few words in the tenant's own
//     voice (up to 600 characters, with "Help me write this", which only suggests wording from
//     what they wrote and changes nothing until they accept it), an offer to prepay rent (their
//     own offer, never a deposit, never a requirement), and whether a realtor may put the words
//     and the offer on a landlord report. The words may be in any language: the box, the
//     suggestion and the English version each read in the direction of their own text, and
//     spelling is checked only for Latin letters. Words that are not English get an English
//     version under the box, "How realtors will read it" (lib/aboutTranslation.js, db/026): the
//     tenant approves it (Looks right), changes it or removes it, and until they approve it no
//     realtor sees it;
//   · Download my profile: a PDF of the profile (pages/api/tenant/export.js).
// Every piece is the tenant's choice and none is required anywhere. On the realtor tokens
// (components/tenant/ProfileFacts.js ProfileStyles); the few rules of its own are at the foot.
// Before db/022 has run the route answers not available and the page says so in one line.
// The writing helper has its own card at the top of About me, above the box. With nothing written
// yet it asks the three questions the chips name, one at a time, a few words each in any
// language, and asks the one suggest action for a paragraph made from those answers alone
// (components/tenant/profileSteps.js composeAnswers); a suggestion that holds a number or a name
// the answers do not is not shown (addsNothing). With words in the box it offers to improve them.
// openHelper: a number the page raises to open the helper from the progress panel or the card.
import { useCallback, useEffect, useRef, useState } from 'react';
import { noWidow, dateLong } from '../../lib/typeset';
import { MOTION_QUERY, DURATION, CURVE } from '../../lib/motion';
import { C, LIGHT } from '../theme';
import { StatusPills } from '../ui';
import { Pending } from '../brand/Loader';
import { ENGLISH_MAX, ENGLISH_HEAD, ENGLISH_NOTE, ENGLISH_UNSEEN, ENGLISH_NOT_READY, ENGLISH_NONE, textDirection, spellChecked, englishLength } from '../../lib/aboutTranslation';
import { IDLE_MONTHS } from '../../lib/tenantVaultRules';
import { GUIDE_QUESTIONS, ANSWER_MAX, composeAnswers, addsNothing } from './profileSteps';
import { Chevron } from './ProfileFacts';
import AboutText from '../AboutText';
import { ABOUT_MAX, PREPAY_MIN, PREPAY_MAX, PHOTO_NOTE, ABOUT_PROMPTS, ABOUT_NOTE, PREPAY_FIELD, PREPAY_NOTE, LANDLORD_SWITCH, PHOTO_MAX_BYTES, aboutLength } from '../../lib/profilePersonal';

const MONTHS = Array.from({ length: PREPAY_MAX - PREPAY_MIN + 1 }, (_, i) => PREPAY_MIN + i);
// Who can open the photo and when it is deleted, beside the button that adds it. The period is
// lib/tenantVaultRules.js IDLE_MONTHS, the rule lib/tenantVault.js expireIdleVaults keeps.
export const PHOTO_KEPT = `Realtors you share your profile with can see it. It is deleted when you remove it, or once your profile has been unused for ${IDLE_MONTHS} months.`;
// The helper's own words: what it does, and that any language works.
export const HELPER_LINE = 'Answer three short questions and it drafts a few lines from your answers, adding nothing you did not say.';
export const HELPER_EDIT_LINE = 'It suggests clearer wording for what you wrote, adding nothing you did not say.';
export const HELPER_LANGUAGE = 'Write in any language you like.';
// The suggest route's own words when the helper had nothing to offer (pages/api/tenant/personal.js),
// said too when a suggestion added a detail the answers did not hold.
const NO_SUGGESTION = 'No suggestion this time. Your own words are unchanged.';
// The photo made small in the browser before it is sent: the longer side 640px, JPEG.
async function smallPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => { const i = new window.Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('That photo could not be opened.')); i.src = url; });
    const k = Math.min(1, 640 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(img.naturalWidth * k)); canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
    const ctx = canvas.getContext('2d'); ctx.fillStyle = LIGHT.card; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
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

// The one read of /api/tenant/personal for the page: the strength (components/tenant/
// ProfileStrength.js), the section states and this card all show the same answer. It is read again
// whenever the facts change (a save) or the page says so (again: a document added or deleted), so
// the strength is current without a reload.
export function usePersonal(profile, again = 0) {
  const [data, setData] = useState(null);
  const load = useCallback(async () => {
    try { const r = await fetch('/api/tenant/personal'); if (!r.ok) { setData({ failed: true }); return; } const j = await r.json(); setData(j); } catch (e) { setData({ failed: true }); }
  }, []);
  useEffect(() => { load(); }, [load, profile && profile.factsUpdatedAt, again]);
  return { data, load };
}

export default function ProfilePersonal({ data, load, openHelper = 0 }) {
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState(null); // { where, tone, text }
  const [text, setText] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [asking, setAsking] = useState(false); // remove the photo?
  const [englishFailed, setEnglishFailed] = useState(false); // the English version could not be prepared just now
  const [englishDraft, setEnglishDraft] = useState(null); // the tenant's own change to the English version, while they type it
  const [guide, setGuide] = useState(-1); // the guided start: the question on screen, or -1
  const [answers, setAnswers] = useState(['', '', '']);
  const [guided, setGuided] = useState(null); // the answers a suggestion was made from
  const [details, setDetails] = useState(false);
  const file = useRef(null);
  const answerBox = useRef(null);
  const helperBtn = useRef(null);
  const focusGuide = useRef(false);
  useEffect(() => { if (data && !data.failed) setText((t) => t || data.about || ''); }, [data]);

  const post = async (body) => {
    const r = await fetch('/api/tenant/personal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.error) { const err = new Error(j?.error || 'Something went wrong. Please try again.'); err.code = j?.code || null; throw err; }
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
  // The one ask for a suggestion: from the words in the box, or from the answers to the guided
  // start (from: the note composed from them). A suggestion made from answers that holds a number
  // or a name they do not is not shown.
  const ask = async (from, made = null) => {
    if (busy) return;
    setBusy('suggest'); setNote(null); setSuggestion(''); setGuided(made);
    try {
      const j = await post({ action: 'suggest', text: from });
      if (made && !addsNothing(j.suggestion || '', made)) { const held = new Error(NO_SUGGESTION); held.code = 'no_suggestion'; throw held; }
      setSuggestion(j.suggestion || ''); setGuide(-1);
    }
    // The helper could not be reached: said calmly, as something to try again. It answered and
    // had nothing to offer: said as before.
    catch (e) { setNote({ where: 'about', tone: e.code === 'helper_unreachable' ? 'calm' : 'warn', text: e.message }); }
    setBusy('');
  };
  const suggest = () => ask(text);
  // The guided start: one question a screen; Write it asks once the last is answered or skipped.
  const startGuide = () => { setNote(null); setSuggestion(''); focusGuide.current = true; setGuide(0); };
  const toQuestion = (n) => { setNote(null); focusGuide.current = true; setGuide(n); };
  const writeIt = () => {
    const composed = composeAnswers(answers);
    if (!composed) { setNote({ where: 'about', tone: 'warn', text: 'Answer at least one question first.' }); return; }
    if (aboutLength(composed) < 20) { setNote({ where: 'about', tone: 'warn', text: 'Add a few more words to your answers first.' }); return; }
    ask(composed, answers);
  };
  useEffect(() => { if (guide >= 0 && focusGuide.current && answerBox.current) { focusGuide.current = false; answerBox.current.focus({ preventScroll: true }); } }, [guide]);
  // Opened from the progress panel or the card: the questions with nothing written yet, the
  // button that improves the words otherwise. In the same turn as the tap, so a phone raises its keyboard.
  const opened = useRef(openHelper);
  useEffect(() => {
    if (openHelper === opened.current) return;
    opened.current = openHelper;
    if (!data || data.failed || !data.available) return;
    if (!text.trim() && !suggestion) startGuide(); else if (helperBtn.current) helperBtn.current.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openHelper]);

  if (!data || data.failed) return null;
  const available = !!data.available;
  const said = (where) => (note && note.where === where ? <p role="status" data-note-tone={note.tone} className={note.tone === 'warn' ? 'mp-alert' : 'mp-note'} style={{ marginTop: 'var(--gap-line)' }}>{noWidow(note.text)}</p> : null);
  const english = available ? data.english || null : null; // null: no English version is offered (before db/026)
  const draftCount = englishLength(englishDraft || '');
  const count = aboutLength(text);
  const changed = text.trim() !== String(data.about || '').trim();
  const blank = !text.trim();
  const log = Array.isArray(data.photoLog) ? data.photoLog : [];

  return (
    <div className="mp-stack" data-personal="" data-personal-available={available ? 'yes' : 'no'}>
      <section className="rl-card mp-card" data-personal-card="" aria-labelledby="pp-about-h">
        <div className="mp-head tp-head">
          <h2 id="pp-about-h" className="mp-h2">About you</h2>
        </div>
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
                  {!data.photosPaused && <button type="button" data-photo-add="" data-focus="photo" className="mp-btn" disabled={!!busy} onClick={() => file.current && file.current.click()}><Pending busy={busy === 'photo'} label="Saving your photo">{data.photo ? 'Replace photo' : 'Add a photo'}</Pending></button>}
                  {data.photo && <button type="button" data-destructive="" className="mp-link" disabled={!!busy} onClick={() => setAsking(true)}>Remove photo</button>}
                </div>
              )}
              {!data.photosPaused && <p className="pp-kept" data-kept="photo">{noWidow(PHOTO_KEPT)}</p>}
              {said('photo')}
            </div>

            {/* About me: the helper's card first, then the box, then the English version right under it. */}
            <div className="pp-part" data-about="">
              <label htmlFor="pp-about" className="mp-label" style={{ display: 'block' }}>About me</label>
              <p className="mp-p" data-about-note="" style={{ marginTop: 'var(--gap-line)' }}>{noWidow(ABOUT_NOTE)}</p>
              <div className="pp-helper" data-about-helper={suggestion ? 'suggestion' : guide >= 0 ? 'questions' : blank ? 'start' : 'improve'}>
                {suggestion ? (
                  <div data-about-suggestion="">
                    <div className="mp-label">{guided ? 'A suggestion, from your answers' : 'A suggestion, from what you wrote'}</div>
                    <div style={{ marginTop: 'var(--gap-line)' }}><AboutText data-about-suggested="" text={suggestion} className="mp-p" /></div>
                    <div className="mp-actions">
                      <button type="button" data-about-accept="" className="mp-btn" onClick={() => { setText(suggestion); setSuggestion(''); setGuided(null); setNote({ where: 'about', tone: 'ok', text: 'In the box. Save it when it reads right.' }); }}>Use this</button>
                      <button type="button" className="mp-link" data-about-keep="" onClick={() => { if (guided) setText(guided.map((x) => String(x || '').trim()).filter(Boolean).join('\n')); setSuggestion(''); setGuided(null); }}>Keep mine</button>
                    </div>
                  </div>
                ) : guide >= 0 ? (
                  <div className="pp-guide" data-about-guide={guide}>
                    <div className="pp-guide-top">
                      <span className="mp-label">{`Question ${guide + 1} of ${GUIDE_QUESTIONS.length}`}</span>
                      <span className="pp-guide-line" aria-hidden="true"><span style={{ transform: `scaleX(${(guide + 1) / GUIDE_QUESTIONS.length})` }} /></span>
                    </div>
                    <label htmlFor="pp-guide-a" className="pp-guide-q">{GUIDE_QUESTIONS[guide]}</label>
                    <input id="pp-guide-a" ref={answerBox} className="mp-input" data-guide-answer={guide} maxLength={ANSWER_MAX} value={answers[guide]} dir={textDirection(answers[guide])} spellCheck={spellChecked(answers[guide])} placeholder="A few words, in any language" autoComplete="off" enterKeyHint={guide < GUIDE_QUESTIONS.length - 1 ? 'next' : 'done'}
                      onChange={(e) => { const v = e.target.value; setAnswers((a) => a.map((x, i) => (i === guide ? v : x))); setNote(null); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (guide < GUIDE_QUESTIONS.length - 1) toQuestion(guide + 1); else writeIt(); } }} />
                    <div className="mp-actions pp-guide-actions">
                      {guide < GUIDE_QUESTIONS.length - 1
                        ? <button type="button" className="mp-btn" data-guide-next="" onClick={() => toQuestion(guide + 1)}>Continue</button>
                        : <button type="button" className="mp-btn" data-guide-write="" disabled={!!busy} onClick={writeIt}><Pending busy={busy === 'suggest'} label="Writing a suggestion">Write it</Pending></button>}
                      <button type="button" className="mp-link" data-guide-back="" disabled={!!busy} onClick={() => (guide === 0 ? setGuide(-1) : toQuestion(guide - 1))}>{guide === 0 ? 'Not now' : 'Back'}</button>
                      {guide < GUIDE_QUESTIONS.length - 1 && <button type="button" className="mp-link" data-guide-skip="" onClick={() => { setAnswers((a) => a.map((x, i) => (i === guide ? '' : x))); toQuestion(guide + 1); }}>Skip</button>}
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="pp-helper-line">{noWidow(blank ? HELPER_LINE : HELPER_EDIT_LINE)}</p>
                    <p className="pp-helper-lang">{noWidow(HELPER_LANGUAGE)}</p>
                    {blank
                      ? <button type="button" ref={helperBtn} data-about-help-start="" data-focus="about" className="mp-btn" disabled={!!busy} onClick={startGuide}>Help me write this</button>
                      : <button type="button" ref={helperBtn} data-about-help="" data-focus="about" className="mp-btn" disabled={!!busy || count < 20 || count > ABOUT_MAX} onClick={suggest}><Pending busy={busy === 'suggest'} label="Writing a suggestion">Help me write this</Pending></button>}
                  </>
                )}
                {said('about')}
              </div>
              <p className="mp-p" style={{ marginTop: 'var(--gap-card)' }}>{noWidow('A few lines in your own words. You could say:')}</p>
              <StatusPills label="You could say" items={[...ABOUT_PROMPTS]} style={{ marginTop: 'var(--s-2)' }} />
              <textarea id="pp-about" className="mp-input pp-area" data-about-text="" rows={6} dir={textDirection(text)} spellCheck={spellChecked(text)} value={text} onChange={(e) => { setText(e.target.value); setNote(null); }} style={{ fontSize: 'var(--t-body)' }} />
              <div className="mp-source" data-about-count="" style={{ marginTop: 'var(--s-1)', color: count > ABOUT_MAX ? C.danger : undefined }}>{`${count} of ${ABOUT_MAX}`}</div>
              <div className="mp-actions">
                <button type="button" data-about-save="" className="mp-btn" disabled={!!busy || !changed || count > ABOUT_MAX} onClick={async () => { const j = await act('about', 'saved', { action: 'about', text }, text.trim() ? 'Saved.' : 'Removed.'); if (j) { setEnglishFailed(!!j.englishFailed); setEnglishDraft(null); } }}><Pending busy={busy === 'about'} label="Saving">Save</Pending></button>
                {note && note.where === 'saved' && <span role="status" data-note-tone={note.tone} className={note.tone === 'warn' ? 'mp-alert' : 'mp-note'}>{noWidow(note.text)}</span>}
              </div>
              {/* The English version of words that are not English: read, approved, changed or removed by the tenant. */}
              {english && english.text ? (
                <div className="pp-suggestion" data-about-english={english.approvedAt ? 'approved' : 'review'}>
                  <div className="mp-label">{ENGLISH_HEAD}</div>
                  {englishDraft != null ? (
                    <>
                      <textarea id="pp-english" aria-label="The English version" className="mp-input pp-area" data-english-text="" rows={6} dir={textDirection(englishDraft)} spellCheck={spellChecked(englishDraft)} value={englishDraft} onChange={(e) => { setEnglishDraft(e.target.value); setNote(null); }} style={{ fontSize: 'var(--t-body)' }} />
                      <div className="mp-source" data-english-count="" style={{ marginTop: 'var(--s-1)', color: draftCount > ENGLISH_MAX ? C.danger : undefined }}>{`${draftCount} of ${ENGLISH_MAX}`}</div>
                      <div className="mp-actions">
                        <button type="button" data-english-save="" className="mp-btn" disabled={!!busy || !englishDraft.trim() || draftCount > ENGLISH_MAX} onClick={async () => { const j = await act('english-edit', 'english', { action: 'english-edit', text: englishDraft }); if (j) setEnglishDraft(null); }}><Pending busy={busy === 'english-edit'} label="Saving">Save the English</Pending></button>
                        <button type="button" className="mp-link" disabled={!!busy} onClick={() => { setEnglishDraft(null); setNote(null); }}>Cancel</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ marginTop: 'var(--gap-line)' }}><AboutText data-english-shown="" text={english.text} className="mp-p" /></div>
                      <p className="mp-p" data-english-note="" style={{ marginTop: 'var(--gap-line)' }}>{noWidow(ENGLISH_NOTE)}</p>
                      <p className="mp-p" data-english-state="" style={{ marginTop: 'var(--gap-line)' }}>{noWidow(english.approvedAt ? `You approved it${dateLong(english.approvedAt) ? ` on ${dateLong(english.approvedAt)}` : ''}. Realtors you share with read it first, then your original.` : ENGLISH_UNSEEN)}</p>
                      <div className="mp-actions">
                        {!english.approvedAt && <button type="button" data-english-approve="" className="mp-btn" disabled={!!busy} onClick={() => act('english-approve', 'english', { action: 'english-approve', text: english.text })}><Pending busy={busy === 'english-approve'} label="Saving">Looks right</Pending></button>}
                        <button type="button" data-english-edit="" className="mp-link" disabled={!!busy} onClick={() => { setEnglishDraft(english.text); setNote(null); }}>Edit the English</button>
                        <button type="button" data-english-remove="" data-destructive="" className="mp-link" disabled={!!busy} onClick={async () => { const j = await act('english-remove', 'english', { action: 'english-remove' }); if (j) setEnglishFailed(false); }}>Remove the English</button>
                      </div>
                    </>
                  )}
                  {said('english')}
                </div>
              ) : english && (englishFailed || english.wanted) ? (
                <div className="pp-suggestion" data-about-english="missing">
                  <p role="status" className="mp-note" data-english-missing="">{noWidow(englishFailed ? ENGLISH_NOT_READY : ENGLISH_NONE)}</p>
                  <div className="mp-actions">
                    <button type="button" data-english-prepare="" className="mp-link" disabled={!!busy} onClick={async () => { const j = await act('english-prepare', 'english', { action: 'english-prepare' }); if (j) setEnglishFailed(!!j.englishFailed); }}><Pending busy={busy === 'english-prepare'} label="Preparing the English version">{englishFailed ? 'Try again' : 'Prepare the English version'}</Pending></button>
                  </div>
                  {said('english')}
                </div>
              ) : null}
            </div>

            {/* The tenant's own offer to prepay rent. */}
            <div className="pp-part" data-prepay={data.prepayMonths != null ? 'on' : 'off'}>
              <Switch on={data.prepayMonths != null} busy={busy === 'prepay'} label={PREPAY_FIELD} data-prepay-switch="" data-focus="prepay" onChange={(on) => act('prepay', 'prepay', { action: 'prepay', months: on ? 2 : null })} />
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
        {/* The tenant's own photo lines from their log (added, removed), behind Details. */}
        {log.length > 0 && (
          <div className="tp-details">
            <button type="button" className="tp-details-btn" aria-expanded={details} onClick={() => setDetails((v) => !v)} data-personal-details="">Details<Chevron open={details} /></button>
            <ul className="pp-photo-log" data-photo-log="" hidden={!details}>
              {log.map((l, i) => <li key={`${l.at}-${i}`} className="mp-source" data-photo-line={l.action}>{noWidow(`${l.action === 'photo_added' ? 'Photo added' : 'Photo removed'}${dateLong(l.at) ? ` on ${dateLong(l.at)}` : ''}${l.action === 'photo_removed' && l.by === 'system' ? `, after ${IDLE_MONTHS} months away` : ''}`)}</li>)}
            </ul>
          </div>
        )}
      </section>

      <style jsx global>{`
        .pp-part { margin-top: var(--gap-card); padding-top: var(--gap-card); border-top: 1px solid var(--rule); min-width: 0; }
        .pp-photo-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-3); margin-top: var(--gap-line); min-width: 0; }
        .pp-photo { width: 84px; height: 84px; border-radius: 12px; object-fit: cover; flex-shrink: 0; border: 1px solid var(--rule); background: ${C.paperDeep}; display: block; }
        .pp-photo-note { flex: 1 1 200px; min-width: 0; }
        .pp-photo-log { list-style: none; margin: var(--s-1) 0 0; padding: 0; display: grid; gap: 2px; }
        .pp-kept { margin: var(--gap-line) 0 0; font-size: 13px; line-height: 1.4; color: ${C.inkSoft}; text-wrap: balance; overflow-wrap: anywhere; max-width: 68ch; }
        .pp-area { height: auto; min-height: 132px; padding: var(--s-3); line-height: var(--lh-body); resize: vertical; margin-top: var(--gap-line); font-family: inherit; }
        .pp-suggestion { margin-top: var(--gap-card); padding: var(--s-3); background: ${C.paperDeep}; border-radius: var(--card-radius); }
        /* The helper's own card: a paper well at the top of About me, its button a real button. */
        .pp-helper { margin-top: var(--gap-card); padding: var(--s-4); border-radius: var(--card-radius); background: ${C.paperDeep}; display: grid; gap: var(--s-2); justify-items: start; min-width: 0; }
        .pp-helper > * { max-width: 100%; }
        .pp-helper .mp-btn { width: auto; background: ${C.card}; padding: 0 var(--s-5); }
        .pp-helper .mp-actions { margin-top: var(--s-3); }
        .pp-helper .mp-actions .mp-btn { flex: 0 0 auto; }
        .pp-helper-line { margin: 0; font-size: var(--t-body); line-height: 1.4; font-weight: 600; color: ${C.ink}; text-wrap: balance; max-width: 60ch; }
        .pp-helper-lang { margin: 0 0 var(--s-1); font-size: var(--t-body-2); line-height: var(--lh-body); color: ${C.inkSoft}; text-wrap: balance; }
        .pp-helper [data-about-suggestion] { width: 100%; }
        .pp-guide { display: grid; gap: var(--s-2); width: 100%; }
        .pp-guide-top { display: grid; gap: var(--s-2); }
        .pp-guide-line { display: block; height: 2px; border-radius: 1px; background: var(--rule); overflow: hidden; }
        .pp-guide-line > span { display: block; height: 100%; background: ${C.ink}; transform-origin: left center; }
        .pp-guide-q { margin-top: var(--s-1); font-family: var(--f-display); font-size: var(--t-d2); font-weight: 600; line-height: var(--lh-display); color: ${C.ink}; text-wrap: balance; }
        .pp-guide .mp-input { background: ${C.card}; max-width: 560px; }
        @media ${MOTION_QUERY} { .pp-guide-line > span { transition: transform ${DURATION.base}ms ${CURVE.settle}; } }
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
