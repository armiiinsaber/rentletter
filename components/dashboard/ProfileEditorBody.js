// components/dashboard/ProfileEditorBody.js
// The realtor identity + branding editor, extracted so BOTH the modal
// (ProfileEditorModal) and the profile hub page (/profile) share one code path —
// no duplicated save/upload/logo logic. Updates the Supabase profiles row (RLS, own
// row) and the logos Storage bucket. Renders two clear sections: Branding + Identity.
import { useState, useRef } from 'react';
import { C, R } from '../theme';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import LogoStudio from './LogoStudio';

const inputStyle = {
  width: '100%', padding: '12px 14px', fontSize: 14, borderRadius: R.ctrl,
  border: `1px solid ${C.rule}`, background: C.paper, color: C.ink, outline: 'none',
};

const ALLOWED = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg', 'image/webp': 'webp' };
const MAX_BYTES = 2 * 1024 * 1024; // 2MB

const sectionLabel = { display: 'block', fontSize: 11, color: C.inkSoft, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 };

// onClose: when provided (modal), Save closes it. When omitted (page), Save shows an
// inline "Saved" confirmation instead.
export default function ProfileEditorBody({ profile, onSaved, onClose }) {
  const [form, setForm] = useState({
    full_name: profile?.full_name || '',
    brokerage: profile?.brokerage || '',
    phone: profile?.phone || '',
    license_number: profile?.license_number || '',
  });
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

  return (
    <div>
      {error && <div style={{ marginBottom: 14, padding: '10px 14px', background: '#fef2f0', borderRadius: R.ctrl, borderLeft: `3px solid ${C.red}`, fontSize: 13, color: C.ink }}>{error}</div>}

      {/* ── BRANDING ── */}
      <label style={sectionLabel}>Branding</label>
      <div style={{ border: `1px solid ${C.rule}`, borderRadius: R.card, padding: 16, background: C.paperDeep, marginBottom: 10 }}>
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
      <p style={{ fontSize: 11.5, color: C.inkMute, lineHeight: 1.5, marginBottom: studioOpen ? 16 : 26 }}>
        Upload accepts PNG, JPG, SVG, or WebP · under 2MB (PNG/JPG render in the PDF).
      </p>

      {studioOpen && (
        <LogoStudio fullName={form.full_name} brokerage={form.brokerage}
          onChosen={(url, p) => { if (url) setLogoUrl(url); if (p) onSaved?.(p); }} />
      )}

      {/* ── IDENTITY ── */}
      <label style={sectionLabel}>Your details</label>
      {fields.map((f) => (
        <div key={f.k} style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 11, color: C.inkSoft, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>{f.label}</label>
          <input type="text" autoComplete={f.ac} value={form[f.k]} onChange={(e) => set(f.k, e.target.value)} placeholder={f.ph} style={inputStyle} />
        </div>
      ))}
      <p style={{ fontSize: 12, color: C.inkMute, lineHeight: 1.5, marginBottom: 14 }}>
        These appear on PDF exports and email summaries you send to landlord clients. All optional.
      </p>
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
