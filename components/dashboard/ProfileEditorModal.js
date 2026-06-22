// components/dashboard/ProfileEditorModal.js
// Edit the realtor profile (full_name, brokerage, phone, license_number) → update
// the Supabase profiles row (RLS, own row). These appear on PDF exports and
// emails sent to landlord clients.
import { useState } from 'react';
import { C, R } from '../theme';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';

const inputStyle = {
  width: '100%', padding: '12px 14px', fontSize: 14, borderRadius: R.ctrl,
  border: `1px solid ${C.rule}`, background: C.paper, color: C.ink, outline: 'none',
};

export default function ProfileEditorModal({ profile, onClose, onSaved }) {
  const [form, setForm] = useState({
    full_name: profile?.full_name || '',
    brokerage: profile?.brokerage || '',
    phone: profile?.phone || '',
    license_number: profile?.license_number || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

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
        style={{ background: C.paper, maxWidth: 480, width: '100%', maxHeight: '90vh', overflowY: 'auto', border: `1px solid ${C.rule}` }}>
        <div style={{ padding: 'clamp(20px,4vw,28px)', borderBottom: `1px solid ${C.rule}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Realtor profile</div>
            <h3 style={{ fontSize: 22, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em' }}>Your details</h3>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 24, color: C.inkSoft, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: 'clamp(20px,4vw,28px)' }}>
          {error && <div style={{ marginBottom: 14, padding: '10px 14px', background: '#fef2f0', borderRadius: R.ctrl, borderLeft: `3px solid ${C.red}`, fontSize: 13, color: C.ink }}>{error}</div>}
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
