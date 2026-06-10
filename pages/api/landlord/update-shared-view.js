// /api/landlord/update-shared-view
// PUBLIC endpoint. Allows the landlord (via share token) to:
//   - Remove a candidate from their view
//   - Restore a previously removed candidate
//   - Add a note about a candidate (visible to realtor)

import { bump, COUNTERS } from '../../../lib/stats';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, action, applicationNumber, note } = req.body || {};

  if (!token || !/^[a-f0-9]{40}$/.test(String(token))) {
    return res.status(400).json({ error: 'Invalid share token.' });
  }
  if (!applicationNumber || !/^RL-[A-Z0-9-]+$/i.test(String(applicationNumber))) {
    return res.status(400).json({ error: 'Invalid application number.' });
  }
  if (!['remove', 'restore', 'note'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action.' });
  }

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(503).json({ error: 'Service unavailable.' });
  }

  const base = (process.env.KV_REST_API_URL || '').replace(/\/+$/, '');

  try {
    const tokenRes = await fetch(`${base}/get/lshare:${token}`, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });
    const tokenData = await tokenRes.json();
    if (!tokenData?.result) {
      return res.status(404).json({ error: 'Share link expired or invalid.' });
    }
    const share = typeof tokenData.result === 'string' ? JSON.parse(tokenData.result) : tokenData.result;

    // Apply the action
    if (action === 'remove') {
      const removed = new Set(share.landlordRemovedApps || []);
      removed.add(applicationNumber);
      share.landlordRemovedApps = Array.from(removed);
      share.landlordActivity = [
        ...(share.landlordActivity || []),
        { type: 'remove', appNumber: applicationNumber, ts: new Date().toISOString() },
      ].slice(-100);
    } else if (action === 'restore') {
      share.landlordRemovedApps = (share.landlordRemovedApps || []).filter(n => n !== applicationNumber);
      share.landlordActivity = [
        ...(share.landlordActivity || []),
        { type: 'restore', appNumber: applicationNumber, ts: new Date().toISOString() },
      ].slice(-100);
    } else if (action === 'note') {
      share.landlordNotes = share.landlordNotes || {};
      const cleanedNote = String(note || '').slice(0, 1000);
      if (cleanedNote) {
        share.landlordNotes[applicationNumber] = {
          text: cleanedNote,
          ts: new Date().toISOString(),
        };
      } else {
        delete share.landlordNotes[applicationNumber];
      }
      share.landlordActivity = [
        ...(share.landlordActivity || []),
        { type: 'note', appNumber: applicationNumber, ts: new Date().toISOString() },
      ].slice(-100);
    }

    share.updatedAt = new Date().toISOString();

    // Save back
    const setRes = await fetch(`${base}/set/lshare:${token}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(share),
    });
    if (!setRes.ok) {
      return res.status(500).json({ error: 'Could not save.' });
    }

    // Instrument
    bump(COUNTERS.LANDLORD_ACTIONS);

    return res.status(200).json({
      ok: true,
      landlordRemovedApps: share.landlordRemovedApps,
      landlordNotes: share.landlordNotes,
    });
  } catch (e) {
    console.error('[update-shared-view] error:', e);
    return res.status(500).json({ error: 'Could not save.' });
  }
}
