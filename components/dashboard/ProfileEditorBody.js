// components/dashboard/ProfileEditorBody.js
// The realtor identity and branding editor, one code path for any host (the profile page, /profile,
// and a modal host), so the save, upload and logo logic is never duplicated. Updates the Supabase
// profiles row (RLS, own row) and the logos Storage bucket. Ordered most fundamental first, in
// three groups under short headings: You, Brokerage, then Brand (the logo, the colours, the fonts).
//
// SAVE MODEL (one rule, everywhere): everything on this screen autosaves. The page says so in one
// sentence under its title (components/dashboard/ProfileView.js SAVE_LINE), which is true because:
//   • Detail fields (name, brokerage, phone, license, province) save when you leave a field
//     (blur / province change), debounced, and are flushed before any AI generation.
//   • Brand colours + derived palette save 600ms after a change. Logo and font pairing save
//     the moment they're chosen.
// Each field says a muted Saved beside its label for two seconds after its write lands; there is
// no banner. The bottom Save button exists only for a modal host (onClose).
import { useState, useRef, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { C, R } from '../theme';
import { noWidow } from '../../lib/typeset';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import { useAdapter } from '../../lib/dashboardAdapter';
import { buildPalette, PALETTE_ORDER, readableText } from '../../lib/brandPalette';
import { FONT_PAIRINGS, GOOGLE_FONTS_HREF, suggestPairingId } from '../../lib/brandFonts';
import { PROVINCE_OPTIONS, normalizeProvince } from '../../lib/provinces';
import { BOARD_OPTIONS } from '../../lib/boardDetails';
import LogoStudio from './LogoStudio';
import { Crossfade, MotionStyles } from '../motion';
import Loader, { Pending } from '../brand/Loader';

const inputStyle = {
  width: '100%', padding: '12px 14px', fontSize: 'var(--t-body)', borderRadius: 'var(--card-radius)',
  border: `1px solid ${C.rule}`, background: C.paper, color: C.ink,
};

const ALLOWED = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg', 'image/webp': 'webp' };
const MAX_BYTES = 2 * 1024 * 1024; // 2MB

// The two brokerage names, each with what it is for: this one is the name on reports; the legal
// name in Circle (components/dashboard/CircleView.js LEGAL_NAME_LINE) is the one the broker of
// record confirms. They are stored apart (profiles.brokerage here, the brokerage record there).
export const BROKERAGE_NAME_LINE = 'The name on your reports.';

const sectionLabel = { display: 'block', fontSize: 11, color: C.inkSoft, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 };

// onClose: when provided (modal), Save closes it. When omitted (page), Save shows an
// inline "Saved" confirmation instead.
// logoOnly: render just the logo block (upload + AI studio). Used by first run onboarding, which
// collects the identity fields on its own screen; the editor's data flow is unchanged.
// onLive: called with what the realtor has typed and chosen so far ({ full_name, brokerage, phone,
// logoUrl }), before it is saved, for a preview beside the form (components/dashboard/ProfileView.js).
// previewBeside: the host shows that preview from 1024px, so the small brand card in the Brand
// group is the phone's alone.
// The page: three groups, each a card under a short heading. You (the name, the phone, the RECO
// number), Brokerage (its name, its address, the province and the board) and Brand (the logo, the
// palette and the fonts). Labels sit above their fields; from 1024px, where a group is wide
// enough, the fields that pair naturally sit two to a row.
export default function ProfileEditorBody({ profile, onSaved, onClose, onDirtyChange, saveRef, logoOnly = false, onLive, previewBeside = false }) {
  const adapter = useAdapter();
  // Every profile write goes through its route (session, entitlement, the event on the server).
  const postJson = async (url, body) => { const r = await adapter.fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); return { ok: r.ok && !j?.error, data: j?.profile || null, error: j?.error || (r.ok ? null : 'Could not save.') }; };
  const [form, setForm] = useState({
    full_name: profile?.full_name || '',
    brokerage: profile?.brokerage || '',
    brokerage_address: profile?.brokerage_address || '',
    phone: profile?.phone || '',
    license_number: profile?.license_number || '',
    board: profile?.board || '',
    province: normalizeProvince(profile?.province),
  });
  // Snapshot of the last-saved detail values. "Dirty" = form differs from this. Updated on Save.
  const [savedForm, setSavedForm] = useState({
    full_name: profile?.full_name || '',
    brokerage: profile?.brokerage || '',
    brokerage_address: profile?.brokerage_address || '',
    phone: profile?.phone || '',
    license_number: profile?.license_number || '',
    board: profile?.board || '',
    province: normalizeProvince(profile?.province),
  });
  // The board details (lib/boardDetails.js): the brokerage address and the board sit beside the
  // brokerage and the RECO registration number, and prefill a new listing's brokerage fields.
  const DETAIL_KEYS = ['full_name', 'brokerage', 'brokerage_address', 'phone', 'license_number', 'board', 'province'];
  const savedFormRef = useRef(savedForm); savedFormRef.current = savedForm;
  const [brandColor, setBrandColor] = useState(profile?.brand_color || '');
  const [brandColorSecondary, setBrandColorSecondary] = useState(profile?.brand_color_secondary || '');
  const [fontId, setFontId] = useState(profile?.brand_fonts?.id || '');
  const suggestedFontId = suggestPairingId(profile);

  // Pick a font pairing → persist to profiles.brand_fonts (separate update so a
  // not-yet-added column can't affect other saves).
  // NOTE: supabase-js returns { error } rather than throwing, so the previous try/catch could
  // never notice a failed write — the card showed "IN USE" while nothing was persisted.
  const [fontState, setFontState] = useState('idle'); // idle | saving | saved | error
  const selectFont = async (fp) => {
    const prev = fontId;
    setFontId(fp.id); setSavedOk(false); setFontState('saving'); setError('');
    try {
      const { ok, data, error: upErr } = await postJson('/api/profile/branding', { brand_fonts: fp });
      if (!ok || !data) {
        setFontId(prev); setFontState('error');
        setError(`Could not save the font pairing${upErr ? ': ' + upErr : ''}. Your reports keep using the previous pairing.`);
        return;
      }
      onSaved?.(data); setFontState('saved'); setTimeout(() => setFontState((st) => (st === 'saved' ? 'idle' : st)), 2000);
    } catch (e) { setFontId(prev); setFontState('error'); setError('Could not save the font pairing. Please try again.'); }
  };
  const [logoUrl, setLogoUrl] = useState(profile?.logo_url || '');
  const [studioOpen, setStudioOpen] = useState(!profile?.logo_url);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  // Remove asks first, in the page: the logo row gives way to one line and two buttons.
  const [removeAsk, setRemoveAsk] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setSavedOk(false); };

  const uploadLogo = async (file) => {
    if (!file) return;
    setError('');
    const ext = ALLOWED[file.type];
    if (!ext) { setError('Logo must be a PNG, JPG, SVG, or WebP image.'); return; }
    if (file.size > MAX_BYTES) { setError('Logo must be under 2MB.'); return; }
    setLogoBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError('Your session expired. Please sign in again.'); setLogoBusy(false); return; }
      const path = `${user.id}/logo.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('logos').upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' });
      if (upErr) { setError('Upload failed: ' + upErr.message); setLogoBusy(false); return; }
      const { data: pub } = supabase.storage.from('logos').getPublicUrl(path);
      const url = `${pub.publicUrl}?v=${Date.now()}`; // cache-bust
      const { ok, data, error: dbErr } = await postJson('/api/profile/branding', { logo_url: url });
      if (!ok) { setError('Could not save logo: ' + dbErr); setLogoBusy(false); return; }
      setLogoUrl(url);
      onSaved?.(data);
    } catch (e) {
      setError('Could not upload the logo. Please try again.');
    }
    setLogoBusy(false);
  };

  const removeLogo = async () => {
    setError('');
    setLogoBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError('Your session expired. Please sign in again.'); setLogoBusy(false); return; }
      const paths = Object.values(ALLOWED).map((ext) => `${user.id}/logo.${ext}`);
      await supabase.storage.from('logos').remove(paths).catch(() => {});
      const { ok, data, error: dbErr } = await postJson('/api/profile/branding', { logo_url: null });
      if (!ok) { setError('Could not remove logo: ' + dbErr); setLogoBusy(false); return; }
      setLogoUrl('');
      onSaved?.(data);
    } catch (e) {
      setError('Could not remove the logo.');
    }
    setLogoBusy(false);
  };

  // ── Detail-field persistence ───────────────────────────────────────────────────────────
  // Single write path for the detail fields (+ colours). Used by: the Save button, blur
  // autosave, "Save & leave", and LogoStudio's pre-generation flush. Reads the LATEST form via
  // a ref so a blur-triggered save never writes stale values. Returns true on success.
  const formRef = useRef(form); formRef.current = form;
  const colorRef = useRef({ brandColor, brandColorSecondary }); colorRef.current = { brandColor, brandColorSecondary };
  const savingRef = useRef(false);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  // The per field Saved flash: the keys whose value changed in the write that just landed, two seconds each.
  const [flash, setFlash] = useState({});
  const flashTimers = useRef({});
  const flashSaved = (keys) => {
    if (!keys.length) return;
    setFlash((cur) => { const n = { ...cur }; for (const k of keys) n[k] = true; return n; });
    for (const k of keys) { clearTimeout(flashTimers.current[k]); flashTimers.current[k] = setTimeout(() => setFlash((cur) => { const n = { ...cur }; delete n[k]; return n; }), 2000); }
  };
  useEffect(() => () => { for (const t of Object.values(flashTimers.current)) clearTimeout(t); }, []);
  const waitIdle = () => new Promise((r) => { const t = setInterval(() => { if (!savingRef.current) { clearInterval(t); r(); } }, 50); });
  const persistDetails = useCallback(async () => {
    if (savingRef.current) { // a blur-save is mid-flight, let it finish, then write the latest values
      await waitIdle();
      const f0 = formRef.current;
      if (!DETAIL_KEYS.some((k) => f0[k] !== savedFormRef.current[k])) return true;
    }
    savingRef.current = true;
    setSaving(true); setSaveState('saving'); setError('');
    const f = formRef.current;
    const { brandColor: bc, brandColorSecondary: bcs } = colorRef.current;
    try {
      // The detail fields through the profile route, the colours through the branding route.
      const details = await postJson('/api/profile/update', {
        full_name: f.full_name.trim() || null,
        brokerage: f.brokerage.trim() || null,
        brokerage_address: f.brokerage_address.trim() || null,
        phone: f.phone.trim() || null,
        license_number: f.license_number.trim() || null,
        board: f.board || null,
        province: normalizeProvince(f.province),
      });
      if (!details.ok) { setError(details.error || 'Could not save.'); setSaveState('error'); return false; }
      const colours = await postJson('/api/profile/branding', {
        brand_color: /^#[0-9a-fA-F]{6}$/.test(bc) ? bc.toLowerCase() : null,
        brand_color_secondary: /^#[0-9a-fA-F]{6}$/.test(bcs) ? bcs.toLowerCase() : null,
      });
      onSaved?.(colours.data || details.data);
      flashSaved(DETAIL_KEYS.filter((k) => f[k] !== savedFormRef.current[k]));
      setSavedForm({ ...f }); // detail fields are now saved, clears the dirty state
      setSaveState('saved');
      return true;
    } catch (e) {
      setError('Could not save. Please try again.');
      setSaveState('error');
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [onSaved]);

  // Explicit Save (button / "Save & leave"). Closes the modal on success.
  const save = async () => {
    const ok = await persistDetails();
    if (!ok) return false;
    if (onClose) onClose();
    else { setSavedOk(true); setTimeout(() => setSavedOk(false), 2600); }
    return true;
  };

  // Blur autosave — fires when the realtor leaves a detail field with unsaved edits.
  const autosaveTimer = useRef(null);
  const autosave = () => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      const f = formRef.current;
      const dirtyNow = DETAIL_KEYS.some((k) => f[k] !== savedFormRef.current[k]);
      if (dirtyNow && !savingRef.current) persistDetails();
    }, 250);
  };
  useEffect(() => () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); }, []);

  // Called by LogoStudio right before it hits the generator: the server builds the wordmark
  // from the SAVED profile row, so unsaved name/brokerage edits must be flushed first.
  const ensureDetailsSaved = async () => {
    const f = formRef.current;
    const dirtyNow = DETAIL_KEYS.some((k) => f[k] !== savedFormRef.current[k]);
    if (!dirtyNow) return true;
    return persistDetails(); // waits for any in-flight blur-save, then writes the latest values
  };

  // Scroll + focus the name field (from the LogoStudio gate notice).
  const jumpToDetails = () => {
    const el = document.getElementById('profile-field-full_name');
    if (!el) return;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    setTimeout(() => el.focus({ preventScroll: true }), reduce ? 0 : 350);
  };

  // The detail fields, by group. span: the field takes the group's whole row (a long value);
  // hint: one line under the field.
  const FIELD = {
    full_name: { k: 'full_name', label: 'Your full name', ph: 'Sarah Chen', ac: 'name', span: true },
    phone: { k: 'phone', label: 'Phone', ph: '(416) 555-0199', ac: 'tel', type: 'tel' },
    license_number: { k: 'license_number', label: 'RECO registration number (optional)', ph: 'RECO 1234567', ac: 'off' },
    brokerage: { k: 'brokerage', label: 'Brokerage', ph: 'Royal LePage Signature Realty', ac: 'organization', span: true, hint: BROKERAGE_NAME_LINE },
    brokerage_address: { k: 'brokerage_address', label: 'Brokerage address (optional)', ph: '8 Sample Ave, Toronto', ac: 'street-address', span: true },
  };
  // Live values for a preview beside the form, as they are typed and before they are saved.
  useEffect(() => { onLive?.({ full_name: form.full_name, brokerage: form.brokerage, phone: form.phone, logoUrl }); }, [form.full_name, form.brokerage, form.phone, logoUrl, onLive]);

  const hexOk = (v) => /^#[0-9a-fA-F]{6}$/.test(String(v || ''));
  const palette = (hexOk(brandColor) && hexOk(brandColorSecondary)) ? buildPalette(brandColor, brandColorSecondary) : null;

  // Auto-persist brand colours + derived palette in the background when they change — no
  // manual Save required. The colour columns and the brand_palette jsonb are saved in
  // separate updates so a not-yet-added jsonb column can't break colour persistence.
  useEffect(() => {
    const p = hexOk(brandColor) ? brandColor.toLowerCase() : null;
    const s = hexOk(brandColorSecondary) ? brandColorSecondary.toLowerCase() : null;
    if (p === (profile?.brand_color || null) && s === (profile?.brand_color_secondary || null)) return;
    const t = setTimeout(async () => {
      try {
        // One write: the colours and the derived palette. The route drops brand_palette on its
        // own when the column is not there yet, so colour persistence never depends on it.
        const { data } = await postJson('/api/profile/branding', { brand_color: p, brand_color_secondary: s, ...(p && s ? { brand_palette: buildPalette(p, s) } : {}) });
        if (data) onSaved?.(data);
      } catch (e) { /* non-fatal, colours still feed generation from live state */ }
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandColor, brandColorSecondary, profile?.brand_color, profile?.brand_color_secondary]);

  // The accent edge of the small brand card: the brand colour, or the soft ink without one (red is
  // the one main action on a view, components/dashboard/HomeView.js brandAccent the same).
  const accentPreview = hexOk(brandColor) ? brandColor : C.inkSoft;

  // ── Unsaved-changes (dirty) tracking for the DETAIL fields ────────────────────────────────
  // Only the fields the Save button persists count. The logo + brand colours auto-save on their
  // own, so they're already persisted and never make the form "dirty".
  const dirty = DETAIL_KEYS.some((k) => form[k] !== savedForm[k]);

  // Report dirty state up (lets the page guard "Back to dashboard") and expose save() to the parent.
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { if (saveRef) saveRef.current = save; }); // keep the ref pointing at the latest save
  // Warn on browser back / tab close / refresh while detail changes are unsaved.
  useEffect(() => {
    if (!dirty) return;
    const h = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  // One field: its label above it (with the muted Saved beside the label after a write lands), the
  // input, and a line under it where the field says what it is for.
  const fieldLabel = (k, text, htmlFor) => (
    <label htmlFor={htmlFor} className="pe-label">{text}{flash[k] && <span role="status" className="pe-saved">Saved</span>}</label>
  );
  const textField = (f) => (
    <div key={f.k} className={`pe-field${f.span ? ' pe-span' : ''}`}>
      {fieldLabel(f.k, f.label, `profile-field-${f.k}`)}
      <input id={`profile-field-${f.k}`} type={f.type || 'text'} autoComplete={f.ac} value={form[f.k]} onChange={(e) => set(f.k, e.target.value)} onBlur={autosave} placeholder={f.ph} style={inputStyle} aria-describedby={f.hint ? `profile-field-${f.k}-hint` : undefined} />
      {f.hint ? <div id={`profile-field-${f.k}-hint`} className="pe-note">{f.hint}</div> : null}
    </div>
  );

  // The logo: the small brand card (the phone's, when a preview stands beside the form), the row of
  // logo actions in one style (upload the main one, the AI studio and Remove quiet), the formats,
  // and the AI studio when it is open. Remove asks first, in the page.
  const logoBlock = (
    <>
      <div className={previewBeside ? 'pe-phone' : undefined}>
        <div style={{ position: 'relative', border: `1px solid ${C.rule}`, borderRadius: R.card, padding: 16, paddingLeft: 20, background: C.paperDeep, marginBottom: 10, overflow: 'hidden' }}>
          {/* the accent edge re-enters on every colour change instead of snapping */}
          <Crossfade watch={accentPreview}><span aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: accentPreview }} /></Crossfade>
          {/* The name and brokerage beside the logo while they keep 220px; on a phone they go under it,
              the card's width, and a long name wraps instead of being cut short. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14 }}>
            {/* top-left logo slot (the brand placement) */}
            <div style={{ width: 88, height: 56, borderRadius: 8, background: '#fff', border: `1px solid ${C.rule}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, padding: 6 }}>
              <Crossfade watch={logoUrl || 'none'}>{logoUrl
                ? <img src={logoUrl} alt="Your logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                : <span style={{ fontSize: 10.5, color: C.inkMute, textAlign: 'center', lineHeight: 1.3 }}>No logo yet</span>}</Crossfade>
            </div>
            <div style={{ minWidth: 0, flex: '1 1 220px' }}>
              <Crossfade watch={fontId || 'default'}><div className="pe-preview-name" style={{ fontSize: 16, fontWeight: 800, color: C.ink, letterSpacing: '-0.01em', overflowWrap: 'anywhere' }}>{form.full_name || 'Your name'}</div></Crossfade>
              {(form.brokerage || !logoUrl) && <div style={{ fontSize: 13, color: C.inkSoft, marginTop: 1 }}>{form.brokerage || 'Your brokerage'}</div>}
              {form.phone && <div style={{ fontSize: 12, color: C.inkMute, marginTop: 1 }}>{form.phone}</div>}
            </div>
          </div>
        </div>
        <p style={{ fontSize: 12, color: C.inkMute, lineHeight: 1.5, marginBottom: 10 }}>
          This is your brand, it appears <span style={{ whiteSpace: 'nowrap' }}>top-left</span> on the landlord reports you send.
        </p>
      </div>

      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; uploadLogo(f); e.target.value = ''; }} />
      {removeAsk ? (
        <div className="pe-ask" data-logo-remove-ask="">
          <p className="pe-ask-line">Remove your logo? Your reports show your name without it.</p>
          <div className="rl-ctrl-row">
            <button type="button" data-destructive="" onClick={async () => { await removeLogo(); setRemoveAsk(false); }} disabled={logoBusy} className="ds-btn pe-btn-danger">
              <Pending busy={logoBusy} label="Removing your logo" tone="red">Remove logo</Pending>
            </button>
            <button type="button" onClick={() => setRemoveAsk(false)} disabled={logoBusy} className="ds-btn ds-btn-quiet">Keep it</button>
          </div>
        </div>
      ) : (
        <div className="rl-ctrl-row" data-logo-row="">
          <button type="button" onClick={() => fileRef.current?.click()} disabled={logoBusy} className="ds-btn ds-btn-ink">
            <Pending busy={logoBusy} label="Uploading your logo" tone="ink">{logoUrl ? 'Replace with upload' : 'Upload a logo'}</Pending>
          </button>
          <button type="button" onClick={() => setStudioOpen((o) => !o)} className="ds-btn ds-btn-quiet">
            {studioOpen ? 'Hide AI studio' : logoUrl ? 'Regenerate with AI' : 'Create with AI'}
          </button>
          {logoUrl && (
            <button type="button" data-destructive="" onClick={() => setRemoveAsk(true)} disabled={logoBusy} className="ds-btn ds-btn-quiet" data-logo-remove="">
              Remove
            </button>
          )}
        </div>
      )}
      <p style={{ fontSize: 11.5, color: C.inkMute, lineHeight: 1.5, margin: '14px 0 16px' }}>
        Upload accepts PNG, JPG, SVG or WebP under 2MB. PNG and JPG render in the PDF.
      </p>

      {studioOpen && (
        <div style={{ marginTop: 4 }}>
          <LogoStudio
            fullName={form.full_name} brokerage={form.brokerage}
            primary={brandColor} secondary={brandColorSecondary}
            onPrimary={(v) => { setBrandColor(v); setSavedOk(false); }}
            onSecondary={(v) => { setBrandColorSecondary(v); setSavedOk(false); }}
            onChosen={(url, p) => { if (url) setLogoUrl(url); if (p) onSaved?.(p); }}
            onEnsureProfileSaved={ensureDetailsSaved}
            onJumpToDetails={jumpToDetails}
          />
          <p style={{ fontSize: 11.5, color: C.inkMute, lineHeight: 1.5, margin: '10px 0 26px', textWrap: 'balance' }}>
            Your brand colours save automatically, feed the AI generator, and tint the landlord report accent.
          </p>
        </div>
      )}
    </>
  );

  return (
    <div className="pe">
      <MotionStyles />
      <style jsx global>{`
        /* Below 345px the preview's name is 14px, so a long name holds two words a line at 320. */
        @media (max-width: 344.98px) { .pe-preview-name { font-size: var(--t-body-2) !important; } }
        .pe-card { padding: var(--card-pad); }
        .pe-card + .pe-card { margin-top: var(--gap-card); }
        .pe-h { font-family: var(--f-display); font-size: var(--t-d3); font-weight: 600; letter-spacing: -0.01em; line-height: var(--lh-display); color: ${C.ink}; margin: 0 0 var(--s-4); }
        /* 24px between rows: each label, tied to its field, has the 44px a tap needs (lib/motion.js HIT). */
        .pe-grid { display: grid; grid-template-columns: minmax(0, 1fr); row-gap: var(--s-5); column-gap: var(--s-5); }
        .pe-label { display: block; font-size: 11px; color: ${C.inkSoft}; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 6px; text-wrap: balance; }
        .pe-saved { margin-left: 8px; color: ${C.inkMute}; font-weight: 600; text-transform: none; letter-spacing: 0; }
        .pe-note { font-size: 12px; color: ${C.inkMute}; margin-top: 6px; line-height: 1.5; text-wrap: balance; }
        .pe-foot { font-size: 12px; color: ${C.inkMute}; line-height: 1.5; margin: var(--s-4) 0 0; text-wrap: balance; }
        .pe-error { margin-bottom: 14px; padding: 10px 14px; background: ${C.dangerTint}; border-radius: ${R.ctrl}px; border-left: 3px solid ${C.danger}; font-size: 13px; color: ${C.ink}; }
        .pe-ask { padding: var(--s-3) var(--s-4); background: ${C.paperDeep}; border-radius: var(--card-radius); }
        .pe-ask-line { font-size: var(--t-body-2); font-weight: 600; color: ${C.ink}; line-height: var(--lh-body); margin: 0 0 var(--s-3); text-wrap: balance; }
        .pe-btn-danger { background: ${C.danger}; color: ${C.paper}; border: 1px solid ${C.danger}; }
        /* From 1024px a group wide enough holds two fields a row; a long value keeps the whole row.
           The small brand card gives way to the preview beside the form. */
        @media (min-width: 1024px) {
          .pe-card { container-type: inline-size; }
          .pe-phone { display: none; }
        }
        @container (min-width: 520px) {
          .pe-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .pe-span { grid-column: 1 / -1; }
        }
      `}</style>
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={GOOGLE_FONTS_HREF} />
      </Head>
      {error && <div role="alert" className="pe-error">{error}</div>}

      {logoOnly ? logoBlock : <>
      {/* You: who the realtor is. */}
      <section className="rl-card pe-card" aria-labelledby="pe-you" data-profile-group="you">
        <h2 id="pe-you" className="pe-h">You</h2>
        <div className="pe-grid">
          {textField(FIELD.full_name)}
          {textField(FIELD.phone)}
          {textField(FIELD.license_number)}
        </div>
      </section>

      {/* Brokerage: its name on reports, its address, the province and the board. */}
      <section className="rl-card pe-card" aria-labelledby="pe-brokerage" data-profile-group="brokerage">
        <h2 id="pe-brokerage" className="pe-h">Brokerage</h2>
        <div className="pe-grid">
          {textField(FIELD.brokerage)}
          {textField(FIELD.brokerage_address)}
          {/* Province · drives province-specific behaviour (e.g. the tenant age-of-majority gate). */}
          <div className="pe-field">
            {fieldLabel('province', 'Province', 'profile-field-province')}
            <select id="profile-field-province" value={form.province} onChange={(e) => { set('province', e.target.value); autosave(); }} onBlur={autosave} style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}>
              {PROVINCE_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <div className="pe-note">The province you operate in. Sets rules like the tenant age of majority (Ontario 18, BC 19).</div>
          </div>
          {/* The board (lib/boardDetails.js): kept for the realtor's own reference, in no report and no group. */}
          <div className="pe-field">
            {fieldLabel('board', 'Board (optional)', 'profile-field-board')}
            <select id="profile-field-board" value={form.board} onChange={(e) => { set('board', e.target.value); autosave(); }} onBlur={autosave} style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}>
              <option value="">Not entered</option>
              {BOARD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
        <p className="pe-foot">Your details appear on the PDF exports and email summaries you send to landlord clients.</p>
      </section>

      {/* Brand: the logo, then the palette and the fonts. */}
      <section className="rl-card pe-card" aria-labelledby="pe-brand" data-profile-group="brand">
        <h2 id="pe-brand" className="pe-h">Brand</h2>
        {logoBlock}

        {/* ── BRAND PALETTE, auto-generated from the two brand colours ── */}
        {palette && (
          <div style={{ marginBottom: 24 }}>
            <label style={{ ...sectionLabel, marginBottom: 4 }}>Brand palette</label>
            <p style={{ fontSize: 11.5, color: C.inkMute, lineHeight: 1.5, marginBottom: 10 }}>
              Auto-generated from your two colours, feeds your report accents and brand kit.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 8 }}>
              {PALETTE_ORDER.map(([key, label]) => {
                const hex = palette[key];
                return (
                  <div key={key} style={{ borderRadius: R.ctrl, overflow: 'hidden', border: `1px solid ${C.rule}` }}>
                    <div style={{ background: hex, height: 52, display: 'flex', alignItems: 'flex-end', padding: 6 }}>
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: readableText(hex), letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</span>
                    </div>
                    <div style={{ background: C.paper, padding: '5px 6px', fontSize: 10.5, fontFamily: 'monospace', color: C.inkSoft, textAlign: 'center' }}>{hex}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── FONT PAIRING ── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', minHeight: 28, marginBottom: 4 }}>
            <label style={{ ...sectionLabel, marginBottom: 0 }}>Font pairing</label>
            {fontState === 'saving' ? <Loader label="Saving your fonts" /> : null}
            {fontState === 'saved' ? <span role="status" style={{ fontSize: 11.5, color: C.inkMute, fontWeight: 600 }}>Saved.</span> : null}
          </div>
          <p style={{ fontSize: 11.5, color: C.inkMute, lineHeight: 1.5, marginBottom: 12, textWrap: 'balance' }}>
            Pick a heading + body pairing. Every pairing here is embedded in your landlord reports, the heading sets your name, the body sets everything else. Script headings style your name only; report text stays in the clean body face.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--gap-card)', alignItems: 'stretch', gridAutoRows: '1fr' }}>
            {FONT_PAIRINGS.map((fp) => {
              const selected = fontId === fp.id;
              return (
                <button key={fp.id} type="button" onClick={() => selectFont(fp)}
                  style={{ height: '100%', textAlign: 'left', cursor: 'pointer', borderRadius: R.card, padding: 12, background: selected ? C.paperDeep : C.paper, border: `1px solid ${selected ? C.ink : C.rule}`, boxShadow: selected ? `0 0 0 1px ${C.ink}` : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: C.ink }}>{fp.name}</span>
                    {selected
                      ? <span style={{ fontSize: 10, fontWeight: 800, color: C.paper, background: C.ink, padding: '2px 8px', borderRadius: R.pill }}>IN USE</span>
                      : fp.id === suggestedFontId && <span style={{ fontSize: 10, fontWeight: 700, color: C.ink, border: `1px solid ${C.ink}`, padding: '1px 7px', borderRadius: R.pill }}>SUGGESTED</span>}
                  </div>
                  <div style={{ fontSize: 10.5, color: C.inkMute, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8 }}>{String(fp.mood).split(' · ').join(', ')}</div>
                  <div style={{ fontFamily: fp.heading.css, fontWeight: fp.heading.weight, letterSpacing: fp.heading.letterSpacing, fontSize: 22, color: C.ink, lineHeight: 1.1 }}>Aa Heading</div>
                  <div style={{ fontFamily: fp.body.css, fontWeight: fp.body.weight, fontSize: 12.5, color: C.inkSoft, lineHeight: 1.5, marginTop: 4, textWrap: 'balance' }}>{noWidow('The quick brown fox jumps over the lazy dog.')}</div>
                  <div style={{ fontSize: 10.5, color: C.inkMute, marginTop: 8, lineHeight: 1.4, textWrap: 'balance' }}>
                    {noWidow(`In reports: ${fp.heading.script ? `your name in ${fp.heading.family}` : `headings in ${fp.heading.family}`}, text in ${fp.body.family}.`)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Explicit Save for a modal host only, same write path as the blur autosave (persistDetails). */}
      {onClose && <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 'var(--gap-card)' }}>
        <button onClick={save} disabled={saving}
          style={{ flex: onClose ? '1 1 100%' : '0 0 auto', background: C.red, color: C.paper, border: 'none', borderRadius: 'var(--btn-radius)', padding: '14px var(--gap-card)', fontSize: 14, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1, boxShadow: (dirty && !saving) ? '0 0 0 3px rgba(215, 32, 39, 0.25)' : 'none' }}>
          <Pending busy={saving} label="Saving your profile" tone="red">{dirty ? 'Save changes' : 'Save'}</Pending>
        </button>
        {!saving && dirty && (
          <span style={{ fontSize: 13, color: C.red, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: C.red, display: 'inline-block', flexShrink: 0 }} />
            Unsaved changes
          </span>
        )}
      </div>}
      </>}
    </div>
  );
}
