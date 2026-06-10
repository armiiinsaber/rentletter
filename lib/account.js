// /lib/account.js
// Lightweight account record for tracking realtor signup/trial/founder status.
// Stored in KV at lacct:{email}. Created lazily on first signin.

const FOUNDING_CAP = 50;
const TRIAL_DAYS = 7;

function kvBase() {
  return (process.env.KV_REST_API_URL || '').replace(/\/+$/, '');
}

async function kvGet(key) {
  const base = kvBase();
  if (!base || !process.env.KV_REST_API_TOKEN) return null;
  try {
    const r = await fetch(`${base}/get/${key}`, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });
    const d = await r.json();
    if (!d?.result) return null;
    return typeof d.result === 'string' ? JSON.parse(d.result) : d.result;
  } catch (e) { return null; }
}

async function kvSet(key, value) {
  const base = kvBase();
  if (!base || !process.env.KV_REST_API_TOKEN) return false;
  try {
    const r = await fetch(`${base}/set/${key}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(value),
    });
    return r.ok;
  } catch (e) { return false; }
}

async function kvIncr(key) {
  const base = kvBase();
  if (!base || !process.env.KV_REST_API_TOKEN) return null;
  try {
    const r = await fetch(`${base}/incr/${key}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });
    const d = await r.json();
    return d?.result;
  } catch (e) { return null; }
}

// Get or create an account record for the given email.
// On first call, creates the record, increments the signup counter,
// and decides if this person is a founder or a trial user.
export async function getOrCreateAccount(email) {
  if (!email) return null;
  const e = String(email).trim().toLowerCase();
  const key = `lacct:${e}`;
  const existing = await kvGet(key);
  if (existing) {
    return existing;
  }

  // First time we've seen this email — increment signup counter
  const signupNumber = await kvIncr('stat:signups_ordered'); // returns Nth signup
  const isFounder = signupNumber !== null && signupNumber <= FOUNDING_CAP;
  const now = new Date();
  const trialEnd = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  const record = {
    email: e,
    signupNumber: signupNumber || null,
    isFounder,
    createdAt: now.toISOString(),
    trialEndsAt: isFounder ? null : trialEnd.toISOString(), // founders have no trial
    subscriptionStatus: isFounder ? 'founder' : 'trial', // 'founder' | 'trial' | 'active' | 'lapsed'
  };
  await kvSet(key, record);
  return record;
}

// Get account record without creating one
export async function getAccount(email) {
  if (!email) return null;
  const e = String(email).trim().toLowerCase();
  return await kvGet(`lacct:${e}`);
}

// Compute trial status — used by frontend to decide whether to gate the dashboard
export function evaluateAccount(record) {
  if (!record) return { status: 'unknown', daysLeft: 0, locked: false };
  if (record.subscriptionStatus === 'founder' || record.isFounder) {
    return { status: 'founder', daysLeft: null, locked: false, signupNumber: record.signupNumber };
  }
  if (record.subscriptionStatus === 'active') {
    return { status: 'active', daysLeft: null, locked: false };
  }
  // Trial: compute days remaining
  if (record.trialEndsAt) {
    const end = new Date(record.trialEndsAt).getTime();
    const now = Date.now();
    const daysLeft = Math.max(0, Math.ceil((end - now) / (24 * 60 * 60 * 1000)));
    return { status: daysLeft > 0 ? 'trial' : 'lapsed', daysLeft, locked: daysLeft <= 0 };
  }
  return { status: 'lapsed', daysLeft: 0, locked: true };
}

export { FOUNDING_CAP, TRIAL_DAYS };
