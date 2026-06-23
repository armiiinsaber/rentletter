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

DESIGN VOCABULARY (draw on these when the brief is vague — pick what fits, don't use all of them)
- Marks: a simple house or roofline silhouette, an abstract rooftop/gable, a doorway or arch, a window grid, a key, a location pin, a stylized monogram from the realtor's initials, or a minimalist geometric mark.
- Wordmarks: the realtor's name as the primary line with the brokerage smaller beneath; choose a refined serif (trust, established) OR a clean geometric sans (modern, approachable) to match the brief.
- Colour: restrained palettes of 1–2 colours plus optional neutral (ink/charcoal, paper). Translate vague colour words tastefully (e.g. "modern blue" -> a deep navy or slate, not a bright primary; "warm" -> terracotta/clay; "premium" -> ink + a single metallic-feeling accent like muted gold #b08d57).
- Composition: generous spacing, strong alignment, balanced optical weight. Icon either left of the wordmark or centered above it.

TRANSLATE the realtor's rough words into concrete choices. "Something clean with a house" -> a single-line geometric roofline + their name in a clean sans. "Modern blue" -> navy/slate, sans wordmark, minimal mark. Make 3 DISTINCT directions (e.g. one icon+wordmark, one monogram, one wordmark-led) unless they asked to iterate on one.

USE REAL TEXT
Always render the realtor's actual name and brokerage in the wordmarks (provided below). Never use placeholder text like "Your Name".

HARD OUTPUT RULES — follow EXACTLY
- Return ONLY a JSON array of exactly 3 objects. No prose, no markdown, no code fences. The first character of your reply must be "[" and the last "]".
- Each object: { "label": "<2-4 word name of the direction>", "svg": "<a complete SVG string>" }.
- Each svg MUST be: self-contained and valid; have a viewBox; have width and height; transparent background (no full-canvas opaque rect unless intentionally part of the mark); use ONLY generic font-family stacks (e.g. "Georgia, 'Times New Roman', serif" or "Helvetica, Arial, sans-serif") via <text>/<tspan> — NO @font-face, NO external fonts, NO Google Fonts.
- ABSOLUTELY NO: <script>, event handlers (onclick etc.), <foreignObject>, <image>, any href/src/url() pointing at http(s) or // or data:, base64 or raster images, <!DOCTYPE>, external stylesheets. Pure inline vector + <text> only.
- Keep each SVG compact (well under 8KB). Use a sensible canvas like viewBox="0 0 320 120" for a horizontal lockup.

Output the JSON array now.`;

function buildUserMessage({ brief, refineFrom, conversationContext, fullName, brokerage }) {
  const lines = [];
  lines.push(`REALTOR NAME: ${fullName || '(not set — use a tasteful placeholder monogram only if truly absent)'}`);
  lines.push(`BROKERAGE: ${brokerage || '(none provided)'}`);
  lines.push('');
  if (Array.isArray(conversationContext) && conversationContext.length) {
    lines.push('PRIOR DIRECTION (most recent last):');
    conversationContext.slice(-6).forEach((t) => lines.push(`- ${String(t).slice(0, 300)}`));
    lines.push('');
  }
  if (refineFrom) {
    lines.push('ITERATE on this existing logo (keep what works, apply the new instruction; do not start from scratch). Still return 3 variations exploring the requested change:');
    lines.push('```');
    lines.push(String(refineFrom).slice(0, 12000));
    lines.push('```');
    lines.push('');
    lines.push(`NEW INSTRUCTION: ${brief || 'refine and polish'}`);
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

  const { brief, refineFrom, conversationContext } = req.body || {};
  if (!brief && !refineFrom) return res.status(400).json({ error: 'Tell us what you want your logo to look like.' });

  // Soft daily cap (per realtor). Fail-open if KV is unavailable.
  const dayKey = `logogen:${user.id}:${new Date().toISOString().slice(0, 10)}`;
  const count = await kvIncr(dayKey);
  if (count === 1) await kvExpire(dayKey, 90000); // ~25h
  if (count !== null && count > DAILY_LIMIT) {
    return res.status(429).json({ error: `You've hit today's logo-generation limit (${DAILY_LIMIT}). Your saved logo is untouched — try again tomorrow.`, limit: DAILY_LIMIT, used: count - 1 });
  }

  // Pull the realtor's real name/brokerage for the wordmark.
  const { data: profile } = await supabase
    .from('profiles').select('full_name, brokerage').eq('id', user.id).maybeSingle();

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: buildUserMessage({
          brief, refineFrom, conversationContext,
          fullName: profile?.full_name, brokerage: profile?.brokerage,
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
