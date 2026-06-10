// /pages/shortlist/[token].js
// Public landlord view. No sign-up required. Accessed via secure token link.
// Landlord sees their realtor's branding prominently, can compare candidates,
// remove from their view, add notes (visible to realtor).

import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import ChatWidget from '../../components/ChatWidget';

const C = {
  paper: '#faf8f3',
  paperDeep: '#f2eee3',
  ink: '#0f0f10',
  inkSoft: '#3a3a3c',
  inkMute: '#86868b',
  rule: '#e3ddd0',
  red: '#d72027',
  redDark: '#a8161c',
  green: '#2d7d4a',
  info: '#eef2f6',
  infoBorder: '#c8d3df',
  infoInk: '#3d4a5c',
};

// Compute fit between an applicant and the landlord's stated preferences.
// Returns { matches: [], misses: [], unknowns: [] } — all in plain language.
// Only references OHRC-compliant fields. Never gender/age/family/etc.
function computeFit(applicant, prefs) {
  if (!prefs || !applicant) return { matches: [], misses: [], unknowns: [] };
  const matches = [];
  const misses = [];
  const unknowns = [];

  const income = applicant.employment?.annualIncome;
  if (prefs.minAnnualIncome) {
    const need = Number(prefs.minAnnualIncome);
    if (income && Number(income) >= need) matches.push(`Income ${formatMoney(income)} ≥ requested ${formatMoney(need)}`);
    else if (income) misses.push(`Income ${formatMoney(income)} below requested ${formatMoney(need)}`);
    else unknowns.push('Income not stated');
  }

  // Rent-to-income check
  const monthly = applicant.employment?.monthlyIncome || (income ? Math.round(Number(income) / 12) : null);
  const rent = applicant.apartment?.estimatedRent;
  if (prefs.rentToIncomeMaxPct && monthly && rent) {
    const ratio = Math.round((rent / monthly) * 100);
    if (ratio <= Number(prefs.rentToIncomeMaxPct)) matches.push(`Rent-to-income ratio ${ratio}% (within requested ≤${prefs.rentToIncomeMaxPct}%)`);
    else misses.push(`Rent-to-income ratio ${ratio}% (above requested ≤${prefs.rentToIncomeMaxPct}%)`);
  }

  // Years at job
  if (prefs.minYearsAtJob) {
    const y = parseFloat(applicant.employment?.yearsAtJob);
    if (!isNaN(y) && y >= Number(prefs.minYearsAtJob)) matches.push(`${y}+ years at current employer (≥${prefs.minYearsAtJob})`);
    else if (!isNaN(y)) misses.push(`${y} years at current employer (below ${prefs.minYearsAtJob})`);
    else unknowns.push('Tenure not stated');
  }

  // Occupants
  if (prefs.maxOccupants) {
    const occ = parseInt(applicant.household?.numberOfOccupants);
    if (!isNaN(occ) && occ <= Number(prefs.maxOccupants)) matches.push(`${occ} occupant${occ === 1 ? '' : 's'} (≤${prefs.maxOccupants} max)`);
    else if (!isNaN(occ)) misses.push(`${occ} occupants exceeds ${prefs.maxOccupants} max`);
  }

  // Smoking
  if (prefs.smokingAllowed === false) {
    const smoker = applicant.household?.smoker;
    if (smoker === 'no') matches.push('Non-smoker');
    else if (smoker === 'yes') misses.push('Applicant smokes (unit is non-smoking)');
  }

  // Pets
  if (prefs.petsPolicy === 'no') {
    const pets = applicant.lifestyle?.pets;
    if (!pets || pets.toLowerCase() === 'none' || pets.toLowerCase() === 'no') matches.push('No pets');
    else misses.push(`Has pets: ${pets}`);
  }

  // Landlord reference required
  if (prefs.requiresLandlordReference) {
    if (applicant.rental?.previousLandlordName) matches.push('Previous landlord reference provided');
    else unknowns.push('No previous landlord reference');
  }

  return { matches, misses, unknowns };
}

function formatMoney(n) {
  if (n == null) return '—';
  return '$' + Number(n).toLocaleString();
}

export default function LandlordShortlistView() {
  const router = useRouter();
  const { token } = router.query;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [removedApps, setRemovedApps] = useState([]); // local copy for instant UI updates
  const [landlordNotes, setLandlordNotes] = useState({});
  const [view, setView] = useState('list'); // 'list' | 'compare' | 'detail'
  const [activeAppNumber, setActiveAppNumber] = useState(null);
  const [showRemoved, setShowRemoved] = useState(false);
  const [noteEditOpen, setNoteEditOpen] = useState(null); // appNumber being edited
  const [noteDraft, setNoteDraft] = useState('');

  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/landlord/view-shared?token=${encodeURIComponent(token)}`);
        const json = await r.json();
        if (!r.ok) {
          setError(json?.error || 'Could not load this share link.');
          setLoading(false);
          return;
        }
        setData(json);
        setLandlordNotes(json.landlordNotes || {});
      } catch (e) {
        setError('Could not connect. Please check your internet.');
      }
      setLoading(false);
    })();
  }, [token]);

  const handleAction = async (action, appNumber, noteText) => {
    if (!token) return;
    try {
      const r = await fetch('/api/landlord/update-shared-view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action, applicationNumber: appNumber, note: noteText }),
      });
      const json = await r.json();
      if (r.ok && json.ok) {
        setRemovedApps(json.landlordRemovedApps || []);
        setLandlordNotes(json.landlordNotes || {});
      }
    } catch (e) {
      console.error('[shortlist] action failed', e);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.paper, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "-apple-system, 'Inter', sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 12 }}>
            Loading
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', marginBottom: 8 }}>
            Loading your shortlist...
          </h2>
          <p style={{ fontSize: 13, color: C.inkSoft }}>One moment.</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: '100vh', background: C.paper, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: "-apple-system, 'Inter', sans-serif" }}>
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 12 }}>
            Link unavailable
          </div>
          <h2 style={{ fontSize: 28, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', marginBottom: 12 }}>
            This link is no longer valid.
          </h2>
          <p style={{ fontSize: 14, color: C.inkSoft, lineHeight: 1.6, marginBottom: 20 }}>
            {error || 'The share link may have expired or been revoked. Ask your realtor to send a fresh one.'}
          </p>
        </div>
      </div>
    );
  }

  const allApplicants = data.applicants || [];
  const activeApplicants = allApplicants.filter(a => !removedApps.includes(a.applicationNumber));
  const removedApplicants = allApplicants.filter(a => removedApps.includes(a.applicationNumber));
  const decisions = data.decisions || {};

  // Sort by priority (top picks first)
  const sortedActive = [...activeApplicants].sort((a, b) => {
    const aP = decisions[a.applicationNumber]?.priority === 'top' ? 0 : 1;
    const bP = decisions[b.applicationNumber]?.priority === 'top' ? 0 : 1;
    return aP - bP;
  });

  const activeApplicant = activeAppNumber ? allApplicants.find(a => a.applicationNumber === activeAppNumber) : null;

  return (
    <>
      <Head>
        <title>{data.realtor.name ? `Shortlist from ${data.realtor.name} — Rentletter` : 'Your shortlist — Rentletter'}</title>
        <meta name="robots" content="noindex" />
      </Head>

      <div style={{ minHeight: '100vh', background: C.paper, fontFamily: "-apple-system, 'Inter', sans-serif", color: C.ink }}>

        {/* REALTOR BRANDING HEADER */}
        <header style={{ background: C.ink, color: C.paper, padding: 'clamp(24px, 5vw, 36px) 0' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 clamp(20px, 4vw, 32px)' }}>
            <div style={{ fontSize: 10, color: '#c8c2b3', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 10 }}>
              Shortlist prepared by your realtor
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <h1 style={{ fontSize: 'clamp(26px, 4.5vw, 36px)', fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.1, marginBottom: 6 }}>
                  {data.realtor.name || 'Your realtor'}
                </h1>
                {data.realtor.brokerage && (
                  <div style={{ fontSize: 14, color: '#c8c2b3', marginBottom: 4 }}>{data.realtor.brokerage}</div>
                )}
                <div style={{ fontSize: 13, color: '#c8c2b3', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                  {data.realtor.phone && (
                    <a href={`tel:${data.realtor.phone}`} style={{ color: '#c8c2b3', textDecoration: 'none' }}>{data.realtor.phone}</a>
                  )}
                  {data.realtor.email && (
                    <a href={`mailto:${data.realtor.email}`} style={{ color: '#c8c2b3', textDecoration: 'underline' }}>{data.realtor.email}</a>
                  )}
                </div>
              </div>
              {data.realtor.phone && (
                <a href={`tel:${data.realtor.phone}`} style={{
                  background: C.red, color: C.paper, textDecoration: 'none',
                  padding: '14px 22px', fontSize: 14, fontWeight: 700,
                  letterSpacing: '0.01em', whiteSpace: 'nowrap',
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                }}>
                  📞 Call your realtor
                </a>
              )}
            </div>
          </div>
        </header>

        {/* CONTENT */}
        <main style={{ maxWidth: 1100, margin: '0 auto', padding: 'clamp(28px, 5vw, 48px) clamp(20px, 4vw, 32px) 80px' }}>

          {/* Title + unit */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
              Your shortlist
            </div>
            <h2 style={{ fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05, marginBottom: 12 }}>
              {activeApplicants.length} candidate{activeApplicants.length === 1 ? '' : 's'} to consider.
            </h2>
            {data.unit && (data.unit.address || data.unit.monthlyRent) && (
              <p style={{ fontSize: 14, color: C.inkSoft, lineHeight: 1.6 }}>
                For: <strong>{data.unit.address}</strong>
                {data.unit.monthlyRent && ` · $${data.unit.monthlyRent}/mo`}
                {data.unit.bedrooms && ` · ${data.unit.bedrooms} bed`}
              </p>
            )}
          </div>

          {/* YOUR STATED PREFERENCES — shown if realtor captured them */}
          {data.preferences && (() => {
            const prefs = data.preferences;
            const items = [];
            if (prefs.minAnnualIncome) items.push({ l: 'Minimum annual income', v: `$${Number(prefs.minAnnualIncome).toLocaleString()}` });
            if (prefs.rentToIncomeMaxPct) items.push({ l: 'Max rent-to-income', v: `${prefs.rentToIncomeMaxPct}%` });
            if (prefs.minYearsAtJob) items.push({ l: 'Min tenure at job', v: `${prefs.minYearsAtJob} year${Number(prefs.minYearsAtJob) === 1 ? '' : 's'}` });
            if (prefs.earliestMoveIn) items.push({ l: 'Earliest move-in', v: prefs.earliestMoveIn });
            if (prefs.latestMoveIn) items.push({ l: 'Latest move-in', v: prefs.latestMoveIn });
            if (prefs.minLeaseTermMonths) items.push({ l: 'Min lease term', v: `${prefs.minLeaseTermMonths} months` });
            if (prefs.maxOccupants) items.push({ l: 'Max occupants', v: prefs.maxOccupants });
            if (prefs.smokingAllowed === false) items.push({ l: 'Smoking', v: 'Not allowed' });
            if (prefs.petsPolicy) items.push({ l: 'Pets', v: prefs.petsPolicy === 'yes' ? 'Allowed' : prefs.petsPolicy === 'no' ? 'Not allowed' : 'Case-by-case' });
            if (prefs.parkingSpots) items.push({ l: 'Parking', v: `${prefs.parkingSpots} spot${Number(prefs.parkingSpots) === 1 ? '' : 's'}` });

            if (items.length === 0 && !prefs.notes) return null;

            return (
              <div style={{ marginBottom: 32, padding: 'clamp(16px, 3vw, 22px)', background: C.info, borderLeft: `4px solid ${C.infoBorder}` }}>
                <div style={{ fontSize: 10, color: C.infoInk, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>
                  Your stated preferences
                </div>
                {items.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: prefs.notes ? 14 : 0 }}>
                    {items.map(it => (
                      <div key={it.l}>
                        <div style={{ fontSize: 11, color: C.inkMute, marginBottom: 2 }}>{it.l}</div>
                        <div style={{ fontSize: 14, color: C.ink, fontWeight: 600 }}>{it.v}</div>
                      </div>
                    ))}
                  </div>
                )}
                {prefs.notes && (
                  <div style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.55, fontStyle: 'italic', paddingTop: items.length > 0 ? 10 : 0, borderTop: items.length > 0 ? `1px solid ${C.infoBorder}` : 'none' }}>
                    "{prefs.notes}"
                  </div>
                )}
                <div style={{ fontSize: 11, color: C.inkMute, marginTop: 14, lineHeight: 1.55 }}>
                  Each candidate below is checked against these preferences. Fit notes are based only on these legal screening criteria.
                </div>
              </div>
            );
          })()}

          {/* View toggle */}
          {view !== 'detail' && activeApplicants.length > 0 && (
            <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: `1px solid ${C.rule}` }}>
              {['list', 'compare'].map(v => (
                <button key={v}
                  onClick={() => setView(v)}
                  style={{
                    background: 'transparent', border: 'none',
                    padding: '14px 20px', fontSize: 14, fontWeight: 700,
                    color: view === v ? C.ink : C.inkMute,
                    borderBottom: view === v ? `2px solid ${C.red}` : '2px solid transparent',
                    cursor: 'pointer', marginBottom: -1,
                  }}>
                  {v === 'list' ? 'List view' : 'Compare side-by-side'}
                </button>
              ))}
            </div>
          )}

          {/* DETAIL VIEW */}
          {view === 'detail' && activeApplicant && (
            <ApplicantDetail
              applicant={activeApplicant}
              decision={decisions[activeApplicant.applicationNumber]}
              landlordNote={landlordNotes[activeApplicant.applicationNumber]}
              onBack={() => { setView('list'); setActiveAppNumber(null); }}
              onRemove={() => { handleAction('remove', activeApplicant.applicationNumber); setView('list'); setActiveAppNumber(null); }}
              onEditNote={() => {
                setNoteDraft(landlordNotes[activeApplicant.applicationNumber]?.text || '');
                setNoteEditOpen(activeApplicant.applicationNumber);
              }}
              realtorEmail={data.realtor.email}
            />
          )}

          {/* LIST VIEW */}
          {view === 'list' && sortedActive.length > 0 && (
            <div>
              {sortedActive.map(app => {
                const dec = decisions[app.applicationNumber] || {};
                const isTopPick = dec.priority === 'top';
                const myNote = landlordNotes[app.applicationNumber];
                return (
                  <div key={app.applicationNumber}
                    style={{
                      background: C.paper,
                      border: `1px solid ${C.rule}`,
                      borderLeft: isTopPick ? `4px solid ${C.red}` : `1px solid ${C.rule}`,
                      padding: 'clamp(18px, 3vw, 24px)',
                      marginBottom: 14,
                    }}>
                    {isTopPick && (
                      <div style={{ fontSize: 10, color: C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
                        ★ Top pick from {data.realtor.name || 'your realtor'}
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap', marginBottom: 10 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <h3 style={{ fontSize: 'clamp(20px, 3.5vw, 26px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', marginBottom: 4 }}>
                          {app.tenant?.fullName || 'Applicant'}
                        </h3>
                        <div style={{ fontSize: 14, color: C.inkSoft, lineHeight: 1.55 }}>
                          {app.employment?.jobTitle || ''}{app.employment?.employer && ` at ${app.employment.employer}`}
                        </div>
                      </div>
                      {app.scorecard?.overall != null && (
                        <div style={{ background: C.ink, color: C.paper, padding: '6px 12px', fontSize: 13, fontWeight: 700 }}>
                          {app.scorecard.overall}/5
                        </div>
                      )}
                    </div>
                    {/* Key facts row */}
                    <div style={{ display: 'flex', gap: 18, fontSize: 13, color: C.inkSoft, flexWrap: 'wrap', marginBottom: 14 }}>
                      {app.employment?.annualIncome && <span><strong style={{ color: C.ink }}>${Number(app.employment.annualIncome).toLocaleString()}</strong>/yr</span>}
                      {app.household?.totalOccupants && <span>{app.household.totalOccupants} occupants</span>}
                      {app.lifestyle?.movein && <span>Move-in: {app.lifestyle.movein}</span>}
                      <span style={{ color: C.inkMute }}>{app.applicationNumber}</span>
                    </div>
                    {/* Fit against landlord's stated preferences */}
                    {data.preferences && (() => {
                      const fit = computeFit(app, data.preferences);
                      if (fit.matches.length === 0 && fit.misses.length === 0 && fit.unknowns.length === 0) return null;
                      return (
                        <div style={{ background: C.info, padding: 12, marginBottom: 12, borderLeft: `3px solid ${C.infoBorder}` }}>
                          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.infoInk, marginBottom: 6 }}>
                            Fit against your preferences
                          </div>
                          {fit.matches.map((m, i) => (
                            <div key={'m' + i} style={{ fontSize: 12, color: C.green, lineHeight: 1.5, marginBottom: 2 }}>✓ {m}</div>
                          ))}
                          {fit.misses.map((m, i) => (
                            <div key={'x' + i} style={{ fontSize: 12, color: C.red, lineHeight: 1.5, marginBottom: 2 }}>✗ {m}</div>
                          ))}
                          {fit.unknowns.map((m, i) => (
                            <div key={'u' + i} style={{ fontSize: 12, color: C.inkMute, lineHeight: 1.5, marginBottom: 2 }}>? {m}</div>
                          ))}
                        </div>
                      );
                    })()}
                    {/* Realtor's note */}
                    {dec.notes && (
                      <div style={{ background: C.paperDeep, padding: 12, fontSize: 13, color: C.ink, lineHeight: 1.55, marginBottom: 12, borderLeft: `3px solid ${C.ink}` }}>
                        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.inkSoft, marginBottom: 4 }}>
                          Note from {data.realtor.name || 'your realtor'}
                        </div>
                        {dec.notes}
                      </div>
                    )}
                    {/* Landlord's own note */}
                    {myNote && (
                      <div style={{ background: '#f7f4eb', padding: 12, fontSize: 13, color: C.ink, lineHeight: 1.55, marginBottom: 12, borderLeft: `3px solid ${C.green}` }}>
                        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.green, marginBottom: 4 }}>
                          Your note (your realtor can see this)
                        </div>
                        {myNote.text}
                      </div>
                    )}
                    {/* Action row */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                      <button
                        onClick={() => { setActiveAppNumber(app.applicationNumber); setView('detail'); }}
                        style={{ background: C.ink, color: C.paper, border: 'none', padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 40 }}>
                        See full details →
                      </button>
                      <button
                        onClick={() => { setNoteDraft(myNote?.text || ''); setNoteEditOpen(app.applicationNumber); }}
                        style={{ background: 'transparent', color: C.ink, border: `1px solid ${C.ink}`, padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 40 }}>
                        {myNote ? '✎ Edit my note' : '+ Add my note'}
                      </button>
                      {app.tenant?.email && (
                        <a href={`mailto:${app.tenant.email}`} style={{ background: 'transparent', color: C.ink, border: `1px solid ${C.rule}`, padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 40, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                          ✉ Email
                        </a>
                      )}
                      {app.tenant?.phone && (
                        <a href={`tel:${app.tenant.phone}`} style={{ background: 'transparent', color: C.ink, border: `1px solid ${C.rule}`, padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 40, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                          📞 Call
                        </a>
                      )}
                      <button
                        onClick={() => {
                          if (confirm(`Remove ${app.tenant?.fullName || 'this candidate'} from your view? You can restore them later if you change your mind.`)) {
                            handleAction('remove', app.applicationNumber);
                          }
                        }}
                        style={{ background: 'transparent', color: C.inkSoft, border: 'none', padding: '10px 12px', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
                        Remove from my list
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* COMPARE VIEW */}
          {view === 'compare' && sortedActive.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${C.ink}` }}>
                    <th style={cellHead}>Candidate</th>
                    <th style={cellHead}>Job / Income</th>
                    <th style={cellHead}>Household</th>
                    <th style={cellHead}>Score</th>
                    <th style={cellHead}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedActive.map(app => {
                    const dec = decisions[app.applicationNumber] || {};
                    const isTopPick = dec.priority === 'top';
                    return (
                      <tr key={app.applicationNumber} style={{ borderBottom: `1px solid ${C.rule}`, background: isTopPick ? '#fff5f5' : 'transparent' }}>
                        <td style={cellBody}>
                          {isTopPick && <span style={{ fontSize: 10, color: C.red, fontWeight: 700, display: 'block', marginBottom: 4 }}>★ TOP PICK</span>}
                          <button onClick={() => { setActiveAppNumber(app.applicationNumber); setView('detail'); }} style={{ background: 'transparent', border: 'none', color: C.ink, fontWeight: 700, fontSize: 15, cursor: 'pointer', padding: 0, textAlign: 'left', textDecoration: 'underline' }}>
                            {app.tenant?.fullName}
                          </button>
                        </td>
                        <td style={cellBody}>
                          {app.employment?.jobTitle}<br />
                          <strong>${Number(app.employment?.annualIncome || 0).toLocaleString()}/yr</strong>
                        </td>
                        <td style={cellBody}>
                          {app.household?.totalOccupants || 1} occupants<br />
                          {app.household?.hasPets === 'yes' && '🐾 Pets'}
                        </td>
                        <td style={cellBody}>
                          <strong>{app.scorecard?.overall ?? '—'}/5</strong>
                        </td>
                        <td style={cellBody}>
                          {dec.notes ? dec.notes.slice(0, 80) + (dec.notes.length > 80 ? '...' : '') : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Empty state if all removed */}
          {view === 'list' && activeApplicants.length === 0 && (
            <div style={{ textAlign: 'center', padding: 'clamp(40px, 8vw, 80px) 20px' }}>
              <p style={{ fontSize: 16, color: C.inkSoft, marginBottom: 16 }}>
                You've removed everyone from your view.
              </p>
              {removedApplicants.length > 0 && (
                <button onClick={() => setShowRemoved(true)}
                  style={{ background: C.ink, color: C.paper, border: 'none', padding: '12px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                  Show removed candidates ({removedApplicants.length})
                </button>
              )}
            </div>
          )}

          {/* Removed list */}
          {(showRemoved || (view === 'list' && removedApplicants.length > 0 && activeApplicants.length === 0)) && removedApplicants.length > 0 && (
            <div style={{ marginTop: 40, paddingTop: 24, borderTop: `1px solid ${C.rule}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: C.inkMute, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Removed by you ({removedApplicants.length})
                </h3>
                <button onClick={() => setShowRemoved(!showRemoved)} style={{ background: 'transparent', border: 'none', color: C.inkSoft, fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
                  {showRemoved ? 'Hide' : 'Show'}
                </button>
              </div>
              {showRemoved && removedApplicants.map(app => (
                <div key={app.applicationNumber}
                  style={{ padding: 14, marginBottom: 8, background: C.paperDeep, opacity: 0.7, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, textDecoration: 'line-through' }}>{app.tenant?.fullName}</div>
                    <div style={{ fontSize: 12, color: C.inkSoft }}>{app.applicationNumber}</div>
                  </div>
                  <button onClick={() => handleAction('restore', app.applicationNumber)}
                    style={{ background: C.ink, color: C.paper, border: 'none', padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Bottom — call-to-action to realtor */}
          <section style={{ marginTop: 60, padding: 'clamp(24px, 5vw, 40px)', background: C.ink, color: C.paper }}>
            <div style={{ fontSize: 11, color: '#f0b8bb', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
              Ready to decide?
            </div>
            <h3 style={{ fontSize: 'clamp(22px, 4vw, 30px)', fontWeight: 800, color: C.paper, letterSpacing: '-0.02em', marginBottom: 12 }}>
              Talk to {data.realtor.name || 'your realtor'}.
            </h3>
            <p style={{ fontSize: 14, color: '#c8c2b3', lineHeight: 1.6, marginBottom: 20 }}>
              Reply to the email from your realtor or contact them directly. Your notes and any candidates you removed are saved here automatically.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {data.realtor.email && (
                <a href={`mailto:${data.realtor.email}`}
                  style={{ background: C.red, color: C.paper, textDecoration: 'none', padding: '14px 22px', fontSize: 14, fontWeight: 700 }}>
                  ✉ Email {data.realtor.name || 'realtor'}
                </a>
              )}
              {data.realtor.phone && (
                <a href={`tel:${data.realtor.phone}`}
                  style={{ background: 'transparent', color: C.paper, border: `1px solid ${C.paper}`, textDecoration: 'none', padding: '14px 22px', fontSize: 14, fontWeight: 700 }}>
                  📞 Call {data.realtor.phone}
                </a>
              )}
            </div>
          </section>

          {/* Small footer */}
          <div style={{ marginTop: 32, paddingTop: 20, borderTop: `1px solid ${C.rule}`, fontSize: 11, color: C.inkMute, lineHeight: 1.6 }}>
            Tenant data is self-reported. Verify references independently before signing a lease. This shortlist was prepared by {data.realtor.name || 'your realtor'} using Rentletter.
          </div>
        </main>

        {/* NOTE EDIT MODAL */}
        {noteEditOpen && (
          <div onClick={() => setNoteEditOpen(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(15, 15, 16, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 100 }}>
            <div onClick={e => e.stopPropagation()}
              style={{ background: C.paper, maxWidth: 480, width: '100%', border: `1px solid ${C.rule}` }}>
              <div style={{ padding: 24, borderBottom: `1px solid ${C.rule}` }}>
                <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Your note
                </div>
                <h3 style={{ fontSize: 20, fontWeight: 800, color: C.ink, letterSpacing: '-0.015em' }}>
                  Note about this candidate
                </h3>
                <p style={{ fontSize: 12, color: C.inkSoft, marginTop: 6, lineHeight: 1.5 }}>
                  Your realtor will see this. Useful for questions, preferences, or things you want them to follow up on.
                </p>
              </div>
              <div style={{ padding: 24 }}>
                <textarea
                  value={noteDraft}
                  onChange={e => setNoteDraft(e.target.value)}
                  placeholder="e.g., I'd like to interview this candidate first. Concerned about the move-in date — can they start earlier?"
                  rows={5}
                  style={{ width: '100%', padding: 12, fontSize: 14, border: `1px solid ${C.rule}`, background: C.paper, color: C.ink, outline: 'none', fontFamily: 'inherit', resize: 'vertical', marginBottom: 14 }}
                />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button onClick={() => setNoteEditOpen(null)}
                    style={{ background: 'transparent', color: C.inkSoft, border: `1px solid ${C.rule}`, padding: '12px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button onClick={() => { handleAction('note', noteEditOpen, noteDraft); setNoteEditOpen(null); }}
                    style={{ background: C.red, color: C.paper, border: 'none', padding: '12px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                    Save note
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <ChatWidget />
      </div>
    </>
  );
}

function ApplicantDetail({ applicant, decision, landlordNote, onBack, onRemove, onEditNote, realtorEmail }) {
  const a = applicant;
  return (
    <div>
      <button onClick={onBack}
        style={{ background: 'transparent', color: C.inkSoft, border: 'none', padding: '8px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 20, textDecoration: 'underline' }}>
        ← Back to list
      </button>

      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 'clamp(28px, 5vw, 40px)', fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.1, marginBottom: 8 }}>
          {a.tenant?.fullName}
        </h2>
        <div style={{ fontSize: 15, color: C.inkSoft, marginBottom: 4 }}>
          {a.employment?.jobTitle}{a.employment?.employer && ` at ${a.employment.employer}`}
        </div>
        <div style={{ fontSize: 12, color: C.inkMute }}>{a.applicationNumber}</div>
      </div>

      {decision?.notes && (
        <div style={{ background: C.paperDeep, padding: 16, marginBottom: 20, borderLeft: `3px solid ${C.ink}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.inkSoft, marginBottom: 6 }}>
            Note from your realtor
          </div>
          <div style={{ fontSize: 14, color: C.ink, lineHeight: 1.55 }}>{decision.notes}</div>
        </div>
      )}

      {landlordNote && (
        <div style={{ background: '#f7f4eb', padding: 16, marginBottom: 20, borderLeft: `3px solid ${C.green}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.green, marginBottom: 6 }}>
            Your note
          </div>
          <div style={{ fontSize: 14, color: C.ink, lineHeight: 1.55 }}>{landlordNote.text}</div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
        <Stat label="Income" value={a.employment?.annualIncome ? `$${Number(a.employment.annualIncome).toLocaleString()}/yr` : '—'} />
        <Stat label="Employment" value={a.employment?.duration || '—'} />
        <Stat label="Household" value={`${a.household?.totalOccupants || 1} occupant${a.household?.totalOccupants > 1 ? 's' : ''}`} />
        <Stat label="Move-in" value={a.lifestyle?.movein || '—'} />
        <Stat label="Score" value={a.scorecard?.overall != null ? `${a.scorecard.overall}/5` : '—'} />
      </div>

      {/* References */}
      {Array.isArray(a.references) && a.references.length > 0 && (
        <Section title="References">
          {a.references.map((r, i) => (
            <div key={i} style={{ padding: 14, background: C.paperDeep, marginBottom: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 4 }}>{r.name}</div>
              <div style={{ fontSize: 13, color: C.inkSoft }}>
                {r.role} {r.relationship && `· ${r.relationship}`}
              </div>
              {(r.email || r.phone) && (
                <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 6 }}>
                  {r.email && <a href={`mailto:${r.email}`} style={{ color: C.red, textDecoration: 'none' }}>{r.email}</a>}
                  {r.email && r.phone && ' · '}
                  {r.phone && <a href={`tel:${r.phone}`} style={{ color: C.red, textDecoration: 'none' }}>{r.phone}</a>}
                </div>
              )}
            </div>
          ))}
        </Section>
      )}

      {/* Cover letter */}
      {a.coverLetter && (
        <Section title="Cover letter">
          <div style={{ padding: 18, background: C.paper, border: `1px solid ${C.rule}`, fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', color: C.ink }}>
            {a.coverLetter}
          </div>
        </Section>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 28, paddingTop: 20, borderTop: `1px solid ${C.rule}` }}>
        <button onClick={onEditNote}
          style={{ background: C.ink, color: C.paper, border: 'none', padding: '14px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          ✎ Add/edit my note
        </button>
        {a.tenant?.email && (
          <a href={`mailto:${a.tenant.email}`}
            style={{ background: 'transparent', color: C.ink, border: `1px solid ${C.ink}`, padding: '14px 20px', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
            ✉ Email candidate
          </a>
        )}
        {a.tenant?.phone && (
          <a href={`tel:${a.tenant.phone}`}
            style={{ background: 'transparent', color: C.ink, border: `1px solid ${C.ink}`, padding: '14px 20px', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
            📞 Call candidate
          </a>
        )}
        <button onClick={onRemove}
          style={{ background: 'transparent', color: C.inkSoft, border: 'none', padding: '14px 12px', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', marginLeft: 'auto' }}>
          Remove from my list
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ padding: 14, background: C.paperDeep, borderLeft: `3px solid ${C.red}` }}>
      <div style={{ fontSize: 10, color: C.inkMute, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 15, color: C.ink, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 11, color: C.inkMute, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>{title}</h3>
      {children}
    </section>
  );
}

const cellHead = { textAlign: 'left', padding: '12px 16px', fontSize: 11, color: C.inkMute, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' };
const cellBody = { padding: '14px 16px', fontSize: 14, color: C.ink, lineHeight: 1.5, verticalAlign: 'top' };
