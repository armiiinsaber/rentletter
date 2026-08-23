// components/crm/model.js
// Pure, client-safe helpers for the founder CRM: stage vocabulary (mirrors lib/crmStore.js),
// local-date arithmetic, what's overdue, what a card should show, and the morning summary.
export const STAGES = [
  { key: 'new', label: 'New', hint: 'Not yet reached' },
  { key: 'contacted', label: 'Contacted', hint: 'First message out' },
  { key: 'demo_booked', label: 'Demo booked', hint: 'Call on the calendar' },
  { key: 'demo_done', label: 'Demo done', hint: 'Deciding' },
  { key: 'follow_up_later', label: 'Follow up later', hint: 'Not now; could convert later' },
  { key: 'client', label: 'Client', hint: 'Using Rentletter' },
  { key: 'set_aside', label: 'Set aside', hint: 'A no' },
];
export const STAGE = Object.fromEntries(STAGES.map((s) => [s.key, s]));
export const SOURCES = [
  { key: 'referral', label: 'Referral' }, { key: 'instagram', label: 'Instagram' }, { key: 'cold', label: 'Cold' }, { key: 'other', label: 'Other' },
];
export const CLOSED = new Set(['client', 'set_aside']);

const pad = (n) => String(n).padStart(2, '0');
// Local calendar date of a Date (YYYY-MM-DD) — never UTC, the founder's day is what matters.
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());
export const parseYmd = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
export const dateOfTs = (ts) => (ts ? ymd(new Date(ts)) : null);
export const weekday = (s) => parseYmd(s).toLocaleDateString('en-CA', { weekday: 'short' });
export const fmtDay = (s, { year = false } = {}) => (s ? parseYmd(s).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}) }) : '');
export const fmtTime = (ts) => (ts ? new Date(ts).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' }).replace(/\s?([ap])\.m\./i, '$1m').toLowerCase() : '');
export const fmtStamp = (ts) => (ts ? new Date(ts).toLocaleString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
export const relDay = (s) => {
  const t = today(); if (!s) return '';
  if (s === t) return 'today'; if (s === addDays(t, 1)) return 'tomorrow'; if (s === addDays(t, -1)) return 'yesterday';
  const diff = Math.round((parseYmd(s) - parseYmd(t)) / 86400000);
  if (diff > 1 && diff < 7) return weekday(s); return fmtDay(s, { year: parseYmd(s).getFullYear() !== new Date().getFullYear() });
};
// datetime-local value (local wall time) ↔ ISO
export const toLocalInput = (ts) => { if (!ts) return ''; const d = new Date(ts); return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);
// Move a timestamp to another calendar day, keeping its wall-clock time.
export const moveTsToDay = (ts, day) => { const d = new Date(ts); const n = parseYmd(day); n.setHours(d.getHours(), d.getMinutes(), 0, 0); return n.toISOString(); };

// What's wrong / due for a lead. Overdue never applies to closed stages.
export function leadStatus(lead, now = new Date()) {
  const t = ymd(now);
  const closed = CLOSED.has(lead.stage);
  const demoDay = dateOfTs(lead.demo_at);
  const fu = lead.follow_up_at ? String(lead.follow_up_at).slice(0, 10) : null;
  const demoOverdue = !closed && lead.stage === 'demo_booked' && lead.demo_at && new Date(lead.demo_at) < now;
  const fuOverdue = !closed && fu && fu < t;
  return { closed, demoDay, fu, demoOverdue, fuOverdue, overdue: !!(demoOverdue || fuOverdue), demoToday: demoDay === t && !closed, fuToday: fu === t && !closed };
}

// The one date line a card shows, by stage. Returns { label, text, tone } or null.
export function cardDate(lead, now = new Date()) {
  const s = leadStatus(lead, now);
  if (lead.stage === 'client') return { label: 'Client since', text: fmtDay(dateOfTs(lead.stage_changed_at) || today()), tone: 'green' };
  if (lead.stage === 'set_aside') return { label: 'Set aside', text: fmtDay(dateOfTs(lead.stage_changed_at) || today()), tone: 'mute' };
  if (lead.stage === 'demo_booked' && lead.demo_at) return { label: s.demoOverdue ? 'Overdue · demo was' : 'Demo', text: `${relDay(s.demoDay)} · ${fmtTime(lead.demo_at)}`, tone: s.demoOverdue ? 'danger' : s.demoToday ? 'red' : 'ink' };
  if (s.fu) return { label: s.fuOverdue ? 'Overdue · follow-up' : 'Follow up', text: relDay(s.fu), tone: s.fuOverdue ? 'danger' : s.fuToday ? 'red' : 'ink' };
  if (lead.demo_at && lead.stage === 'demo_done') return { label: 'Demo was', text: relDay(s.demoDay), tone: 'mute' };
  return null;
}

// Morning strip: overdue, today, and the rest of this week (next 7 days), sorted.
export function morning(leads, now = new Date()) {
  const t = ymd(now); const weekEnd = addDays(t, 7);
  const overdue = [], todayList = [], week = [];
  for (const l of leads) {
    const s = leadStatus(l, now);
    if (s.closed) continue;
    if (s.demoOverdue) overdue.push({ lead: l, what: 'demo passed — mark it done', when: s.demoDay, kind: 'demo' });
    else if (s.demoDay === t && l.stage === 'demo_booked') todayList.push({ lead: l, what: `demo ${fmtTime(l.demo_at)}`, when: s.demoDay, kind: 'demo', ts: l.demo_at });
    else if (s.demoDay && s.demoDay > t && s.demoDay <= weekEnd && l.stage === 'demo_booked') week.push({ lead: l, what: `demo ${weekday(s.demoDay)} ${fmtTime(l.demo_at)}`, when: s.demoDay, kind: 'demo' });
    if (s.fuOverdue) overdue.push({ lead: l, what: `follow-up was ${fmtDay(s.fu)}`, when: s.fu, kind: 'fu' });
    else if (s.fu === t) todayList.push({ lead: l, what: 'follow up', when: s.fu, kind: 'fu', ts: null });
    else if (s.fu && s.fu > t && s.fu <= weekEnd) week.push({ lead: l, what: `follow up ${weekday(s.fu)}`, when: s.fu, kind: 'fu' });
  }
  const byWhen = (a, b) => (a.when < b.when ? -1 : a.when > b.when ? 1 : String(a.ts || '').localeCompare(String(b.ts || '')));
  return { overdue: overdue.sort(byWhen), today: todayList.sort(byWhen), week: week.sort(byWhen) };
}

// Calendar items for a month: { day, lead, kind: 'demo'|'fu', tone }
export function calendarItems(leads, now = new Date()) {
  const out = [];
  for (const l of leads) {
    const s = leadStatus(l, now);
    if (s.demoDay) out.push({ day: s.demoDay, lead: l, kind: 'demo', ts: l.demo_at, tone: s.demoOverdue ? 'overdue' : s.closed || l.stage !== 'demo_booked' ? 'past' : 'upcoming' });
    if (s.fu) out.push({ day: s.fu, lead: l, kind: 'fu', ts: null, tone: s.fuOverdue ? 'overdue' : s.closed ? 'past' : 'upcoming' });
  }
  return out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : String(a.ts || '').localeCompare(String(b.ts || ''))));
}

export const initials = (name) => String(name || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';
