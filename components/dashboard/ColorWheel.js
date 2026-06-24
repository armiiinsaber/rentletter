// components/dashboard/ColorWheel.js
// Lightweight, dependency-free HSV colour wheel (canvas) + brightness slider.
// Hue = angle, saturation = radius, value = slider. Controlled by a hex `value`,
// emits hex via onChange. Mouse + touch. No heavy deps.
import { useRef, useEffect, useState, useCallback } from 'react';
import { C, R } from '../theme';

function hsvToRgb(h, s, v) {
  h = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
const hex2 = (n) => n.toString(16).padStart(2, '0');
export const hsvToHex = ([h, s, v]) => { const [r, g, b] = hsvToRgb(h, s, v); return `#${hex2(r)}${hex2(g)}${hex2(b)}`; };

export function hexToHsv(hex) {
  if (!/^#?[0-9a-fA-F]{6}$/.test(String(hex || ''))) return null;
  const m = hex.replace(/^#/, '');
  const r = parseInt(m.slice(0, 2), 16) / 255, g = parseInt(m.slice(2, 4), 16) / 255, b = parseInt(m.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
}

export default function ColorWheel({ value, onChange, size = 150, disabled }) {
  const canvasRef = useRef(null);
  const [hsv, setHsv] = useState(() => hexToHsv(value) || [210, 0.7, 0.45]);
  const dragging = useRef(false);

  // Sync from the controlled value when it changes externally (hex input, preset…).
  useEffect(() => {
    const ext = hexToHsv(value);
    if (ext && hsvToHex(ext).toLowerCase() !== hsvToHex(hsv).toLowerCase()) setHsv(ext);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Draw the hue/saturation wheel at the current brightness (value).
  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext('2d');
    const R0 = size / 2;
    const img = ctx.createImageData(size, size);
    const d = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - R0, dy = y - R0;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const i = (y * size + x) * 4;
        if (dist <= R0) {
          let h = Math.atan2(dy, dx) * 180 / Math.PI; if (h < 0) h += 360;
          const s = Math.min(dist / R0, 1);
          const [r, g, b] = hsvToRgb(h, s, hsv[2]);
          d[i] = r; d[i + 1] = g; d[i + 2] = b;
          d[i + 3] = dist > R0 - 1 ? Math.round(255 * (R0 - dist + 1)) : 255; // soft edge
        } else { d[i + 3] = 0; }
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [hsv[2], size]);

  const commit = (next) => { setHsv(next); onChange?.(hsvToHex(next)); };

  const pick = useCallback((clientX, clientY) => {
    const cv = canvasRef.current; if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const R0 = rect.width / 2;
    const dx = clientX - rect.left - R0, dy = clientY - rect.top - R0;
    let h = Math.atan2(dy, dx) * 180 / Math.PI; if (h < 0) h += 360;
    const s = Math.min(Math.sqrt(dx * dx + dy * dy) / R0, 1);
    commit([h, s, hsv[2]]);
  }, [hsv]);

  const onDown = (e) => {
    if (disabled) return;
    dragging.current = true;
    const p = e.touches ? e.touches[0] : e;
    pick(p.clientX, p.clientY);
  };
  useEffect(() => {
    const move = (e) => { if (!dragging.current) return; const p = e.touches ? e.touches[0] : e; pick(p.clientX, p.clientY); if (e.touches) e.preventDefault(); };
    const up = () => { dragging.current = false; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); window.removeEventListener('touchmove', move); window.removeEventListener('touchend', up); };
  }, [pick]);

  // Marker position
  const R0 = size / 2;
  const mx = R0 + Math.cos(hsv[0] * Math.PI / 180) * hsv[1] * R0;
  const my = R0 + Math.sin(hsv[0] * Math.PI / 180) * hsv[1] * R0;
  const fullHue = hsvToHex([hsv[0], hsv[1], 1]);

  return (
    <div style={{ width: size, opacity: disabled ? 0.5 : 1 }}>
      <div style={{ position: 'relative', width: size, height: size, touchAction: 'none' }}>
        <canvas ref={canvasRef} width={size} height={size}
          onMouseDown={onDown} onTouchStart={onDown}
          style={{ width: size, height: size, borderRadius: '50%', cursor: disabled ? 'not-allowed' : 'crosshair', display: 'block', boxShadow: `inset 0 0 0 1px ${C.ruleDark}` }} />
        <span aria-hidden="true" style={{ position: 'absolute', left: mx - 7, top: my - 7, width: 14, height: 14, borderRadius: '50%', background: hsvToHex(hsv), border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.4)', pointerEvents: 'none' }} />
      </div>
      {/* Brightness */}
      <input type="range" min={0} max={100} value={Math.round(hsv[2] * 100)} disabled={disabled}
        onChange={(e) => commit([hsv[0], hsv[1], Number(e.target.value) / 100])}
        aria-label="Brightness"
        style={{ width: size, marginTop: 8, accentColor: fullHue, background: `linear-gradient(90deg, #000, ${fullHue})`, borderRadius: 999, height: 8, appearance: 'none', WebkitAppearance: 'none', outline: 'none', cursor: disabled ? 'not-allowed' : 'pointer' }} />
    </div>
  );
}
