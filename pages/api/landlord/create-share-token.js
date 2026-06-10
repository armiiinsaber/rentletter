// /api/landlord/create-share-token
// Realtor sends a shortlist to a landlord client. Creates a 14-day share token
// the landlord can use to view candidates (no sign-up). Realtor can also update
// the share later (add more candidates) using the same token.

import crypto from 'crypto';
import { bump, logEvent, COUNTERS } from '../../../lib/stats';

async function getSession(sessionToken) {
  if (!sessionToken) return null;
  const clean = String(sessionToken).trim();
  if (!/^[a-f0-9]{48}$/.test(clean)) return null;
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return null;
  try {
    const r = await fetch(`${process.env.KV_REST_API_URL}/get/lsession:${clean}`, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });
    const data = await r.json();
    if (!data?.result) return null;
    const record = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
    return record;
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sessionToken = req.headers['x-rl-session'];
  const session = await getSession(sessionToken);
  if (!session?.email) return res.status(401).json({ error: 'Not signed in.' });

  const {
    existingToken,        // if provided, UPDATE this token instead of creating new
    applicationNumbers,
    applicants,           // full applicant objects (snapshot at moment of share)
    decisions,            // { appNumber: { status, priority, notes } }
    realtorProfile,
    landlordEmail,
    unit,
    listingId,
    preferences,          // landlord-stated screening preferences (OHRC-compliant)
  } = req.body || {};

  if (!Array.isArray(applicationNumbers) || applicationNumbers.length === 0) {
    return res.status(400).json({ error: 'No applications specified.' });
  }

  const cleanedApps = applicationNumbers
    .map(n => String(n || '').trim())
    .filter(n => /^RL-[A-Z0-9-]+$/i.test(n))
    .slice(0, 30);

  if (cleanedApps.length === 0) {
    return res.status(400).json({ error: 'No valid application numbers.' });
  }

  // Embed full applicant snapshots so the share is self-contained.
  // This means: works with demo data, survives tenant revocation, no extra KV lookups for the landlord.
  // We strip very large or sensitive fields to keep the share record under KV size limits.
  const cleanedApplicants = Array.isArray(applicants)
    ? applicants
        .filter(a => a && a.applicationNumber && cleanedApps.includes(a.applicationNumber))
        .slice(0, 30)
        .map(a => ({
          applicationNumber: a.applicationNumber,
          tenant: a.tenant,
          employment: a.employment,
          household: a.household,
          lifestyle: a.lifestyle,
          rentalHistory: a.rentalHistory,
          references: a.references,
          scorecard: a.scorecard,
          // Truncate long fields
          coverLetter: typeof a.coverLetter === 'string' ? a.coverLetter.slice(0, 5000) : a.coverLetter,
          additionalNotes: typeof a.additionalNotes === 'string' ? a.additionalNotes.slice(0, 2000) : a.additionalNotes,
        }))
    : [];

  // Sanitize decisions for these specific apps only
  const cleanedDecisions = {};
  if (decisions && typeof decisions === 'object') {
    for (const appNum of cleanedApps) {
      const d = decisions[appNum];
      if (d && typeof d === 'object') {
        cleanedDecisions[appNum] = {
          status: ['shortlist', 'reject', 'none'].includes(d.status) ? d.status : 'none',
          priority: ['top', 'normal', null].includes(d.priority) ? d.priority : null,
          notes: typeof d.notes === 'string' ? d.notes.slice(0, 1000) : '',
        };
      }
    }
  }

  const base = (process.env.KV_REST_API_URL || '').replace(/\/+$/, '');

  // Use existing token or mint a new one
  const token = (existingToken && /^[a-f0-9]{40}$/.test(String(existingToken)))
    ? String(existingToken)
    : crypto.randomBytes(20).toString('hex');

  // If updating, preserve existing landlord activity (removals, notes)
  let landlordActivity = [];
  let landlordRemovedApps = [];
  let landlordNotes = {};
  let createdAt = new Date().toISOString();

  if (existingToken) {
    try {
      const r = await fetch(`${base}/get/lshare:${token}`, {
        headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
      });
      const d = await r.json();
      if (d?.result) {
        const prev = typeof d.result === 'string' ? JSON.parse(d.result) : d.result;
        landlordActivity = prev.landlordActivity || [];
        landlordRemovedApps = prev.landlordRemovedApps || [];
        landlordNotes = prev.landlordNotes || {};
        createdAt = prev.createdAt || createdAt;
        // Log this update as a realtor action
        landlordActivity.push({
          type: 'realtor_updated_list',
          ts: new Date().toISOString(),
          appsCount: cleanedApps.length,
        });
      }
    } catch (e) { /* no existing share, proceed as new */ }
  }

  const payload = {
    realtorEmail: session.email,
    realtorName: String(realtorProfile?.fullName || '').slice(0, 120),
    realtorBrokerage: String(realtorProfile?.brokerage || '').slice(0, 200),
    realtorPhone: String(realtorProfile?.phone || '').slice(0, 40),
    landlordEmail: String(landlordEmail || '').trim().toLowerCase().slice(0, 200),
    applicationNumbers: cleanedApps,
    applicants: cleanedApplicants, // Full applicant snapshots embedded in the share token
    decisions: cleanedDecisions,
    unit: unit && typeof unit === 'object' ? unit : null,
    listingId: listingId ? String(listingId).slice(0, 32) : null,
    preferences: preferences && typeof preferences === 'object' ? preferences : null,
    landlordActivity,
    landlordRemovedApps,
    landlordNotes,
    createdAt,
    updatedAt: new Date().toISOString(),
  };

  try {
    const setRes = await fetch(`${base}/set/lshare:${token}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!setRes.ok) {
      const errText = await setRes.text().catch(() => '');
      console.error('[create-share-token] KV set failed:', setRes.status, errText);
      return res.status(500).json({ error: 'Could not create share link.' });
    }
    // 14-day expiry, refreshed on every update
    await fetch(`${base}/expire/lshare:${token}/1209600`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });
    // Instrument
    bump(COUNTERS.SHARES_CREATED);
    logEvent('shares', {
      realtorEmail: session.email,
      landlordEmail: payload.landlordEmail,
      appsCount: cleanedApps.length,
      isUpdate: !!existingToken,
    });
    return res.status(200).json({ ok: true, token, url: `https://rentletter.ca/shortlist/${token}` });
  } catch (e) {
    console.error('[create-share-token] error:', e);
    return res.status(500).json({ error: 'Could not create share link.' });
  }
}
