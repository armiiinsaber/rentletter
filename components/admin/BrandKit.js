// components/admin/BrandKit.js
// The brand kit on the admin mockups page (pages/admin/mockups.js): one pill for the whole kit as
// a zip, then a card per asset, grouped as the kit's folders are, each on the ground it is made
// for, with a pill per format that downloads that one file. Everything comes from the kit's
// manifest (public/brand/kit/manifest.json, written by npm run brand:kit), so the page never lists
// a file the kit does not have.
// Downloads: in a browser tab every pill is a link with the download attribute, and the file
// saves. In the installed admin app (standalone, no browser chrome) a download would open in the
// app window with no way back (the trap fixed for the report PDF, components/dashboard/
// ListingView.js), so there the file goes to the share sheet, or opens in a new window where the
// share sheet is not offered. Share needs the tap itself: when fetching the file outlasts the tap,
// the pill turns to Share and the next tap shares it.
import { useRef, useState } from 'react';
import KIT from '../../public/brand/kit/manifest.json';
import { C, R, FONT } from '../theme';
import { isStandalone } from '../../lib/standalone';

const BASE = '/brand/kit';
const urlOf = (p) => (p.startsWith('../') ? `${BASE}/${p.slice(3)}` : `${BASE}/${KIT.folder}/${p}`);
const TYPES = { svg: 'image/svg+xml', png: 'image/png', pdf: 'application/pdf', zip: 'application/zip', json: 'application/json', css: 'text/css', txt: 'text/plain', ttf: 'font/ttf', woff2: 'font/woff2' };
const typeOf = (name) => TYPES[name.split('.').pop()] || 'application/octet-stream';
export const sizeLabel = (bytes) => (bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`);
const GROUND = { paper: C.paper, ink: C.inst, white: C.card };
// Pill columns: rows split evenly (seven as four and three, five as three and two), never fewer
// than three, so a lone pill is a third of the card, not all of it.
export const pillColumns = (n) => (n <= 3 ? 3 : Math.ceil(n / Math.ceil(n / 4)));

function useDeliver() {
  const [state, setState] = useState({}); // url -> 'busy' | 'share'
  const ready = useRef(new Map()); // url -> File, fetched, waiting for the second tap
  const mark = (url, v) => setState((s) => { const n = { ...s }; if (v) n[url] = v; else delete n[url]; return n; });
  const deliver = async (e, url, name) => {
    const browserSaves = typeof window !== 'undefined' && 'download' in window.HTMLAnchorElement.prototype;
    if (!isStandalone() && browserSaves) return; // the link's own download attribute saves it
    e.preventDefault();
    const canShare = typeof navigator.share === 'function' && typeof navigator.canShare === 'function';
    if (!canShare) { window.open(url, '_blank', 'noopener'); return; }
    let file = ready.current.get(url);
    if (!file) {
      mark(url, 'busy');
      try { const blob = await (await fetch(url)).blob(); file = new window.File([blob], name, { type: typeOf(name) }); }
      catch (err) { mark(url, null); window.open(url, '_blank', 'noopener'); return; }
    }
    if (!navigator.canShare({ files: [file] })) { ready.current.delete(url); mark(url, null); window.open(url, '_blank', 'noopener'); return; }
    try { await navigator.share({ files: [file], title: name }); ready.current.delete(url); mark(url, null); }
    catch (err) {
      if (err && err.name === 'NotAllowedError') { ready.current.set(url, file); mark(url, 'share'); }
      else { ready.current.delete(url); mark(url, null); } // the sheet was closed
    }
  };
  return { state, deliver };
}

export default function BrandKit() {
  const { state, deliver } = useDeliver();
  const zipUrl = `${BASE}/${KIT.zip.path}`;
  const label = (url, text) => (state[url] === 'busy' ? 'Preparing' : state[url] === 'share' ? 'Share' : text);
  const files = KIT.files.length;
  return (
    <section className="bk" aria-labelledby="bk-title" id="brand-kit">
      <div className="ad-eyebrow">Brand kit</div>
      <h2 id="bk-title" className="bk-h2">Logos, marks, colour and type.</h2>
      <div className="bk-main">
        <a className="bk-primary" href={zipUrl} download={KIT.zip.path} onClick={(e) => deliver(e, zipUrl, KIT.zip.path)} aria-label={`Download brand kit, ${sizeLabel(KIT.zip.size)}`} data-kit-zip="">
          {label(zipUrl, 'Download brand kit')}
        </a>
        <span className="bk-size ad-num">{`${sizeLabel(KIT.zip.size)} zip, ${files} files`}</span>
      </div>
      {KIT.groups.map((g) => (
        <div key={g.key} className="bk-group">
          <h3 className="bk-h3">{g.title}</h3>
          <div className="bk-grid">
            {g.items.map((it) => (
              <article key={it.key} className="bk-card" data-kit-item={`${g.key}/${it.key}`}>
                <div className={`bk-prev bk-prev-${g.key}`} style={{ background: GROUND[it.ground] || C.paper }}>
                  <img src={urlOf(it.preview)} alt="" decoding="async" />
                </div>
                <h4 className="bk-h4">{it.title}</h4>
                <p className="bk-note">{it.note}</p>
                {it.rows.map((row, ri) => (
                  <div key={ri} className="bk-row">
                    {row.label ? <div className="bk-rowlabel">{row.label}</div> : null}
                    <div className="bk-pills" style={{ gridTemplateColumns: `repeat(${pillColumns(row.formats.length)}, minmax(0, 1fr))` }}>
                      {row.formats.map((f) => {
                        const url = urlOf(f.path);
                        return (
                          <a key={f.path} className="bk-pill ad-num" href={url} download={f.file} onClick={(e) => deliver(e, url, f.file)}
                            aria-label={`${it.title}${row.label ? `, ${row.label}` : ''}, ${/^\d+$/.test(f.label) ? `PNG ${f.label} pixels` : f.label}`} title={`${f.file}, ${sizeLabel(f.size)}`}>
                            {label(url, f.label)}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </article>
            ))}
          </div>
        </div>
      ))}
      <style jsx global>{`
        .bk { margin: 0 0 40px; }
        .bk-h2 { font-family: ${FONT.serif}; font-weight: 600; font-size: 22px; line-height: 1.15; letter-spacing: -0.015em; color: ${C.instText}; margin: 0; text-wrap: balance; }
        .bk-main { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; margin-top: 16px; }
        .bk-primary { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 20px; border-radius: ${R.pill}px; background: ${C.paper}; color: ${C.ink}; font-size: 16px; font-weight: 700; text-decoration: none; }
        .bk-primary:hover { background: ${C.card}; }
        .bk-size { font-size: 14px; color: ${C.instMute}; line-height: 1.5; }
        .bk-group { margin-top: 32px; }
        .bk-h3 { font-family: ${FONT.serif}; font-weight: 600; font-size: 18px; line-height: 1.15; letter-spacing: -0.01em; color: ${C.instText}; margin: 0 0 12px; }
        .bk-grid { display: grid; grid-template-columns: 1fr; gap: 16px; align-items: start; }
        @media (min-width: 720px) { .bk-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (min-width: 1100px) { .bk-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
        .bk-card { background: ${C.instRaise}; border: 1px solid ${C.instRule}; border-radius: ${R.card}px; padding: 16px; min-width: 0; }
        .bk-prev { position: relative; aspect-ratio: 16 / 9; border-radius: ${R.ctrl}px; border: 1px solid ${C.instRule}; overflow: hidden; }
        .bk-prev img { position: absolute; inset: 12% 11%; width: 78%; height: 76%; object-fit: contain; }
        .bk-prev-mark img { inset: 18%; width: 64%; height: 64%; }
        .bk-prev-social img { inset: 13%; width: 74%; height: 74%; }
        .bk-prev-colour img, .bk-prev-type img, .bk-prev-guidelines img { inset: 8px; width: calc(100% - 16px); height: calc(100% - 16px); }
        .bk-h4 { font-family: ${FONT.sans}; font-size: 16px; font-weight: 600; line-height: 1.3; color: ${C.instText}; margin: 12px 0 0; }
        .bk-note { font-size: 14px; line-height: 1.5; color: ${C.instMute}; margin: 8px 0 0; text-wrap: pretty; }
        .bk-row { margin-top: 12px; }
        .bk-rowlabel { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${C.instMute}; line-height: 1; margin-bottom: 8px; }
        .bk-pills { display: grid; gap: 8px; }
        .bk-pill { display: flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 12px; border-radius: ${R.pill}px; border: 1px solid rgba(250, 248, 243, 0.24); color: ${C.instText}; font-size: 14px; font-weight: 600; text-decoration: none; white-space: nowrap; }
        .bk-pill:hover { background: rgba(250, 248, 243, 0.08); }
        .bk-pill:focus-visible, .bk-primary:focus-visible { outline: 2px solid ${C.instText}; outline-offset: 2px; }
      `}</style>
    </section>
  );
}
