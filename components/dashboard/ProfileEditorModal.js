// components/dashboard/ProfileEditorModal.js
// Edit the realtor profile (full_name, brokerage, phone, license_number, logo) →
// update the Supabase profiles row (RLS, own row). The logo uploads to the public
// "logos" Storage bucket at {auth.uid()}/logo.{ext} (RLS: realtor writes own folder)
// and its public URL is saved to profiles.logo_url. Branding appears on the
// landlord report PDF + emails.
import { useState, useRef } from 'react';
import { C, R } from '../theme';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import LogoStudio from './LogoStudio';

const inputStyle = {
  width: '100%', padding: '12px 14px', fontSize: 14, borderRadius: R.ctrl,
  border: `1px solid ${C.rule}`, background: C.paper, color: C.ink, outline: 'none',
};

const ALLOWED = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
};
const MAX_BYTES = 2 * 1024 * 1024; // 2MB

export default function ProfileEditorModal({ profile, onClose, onSaved }) {
  const [form, setForm] = useState({
    full_name: profile?.full_name || '',
    brokerage: profile?.brokerage || '',
    phone: profile?.phone || '',
    license_number: profile?.license_number || '',
  });
  const [logoUrl, setLogoUrl] = useState(profile?.logo_url || '');
  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

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
        .from('logos')
        .upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' });
      if (upErr) { setError('Upload failed: ' + upErr.message); setLogoBusy(false); return; }
      const { data: pub } = supabase.storage.from('logos').getPublicUrl(path);
      // Cache-bust so re-uploads (same path) refresh the preview + report.
      const url = `${pub.publicUrl}?v=${Date.now()}`;
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
      // Best-effort remove all known extensions for this folder.
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
      onClose?.();
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
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,15,16,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(16px,4vw,32px)', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} className="rl-modal"
        style={{ background: C.paper, maxWidth: 540, width: '100%', maxHeight: '90vh', overflowY: 'auto', border: `1px solid ${C.rule}` }}>
        <div style={{ padding: 'clamp(20px,4vw,28px)', borderBottom: `1px solid ${C.rule}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Realtor profile</div>
            <h3 style={{ fontSize: 22, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em' }}>Your details &amp; branding</h3>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 24, color: C.inkSoft, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: 'clamp(20px,4vw,28px)' }}>
          {error && <div style={{ marginBottom: 14, padding: '10px 14px', background: '#fef2f0', borderRadius: R.ctrl, borderLeft: `3px solid ${C.red}`, fontSize: 13, color: C.ink }}>{error}</div>}

          {/* Logo / branding */}
          <label style={{ display: 'block', fontSize: 11, color: C.inkSoft, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Logo</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6, flexWrap: 'wrap' }}>
            <div style={{ width: 64, height: 64, borderRadius: R.ctrl, border: `1px solid ${C.rule}`, background: C.paperDeep, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
              {logoUrl
                ? <img src={logoUrl} alt="Logo preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                : <span style={{ fontSize: 11, color: C.inkMute }}>No logo</span>}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; uploadLogo(f); e.target.value = ''; }} />
              <button onClick={() => fileRef.current?.click()} disabled={logoBusy}
                style={{ background: C.ink, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: logoBusy ? 'wait' : 'pointer' }}>
                {logoBusy ? 'Working…' : logoUrl ? 'Replace logo' : 'Upload logo'}
              </button>
              {logoUrl && (
                <button onClick={removeLogo} disabled={logoBusy}
                  style={{ background: 'transparent', color: C.red, border: `1px solid ${C.red}`, borderRadius: R.ctrl, padding: '10px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Remove
                </button>
              )}
            </div>
          </div>
          <p style={{ fontSize: 12, color: C.inkMute, lineHeight: 1.5, marginBottom: 16 }}>
            PNG, JPG, SVG, or WebP · under 2MB. Appears on your landlord report (PNG/JPG render in the PDF).
          </p>

          {/* AI logo studio — generate a logo instead of (or alongside) uploading one */}
          <LogoStudio onChosen={(url, p) => { if (url) setLogoUrl(url); if (p) onSaved?.(p); }} />

          {fields.map((f) => (
            <div key={f.k} style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, color: C.inkSoft, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>{f.label}</label>
              <input type="text" autoComplete={f.ac} value={form[f.k]} onChange={(e) => set(f.k, e.target.value)} placeholder={f.ph} style={inputStyle} />
            </div>
          ))}
          <p style={{ fontSize: 12, color: C.inkMute, lineHeight: 1.5, marginBottom: 14 }}>
            These appear on PDF exports and email summaries you send to landlord clients. All optional.
          </p>
          <button onClick={save} disabled={saving}
            style={{ width: '100%', background: C.red, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '14px', fontSize: 14, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
