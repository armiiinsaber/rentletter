// components/dashboard/ProfileEditorBody.js
// The realtor identity + branding editor, extracted so BOTH the modal
// (ProfileEditorModal) and the profile hub page (/profile) share one code path —
// no duplicated save/upload/logo logic. Updates the Supabase profiles row (RLS, own
// row) and the logos Storage bucket. Renders two clear sections, in order: Your details (identity)
// first, then Your branding (logo / colours / fonts).
import { useState, useRef, useEffect } from 'react';
import Head from 'next/head';
import { C, R } from '../theme';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import { buildPalette, PALETTE_ORDER, readableText } from '../../lib/brandPalette';
import { FONT_PAIRINGS, GOOGLE_FONTS_HREF, suggestPairingId } from '../../lib/brandFonts';
import { PROVINCE_OPTIONS, normalizeProvince } from '../../lib/provinces';
import LogoStudio from './LogoStudio';

const inputStyle = {
  width: '100%', padding: '12px 14px', fontSize: 14, borderRadius: R.ctrl,
  border: `1px solid ${C.rule}`, background: C.paper, color: C.ink, outline: 'none',
};

const ALLOWED = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg', 'image/webp': 'webp' };
const MAX_BYTES = 2 * 1024 * 1024; // 2MB

const sectionLabel = { display: 'block', fontSize: 11, color: C.inkSoft, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 };

// Red-dash eyebrow — the app's section-header treatment, used for the two main sections below.
function SectionHeader({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <span aria-hidden="true" style={{ display: 'inline-block', width: 3, height: 13, background: C.red, borderRadius: 1, flexShrink: 0 }} />
      <span style={{ fontSize: 11.5, color: C.red, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{children}</span>
    </div>
  );
}

// onClose: when provided (modal), Save closes it. When omitted (page), Save shows an
// inline "Saved" confirmation instead.
export default function ProfileEditorBody({ profile, onSaved, onClose }) {
  const [form, setForm] = useState({
    full_name: profile?.full_name || '',
    brokerage: profile?.brokerage || '',
    phone: profile?.phone || '',
    license_number: profile?.license_number || '',
    province: normalizeProvince(profile?.province),
  });
  const [brandColor, setBrandColor] = useState(profile?.brand_color || '');
  const [brandColorSecondary, setBrandColorSecondary] = useState(profile?.brand_color_secondary || '');
  const [fontId, setFontId] = useState(profile?.brand_fonts?.id || '');
  const suggestedFontId = suggestPairingId(profile);

  // Pick a font pairing → persist to profiles.brand_fonts (separate update so a
  // not-yet-added column can't affect other saves).
  const selectFont = async (fp) => {
    setFontId(fp.id); setSavedOk(false);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('profiles').update({ brand_fonts: fp }).eq('id', user.id).select().single();
      if (data) onSaved?.(data);
    } catch (e) { /* brand_fonts column not added yet — non-fatal */ }
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
      const { data, error: dbErr } = await supabase
        .from('profiles').update({ logo_url: url }).eq('id', user.id).select().single();
      if (dbErr) { setError('Could not save logo: ' + dbErr.message); setLogoBusy(false); return; }
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
      const { data, error: dbErr } = await supabase
        .from('profiles').update({ logo_url: null }).eq('id', user.id).select().single();
      if (dbErr) { setError('Could not remove logo: ' + dbErr.message); setLogoBusy(false); return; }
      setLogoUrl('');
      onSaved?.(data);
    } catch (e) {
      setError('Could not remove the logo.');
    }
    setLogoBusy(false);
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError('Your session expired. Please sign in again.'); setSaving(false); return; }
      const patch = {
        full_name: form.full_name.trim() || null,
        brokerage: form.brokerage.trim() || null,
        phone: form.phone.trim() || null,
        license_number: form.license_number.trim() || null,
        province: normalizeProvince(form.province),
        brand_color: /^#[0-9a-fA-F]{6}$/.test(brandColor) ? brandColor.toLowerCase() : null,
        brand_color_secondary: /^#[0-9a-fA-F]{6}$/.test(brandColorSecondary) ? brandColorSecondary.toLowerCase() : null,
      };
      const { data, error: upErr } = await supabase
        .from('profiles').update(patch).eq('id', user.id).select().single();
      if (upErr) { setError(upErr.message); setSaving(false); return; }
      onSaved?.(data);
      setSaving(false);
      if (onClose) onClose();
      else { setSavedOk(true); setTimeout(() => setSavedOk(false), 2600); }
    } catch (e) {
      setError('Could not save. Please try again.');
      setSaving(false);
    }
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
        const supabase = getSupabaseBrowserClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase.from('profiles')
          .update({ brand_color: p, brand_color_secondary: s }).eq('id', user.id).select().single();
        if (data) onSaved?.(data);
        if (p && s) {
          try {
            const { data: d2 } = await supabase.from('profiles')
              .update({ brand_palette: buildPalette(p, s) }).eq('id', user.id).select().single();
            if (d2) onSaved?.(d2);
          } catch (e) { /* brand_palette column not added yet — non-fatal */ }
        }
      } catch (e) { /* non-fatal — colours still feed generation from live state */ }
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandColor, brandColorSecondary, profile?.brand_color, profile?.brand_color_secondary]);

  const accentPreview = hexOk(brandColor) ? brandColor : C.red;

  return (
    <div>
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={GOOGLE_FONTS_HREF} />
      </Head>
      {error && <div style={{ marginBottom: 14, padding: '10px 14px', background: '#fef2f0', borderRadius: R.ctrl, borderLeft: `3px solid ${C.red}`, fontSize: 13, color: C.ink }}>{error}</div>}

      {/* ── YOUR DETAILS (identity) — FIRST. A realtor's own identity is more fundamental than
          their branding, so it leads; branding (logo/colours/fonts) follows below. ── */}
      <SectionHeader>Your details</SectionHeader>
      {fields.map((f) => (
        <div key={f.k} style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 11, color: C.inkSoft, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>{f.label}</label>
          <input type="text" autoComplete={f.ac} value={form[f.k]} onChange={(e) => set(f.k, e.target.value)} placeholder={f.ph} style={inputStyle} />
        </div>
      ))}
      {/* Province — drives province-specific behaviour (e.g. the tenant age-of-majority gate). */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 11, color: C.inkSoft, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Province</label>
        <select value={form.province} onChange={(e) => set('province', e.target.value)} style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}>
          {PROVINCE_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <div style={{ fontSize: 12, color: C.inkMute, marginTop: 6, lineHeight: 1.5 }}>The province you operate in. Sets rules like the tenant age of majority (Ontario 18, BC 19).</div>
      </div>
      <p style={{ fontSize: 12, color: C.inkMute, lineHeight: 1.5, marginBottom: 4 }}>
        These appear on PDF exports and email summaries you send to landlord clients. All optional.
      </p>

      {/* ── YOUR BRANDING — SECOND: logo, colours, fonts — how you LOOK on reports. ── */}
      <div style={{ borderTop: `1px solid ${C.rule}`, margin: '30px 0 24px' }} />
      <SectionHeader>Your branding</SectionHeader>
      <div style={{ border: `1px solid ${C.rule}`, borderLeft: `4px solid ${accentPreview}`, borderRadius: R.card, padding: 16, background: C.paperDeep, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* top-left logo slot (the brand placement) */}
          <div style={{ width: 88, height: 56, borderRadius: 8, background: '#fff', border: `1px solid ${C.rule}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, padding: 6 }}>
            {logoUrl
              ? <img src={logoUrl} alt="Your logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              : <span style={{ fontSize: 10.5, color: C.inkMute, textAlign: 'center', lineHeight: 1.3 }}>No logo yet</span>}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.ink, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{form.full_name || 'Your name'}</div>
            {(form.brokerage || !logoUrl) && <div style={{ fontSize: 13, color: C.inkSoft, marginTop: 1 }}>{form.brokerage || 'Your brokerage'}</div>}
            {form.phone && <div style={{ fontSize: 12, color: C.inkMute, marginTop: 1 }}>{form.phone}</div>}
          </div>
        </div>
      </div>
      <p style={{ fontSize: 12, color: C.inkMute, lineHeight: 1.5, marginBottom: 10 }}>
        This is your brand — it appears top-left on the landlord reports you send.
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
          />
          <p style={{ fontSize: 11.5, color: C.inkMute, lineHeight: 1.5, margin: '10px 0 26px' }}>
            Your brand colours save automatically, feed the AI generator, and tint the landlord report accent.
          </p>
        </div>
      )}

      {/* ── BRAND PALETTE — auto-generated from the two brand colours ── */}
      {palette && (
        <div style={{ marginBottom: 24 }}>
          <label style={{ ...sectionLabel, marginBottom: 4 }}>Brand palette</label>
          <p style={{ fontSize: 11.5, color: C.inkMute, lineHeight: 1.5, marginBottom: 10 }}>
            Auto-generated from your two colours — feeds your report accents and brand kit.
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
          Pick a heading + body pairing for your business card, signature, and brand kit.
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
              </button>
            );
          })}
        </div>
      </div>

      {/* Save — persists identity + brand colours in one patch (logic unchanged; still saves
          every field regardless of the new section order). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <button onClick={save} disabled={saving}
          style={{ flex: onClose ? '1 1 100%' : '0 0 auto', background: C.red, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '14px 24px', fontSize: 14, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {savedOk && <span style={{ fontSize: 13, color: C.green, fontWeight: 700 }}>✓ Saved</span>}
      </div>
    </div>
  );
}
