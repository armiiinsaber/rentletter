// components/dashboard/ProfileEditorModal.js
// Thin modal wrapper around ProfileEditorBody (the shared identity + branding editor).
// The profile hub page (/profile) renders the same body inline — one code path.
import { C, R } from '../theme';
import ProfileEditorBody from './ProfileEditorBody';

export default function ProfileEditorModal({ profile, onClose, onSaved }) {
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
          <ProfileEditorBody profile={profile} onSaved={onSaved} onClose={onClose} />
        </div>
      </div>
    </div>
  );
}
