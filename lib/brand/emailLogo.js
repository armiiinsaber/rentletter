// lib/brand/emailLogo.js  PURE. The logo in an email. Email clients cannot rely on a web font, so it
// is the hosted PNG (public/brand/rentletter-logo-email.png, built by scripts/brand/build-brand.mjs
// from the same vector as the web logo), at a fixed width, with "Rentletter" as its alt text. The
// image is transparent, so it sits on the paper and the white of every template.
import { EMAIL_LOGO } from './emailLogoSize.js';

const siteBase = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://rentletter.ca').replace(/\/+$/, '');
export const emailLogoUrl = (site = siteBase()) => `${site}${EMAIL_LOGO.path}`;
// width: the header's 132 by default; the footer's 66 (half, 66 by 13) is the same image.
export const emailLogoHtml = (site = siteBase(), width = EMAIL_LOGO.width) => {
  const height = Math.round((width * EMAIL_LOGO.height) / EMAIL_LOGO.width);
  return `<img src="${emailLogoUrl(site)}" width="${width}" height="${height}" alt="Rentletter" style="display:block;width:${width}px;height:${height}px;border:0;outline:none;text-decoration:none;">`;
};
