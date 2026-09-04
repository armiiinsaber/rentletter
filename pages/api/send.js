import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// ─── Lean application-confirmation email (no attachments) ──────
// The current apply flow (/apply/[token]) sends the tenant ONLY their application
// number + owner token. The legacy rent-letter PDF / tenant-résumé attachments were
// removed from the product — this email exists because /my-application recovery
// depends on the emailed owner token, not to deliver documents.
function buildConfirmationHtml({ firstName, applicationNumber, ownerToken }) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background: #faf8f3; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #faf8f3;">
    <tr>
      <td align="center" style="padding: 56px 24px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width: 560px; background: #faf8f3;">

          <!-- Header, wordmark with red bar -->
          <tr>
            <td style="padding-bottom: 28px; border-bottom: 1px solid #e3ddd0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align: middle; padding-right: 8px;">
                    <div style="width: 4px; height: 24px; background: #d72027;"></div>
                  </td>
                  <td style="vertical-align: middle; font-family: 'Inter', sans-serif; font-size: 20px; font-weight: 800; color: #0f0f10; letter-spacing: -0.02em;">
                    Rentletter
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Headline -->
          <tr>
            <td style="padding: 48px 0 20px;">
              <h1 style="font-family: 'Inter', sans-serif; font-weight: 800; font-size: 40px; line-height: 1.02; letter-spacing: -0.03em; color: #0f0f10; margin: 0;">
                Application <span style="color: #d72027;">submitted,</span><br>${firstName}.
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding-bottom: 32px;">
              <p style="font-family: 'Inter', sans-serif; font-size: 16px; line-height: 1.6; color: #3a3a3c; margin: 0;">
                Your application went to the listing realtor, the agent representing the landlord for this unit. Keep this email, your application number and owner key below are how you track and control it.
              </p>
            </td>
          </tr>

          <!-- Application number -->
          <tr>
            <td style="padding-bottom: 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #0f0f10;">
                <tr>
                  <td style="width: 4px; background: #d72027;"></td>
                  <td style="padding: 24px 28px;">
                    <p style="font-family: 'Inter', sans-serif; font-size: 11px; color: #d72027; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; margin: 0 0 10px;">
                      Your Application Number
                    </p>
                    <p style="font-family: 'Courier New', monospace; font-size: 22px; font-weight: 800; color: #faf8f3; letter-spacing: 0.04em; margin: 0 0 14px;">
                      ${applicationNumber}
                    </p>
                    <p style="font-family: 'Inter', sans-serif; font-size: 13px; line-height: 1.55; color: #a4adbb; margin: 0;">
                      The listing realtor uses this number to pull up your application in their dashboard.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${ownerToken ? `
          <!-- Owner token / manage application -->
          <tr>
            <td style="padding-bottom: 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #faf8f3; border: 1px solid #e3ddd0;">
                <tr>
                  <td style="padding: 20px 24px;">
                    <p style="font-family: 'Inter', sans-serif; font-size: 11px; color: #d72027; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; margin: 0 0 10px;">
                      Your profile
                    </p>
                    <p style="font-family: 'Inter', sans-serif; font-size: 14px; line-height: 1.6; color: #3a3a3c; margin: 0 0 8px;">
                      This application is now your saved profile. From it you can see who's looked you up, update your details, and revoke access any time.
                    </p>
                    <p style="font-family: 'Inter', sans-serif; font-size: 14px; line-height: 1.6; color: #0f0f10; font-weight: 600; margin: 0 0 14px;">
                      Next listing? Apply in seconds &mdash; open your profile, paste the new invite link, and everything is filled in for you to review.
                    </p>
                    <p style="font-family: 'Inter', sans-serif; font-size: 13px; line-height: 1.6; color: #3a3a3c; margin: 0 0 14px;">
                      Lost this email? Go to <a href="https://rentletter.ca/my-application" style="color: #d72027; font-weight: 600;">rentletter.ca/my application</a>, enter this email address, and we&rsquo;ll send you a fresh link &mdash; no password needed. The owner key below also opens this application directly; keep it private.
                    </p>
                    <p style="font-family: 'Inter', sans-serif; font-size: 11px; color: #86868b; margin: 0 0 4px; letter-spacing: 0.04em; text-transform: uppercase; font-weight: 600;">
                      Owner token
                    </p>
                    <p style="font-family: 'Courier New', monospace; font-size: 14px; color: #0f0f10; letter-spacing: 0.04em; word-break: break-all; background: #ffffff; border: 1px solid #e3ddd0; padding: 10px 12px; margin: 0 0 16px;">
                      ${ownerToken}
                    </p>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="background: #0f0f10;">
                          <a href="https://rentletter.ca/my-application?app=${applicationNumber}&token=${ownerToken}" style="display: inline-block; padding: 12px 22px; color: #faf8f3; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 700; text-decoration: none; letter-spacing: 0.02em;">
                            Open my profile &rarr;
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ` : ''}

          <!-- Sign-off -->
          <tr>
            <td style="padding-top: 32px; border-top: 1px solid #e3ddd0;">
              <p style="font-family: 'Inter', sans-serif; font-size: 16px; font-weight: 600; color: #0f0f10; margin: 0 0 4px;">
                Good luck out there<span style="color: #d72027;">.</span>
              </p>
              <p style="font-family: 'Inter', sans-serif; font-size: 14px; color: #86868b; margin: 6px 0 24px;">
, The Rentletter desk
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="vertical-align: middle; padding-right: 6px;">
                          <div style="width: 3px; height: 14px; background: #d72027;"></div>
                        </td>
                        <td style="vertical-align: middle; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 800; color: #0f0f10; letter-spacing: -0.01em;">
                          Rentletter
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td align="right" style="font-family: 'Inter', sans-serif; font-size: 12px; color: #86868b;">
                    Ontario · Not legal advice
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Handler ───────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // The application confirmation: number and owner token, no attachments. The cover letter is no
  // longer generated (pages/api/generate.js), so `letter` and `resume` from a stale client are ignored.
  const { email, fullName, applicationNumber, ownerToken } = req.body;
  if (!email || !applicationNumber) {
    return res.status(400).json({ error: 'Missing email and application number' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ error: 'Email service not configured' });
  }

  try {
    const firstName = (fullName || '').split(' ')[0] || 'there';
    const result = await resend.emails.send({
      from: 'Rentletter <hello@rentletter.ca>',
      to: email,
      subject: 'Your Rentletter application',
      html: buildConfirmationHtml({ firstName, applicationNumber, ownerToken }),
    });
    if (result.error) {
      console.error('Resend error:', result.error);
      return res.status(500).json({ error: 'Failed to send email' });
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Email error:', err);
    return res.status(500).json({ error: 'Failed to send email' });
  }
}

// Increase body size limit for large letters
export const config = {
  api: { bodyParser: { sizeLimit: '1mb' } },
};
