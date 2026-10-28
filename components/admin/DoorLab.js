// components/admin/DoorLab.js
// The Door section of the admin mockups page (pages/admin/mockups.js): the door mark
// (components/brand/DoorMark.js) on three grounds at once, the wordmark on paper, the realtor app
// icon and the admin app icon, with live controls for the swing, and beside it the loading icon at
// 20, 28 and 44 px on paper and on ink. Copy settings puts the chosen values on the clipboard as
// JSON, to be fixed in lib/motion.js DOOR next. Nothing here ships to a realtor, tenant or landlord.
import { useEffect, useRef, useState } from 'react';
import DoorMark from '../brand/DoorMark';
import { DOOR_OPEN_RANGE, doorGeometry, doorSettingsJson } from '../brand/doorGeometry';
import { DOOR } from '../../lib/motion';
import { noWidow } from '../../lib/typeset';
import { C, R, FONT } from '../theme';

export const DOOR_SWING_RANGE = Object.freeze({ min: 300, max: 1500, step: 50 });
export const DOOR_PAUSE_RANGE = Object.freeze({ min: 0, max: 2000, step: 100 });
export const LOADING_SIZES = Object.freeze([20, 28, 44]);
const ICON_SIZE = 112;
const EASINGS = [['soft', 'Soft'], ['crisp', 'Crisp'], ['weighted', 'Weighted']];

async function writeClipboard(text) {
  try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; } } catch (e) { /* the fallback below */ }
  try {
    const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); document.body.removeChild(ta); return ok;
  } catch (e) { return false; }
}

// The wordmark's cap height for the width its tile gives it, between 24 and 56 px.
function useCap(ref) {
  const [cap, setCap] = useState(36);
  useEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const per = doorGeometry('wordmark', 100, DOOR_OPEN_RANGE.max).w / 100; // box units per cap px
    const read = () => { const w = el.getBoundingClientRect().width - 32; setCap(Math.max(24, Math.min(56, Math.floor(w / per)))); };
    read();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(read) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [ref]);
  return cap;
}

function Chips({ label, options, value, onPick, name, extra = null }) {
  return (
    <div className="dr-field" role="group" aria-label={label}>
      <div className="dr-label"><span>{label}</span></div>
      <div className="dr-chips" style={{ gridTemplateColumns: `repeat(${options.length + (extra ? 1 : 0)}, minmax(0, 1fr))` }}>
        {options.map(([v, text]) => (
          <button key={v} type="button" className={`dr-chip${value === v ? ' on' : ''}`} aria-pressed={value === v} data-door-control={`${name}-${v}`} onClick={() => onPick(v)}>{text}</button>
        ))}
        {extra}
      </div>
    </div>
  );
}
function Slider({ label, value, shown, range, onPick, name }) {
  return (
    <div className="dr-field">
      <div className="dr-label"><span>{label}</span><span className="dr-value ad-num" data-door-value={name}>{shown}</span></div>
      <input type="range" className="dr-range" min={range.min} max={range.max} step={range.step} value={value} aria-label={label} data-door-control={name}
        onChange={(e) => onPick(Number(e.target.value))} />
    </div>
  );
}

export default function DoorLab() {
  const [s, setS] = useState({ ...DOOR.defaults });
  const [version, setVersion] = useState('3d');
  const [reduced, setReduced] = useState(false);
  const [run, setRun] = useState(0);
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);
  const tile = useRef(null);
  const cap = useCap(tile);
  useEffect(() => () => clearTimeout(timer.current), []);
  const set = (k, v) => setS((o) => ({ ...o, [k]: v }));
  const motion = reduced ? 'reduced' : 'auto';
  const mark = { settings: s, version, motion, run };
  const copy = async () => {
    const ok = await writeClipboard(doorSettingsJson(s));
    setCopied(ok); clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 2000);
  };
  return (
    <section className="dr" aria-labelledby="dr-title" id="door" data-door-section="" data-door-settings={JSON.stringify(s)} data-door-motion={motion}>
      <div className="ad-eyebrow">Door</div>
      <h2 id="dr-title" className="dr-h2">The bar beside the R is a door.</h2>
      <p className="dr-note">{noWidow('Seen from the side, it swings on the hinge nearest the R: out to a panel and back, never across the R.')}</p>

      <div className="dr-controls">
        <Chips label="Resting state" name="rest" value={s.rest} onPick={(v) => set('rest', v)} options={[['bar', 'Thin bar'], ['panel', 'Panel']]} />
        <Slider label="Open width" name="open" value={s.open} shown={`${s.open.toFixed(2)} of the R`} range={DOOR_OPEN_RANGE} onPick={(v) => set('open', v)} />
        <Slider label="One swing" name="swing" value={s.swingMs} shown={`${s.swingMs} ms`} range={DOOR_SWING_RANGE} onPick={(v) => set('swingMs', v)} />
        <Slider label="Pause between swings" name="pause" value={s.pauseMs} shown={`${s.pauseMs} ms`} range={DOOR_PAUSE_RANGE} onPick={(v) => set('pauseMs', v)} />
        <Chips label="Easing" name="easing" value={s.easing} onPick={(v) => set('easing', v)} options={EASINGS} />
        <Chips label="Play" name="play" value={s.play} onPick={(v) => { set('play', v); setRun((n) => n + 1); }} options={[['once', 'Once'], ['loop', 'Loop']]}
          extra={<button type="button" className="dr-chip" data-door-control="replay" onClick={() => setRun((n) => n + 1)}>Replay</button>} />
        <Chips label="Version" name="version" value={version} onPick={setVersion} options={[['3d', '3D'], ['svg', 'SVG only']]} />
        <Chips label="Reduced motion" name="reduced" value={reduced ? 'on' : 'off'} onPick={(v) => setReduced(v === 'on')} options={[['off', 'Off'], ['on', 'Preview']]} />
        <div className="dr-field dr-copyrow">
          <button type="button" className="dr-copy" data-door-control="copy" onClick={copy}>{copied ? 'Copied' : 'Copy settings'}</button>
        </div>
      </div>

      <div className="dr-stage">
        <div className="dr-grounds" id="door-grounds">
          <figure className="dr-tile" data-door-tile="wordmark">
            <div className="dr-tile-stage" ref={tile}><DoorMark kind="wordmark" size={cap} {...mark} /></div>
            <figcaption className="dr-cap">Wordmark on paper</figcaption>
          </figure>
          <figure className="dr-tile" data-door-tile="realtor">
            <div className="dr-tile-stage"><DoorMark kind="realtor" size={ICON_SIZE} {...mark} /></div>
            <figcaption className="dr-cap">Realtor app icon</figcaption>
          </figure>
          <figure className="dr-tile" data-door-tile="admin">
            <div className="dr-tile-stage"><DoorMark kind="admin" size={ICON_SIZE} {...mark} /></div>
            <figcaption className="dr-cap">Admin app icon</figcaption>
          </figure>
        </div>
        <div className="dr-loading" data-door-loading="">
          <h3 className="dr-h3">Loading icon</h3>
          <p className="dr-note dr-note-sm">{noWidow('The same mark at the sizes a loading indicator takes, looping.')}</p>
          {['paper', 'ink'].map((ground) => (
            <div key={ground} className="dr-loadrow">
              <div className="dr-rowlabel">{ground === 'paper' ? 'On paper' : 'On ink'}</div>
              <div className="dr-cells">
                {LOADING_SIZES.map((px) => (
                  <figure key={px} className={`dr-cell dr-cell-${ground}`} data-door-cell={`${ground}-${px}`}>
                    <div className="dr-cellbox"><DoorMark kind={ground} size={px} {...mark} settings={{ ...s, play: 'loop' }} /></div>
                    <figcaption className="dr-cellcap ad-num">{px} px</figcaption>
                  </figure>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <style jsx global>{`
        .dr { margin: 0 0 40px; }
        .dr-h2 { font-family: ${FONT.serif}; font-weight: 600; font-size: 22px; line-height: 1.15; letter-spacing: -0.015em; color: ${C.instText}; margin: 0; text-wrap: balance; }
        .dr-h3 { font-family: ${FONT.serif}; font-weight: 600; font-size: 18px; line-height: 1.15; letter-spacing: -0.01em; color: ${C.instText}; margin: 0; text-wrap: balance; }
        .dr-note { font-size: 14px; line-height: 1.5; color: ${C.instMute}; margin: 8px 0 0; max-width: 560px; text-wrap: balance; }
        .dr-note-sm { margin: 6px 0 12px; }
        .dr-controls { display: grid; grid-template-columns: 1fr; gap: 16px; margin-top: 16px; background: ${C.instRaise}; border: 1px solid ${C.instRule}; border-radius: ${R.card}px; padding: 16px; }
        @media (min-width: 720px) { .dr-controls { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (min-width: 1100px) { .dr-controls { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
        .dr-field { min-width: 0; }
        .dr-label { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${C.instMute}; line-height: 1.3; margin-bottom: 8px; }
        .dr-value { font-size: 13px; font-weight: 600; letter-spacing: 0; text-transform: none; color: ${C.instText}; white-space: nowrap; }
        /* One row per control, the chips in equal columns, so a row never breaks onto a second line. */
        .dr-chips { display: grid; gap: 8px; }
        .dr-chip { min-height: 44px; min-width: 0; padding: 0 8px; white-space: nowrap; border-radius: ${R.pill}px; border: 1px solid ${C.instRule}; background: transparent; color: ${C.instText}; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; }
        @media (max-width: 360px) { .dr-chip { font-size: 13px; padding: 0 4px; } }
        .dr-chip.on { background: ${C.instText}; color: ${C.inst}; border-color: ${C.instText}; }
        .dr-chip:focus-visible, .dr-copy:focus-visible, .dr-range:focus-visible { outline: 2px solid ${C.instText}; outline-offset: 2px; }
        .dr-range { display: block; width: 100%; height: 44px; margin: 0; accent-color: ${C.red}; cursor: pointer; }
        .dr-copyrow { display: flex; align-items: flex-end; }
        .dr-copy { min-height: 44px; width: 100%; padding: 0 20px; border-radius: ${R.pill}px; border: 0; background: ${C.paper}; color: ${C.ink}; font-size: 16px; font-weight: 700; cursor: pointer; font-family: inherit; }
        .dr-copy:hover { background: ${C.card}; }
        .dr-stage { display: grid; grid-template-columns: 1fr; gap: 16px; margin-top: 16px; align-items: start; }
        @media (min-width: 1100px) { .dr-stage { grid-template-columns: minmax(0, 3fr) minmax(0, 1.25fr); } }
        .dr-grounds { display: grid; grid-template-columns: 1fr; gap: 16px; scroll-margin-top: 72px; }
        @media (min-width: 720px) { .dr-grounds { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
        .dr-tile { margin: 0; background: ${C.instRaise}; border: 1px solid ${C.instRule}; border-radius: ${R.card}px; padding: 12px; min-width: 0; }
        .dr-tile-stage { display: flex; align-items: center; justify-content: center; min-height: 160px; background: ${C.paper}; border-radius: ${R.ctrl}px; overflow: hidden; }
        .dr-cap { font-size: 14px; font-weight: 600; line-height: 1.3; color: ${C.instText}; margin-top: 10px; }
        .dr-loading { background: ${C.instRaise}; border: 1px solid ${C.instRule}; border-radius: ${R.card}px; padding: 16px; min-width: 0; }
        .dr-loadrow + .dr-loadrow { margin-top: 12px; }
        .dr-rowlabel { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${C.instMute}; line-height: 1.3; margin-bottom: 8px; }
        .dr-cells { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
        .dr-cell { margin: 0; min-width: 0; }
        .dr-cellbox { display: flex; align-items: center; justify-content: center; height: 72px; border-radius: ${R.ctrl}px; border: 1px solid ${C.instRule}; }
        .dr-cell-paper .dr-cellbox { background: ${C.paper}; }
        .dr-cell-ink .dr-cellbox { background: ${C.ink}; }
        .dr-cellcap { font-size: 13px; color: ${C.instMute}; text-align: center; margin-top: 6px; line-height: 1.3; }
      `}</style>
    </section>
  );
}
