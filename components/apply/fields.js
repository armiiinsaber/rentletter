// components/apply/fields.js
// The tenant application form primitives — shared by /apply/[token] (first submission) and
// /my-application (editing the saved profile) so both screens feel like one product. Underline
// inputs on paper, 16px text (no iOS zoom), generous 14px vertical padding for tap targets.
import { C, R } from '../theme';

export function FormSection({ num, title, required, children }) {
  return (
    <div className="rl-in" style={{ marginBottom: 40, paddingBottom: 40, borderBottom: `1px solid ${C.rule}` }}>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'baseline', gap: 14 }}>
        <span style={{ fontSize: 13, color: C.inkMute, fontWeight: 500 }}>{num}</span>
        <h3 style={{ fontSize: 20, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em' }}>{title}</h3>
        {required && <span style={{ fontSize: 11, color: C.inkMute, fontWeight: 500 }}>Required</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>{children}</div>
    </div>
  );
}

export function Field({ label, value, onChange, onBlur, placeholder, type = 'text', required, error, hint, inputMode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, color: C.inkSoft, marginBottom: 8, fontWeight: 500 }}>
        {label}{required && <span aria-hidden="true" style={{ color: C.red, fontWeight: 700, marginLeft: 4 }}>*</span>}
      </label>
      <input type={type} inputMode={inputMode} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        aria-required={required || undefined} aria-invalid={error ? true : undefined}
        style={{ width: '100%', padding: '14px 0', fontSize: 16, border: 'none', borderBottom: `1px solid ${error ? C.red : C.rule}`, background: 'transparent', color: C.ink, outline: 'none', transition: 'border-color 0.2s' }}
        onFocus={(e) => (e.target.style.borderBottomColor = C.ink)}
        onBlur={(e) => { e.target.style.borderBottomColor = error ? C.red : C.rule; onBlur && onBlur(); }} />
      {error
        ? <div style={{ fontSize: 12, color: C.red, marginTop: 6, lineHeight: 1.5 }}>{error}</div>
        : hint ? <div style={{ fontSize: 12, color: C.inkMute, marginTop: 6, lineHeight: 1.5 }}>{hint}</div> : null}
    </div>
  );
}

export function Textarea({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, color: C.inkSoft, marginBottom: 8, fontWeight: 500 }}>{label}</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3}
        style={{ width: '100%', padding: '14px 0', fontSize: 16, border: 'none', borderBottom: `1px solid ${C.rule}`, background: 'transparent', color: C.ink, outline: 'none', resize: 'vertical', fontFamily: "'Inter', sans-serif", lineHeight: 1.5, transition: 'border-color 0.2s' }}
        onFocus={(e) => (e.target.style.borderBottomColor = C.ink)}
        onBlur={(e) => (e.target.style.borderBottomColor = C.rule)} />
    </div>
  );
}

export function SelectField({ label, value, onChange, options }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, color: C.inkSoft, marginBottom: 8, fontWeight: 500 }}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', padding: '14px 0', fontSize: 16, border: 'none', borderBottom: `1px solid ${C.rule}`, background: 'transparent', color: C.ink, outline: 'none', appearance: 'none', fontFamily: "'Inter', sans-serif", cursor: 'pointer' }}
        onFocus={(e) => (e.target.style.borderBottomColor = C.ink)}
        onBlur={(e) => (e.target.style.borderBottomColor = C.rule)}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

export function ToggleField({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0' }}>
      <button type="button" onClick={() => onChange(!value)}
        style={{ width: 44, height: 24, background: value ? C.red : C.rule, border: 'none', borderRadius: 12, position: 'relative', cursor: 'pointer', transition: 'background 0.2s', padding: 0, flexShrink: 0 }}>
        <span style={{ position: 'absolute', top: 2, left: value ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: C.paper, transition: 'left 0.2s' }} />
      </button>
      <span style={{ fontSize: 14, color: C.ink, fontWeight: 500, cursor: 'pointer' }} onClick={() => onChange(!value)}>{label}</span>
    </div>
  );
}
