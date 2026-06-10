// /api/pass/create.js
// Called after successful Stripe payment for the 30-day pass.
// Generates a unique pass token, stores in KV with 30-day TTL,
// sends an email to the customer with their access link.

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Verify Stripe session and confirm it's the 30-day pass product
async function verifyStripeSession(sessionId) {
  if (!sessionId) return { ok: false, reason: 'No session ID' };
  if (!process.env.STRIPE_SECRET_KEY) return { ok: false, reason: 'Stripe not configured' };

  try {
    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
    });
    const session = await res.json();
    if (session.error) return { ok: false, reason: session.error.message };
    if (session.payment_status !== 'paid') return { ok: false, reason: 'Payment not completed' };
    return { ok: true, session };
  } catch (err) {
    return { ok: false, reason: 'Stripe verification failed' };
  }
}

// Generate a unique pass token
function generatePassToken() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // No confusing chars (0/O, 1/I/L)
  let token = '';
  for (let i = 0; i < 16; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

// Store pass in KV with 30-day TTL
async function storePass(token, payload) {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    console.warn('KV not configured — pass not persisted');
    return false;
  }
  try {
    const setRes = await fetch(`${process.env.KV_REST_API_URL}/set/pass:${token}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!setRes.ok) {
      console.error('KV pass store failed:', await setRes.text());
      return false;
    }
    // 30-day TTL (in seconds)
    await fetch(`${process.env.KV_REST_API_URL}/expire/pass:${token}/2592000`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });
    return true;
  } catch (err) {
    console.error('KV pass store error:', err);
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { stripeSessionId } = req.body;

  // Verify the payment
  const verification = await verifyStripeSession(stripeSessionId);
  if (!verification.ok) {
    return res.status(402).json({ error: `Payment required. ${verification.reason}` });
  }

  // Extract customer email from the Stripe session
  const session = verification.session;
  const customerEmail = session.customer_details?.email || session.customer_email;

  if (!customerEmail) {
    return res.status(400).json({ error: 'No customer email found in payment session' });
  }

  // Generate the pass
  const passToken = generatePassToken();
  const now = Date.now();
  const expiresAt = now + (30 * 24 * 60 * 60 * 1000); // 30 days from now

  const passPayload = {
    token: passToken,
    email: customerEmail,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    stripeSessionId,
    lettersGenerated: 0,
    plan: '30-day unlimited pass',
  };

  // Store in KV
  const stored = await storePass(passToken, passPayload);
  if (!stored) {
    console.error('Failed to store pass — but payment was successful');
    // Still continue — we'll email them the pass and they can use it
  }

  // Send the pass email
  const passUrl = `https://rentletter.ca/?pass=${passToken}`;
  try {
    if (process.env.RESEND_API_KEY) {
      await resend.emails.send({
        from: 'Rentletter <hello@rentletter.ca>',
        to: customerEmail,
        subject: 'Your 30-day search pass — Rentletter',
        html: buildPassEmail(passToken, passUrl, new Date(expiresAt)),
      });
    }
  } catch (emailErr) {
    console.error('Pass email send failed:', emailErr);
    // Don't fail the request — they still have the pass on the success page
  }

  return res.status(200).json({
    passToken,
    passUrl,
    email: customerEmail,
    expiresAt: passPayload.expiresAt,
  });
}

function buildPassEmail(token, passUrl, expiresDate) {
  const expiryStr = expiresDate.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Your 30-day pass</title>
</head>
<body style="margin:0;padding:0;background:#faf8f3;font-family:-apple-system,'Inter',sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#faf8f3;padding:48px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#faf8f3;">

          <!-- Logo -->
          <tr>
            <td style="padding-bottom:32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="width:3px;height:20px;background:#d72027;"></td>
                  <td style="padding-left:7px;font-family:'Inter',sans-serif;font-size:17px;font-weight:800;color:#0f0f10;letter-spacing:-0.02em;">
                    Rentletter
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Headline -->
          <tr>
            <td style="padding-bottom:24px;">
              <p style="font-family:'Inter',sans-serif;font-size:11px;color:#d72027;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 12px;">
                Payment confirmed &middot; 30-day search pass activated
              </p>
              <h1 style="font-family:'Inter',sans-serif;font-size:42px;font-weight:800;color:#0f0f10;letter-spacing:-0.03em;line-height:1.05;margin:0;">
                Your search pass<span style="color:#d72027;"> is ready.</span>
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding-bottom:32px;">
              <p style="font-family:'Inter',sans-serif;font-size:16px;line-height:1.6;color:#3a3a3c;margin:0 0 16px;">
                Tailor a new Rentletter application for every apartment you're considering over the next 30 days. Update your profile when your situation changes &mdash; new job, new income, found a roommate. Bookmark this email; your access link is below.
              </p>
            </td>
          </tr>

          <!-- Access pass card -->
          <tr>
            <td style="padding-bottom:32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0f0f10;">
                <tr>
                  <td style="width:4px;background:#d72027;"></td>
                  <td style="padding:28px 30px;">
                    <p style="font-family:'Inter',sans-serif;font-size:11px;color:#d72027;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 12px;">
                      Your access link
                    </p>
                    <p style="font-family:'Courier New',monospace;font-size:13px;color:#a4adbb;margin:0 0 20px;word-break:break-all;">
                      ${passUrl}
                    </p>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="background:#d72027;">
                          <a href="${passUrl}" style="display:inline-block;padding:16px 28px;color:#faf8f3;font-family:'Inter',sans-serif;font-size:14px;font-weight:700;text-decoration:none;letter-spacing:0.02em;">
                            Open my pass &rarr;
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p style="font-family:'Inter',sans-serif;font-size:12px;color:#a4adbb;margin:20px 0 0;line-height:1.55;">
                      Pass token: <strong style="color:#faf8f3;font-family:'Courier New',monospace;letter-spacing:0.04em;">${token}</strong><br>
                      Expires: <strong style="color:#faf8f3;">${expiryStr}</strong>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- How it works -->
          <tr>
            <td style="padding-bottom:32px;">
              <p style="font-family:'Inter',sans-serif;font-size:11px;color:#86868b;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 14px;">
                How to use your pass
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="padding:6px 0;font-family:'Inter',sans-serif;font-size:14px;color:#3a3a3c;line-height:1.6;">
                    <strong style="color:#0f0f10;">1.</strong>&nbsp;&nbsp;Click the link above whenever you want to apply to a new apartment.
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-family:'Inter',sans-serif;font-size:14px;color:#3a3a3c;line-height:1.6;">
                    <strong style="color:#0f0f10;">2.</strong>&nbsp;&nbsp;Update the apartment address and any details that changed &mdash; we&rsquo;ll generate a fresh, tailored application.
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-family:'Inter',sans-serif;font-size:14px;color:#3a3a3c;line-height:1.6;">
                    <strong style="color:#0f0f10;">3.</strong>&nbsp;&nbsp;Each application gets a fresh number landlords can verify in the dashboard.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Tip block -->
          <tr>
            <td style="padding-bottom:32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="width:3px;background:#d72027;"></td>
                  <td style="padding-left:18px;">
                    <p style="font-family:'Inter',sans-serif;font-size:11px;color:#d72027;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 8px;">
                      Quick tip
                    </p>
                    <p style="font-family:'Inter',sans-serif;font-size:14px;line-height:1.6;color:#3a3a3c;margin:0;">
                      Save this email or bookmark the link. The pass works from any device — phone, laptop, anywhere — as long as you have the URL.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:24px;border-top:1px solid #e3ddd0;">
              <p style="font-family:'Inter',sans-serif;font-size:12px;color:#86868b;line-height:1.55;margin:0;">
                Questions? Reply to this email.<br>
                Rentletter · Toronto · rentletter.ca
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
