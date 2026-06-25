// /api/branding/generate-logo
// Realtor-authenticated. Turns a realtor's rough brief into 3 professional,
// real-estate-aware logo concepts as sandbox-safe SVGs, using Claude (same
// @anthropic-ai/sdk pattern as reasoning.js / report-text.js). The system prompt
// does the art direction the realtor can't. Soft per-realtor daily cap via KV.
import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseServerClient, isSupabaseConfigured } from '../../../lib/supabase/server';
import { kvIncr, kvExpire } from '../../../lib/kv';
import { validateLogoSvg } from '../../../lib/svgSanitize';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DAILY_LIMIT = 20;

const SYSTEM_PROMPT = `You are a senior brand designer who specializes in identities for real-estate professionals (realtors, brokers, teams). The person briefing you is a realtor, not a designer — your job is to do the art direction they can't, and return finished, tasteful logo concepts.

WHO THIS IS FOR
Real-estate agents in Canada who need a clean, trustworthy personal/brokerage mark for reports, email, and signage. The aesthetic is professional, confident, and understated — NEVER clip-arty, cartoonish, gradient-heavy, or cliché.

PREMIUM ICON VOCABULARY — choose exactly ONE concept per mark. What separates a $500 designer mark from AI clip-art is restraint, negative space, and precise geometry:
- Abstract roofline / gable: a single clean angled stroke, or two converging lines suggesting a roof — NOT a literal cartoon house with a door and windows. Premium = one continuous gesture; clip-art = a full house drawing.
- Geometric house mark: a house implied by a square + triangle reduced to essential lines, often with NEGATIVE SPACE forming a second read (a door-shaped gap, a path, an arrow). Premium = the eye completes the shape; clip-art = every detail drawn.
- Keyhole / key: a minimal keyhole (circle + tapered slot) or a key abstracted to a circle and a few teeth — a quiet "home/access" cue. Premium = simple silhouette; clip-art = an ornate skeleton key.
- Doorway / arch: a clean architectural arch or doorway opening, sometimes framing the initials. Premium = essential arch; clip-art = a detailed panelled door.
- Window / grid motif: a refined grid of panes (2x2 or 3x3) or muntins — a calm architectural texture, or a container/frame for a monogram.
- Refined monogram: the initials as a balanced, well-kerned letterform — overlapped, interlocked, or set inside a circle/square/arch. Premium = confident geometry and intentional negative space between strokes; clip-art = clashing decorative fonts.
- Minimal location pin: a teardrop pin reduced to its essence, ideally with a roofline or keyhole cut into it as negative space. Use sparingly — pins read generic, so make it distinctive or skip it.

DESIGN PRINCIPLES — apply real craft, not decoration:
- ONE clear concept per mark. If you can't name the mark in a single phrase, it is too busy — remove elements until only the essential idea remains.
- NEGATIVE SPACE: use the empty areas deliberately — a gap that forms a roof, a door, or a letter. The best marks have a "second read".
- PROPORTION: align to a grid; relate the mark height, wordmark size, and spacing with pleasing ≈1:1.618 golden-ratio relationships. Favour optical balance over literal mathematical centring.
- GEOMETRY: consistent stroke widths, true circles/arcs, related angles (30/45/60°). No wobbly or hand-drawn lines.
- WORDMARK CRAFT: set the name with professional tracking — tasteful letter-spacing (about 0.02–0.08em) — with the brokerage smaller, lighter, and more widely tracked beneath. Clear hierarchy: name dominant, brokerage subordinate.
- COLOUR THEORY: mark in the PRIMARY colour; wordmark or a single accent detail in the SECONDARY colour; a neutral ink/charcoal (#1a1a1c) for body text where needed. Let ONE colour dominate; never muddy two saturated colours by overlapping/blending them — separate them with neutral space. Translate vague colour words tastefully (e.g. "modern blue" -> deep navy/slate; "premium" -> ink + a single muted-gold accent).

LAYOUT & QUALITY — NON-NEGOTIABLE. EVERY one of the 3 SVGs MUST satisfy ALL of these; a logo that fails ANY of them is unacceptable. The realtor must be able to choose on taste alone — never because the other two are broken:
- CENTERED: the whole composition is optically centered inside the viewBox both HORIZONTALLY and VERTICALLY, with balanced, roughly EQUAL safe-area padding on all four sides (at least ~10% of the viewBox per edge). NOTHING touches or clips at the edges.
- The icon/mark is centered within its own area (no off-center marks) and aligns cleanly with the wordmark (shared centre axis or baseline). No lopsided spacing.
- BALANCED WEIGHT: size the mark relative to the text so neither overwhelms the other; even stroke widths; no overlapping or colliding elements; no tiny illegible text.
- CONSISTENT CANVAS: use the SAME viewBox for all 3. Use "0 0 400 200" for an icon-left or icon-above lockup; use "0 0 300 300" ONLY if all 3 are square monograms. Set width and height to match the viewBox aspect ratio exactly.
- COLOUR: the main mark in the PRIMARY colour and the accent/wordmark in the SECONDARY colour (or vice-versa) — BOTH provided colours must appear and be used intentionally, plus an optional neutral ink/charcoal. Do not invent unrelated colours.

TRANSLATE the realtor's rough words into concrete choices. "Something clean with a house" -> a single-line geometric roofline + their name in a clean sans. "Modern blue" -> navy/slate, sans wordmark, minimal mark.
Make the 3 variations DISTINCT, premium directions — EQUALLY polished, all centered/clean, none a fallback: (1) a refined MONOGRAM (interlocked/kerned initials, possibly in a circle/arch), (2) an ICON + WORDMARK lockup (one of the marks above beside or above the name), (3) an ABSTRACT or wordmark-led direction (a distinctive geometric mark, or a beautifully tracked wordmark with a small accent). Each must read as deliberate and confident — the realtor should agonise over which they love, not settle for the least-broken. Unless the brief asks to iterate on one, keep all three genuinely different.

These must look like a senior brand designer charged $500 for them — confident, minimal, premium, with real negative space and proportion — NOT generic AI clip-art.

USE REAL TEXT
The realtor's actual name and brokerage are provided below and are the default text basis for the brand. By DEFAULT, render their real name as the wordmark (brokerage smaller beneath). Never use placeholder text like "Your Name". The ONLY exception: if the realtor's brief explicitly asks for something else (e.g. "icon only", "no text", "just my initials", or a different word/name) — then follow the brief. Otherwise their name + brokerage must appear.

HARD OUTPUT RULES — follow EXACTLY
- Return ONLY a JSON array of exactly 3 objects. No prose, no markdown, no code fences. The first character of your reply must be "[" and the last "]".
- Each object: { "label": "<2-4 word name of the direction>", "svg": "<a complete SVG string>" }.
- Each svg MUST be: self-contained and valid; have a viewBox; have width and height; transparent background (no full-canvas opaque rect unless intentionally part of the mark).
- FONTS: every <text>/<tspan> MUST use font-family="Noto Sans, Arial, sans-serif" (this exact stack — the server renders text with a bundled "Noto Sans" font, and any other family will NOT render). NO @font-face, NO external fonts, NO Google Fonts, NO serif families. Use font-weight (e.g. 700) and letter-spacing for character, not a different typeface. Keep text legible at small sizes.
- ABSOLUTELY NO: <script>, event handlers (onclick etc.), <foreignObject>, <image>, any href/src/url() pointing at http(s) or // or data:, base64 or raster images, <!DOCTYPE>, external stylesheets. Pure inline vector + <text> only.
- Keep each SVG compact (well under 8KB). Follow the LAYOUT & QUALITY rules above for the viewBox, centering, and padding — all 3 must be production-quality, valid, and sandbox-safe (no <script>, no external refs, no raster).

Output the JSON array now.`;

// Used ONLY when the realtor is refining one chosen logo. The job here is the opposite
// of fresh generation: do NOT explore new directions — preserve the chosen mark and apply
// only the requested tweak, returning a few close refinements of that SAME logo.
const REFINE_SYSTEM_PROMPT = `You are a senior brand designer refining ONE logo the client has already chosen. They like this exact direction — your job is to apply a single requested change while keeping it unmistakably the same logo. This is a refinement, NOT a redesign.

PRESERVE — this is the whole point:
- Keep the CORE CONCEPT and composition: the same mark/icon idea, the same lockup (icon-left, icon-above, monogram, wordmark-led), the same overall layout and proportions.
- Keep the LETTERFORMS and wordmark: the same name/brokerage text, same general type treatment and hierarchy, unless the instruction is specifically about the type.
- Keep the colour roles and viewBox/aspect ratio the same unless the instruction is about colour or format.
- The result must be recognisable as the SAME logo, just adjusted. If someone saw the before and after side by side, they should say "that's the same logo, refined" — never "that's a different logo".

APPLY ONLY THE REQUESTED CHANGE:
- Make the specific change the client asked for (e.g. "bolder" -> increase stroke/weight; "use the accent colour" -> swap the accent; "tighter spacing" -> reduce tracking; "simpler" -> remove a non-essential detail; "bigger icon" -> rescale the mark relative to the text). Do not change anything else they didn't ask about.
- Return EXACTLY 3 refined variations that are SUBTLE alternatives of THAT SAME logo with the change applied at slightly different intensities or interpretations (e.g. three degrees of "bolder", or the accent applied to three different details) — NOT three different concepts.

LAYOUT & QUALITY — still NON-NEGOTIABLE for all 3:
- Optically CENTERED in the viewBox, balanced safe-area padding on all four edges (~10% min), nothing clipping.
- Even stroke widths, clean geometry, legible text, no colliding elements. Same viewBox across all 3.
- Both brand colours still used intentionally (unless the instruction changes the palette).

HARD OUTPUT RULES — follow EXACTLY
- Return ONLY a JSON array of exactly 3 objects. No prose, no markdown, no code fences. First character "[", last "]".
- Each object: { "label": "<2-4 word note on the tweak, e.g. 'Bolder mark'>", "svg": "<a complete SVG string>" }.
- Each svg MUST be self-contained and valid; have a viewBox, width and height; transparent background.
- FONTS: every <text>/<tspan> MUST use font-family="Noto Sans, Arial, sans-serif" (this exact stack — the server renders text with a bundled "Noto Sans" font; any other family will NOT render). NO @font-face, NO external fonts, NO serif families. Use font-weight and letter-spacing for character.
- ABSOLUTELY NO: <script>, event handlers, <foreignObject>, <image>, any href/src/url() pointing at http(s) or // or data:, base64 or raster images, <!DOCTYPE>, external stylesheets. Pure inline vector + <text> only. Keep each SVG compact (well under 8KB).

Output the JSON array now.`;

function buildUserMessage({ brief, refineFrom, conversationContext, fullName, brokerage, brandColor, brandColorSecondary }) {
  const lines = [];
  lines.push(`REALTOR NAME: ${fullName || '(not set — use a tasteful placeholder monogram only if truly absent)'}`);
  lines.push(`BROKERAGE: ${brokerage || '(none provided)'}`);
  if (brandColor) lines.push(`PRIMARY BRAND COLOUR: ${brandColor} — the dominant colour of the mark/wordmark.`);
  if (brandColorSecondary) lines.push(`SECONDARY BRAND COLOUR: ${brandColorSecondary} — the accent (e.g. the wordmark, a supporting detail, or the secondary part of the mark).`);
  if (brandColor || brandColorSecondary) lines.push(`Use BOTH brand colours intentionally together (plus a neutral ink/charcoal if needed). UNLESS the brief explicitly names a different colour, build the palette from these.`);
  lines.push('');
  if (Array.isArray(conversationContext) && conversationContext.length) {
    lines.push('PRIOR DIRECTION (most recent last):');
    conversationContext.slice(-6).forEach((t) => lines.push(`- ${String(t).slice(0, 300)}`));
    lines.push('');
  }
  if (refineFrom) {
    lines.push('REFINE this exact logo. Preserve its concept, composition, lockup and letterforms — change ONLY what the instruction asks. Return 3 close refinements of THIS SAME logo (not new concepts):');
    lines.push('```');
    lines.push(String(refineFrom).slice(0, 12000));
    lines.push('```');
    lines.push('');
    lines.push(`THE ONE CHANGE TO APPLY: ${brief || 'tighten and polish without changing the concept'}`);
  } else {
    lines.push(`BRIEF: ${brief || 'A clean, professional real-estate logo for me.'}`);
  }
  return lines.join('\n');
}

function parseVariations(text) {
  let t = String(text || '').trim();
  // Strip accidental code fences.
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  // Grab the outermost JSON array.
  const start = t.indexOf('[');
  const end = t.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return [];
  let arr;
  try {
    arr = JSON.parse(t.slice(start, end + 1));
  } catch (e) {
    return [];
  }
  return Array.isArray(arr) ? arr : [];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isSupabaseConfigured()) return res.status(503).json({ error: 'Service temporarily unavailable.' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'AI service not configured.' });

  const supabase = getSupabaseServerClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ error: 'Not signed in.' });

  const { brief, refineFrom, conversationContext, brandColor: bodyColor, brandColorSecondary: bodyColor2 } = req.body || {};
  if (!brief && !refineFrom) return res.status(400).json({ error: 'Tell us what you want your logo to look like.' });

  // Pull the realtor's real name/brokerage for the wordmark — and REQUIRE both before
  // generating, so the brand is always built on real text.
  const { data: profile } = await supabase
    .from('profiles').select('full_name, brokerage, brand_color, brand_color_secondary').eq('id', user.id).maybeSingle();
  const fullName = (profile?.full_name || '').trim();
  const brokerage = (profile?.brokerage || '').trim();
  // Brand colours: the live pickers (body) override the saved ones. Validate hex.
  const normHex = (v) => {
    const r = String(v || '').trim();
    return /^#?[0-9a-fA-F]{6}$/.test(r) ? (r.startsWith('#') ? r.toLowerCase() : `#${r.toLowerCase()}`) : null;
  };
  const brandColor = normHex(bodyColor) || normHex(profile?.brand_color);
  const brandColorSecondary = normHex(bodyColor2) || normHex(profile?.brand_color_secondary);
  if (!fullName || !brokerage) {
    return res.status(400).json({ error: 'Add your name and brokerage first so we can build your brand.', code: 'profile_incomplete' });
  }

  // Soft daily cap (per realtor). Fail-open if KV is unavailable.
  const dayKey = `logogen:${user.id}:${new Date().toISOString().slice(0, 10)}`;
  const count = await kvIncr(dayKey);
  if (count === 1) await kvExpire(dayKey, 90000); // ~25h
  if (count !== null && count > DAILY_LIMIT) {
    return res.status(429).json({ error: `You've hit today's logo-generation limit (${DAILY_LIMIT}). Your saved logo is untouched — try again tomorrow.`, limit: DAILY_LIMIT, used: count - 1 });
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: refineFrom ? REFINE_SYSTEM_PROMPT : SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: buildUserMessage({
          brief, refineFrom, conversationContext, fullName, brokerage, brandColor, brandColorSecondary,
        }),
      }],
    });

    const raw = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const parsed = parseVariations(raw);

    const variations = [];
    for (const v of parsed) {
      const check = validateLogoSvg(v?.svg);
      if (check.ok) {
        variations.push({ label: String(v?.label || 'Concept').slice(0, 60), svg: check.svg });
      }
    }

    if (variations.length === 0) {
      return res.status(502).json({ error: 'The generator returned nothing usable. Please try again or rephrase.' });
    }

    return res.status(200).json({
      variations,
      used: count === null ? null : count,
      limit: DAILY_LIMIT,
    });
  } catch (e) {
    console.error('[branding/generate-logo] error:', e?.message || e);
    return res.status(500).json({ error: 'Could not generate logos right now. Please try again.' });
  }
}
