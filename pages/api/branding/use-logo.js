// /api/branding/use-logo
// Realtor-authenticated. Takes a chosen logo SVG, rasterizes it to PNG server-side
// (pdf-lib can't embed SVG), uploads BOTH logo.svg and logo.png to the logos bucket
// at {auth.uid()}/ under the realtor's own RLS (cookie-bound server client — no
// service-role on this path), and sets profiles.logo_url to the cache-busted PNG
// public URL. The existing PDF/text branding then "just works".
import { Resvg } from '@resvg/resvg-js';
import { getSupabaseServerClient, isSupabaseConfigured } from '../../../lib/supabase/server';
import { validateLogoSvg } from '../../../lib/svgSanitize';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isSupabaseConfigured()) return res.status(503).json({ error: 'Service temporarily unavailable.' });

  const supabase = getSupabaseServerClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ error: 'Not signed in.' });

  const check = validateLogoSvg(req.body?.svg);
  if (!check.ok) return res.status(400).json({ error: 'That logo could not be saved (invalid SVG).' });
  const svg = check.svg;

  try {
    // Rasterize to a crisp, transparent PNG for the PDF/email pipeline.
    let png;
    try {
      const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 800 }, background: 'rgba(0,0,0,0)' });
      png = Buffer.from(resvg.render().asPng());
    } catch (e) {
      console.error('[branding/use-logo] rasterize error:', e?.message || e);
      return res.status(400).json({ error: 'Could not render that logo to an image. Try another concept.' });
    }

    const base = `${user.id}/logo`;
    const up1 = await supabase.storage.from('logos').upload(`${base}.png`, png, { upsert: true, contentType: 'image/png', cacheControl: '3600' });
    if (up1.error) { console.error('[use-logo] png upload', up1.error); return res.status(500).json({ error: 'Could not save the logo image.' }); }
    // The .svg is stored for future re-editing/scaling; not required by the PDF.
    await supabase.storage.from('logos').upload(`${base}.svg`, Buffer.from(svg, 'utf8'), { upsert: true, contentType: 'image/svg+xml', cacheControl: '3600' }).catch(() => {});

    const { data: pub } = supabase.storage.from('logos').getPublicUrl(`${base}.png`);
    const url = `${pub.publicUrl}?v=${Date.now()}`; // cache-bust so the new logo shows everywhere

    const { data: profile, error: dbErr } = await supabase
      .from('profiles').update({ logo_url: url }).eq('id', user.id).select().single();
    if (dbErr) { console.error('[use-logo] profile update', dbErr); return res.status(500).json({ error: 'Saved the image but could not update your profile.' }); }

    return res.status(200).json({ logo_url: url, profile });
  } catch (e) {
    console.error('[branding/use-logo] error:', e?.message || e);
    return res.status(500).json({ error: 'Could not save that logo. Please try again.' });
  }
}
