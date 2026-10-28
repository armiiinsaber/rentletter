// components/brand/DoorMark.js
// The door mark: the bar beside the R is a door seen from the side. It swings on a hinge on the
// bar's edge nearest the R, so the panel widens away from the R and never crosses into it.
// Drawn from the official vector source (lib/brand/logoPaths.js): the R and the letters come from
// the paths, the door from the bar's own box. Timing and curves come from lib/motion.js DOOR.
//
// Two versions on one geometry:
//   3d   The door is two HTML faces, each turned by CSS perspective and rotateY around the hinge
//        edge (each face's transform origin). The edge face is the bar itself; the panel face is
//        folded back behind the hinge, seen edge on at rest. The vanishing point sits on the hinge
//        line, so every projected point stays on the door's side of the hinge.
//        Each face carries an ink shade whose opacity rises as the face turns away: depth.
//   svg  One SVG with no 3D transform, for email and GIF export: the bar is scaled from the hinge
//        to the width the 3D door projects to, with a subtle skew at mid swing, sampled from the
//        same timing.
// Under reduced motion the door does not turn: it holds still and its opacity breathes between
// DOOR.breath and 1. The resting pose is the server rendered markup, so the mark reads without
// JavaScript and without animation.
import { useId } from 'react';
import { DOOR } from '../../lib/motion';
import { C } from '../theme';
import { DOOR_GROUNDS, doorGeometry, doorParts, door3dCss, doorFlatCss, flatPose, turn3d, restAngle, shadeEdge, shadePanel, hash, r3, faceRestOpacity } from './doorGeometry';

// ── the component ───────────────────────────────────────────────────────────────────────────────
// kind: wordmark | realtor | admin | paper | ink. size: the cap height (wordmark) or the side (the
// rest), in px. settings: DOOR.defaults' shape. version: '3d' or 'svg'. motion: 'auto' or
// 'reduced'. run: change it to play again.
export default function DoorMark({ kind = 'wordmark', size = 40, settings = DOOR.defaults, version = '3d', motion = 'auto', run = 0 }) {
  const cls = `rd${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const s = { ...DOOR.defaults, ...settings };
  const g = doorGeometry(kind, size, s.open);
  const colours = DOOR_GROUNDS[kind] || DOOR_GROUNDS.wordmark;
  // The animation's name changes with the settings and nothing else: every mark restarts together.
  const name = `${cls}${hash([version, motion, run, s.rest, s.open, s.swingMs, s.pauseMs, s.easing, s.play].join('|'))}`;
  const icon = g.radius !== null;
  const letters = (
    <g transform={g.letters || undefined}>
      <path data-door-r="" d={g.rPath} fill={colours.letter} />
      {g.restPath ? <path d={g.restPath} fill={colours.letter} /> : null}
    </g>
  );
  const ground = icon ? <rect width={g.w} height={g.h} rx={g.radius || undefined} fill={colours.ground} /> : null;
  const A0 = restAngle(s);

  if (version === 'svg') {
    const parts = doorParts(g, s.open);
    const pose = flatPose(A0, parts);
    return (
      <svg className={cls} data-door={kind} data-door-version="svg" width={r3(g.w * g.k)} height={r3(g.h * g.k)} viewBox={`0 0 ${g.w} ${g.h}`}
        role="img" aria-label="Rentletter" focusable="false" style={{ display: 'block', flexShrink: 0, overflow: 'visible', background: icon ? undefined : colours.ground }}>
        <style dangerouslySetInnerHTML={{ __html: doorFlatCss({ cls, name, parts, s, motion }) }} />
        {ground}{letters}
        <g data-door-leaf="">
          <g data-door-flat="" style={{ transform: pose.transform }}>
            <rect data-door-face="flat" x={g.bar.x} y={g.bar.y} width={g.bar.w} height={g.bar.h} rx={g.bar.rx} fill={colours.bar} />
            <rect data-door-shade="flat" x={g.bar.x} y={g.bar.y} width={g.bar.w} height={g.bar.h} rx={g.bar.rx} fill={C.ink} style={{ opacity: pose.shade }} />
          </g>
        </g>
      </svg>
    );
  }

  const px = doorParts(g, s.open, g.k);
  // Each face is its own flat element turned on the hinge line (its right edge, the transform
  // origin and so the vanishing point), with no nested 3D context: WebKit flattens a
  // preserve-3d context and the folded panel would never show. The panel is drawn first, the edge
  // over it: the edge is always the nearer face.
  const face = { position: 'absolute', top: r3(px.hy), height: r3(px.h), fontSize: r3(px.h), borderRadius: r3(px.rx), background: colours.bar, transformOrigin: '100% 50%' };
  const shade = { position: 'absolute', inset: 0, borderRadius: 'inherit', background: C.ink };
  return (
    <div className={cls} data-door={kind} data-door-version="3d" role="img" aria-label="Rentletter"
      style={{ position: 'relative', width: r3(g.w * g.k), height: r3(g.h * g.k), flexShrink: 0, background: icon ? undefined : colours.ground }}>
      <style dangerouslySetInnerHTML={{ __html: door3dCss({ cls, name, s, motion }) }} />
      <svg width={r3(g.w * g.k)} height={r3(g.h * g.k)} viewBox={`0 0 ${g.w} ${g.h}`} aria-hidden="true" focusable="false"
        style={{ position: 'absolute', left: 0, top: 0, display: 'block', overflow: 'visible' }}>
        {ground}{letters}
      </svg>
      <div data-door-leaf="" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div data-door-face="panel" style={{ ...face, left: r3(px.hx - px.W), width: r3(px.W), transform: turn3d(A0 - 90), opacity: faceRestOpacity(s, 'panel') }}>
          <div data-door-shade="panel" style={{ ...shade, opacity: shadePanel(A0) }} />
        </div>
        <div data-door-face="edge" style={{ ...face, left: r3(px.hx - px.t), width: r3(px.t), transform: turn3d(A0), opacity: faceRestOpacity(s, 'edge') }}>
          <div data-door-shade="edge" style={{ ...shade, opacity: shadeEdge(A0) }} />
        </div>
      </div>
    </div>
  );
}
