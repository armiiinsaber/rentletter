// components/apply/fields.js
// The tenant form primitives, shared by /apply/[token] and the profile pages' edit forms. On the
// realtor tokens: the label at --t-eyebrow with no colon, a 44px bordered input at 16px (no iOS
// zoom), the hint and the error at --t-body-2. Classes come from ProfileStyles
// (components/tenant/ProfileFacts.js), which every page that mounts these renders once.
import { useId } from 'react';
import { C } from '../theme';
import { noWidow } from '../../lib/typeset';

const Label = ({ children, required, htmlFor }) => (
  <label htmlFor={htmlFor} className="mp-label" style={{ display: 'block' }}>{children}{required && <span aria-hidden="true" style={{ marginLeft: 4 }}>*</span>}</label>
);
const Under = ({ error, hint }) => (error
  ? <div role="alert" className="mp-alert" style={{ marginTop: 'var(--gap-line)' }}>{noWidow(error)}</div>
  : hint ? <div className="mp-note" style={{ marginTop: 'var(--gap-line)' }}>{noWidow(hint)}</div> : null);

export function Field({ label, value, onChange, onBlur, placeholder, type = 'text', required, error, hint, inputMode }) {
  const id = useId();
  return (
    <div>
      <Label required={required} htmlFor={id}>{label}</Label>
      <input id={id} type={type} inputMode={inputMode} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} onBlur={onBlur}
        aria-required={required || undefined} aria-invalid={error ? true : undefined} className="mp-input"
        style={{ marginTop: 'var(--gap-line)', borderColor: error ? C.danger : undefined }} />
      <Under error={error} hint={hint} />
    </div>
  );
}

export function Textarea({ label, value, onChange, placeholder }) {
  const id = useId();
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3} className="mp-input"
        style={{ marginTop: 'var(--gap-line)', padding: 'var(--s-3)', resize: 'vertical', lineHeight: 'var(--lh-body)' }} />
    </div>
  );
}

export function SelectField({ label, value, onChange, options }) {
  const id = useId();
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="mp-input" style={{ marginTop: 'var(--gap-line)', appearance: 'none', cursor: 'pointer' }}>
        {options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
    </div>
  );
}

export function ToggleField({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)', minHeight: 44 }}>
      <button type="button" role="switch" aria-checked={!!value} aria-label={label} onClick={() => onChange(!value)}
        style={{ width: 44, height: 24, background: value ? C.ink : C.rule, border: 'none', borderRadius: 12, position: 'relative', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
        <span style={{ position: 'absolute', top: 2, left: value ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: C.paper }} />
      </button>
      <span className="mp-value" style={{ marginTop: 0, cursor: 'pointer', textWrap: 'pretty' }} onClick={() => onChange(!value)}>{noWidow(label)}</span>
    </div>
  );
}
