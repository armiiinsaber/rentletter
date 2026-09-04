// components/dashboard/ProfileEditorBody.js
// The realtor identity + branding editor, extracted so BOTH the modal
// (ProfileEditorModal) and the profile hub page (/profile) share one code path —
// no duplicated save/upload/logo logic. Updates the Supabase profiles row (RLS, own
// row) and the logos Storage bucket. One continuous "your profile & brand" flow, ordered most-
// fundamental first: your details (identity) → logo → final aesthetic touches (colours + fonts).
// No separate labelled sections — it reads top-to-bottom as one form.
//
// SAVE MODEL (one rule, everywhere): everything on this screen autosaves.
//   • Detail fields (name, brokerage, phone, license, province) save when you leave a field
//     (blur / province change), debounced, and are flushed before any AI generation.
//   • Brand colours + derived palette save 600ms after a change. Logo and font pairing save
//     the moment they're chosen.
// A sticky status strip at the top says exactly which state the form is in ("Saving…",
// "All changes saved", "Unsaved — saving when you leave the field · Save now"). The bottom
// Save button remains as an explicit flush (and closes the modal) but is no longer the only
// way to persist anything.
import { useState, useRef, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { C, R } from '../theme';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import { useAdapter } from '../../lib/dashboardAdapter';
import { buildPalette, PALETTE_ORDER, readableText } from '../../lib/brandPalette';
import { FONT_PAIRINGS, GOOGLE_FONTS_HREF, suggestPairingId } from '../../lib/brandFonts';
import { PROVINCE_OPTIONS, normalizeProvince } from '../../lib/provinces';
import LogoStudio from './LogoStudio';
import { Crossfade, MotionStyles } from '../motion';

const inputStyle = {
  width: '100%', padding: '12px 14px', fontSize: 14, borderRadius: R.ctrl,
  border: `1px solid ${C.rule}`, background: C.paper, color: C.ink, outline: 'none',
};

const ALLOWED = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg', 'image/webp': 'webp' };
const MAX_BYTES = 2 * 1024 * 1024; // 2MB

const sectionLabel = { display: 'block', fontSize: 11, color: C.inkSoft, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 };

// onClose: when provided (modal), Save closes it. When omitted (page), Save shows an
// inline "Saved" confirmation instead.
// logoOnly: render just the logo block (upload + AI studio). Used by first run onboarding, which
// collects the identity fields on its own screen; the editor's data flow is unchanged.
export default function ProfileEditorBody({ profile, onSaved, onClose, onDirtyChange, saveRef, logoOnly = false }) {
  const adapter = useAdapter();
  // Every profile write goes through its route (session, entitlement, the event on the server).
  const postJson = async (url, body) => { const r = await adapter.fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); return { ok: r.ok && !j?.error, data: j?.profile || null, error: j?.error || (r.ok ? null : 'Could not save.') }; };
  const [form, setForm] = useState({
    full_name: profile?.full_name || '',
    brokerage: profile?.brokerage || '',
    phone: profile?.phone || '',
    license_number: profile?.license_number || '',
    province: normalizeProvince(profile?.province),
  });
  // Snapshot of the last-saved detail values. "Dirty" = form differs from this. Updated on Save.
  const [savedForm, setSavedForm] = useState({
    full_name: profile?.full_name || '',
    brokerage: profile?.brokerage || '',
    phone: profile?.phone || '',
    license_number: profile?.license_number || '',
    province: normalizeProvince(profile?.province),
  });
  const DETAIL_KEYS = ['full_name', 'brokerage', 'phone', 'license_number', 'province'];
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
      onSaved?.(data); setFontState('saved');
    } catch (e) { setFontId(prev); setFontState('error'); setError('Could not save the font pairing. Please try again.'); }
  };
  const [logoUrl, setLogoUrl] = useState(profile?.logo_url || '');
  const [studioOpen, setStudioOpen] = useState(!profile?.logo_url);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
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
        phone: f.phone.trim() || null,
        license_number: f.license_number.trim() || null,
        province: normalizeProvince(f.province),
      });
      if (!details.ok) { setError(details.error || 'Could not save.'); setSaveState('error'); return false; }
      const colours = await postJson('/api/profile/branding', {
        brand_color: /^#[0-9a-fA-F]{6}$/.test(bc) ? bc.toLowerCase() : null,
        brand_color_secondary: /^#[0-9a-fA-F]{6}$/.test(bcs) ? bcs.toLowerCase() : null,
      });
      onSaved?.(colours.data || details.data);
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

  const fields = [
    { k: 'full_name', label: 'Your full name', ph: 'Sarah Chen', ac: 'name' },
    { k: 'brokerage', label: 'Brokerage', ph: 'Royal LePage Signature Realty', ac: 'organization' },
    { k: 'phone', label: 'Phone', ph: '(416) 555-0199', ac: 'tel' },
    { k: 'license_number', label: 'RECO license number (optional)', ph: 'RECO 1234567', ac: 'off' },
  ];

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

  const accentPreview = hexOk(brandColor) ? brandColor : C.red;

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

  return (
    <div>
      <MotionStyles />
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={GOOGLE_FONTS_HREF} />
      </Head>
      {/* Sticky save-state strip, the ONE place that says whether this form is persisted. Sticks to
          the top of the scroll container (the modal body, or the page) so it's visible from the name
          field down to the font cards. Colours: ink while saving, green when saved, red when unsaved. */}
      {!logoOnly && <div role="status" aria-live="polite"
        style={{ position: 'sticky', top: 0, zIndex: 5, margin: '0 0 14px', padding: '8px 12px', background: C.paper, borderBottom: `1px solid ${C.rule}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', fontSize: 12.5, lineHeight: 1.4 }}>
        {saving ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: C.inkSoft, fontWeight: 600 }}>
            <span className="rl-savespin" aria-hidden="true" /> Saving…
          </span>
        ) : dirty ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: C.red, fontWeight: 700 }}>
            <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: C.red, display: 'inline-block', flexShrink: 0 }} />
            Unsaved, saves when you leave the field
          </span>
        ) : saveState === 'error' ? (
          <span style={{ color: C.red, fontWeight: 700 }}>Not saved, see the message below</span>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: C.green, fontWeight: 700 }}>
            <span aria-hidden="true">✓</span> All changes saved
          </span>
        )}
        {dirty && !saving && (
          <button type="button" onClick={() => persistDetails()}
            style={{ background: C.ink, color: C.paper, border: 'none', borderRadius: R.pill, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            Save now
          </button>
        )}
      </div>}
      {error && <div style={{ marginBottom: 14, padding: '10px 14px', background: '#fef2f0', borderRadius: R.ctrl, borderLeft: `3px solid ${C.red}`, fontSize: 13, color: C.ink }}>{error}</div>}

      {/* One continuous flow, ordered most-fundamental first, your details, then logo, then the
          final aesthetic touches (colours + fonts). No section headers: it reads as one form. */}
      {!logoOnly && <>
      {fields.map((f) => (
        <div key={f.k} style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 11, color: C.inkSoft, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>{f.label}</label>
          <input id={`profile-field-${f.k}`} type="text" autoComplete={f.ac} value={form[f.k]} onChange={(e) => set(f.k, e.target.value)} onBlur={autosave} placeholder={f.ph} style={inputStyle} />
        </div>
      ))}
      {/* Province · drives province-specific behaviour (e.g. the tenant age-of-majority gate). */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 11, color: C.inkSoft, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Province</label>
        <select value={form.province} onChange={(e) => { set('province', e.target.value); autosave(); }} onBlur={autosave} style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}>
          {PROVINCE_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <div style={{ fontSize: 12, color: C.inkMute, marginTop: 6, lineHeight: 1.5 }}>The province you operate in. Sets rules like the tenant age of majority (Ontario 18, BC 19).</div>
      </div>
      <p style={{ fontSize: 12, color: C.inkMute, lineHeight: 1.5, marginBottom: 26 }}>
        These appear on PDF exports and email summaries you send to landlord clients. Saved automatically when you leave a field.
      </p>
      </>}

      {/* Logo, upload or generate with the AI studio (which carries the brand colours). Flows
          straight on from the details above; no divider or section header. */}
      <div style={{ position: 'relative', border: `1px solid ${C.rule}`, borderRadius: R.card, padding: 16, paddingLeft: 20, background: C.paperDeep, marginBottom: 10, overflow: 'hidden' }}>
        {/* the accent edge re-enters on every colour change instead of snapping */}
        <Crossfade watch={accentPreview}><span aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: accentPreview }} /></Crossfade>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* top-left logo slot (the brand placement) */}
          <div style={{ width: 88, height: 56, borderRadius: 8, background: '#fff', border: `1px solid ${C.rule}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, padding: 6 }}>
            <Crossfade watch={logoUrl || 'none'}>{logoUrl
              ? <img src={logoUrl} alt="Your logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              : <span style={{ fontSize: 10.5, color: C.inkMute, textAlign: 'center', lineHeight: 1.3 }}>No logo yet</span>}</Crossfade>
          </div>
          <div style={{ minWidth: 0 }}>
            <Crossfade watch={fontId || 'default'}><div style={{ fontSize: 16, fontWeight: 800, color: C.ink, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{form.full_name || 'Your name'}</div></Crossfade>
            {(form.brokerage || !logoUrl) && <div style={{ fontSize: 13, color: C.inkSoft, marginTop: 1 }}>{form.brokerage || 'Your brokerage'}</div>}
            {form.phone && <div style={{ fontSize: 12, color: C.inkMute, marginTop: 1 }}>{form.phone}</div>}
          </div>
        </div>
      </div>
      <p style={{ fontSize: 12, color: C.inkMute, lineHeight: 1.5, marginBottom: 10 }}>
        This is your brand, it appears top-left on the landlord reports you send.
      </p>

      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; uploadLogo(f); e.target.value = ''; }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <button onClick={() => fileRef.current?.click()} disabled={logoBusy}
          style={{ background: C.ink, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: logoBusy ? 'wait' : 'pointer' }}>
          {logoBusy ? 'Working…' : 'Replace with upload'}
        </button>
        <button onClick={() => setStudioOpen((o) => !o)}
          style={{ background: studioOpen ? C.card : C.red, color: studioOpen ? C.ink : C.paper, border: studioOpen ? `1px solid ${C.ruleDark}` : 'none', borderRadius: R.ctrl, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          {studioOpen ? 'Hide AI studio' : logoUrl ? 'Regenerate with AI' : 'Create with AI'}
        </button>
        {logoUrl && (
          <button onClick={removeLogo} disabled={logoBusy}
            style={{ background: 'transparent', color: C.red, border: `1px solid ${C.red}`, borderRadius: R.ctrl, padding: '10px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Remove
          </button>
        )}
      </div>
      <p style={{ fontSize: 11.5, color: C.inkMute, lineHeight: 1.5, marginBottom: 16 }}>
        Upload accepts PNG, JPG, SVG, or WebP · under 2MB (PNG/JPG render in the PDF).
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
          <p style={{ fontSize: 11.5, color: C.inkMute, lineHeight: 1.5, margin: '10px 0 26px' }}>
            Your brand colours save automatically, feed the AI generator, and tint the landlord report accent.
          </p>
        </div>
      )}

      {!logoOnly && <>
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
      <div style={{ marginBottom: 24 }}>
        <label style={{ ...sectionLabel, marginBottom: 4 }}>Font pairing</label>
        <p style={{ fontSize: 11.5, color: C.inkMute, lineHeight: 1.5, marginBottom: 12 }}>
          Pick a heading + body pairing. Every pairing here is embedded in your landlord reports, the heading sets your name, the body sets everything else. Script headings style your name only; report text stays in the clean body face.
          {fontState === 'saving' && <span style={{ color: C.inkSoft, fontWeight: 600 }}> · Saving…</span>}
          {fontState === 'saved' && <span style={{ color: C.green, fontWeight: 700 }}> · ✓ Saved</span>}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          {FONT_PAIRINGS.map((fp) => {
            const selected = fontId === fp.id;
            return (
              <button key={fp.id} type="button" onClick={() => selectFont(fp)}
                style={{ textAlign: 'left', cursor: 'pointer', borderRadius: R.card, padding: 12, background: selected ? '#f0f7f3' : C.paper, border: `1px solid ${selected ? C.green : C.rule}`, boxShadow: selected ? `0 0 0 1px ${C.green}` : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: C.ink }}>{fp.name}</span>
                  {selected
                    ? <span style={{ fontSize: 10, fontWeight: 800, color: C.paper, background: C.green, padding: '2px 8px', borderRadius: R.pill }}>✓ IN USE</span>
                    : fp.id === suggestedFontId && <span style={{ fontSize: 10, fontWeight: 700, color: C.red, border: `1px solid ${C.red}`, padding: '1px 7px', borderRadius: R.pill }}>SUGGESTED</span>}
                </div>
                <div style={{ fontSize: 10.5, color: C.inkMute, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8 }}>{fp.mood}</div>
                <div style={{ fontFamily: fp.heading.css, fontWeight: fp.heading.weight, letterSpacing: fp.heading.letterSpacing, fontSize: 22, color: C.ink, lineHeight: 1.1 }}>Aa Heading</div>
                <div style={{ fontFamily: fp.body.css, fontWeight: fp.body.weight, fontSize: 12.5, color: C.inkSoft, lineHeight: 1.5, marginTop: 4 }}>The quick brown fox jumps over the lazy dog.</div>
                <div style={{ fontSize: 10.5, color: C.inkMute, marginTop: 8, lineHeight: 1.4 }}>
                  In reports: {fp.heading.script ? `your name in ${fp.heading.family}` : `headings in ${fp.heading.family}`} · text in {fp.body.family}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Explicit Save, same write path as the blur autosave (persistDetails). Kept as a visible
          flush + "close the modal" action; the sticky strip above is the primary save indicator. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <button onClick={save} disabled={saving}
          style={{ flex: onClose ? '1 1 100%' : '0 0 auto', background: C.red, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '14px 24px', fontSize: 14, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1, boxShadow: (dirty && !saving) ? '0 0 0 3px rgba(215, 32, 39, 0.25)' : 'none' }}>
          {saving ? 'Saving…' : (dirty ? 'Save changes' : 'Save')}
        </button>
        {!saving && dirty && (
          <span style={{ fontSize: 13, color: C.red, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: C.red, display: 'inline-block', flexShrink: 0 }} />
            Unsaved changes
          </span>
        )}
        {!saving && !dirty && savedOk && <span style={{ fontSize: 13, color: C.green, fontWeight: 700 }}>✓ Saved</span>}
      </div>
      <style jsx>{`
        .rl-savespin {
          width: 12px; height: 12px; flex-shrink: 0; border-radius: 50%; display: inline-block;
          border: 2px solid ${C.rule}; border-top-color: ${C.ink};
        }
        @media (prefers-reduced-motion: no-preference) {
          .rl-savespin { animation: rl-savespin 0.7s linear infinite; }
        }
        @keyframes rl-savespin { to { transform: rotate(360deg); } }
      `}</style>
      </>}
    </div>
  );
}
