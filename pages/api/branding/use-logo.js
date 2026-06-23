// /api/branding/use-logo
// Realtor-authenticated. Takes a chosen logo SVG, rasterizes it to PNG server-side
// (pdf-lib can't embed SVG), uploads BOTH logo.png and logo.svg to the logos bucket
// at {auth.uid()}/, and sets profiles.logo_url to the cache-busted PNG public URL.
// Identity is proven via the cookie client (getUser); the writes use the service-role
// admin client (server-only) scoped to the authenticated user's own folder — this
// avoids any cookie-token-for-Storage ambiguity in the bundled API runtime. The
// existing PDF/text branding then "just works".
import { Resvg } from '@resvg/resvg-js';
import { getSupabaseServerClient, isSupabaseConfigured } from '../../../lib/supabase/server';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { validateLogoSvg } from '../../../lib/svgSanitize';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'Service temporarily unavailable.' });
  }

  const supabase = getSupabaseServerClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ error: 'Not signed in.' });

  const check = validateLogoSvg(req.body?.svg);
  if (!check.ok) return res.status(400).json({ error: 'That logo could not be saved (invalid SVG).' });
  const svg = check.svg;

  // 1) Rasterize SVG → transparent PNG for the PDF/email pipeline.
  let png;
  try {
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 800 }, background: 'rgba(0,0,0,0)' });
    png = resvg.render().asPng(); // Uint8Array
  } catch (e) {
    console.error('[use-logo] rasterize error:', e?.message || e);
    return res.status(400).json({ error: 'Could not render that logo to an image. Try another concept.' });
  }

  try {
    const admin = getSupabaseAdminClient();
    const base = `${user.id}/logo`;

    // 2) Upload PNG (required by the PDF) then SVG (kept for re-editing/scaling).
    const up1 = await admin.storage.from('logos').upload(`${base}.png`, new Uint8Array(png), {
      upsert: true, contentType: 'image/png', cacheControl: '3600',
    });
    if (up1.error) {
      console.error('[use-logo] png upload failed:', up1.error?.message || up1.error);
      return res.status(500).json({ error: 'Could not save the logo image.' });
    }
    const up2 = await admin.storage.from('logos').upload(`${base}.svg`, Buffer.from(svg, 'utf8'), {
      upsert: true, contentType: 'image/svg+xml', cacheControl: '3600',
    });
    if (up2.error) console.error('[use-logo] svg upload (non-fatal):', up2.error?.message || up2.error);

    // 3) Point profiles.logo_url at the cache-busted PNG public URL.
    const { data: pub } = admin.storage.from('logos').getPublicUrl(`${base}.png`);
    const url = `${pub.publicUrl}?v=${Date.now()}`;

    const { data: profile, error: dbErr } = await admin
      .from('profiles').update({ logo_url: url }).eq('id', user.id).select().single();
    if (dbErr) {
      console.error('[use-logo] profile update failed:', dbErr?.message || dbErr);
      return res.status(500).json({ error: 'Saved the image but could not update your profile.' });
    }

    return res.status(200).json({ logo_url: url, profile });
  } catch (e) {
    console.error('[use-logo] error:', e?.message || e);
    return res.status(500).json({ error: 'Could not save that logo. Please try again.' });
  }
}
