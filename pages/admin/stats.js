// /pages/admin/stats.js
// Internal observability dashboard. Gated by ADMIN_STATS_SECRET env var.
// Pass ?key=YOUR_SECRET in the URL to access.

import { getCounter, getRecentEvents, getUniqueUserCount, COUNTERS } from '../../lib/stats';

export async function getServerSideProps({ query }) {
  const expectedKey = process.env.ADMIN_STATS_SECRET;
  if (!expectedKey) {
    return { props: { error: 'ADMIN_STATS_SECRET env var not set on server.' } };
  }
  if (query.key !== expectedKey) {
    return { props: { error: 'Access denied. Append ?key=YOUR_SECRET to the URL.' } };
  }

  // Parallel fetch all counters + event streams
  const [
    signups,
    workspaceSaves,
    lettersGenerated,
    sharesCreated,
    sharesViewed,
    landlordActions,
    emailsSent,
    uniqueUsers,
    recentSignups,
    recentShares,
    recentLetters,
    recentEmails,
  ] = await Promise.all([
    getCounter(COUNTERS.SIGNUPS),
    getCounter(COUNTERS.WORKSPACE_SAVES),
    getCounter(COUNTERS.APPLICATIONS_GENERATED),
    getCounter(COUNTERS.SHARES_CREATED),
    getCounter(COUNTERS.SHARES_VIEWED),
    getCounter(COUNTERS.LANDLORD_ACTIONS),
    getCounter(COUNTERS.EMAILS_SENT),
    getUniqueUserCount(),
    getRecentEvents('signups', 30),
    getRecentEvents('shares', 30),
    getRecentEvents('letters', 30),
    getRecentEvents('emails', 30),
  ]);

  return {
    props: {
      stats: {
        signups, workspaceSaves, lettersGenerated, sharesCreated,
        sharesViewed, landlordActions, emailsSent, uniqueUsers,
      },
      recentSignups,
      recentShares,
      recentLetters,
      recentEmails,
      generatedAt: new Date().toISOString(),
    },
  };
}

export default function AdminStats({ error, stats, recentSignups, recentShares, recentLetters, recentEmails, generatedAt }) {
  if (error) {
    return (
      <div style={{ padding: 40, fontFamily: 'monospace', background: '#0f0f10', color: '#faf8f3', minHeight: '100vh' }}>
        <h1 style={{ fontSize: 18, marginBottom: 12 }}>Admin Stats</h1>
        <p style={{ color: '#d72027' }}>{error}</p>
      </div>
    );
  }

  return (
    <div style={{
      padding: '32px 24px', fontFamily: "'Inter', -apple-system, sans-serif",
      background: '#0f0f10', color: '#faf8f3', minHeight: '100vh',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>
            <span style={{ color: '#d72027' }}>●</span> Rentletter — Internal Stats
          </h1>
          <span style={{ fontSize: 11, color: '#86868b' }}>
            Snapshot at {new Date(generatedAt).toLocaleString('en-CA')}
          </span>
        </div>

        {/* Counter cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 32 }}>
          <Stat label="Unique users" value={stats.uniqueUsers} highlight />
          <Stat label="Letters generated" value={stats.lettersGenerated} />
          <Stat label="Shares created" value={stats.sharesCreated} />
          <Stat label="Shares viewed" value={stats.sharesViewed} />
          <Stat label="Landlord actions" value={stats.landlordActions} />
          <Stat label="Emails sent" value={stats.emailsSent} />
          <Stat label="Workspace saves" value={stats.workspaceSaves} />
        </div>

        {/* Funnel snapshot */}
        <Section title="Funnel snapshot">
          <table style={tbl}>
            <tbody>
              <tr><td style={td}>Letter generated</td><td style={tdRight}>{stats.lettersGenerated}</td></tr>
              <tr><td style={td}>→ Workspace saved (realtor active)</td><td style={tdRight}>{stats.workspaceSaves}</td></tr>
              <tr><td style={td}>→ Share created</td><td style={tdRight}>{stats.sharesCreated}</td></tr>
              <tr><td style={td}>→ Email to landlord sent</td><td style={tdRight}>{stats.emailsSent}</td></tr>
              <tr><td style={td}>→ Landlord opened link</td><td style={tdRight}>{stats.sharesViewed}</td></tr>
              <tr><td style={td}>→ Landlord took action</td><td style={tdRight}>{stats.landlordActions}</td></tr>
            </tbody>
          </table>
        </Section>

        {/* Recent signups */}
        <Section title={`Recent signups (${recentSignups.length})`}>
          <EventList events={recentSignups} render={e => e.email || '—'} />
        </Section>

        {/* Recent shares */}
        <Section title={`Recent shares (${recentShares.length})`}>
          <EventList events={recentShares} render={e => (
            <>
              <strong>{e.realtorEmail || '—'}</strong> → {e.landlordEmail || '—'} · {e.appsCount || 0} candidate{e.appsCount === 1 ? '' : 's'}{e.isUpdate ? ' (update)' : ''}
            </>
          )} />
        </Section>

        {/* Recent emails */}
        <Section title={`Recent emails sent (${recentEmails.length})`}>
          <EventList events={recentEmails} render={e => (
            <>
              <strong>{e.realtorEmail || '—'}</strong> → {e.landlordEmail || '—'} · {e.candidates || 0} candidate{e.candidates === 1 ? '' : 's'}
            </>
          )} />
        </Section>

        {/* Recent letters */}
        <Section title={`Recent letters generated (${recentLetters.length})`}>
          <EventList events={recentLetters} render={e => e.applicationNumber || '—'} />
        </Section>

        <p style={{ marginTop: 40, fontSize: 11, color: '#86868b', lineHeight: 1.6 }}>
          Counters increment on each event. Event streams keep the last ~200. Refresh the page to update. This page is server-rendered — no client polling.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }) {
  return (
    <div style={{
      background: highlight ? '#d72027' : '#1a1a1c',
      padding: '16px 18px',
      borderRadius: 8,
      borderLeft: highlight ? '3px solid #faf8f3' : '3px solid #d72027',
    }}>
      <div style={{ fontSize: 10, color: highlight ? '#faf8f3' : '#c8c2b3', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6, opacity: highlight ? 0.9 : 1 }}>
        {label}
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, color: '#faf8f3', letterSpacing: '-0.02em', lineHeight: 1 }}>
        {Number(value).toLocaleString()}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 11, color: '#d72027', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
        {title}
      </h2>
      <div style={{ background: '#1a1a1c', padding: '12px 16px', borderRadius: 12 }}>
        {children}
      </div>
    </section>
  );
}

function EventList({ events, render }) {
  if (!events || events.length === 0) {
    return <div style={{ fontSize: 13, color: '#86868b', padding: '8px 0' }}>No events yet.</div>;
  }
  return (
    <div>
      {events.map((e, i) => (
        <div key={i} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          padding: '8px 0', borderBottom: i < events.length - 1 ? '1px solid #2a2a2c' : 'none',
          fontSize: 13,
        }}>
          <div style={{ flex: 1, minWidth: 0, color: '#faf8f3', wordBreak: 'break-all' }}>{render(e)}</div>
          <div style={{ fontSize: 10, color: '#86868b', marginLeft: 12, whiteSpace: 'nowrap' }}>
            {e.ts ? new Date(e.ts).toLocaleString('en-CA', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
          </div>
        </div>
      ))}
    </div>
  );
}

const tbl = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const td = { padding: '10px 0', borderBottom: '1px solid #2a2a2c', color: '#faf8f3' };
const tdRight = { padding: '10px 0', borderBottom: '1px solid #2a2a2c', color: '#faf8f3', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 };
