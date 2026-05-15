import { useState, useEffect } from 'react';
import Head from 'next/head';

// ─── DESIGN TOKENS (matching main site) ──────────────────────
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
};

const GlobalStyle = () => (
  <style jsx global>{`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      background: ${C.paper}; color: ${C.ink};
      font-family: 'Inter', -apple-system, sans-serif;
      overflow-x: hidden;
      -webkit-font-smoothing: antialiased;
    }
    button, input, textarea, select { font-family: 'Inter', sans-serif; }
    button { cursor: pointer; }
    input:focus { outline: none; }
    ::selection { background: ${C.red}; color: ${C.paper}; }
  `}</style>
);

const Wordmark = () => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
    <div style={{ width: 3, height: 20, background: C.red }} />
    <span style={{ fontSize: 17, color: C.ink, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>
      Rentletter
    </span>
  </div>
);

// ─── STAR DISPLAY ────────────────────────────────────────────
const Stars = ({ score, size = 14 }) => {
  const full = Math.floor(score);
  const stars = [];
  for (let i = 0; i < 5; i++) {
    stars.push(
      <span key={i} style={{ color: i < full ? C.red : C.rule, fontSize: size, lineHeight: 1 }}>
        ★
      </span>
    );
  }
  return <span style={{ display: 'inline-flex', gap: 1 }}>{stars}</span>;
};

// ─── DEFAULT WEIGHT SETTINGS ─────────────────────────────────
const DEFAULT_WEIGHTS = {
  incomeStability: 1.0,
  rentAffordability: 1.0,
  rentalHistory: 1.0,
  longTermIntent: 1.0,
  disclosures: 1.0,
};

const calculateWeightedScore = (scorecard, weights) => {
  if (!scorecard) return 0;
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  if (totalWeight === 0) return 0;
  const weighted =
    scorecard.incomeStability.score * weights.incomeStability +
    scorecard.rentAffordability.score * weights.rentAffordability +
    scorecard.rentalHistory.score * weights.rentalHistory +
    scorecard.longTermIntent.score * weights.longTermIntent +
    scorecard.disclosures.score * weights.disclosures;
  return Math.round((weighted / totalWeight) * 10) / 10;
};

export default function LandlordDashboard() {
  const [appNumberInput, setAppNumberInput] = useState('');
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState('detail'); // 'detail' | 'compare' | 'ranked'
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [activeAppIdx, setActiveAppIdx] = useState(0);

  // ── FILTER STATE ──
  const [filters, setFilters] = useState({
    smokerStatus: 'any', // 'any' | 'non-smoker' | 'no-indoor'
    pets: 'any', // 'any' | 'no-pets' | 'with-pets'
    coApplicant: 'any', // 'any' | 'single' | 'with-co'
    minIncome: 0,
    maxRentToIncome: 100,
  });
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Apply filters to applications list (used for Compare and Ranked views)
  const filteredApplications = applications.filter(app => {
    if (filters.smokerStatus === 'non-smoker' && app.household?.smoker !== 'no') return false;
    if (filters.smokerStatus === 'no-indoor' && app.household?.smoker === 'yes') return false;
    if (filters.pets === 'no-pets' && app.lifestyle?.pets && app.lifestyle.pets.toLowerCase() !== 'none' && app.lifestyle.pets.trim() !== '') return false;
    if (filters.pets === 'with-pets' && (!app.lifestyle?.pets || app.lifestyle.pets.toLowerCase() === 'none' || app.lifestyle.pets.trim() === '')) return false;
    if (filters.coApplicant === 'single' && app.coApplicant) return false;
    if (filters.coApplicant === 'with-co' && !app.coApplicant) return false;
    const totalIncome = (app.employment?.annualIncome || 0) + (app.coApplicant?.annualIncome || 0);
    if (totalIncome < filters.minIncome) return false;
    if (app.apartment?.rentToIncomeRatio && app.apartment.rentToIncomeRatio > filters.maxRentToIncome) return false;
    return true;
  });

  const resetFilters = () => setFilters({
    smokerStatus: 'any', pets: 'any', coApplicant: 'any',
    minIncome: 0, maxRentToIncome: 100,
  });

  const activeFilterCount = [
    filters.smokerStatus !== 'any',
    filters.pets !== 'any',
    filters.coApplicant !== 'any',
    filters.minIncome > 0,
    filters.maxRentToIncome < 100,
  ].filter(Boolean).length;

  // Load saved applications from session storage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = sessionStorage.getItem('landlord_apps');
    if (saved) {
      try {
        setApplications(JSON.parse(saved));
      } catch (e) {
        // ignore
      }
    }
  }, []);

  // Save applications to session storage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem('landlord_apps', JSON.stringify(applications));
  }, [applications]);

  const lookupApplication = async () => {
    setError('');
    if (!appNumberInput.trim()) {
      setError('Please enter an application number.');
      return;
    }
    const normalized = appNumberInput.trim().toUpperCase();
    if (applications.find(a => a.applicationNumber === normalized)) {
      setError('That application is already loaded.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/landlord/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationNumber: normalized }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setApplications(prev => [...prev, json.application]);
      setAppNumberInput('');
      setActiveAppIdx(applications.length);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const removeApplication = (appNumber) => {
    setApplications(prev => prev.filter(a => a.applicationNumber !== appNumber));
    if (activeAppIdx >= applications.length - 1) {
      setActiveAppIdx(Math.max(0, applications.length - 2));
    }
  };

  const clearAll = () => {
    if (!confirm('Clear all loaded applications?')) return;
    setApplications([]);
    setActiveAppIdx(0);
  };

  // ─── DEV: Load demo applications for instant testing ─────────
  const loadDemoApplications = () => {
    const demos = [
      {
        applicationNumber: 'RL-2026-DEMO-A001',
        createdAt: new Date().toISOString(),
        tenant: { fullName: 'Sarah Chen', age: '29', dateOfBirth: '1996-08-12', phone: '(416) 555-0181' },
        employment: {
          jobTitle: 'Marketing Manager', employer: 'Loblaw Companies',
          yearsAtJob: '4', annualIncome: 87000, monthlyIncome: 7250,
        },
        rental: {
          previousAddress: '245 Sherbourne Street, Toronto', yearsAtPrevious: '2.5',
          previousLandlordName: 'Michael Park', previousLandlordContact: '416-555-0142',
          currentRent: 1950,
        },
        apartment: {
          address: '144 Roxborough Drive, Toronto', description: '1BR, Rosedale, $2,200/mo',
          estimatedRent: 2200, rentToIncomeRatio: 30,
        },
        move: { moveInDate: 'June 15, 2026', reasonForMoving: 'Moving closer to my office on Bloor Street.' },
        household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'no' },
        coApplicant: null,
        lifestyle: { personality: 'Quiet, works from home 3 days a week.', pets: null },
        vehicle: null,
        references: [
          { name: 'Jennifer Lee', relationship: 'Direct manager', contact: '416-555-0167' },
          { name: 'David Park', relationship: 'Friend of 7 years', contact: 'd.park@email.com' },
        ],
        disclosures: null,
        scorecard: {
          incomeStability: { score: 5, note: '4 years at Loblaw Companies' },
          rentAffordability: { score: 5, note: '30% of monthly income' },
          rentalHistory: { score: 5, note: '2.5 years with reference available' },
          longTermIntent: { score: 5, note: 'Move tied to job commute' },
          disclosures: { score: 5, note: 'No items to address' },
          overall: 5.0,
        },
      },
      {
        applicationNumber: 'RL-2026-DEMO-B002',
        createdAt: new Date().toISOString(),
        tenant: { fullName: 'James Okafor', age: '26', dateOfBirth: '1999-03-22', phone: '(647) 555-0203' },
        employment: {
          jobTitle: 'Software Engineer', employer: 'Shopify',
          yearsAtJob: '1.5', annualIncome: 95000, monthlyIncome: 7916,
        },
        rental: {
          previousAddress: null, yearsAtPrevious: null,
          previousLandlordName: null, previousLandlordContact: null,
          currentRent: null,
        },
        apartment: {
          address: '88 Yonge Street, Toronto', description: 'Studio, downtown, $1,850/mo',
          estimatedRent: 1850, rentToIncomeRatio: 23,
        },
        move: { moveInDate: 'July 1, 2026', reasonForMoving: 'First-time renter — moving out of family home to start independent life closer to work.' },
        household: { numberOfOccupants: '1', occupantsDetails: null, smoker: 'no' },
        coApplicant: null,
        lifestyle: { personality: 'Quiet evenings, occasional weekend hosting.', pets: null },
        vehicle: { makeModel: 'Honda Civic', year: '2020' },
        references: [
          { name: 'Adaobi Okafor', relationship: 'Sister, social worker', contact: 'a.okafor@email.com' },
          { name: 'Marcus Reid', relationship: 'Manager at Shopify', contact: '416-555-0298' },
        ],
        disclosures: 'Limited rental history as first-time renter. Can provide guarantor and employer reference.',
        scorecard: {
          incomeStability: { score: 4, note: '1.5 years at Shopify' },
          rentAffordability: { score: 5, note: '23% of monthly income' },
          rentalHistory: { score: 3, note: 'First-time renter — alternative documentation' },
          longTermIntent: { score: 4, note: 'General life-stage move' },
          disclosures: { score: 4, note: 'Items proactively disclosed' },
          overall: 4.0,
        },
      },
      {
        applicationNumber: 'RL-2026-DEMO-C003',
        createdAt: new Date().toISOString(),
        tenant: { fullName: 'Priya Nair', age: '34', dateOfBirth: '1991-11-04', phone: '(437) 555-0312' },
        employment: {
          jobTitle: 'Senior UX Designer', employer: 'CIBC',
          yearsAtJob: '5', annualIncome: 115000, monthlyIncome: 9583,
        },
        rental: {
          previousAddress: '300 Bloor Street West, Toronto', yearsAtPrevious: '3',
          previousLandlordName: 'David Wong', previousLandlordContact: '647-555-0199',
          currentRent: 2400,
        },
        apartment: {
          address: '550 Queen Street West, Toronto', description: '2BR, Queen West, $3,100/mo',
          estimatedRent: 3100, rentToIncomeRatio: 16,
        },
        move: { moveInDate: 'August 1, 2026', reasonForMoving: 'Partner and I are moving in together closer to the West End where we both work.' },
        household: { numberOfOccupants: '2', occupantsDetails: 'Partner and I, both work hybrid.', smoker: 'no' },
        coApplicant: {
          name: 'Daniel Ross', age: '33', relationship: 'Partner of 4 years',
          jobTitle: 'Product Manager', employer: 'RBC', annualIncome: 105000,
        },
        lifestyle: { personality: 'Stable, professional household.', pets: 'One indoor cat, 6 years old, vet records available' },
        vehicle: { makeModel: 'Toyota RAV4', year: '2022' },
        references: [
          { name: 'Sarah Martinez', relationship: 'Director at CIBC', contact: '416-555-0445' },
          { name: 'Michael Tan', relationship: 'Previous landlord at 300 Bloor', contact: '416-555-0512' },
        ],
        disclosures: null,
        scorecard: {
          incomeStability: { score: 5, note: '5 years at CIBC' },
          rentAffordability: { score: 5, note: '16% of combined household income' },
          rentalHistory: { score: 5, note: '3 years with reference available' },
          longTermIntent: { score: 5, note: 'Move tied to partner cohabitation' },
          disclosures: { score: 5, note: 'No items to address' },
          overall: 5.0,
        },
      },
    ];
    setApplications(demos);
    setActiveAppIdx(0);
  };

  // ════════════════════════════════════════════════════════════
  // PAGE LAYOUT
  // ════════════════════════════════════════════════════════════
  return (
    <>
      <Head>
        <title>Landlord Dashboard — Rentletter</title>
        <meta name="description" content="Verify, compare, and rank tenant applications. Free for landlords and realtors." />
      </Head>
      <GlobalStyle />

      <div style={{ minHeight: '100vh', background: C.paper }}>

        {/* ── RED COMMAND BAR at top ────────────────────────── */}
        <div style={{
          background: C.red, color: C.paper,
          padding: '8px 32px', fontSize: 11,
          fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
              background: C.paper, animation: 'pulseRed 2s ease-in-out infinite',
            }} />
            Landlord Dashboard · Live
          </div>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
            <span style={{ opacity: 0.85 }}>Free for landlords + realtors</span>
            <a href="/" style={{ color: C.paper, textDecoration: 'none', opacity: 0.85 }}>
              ← Back to Rentletter
            </a>
          </div>
          <style jsx>{`
            @keyframes pulseRed {
              0%, 100% { opacity: 1; transform: scale(1); }
              50% { opacity: 0.4; transform: scale(0.85); }
            }
          `}</style>
        </div>

        {/* ── HEADER ─────────────────────────────────────────── */}
        <header style={{ borderBottom: `1px solid ${C.rule}`, background: C.paper }}>
          <div style={{ maxWidth: 1400, margin: '0 auto', padding: '22px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <a href="/" style={{ textDecoration: 'none' }}>
              <Wordmark />
            </a>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: C.inkMute }}>
              <span style={{ fontFamily: 'monospace', letterSpacing: '0.04em' }}>
                {applications.length > 0
                  ? `${applications.length} application${applications.length === 1 ? '' : 's'} loaded`
                  : 'Ready to verify'}
              </span>
            </div>
          </div>
        </header>

        <div style={{ maxWidth: 1400, margin: '0 auto', padding: applications.length === 0 ? '0' : '40px 32px 80px' }}>

          {/* ── INTRO HERO — red full-bleed magazine cover when empty ── */}
          {applications.length === 0 && (
            <section style={{ background: C.red, color: C.paper, position: 'relative', overflow: 'hidden', marginBottom: 0 }}>
              {/* Oversized number decorations */}
              <div style={{
                position: 'absolute',
                top: 40, right: '5%',
                fontSize: 'clamp(180px, 28vw, 380px)',
                lineHeight: 0.85, fontWeight: 900,
                color: C.redDark, opacity: 0.45,
                fontFamily: 'Inter, sans-serif',
                letterSpacing: '-0.05em',
                pointerEvents: 'none',
                userSelect: 'none',
              }}>
                10
              </div>
              <div style={{ maxWidth: 1100, margin: '0 auto', padding: '80px 32px 100px', position: 'relative', zIndex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
                  <div style={{ width: 32, height: 1, background: C.paper }} />
                  <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.85 }}>
                    For landlords + realtors
                  </span>
                </div>

                <h1 style={{
                  fontSize: 'clamp(40px, 7.5vw, 96px)',
                  lineHeight: 0.95,
                  letterSpacing: '-0.035em',
                  color: C.paper, fontWeight: 800,
                  marginBottom: 32, maxWidth: 900,
                }}>
                  Pick the right tenant<br />
                  in 10 minutes,<br />
                  not 10 days.
                </h1>

                <p style={{ fontSize: 19, lineHeight: 1.5, color: C.paper, opacity: 0.9, maxWidth: 620, marginBottom: 40 }}>
                  Paste any Rentletter application number to verify the tenant, see their full profile, and compare them side-by-side with other applicants. <strong style={{ color: C.paper, opacity: 1 }}>Free</strong> for landlords and realtors. No account required.
                </p>

                {/* Inline "free" tags */}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {['No login', 'No credit card', 'Unlimited applications', 'Session-private'].map(tag => (
                    <span key={tag} style={{
                      fontSize: 11, fontWeight: 600,
                      letterSpacing: '0.06em', textTransform: 'uppercase',
                      color: C.paper, border: `1px solid ${C.paper}`,
                      padding: '6px 14px', opacity: 0.85,
                    }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* ── How it works (only when no apps loaded) ── */}
          {applications.length === 0 && (
            <section style={{ padding: '64px 32px 48px', maxWidth: 1100, margin: '0 auto' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 32,
              }}>
                {[
                  { n: '01', t: 'Paste application numbers', d: 'Tenants share their number (RL-2026-XXXX-XXXX) with you.' },
                  { n: '02', t: 'See the full picture', d: 'Income, history, references, lifestyle, and our honest Scorecard.' },
                  { n: '03', t: 'Compare and rank', d: 'Side-by-side comparison. Weight what matters most to you.' },
                  { n: '04', t: 'Make the call', d: 'Defensible decision in minutes. Reach out to your top pick.' },
                ].map(s => (
                  <div key={s.n}>
                    <div style={{ fontSize: 12, color: C.red, marginBottom: 8, fontWeight: 600, letterSpacing: '0.08em' }}>{s.n}</div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: C.ink, marginBottom: 6 }}>{s.t}</h3>
                    <p style={{ fontSize: 13, lineHeight: 1.5, color: C.inkSoft }}>{s.d}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Outer padded container for input + below */}
          <div style={{ padding: applications.length === 0 ? '0 32px 80px' : '40px 32px 80px' }}>

          {/* ── INPUT BAR ────────────────────────────────────── */}
          <section style={{ marginBottom: 32 }}>
            <label style={{ display: 'block', fontSize: 12, color: C.inkSoft, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
              Add application number
            </label>
            <div style={{ display: 'flex', gap: 12, alignItems: 'stretch', flexWrap: 'wrap' }}>
              <input
                value={appNumberInput}
                onChange={e => setAppNumberInput(e.target.value)}
                placeholder="RL-2026-XXXX-XXXX"
                onKeyDown={e => e.key === 'Enter' && lookupApplication()}
                style={{
                  flex: 1, minWidth: 280,
                  padding: '16px 20px', fontSize: 16,
                  fontFamily: 'monospace', letterSpacing: '0.04em',
                  border: `1px solid ${C.ink}`,
                  background: C.paper, color: C.ink,
                }}
              />
              <button
                onClick={lookupApplication}
                disabled={loading || !appNumberInput.trim()}
                style={{
                  background: C.ink, color: C.paper, border: 'none',
                  padding: '0 32px', fontSize: 14, fontWeight: 600,
                  cursor: (loading || !appNumberInput.trim()) ? 'not-allowed' : 'pointer',
                  opacity: (loading || !appNumberInput.trim()) ? 0.5 : 1,
                  minHeight: 52,
                }}
              >
                {loading ? 'Loading...' : 'Look up →'}
              </button>
              {applications.length > 0 && (
                <button onClick={clearAll}
                  style={{
                    background: 'transparent', color: C.inkSoft,
                    border: `1px solid ${C.rule}`,
                    padding: '0 20px', fontSize: 13, fontWeight: 500,
                  }}>
                  Clear all
                </button>
              )}
            </div>

            {/* Dev demo loader */}
            {applications.length === 0 && (
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: C.inkMute }}>Don't have an application number yet?</span>
                <button onClick={loadDemoApplications}
                  style={{
                    background: 'transparent', color: C.red,
                    border: `1px solid ${C.red}`,
                    padding: '6px 14px', fontSize: 12, fontWeight: 600,
                  }}>
                  Load 3 demo tenants →
                </button>
              </div>
            )}
            {error && (
              <div style={{ marginTop: 12, padding: '12px 16px', background: '#fef2f0', borderLeft: `3px solid ${C.red}`, fontSize: 13, color: C.ink }}>
                {error}
              </div>
            )}
            {applications.length > 0 && (
              <div style={{ marginTop: 14, fontSize: 12, color: C.inkMute }}>
                {applications.length} application{applications.length === 1 ? '' : 's'} loaded · Sessions are private, data clears when you close this tab
              </div>
            )}
          </section>

          {/* ── FILTER BAR ────────────────────────────────────── */}
          {applications.length >= 2 && (
            <section style={{ marginBottom: 24, borderTop: `1px solid ${C.rule}`, paddingTop: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: filtersOpen ? 20 : 0 }}>
                <button
                  onClick={() => setFiltersOpen(!filtersOpen)}
                  style={{
                    background: filtersOpen ? C.ink : 'transparent',
                    color: filtersOpen ? C.paper : C.ink,
                    border: `1px solid ${C.ink}`,
                    padding: '10px 18px', fontSize: 13, fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                  <span>Filters</span>
                  {activeFilterCount > 0 && (
                    <span style={{
                      background: C.red, color: C.paper,
                      padding: '2px 8px', fontSize: 11, fontWeight: 700,
                      borderRadius: 10, minWidth: 22, textAlign: 'center',
                    }}>
                      {activeFilterCount}
                    </span>
                  )}
                  <span style={{ fontSize: 10 }}>{filtersOpen ? '▲' : '▼'}</span>
                </button>
                <span style={{ fontSize: 12, color: C.inkMute }}>
                  {filteredApplications.length} of {applications.length} match{activeFilterCount > 0 ? ' your filters' : ''}
                </span>
                {activeFilterCount > 0 && (
                  <button onClick={resetFilters}
                    style={{
                      background: 'transparent', border: 'none',
                      color: C.red, fontSize: 12, fontWeight: 600,
                      textDecoration: 'underline',
                    }}>
                    Clear filters
                  </button>
                )}
              </div>

              {filtersOpen && (
                <div style={{
                  background: '#fafaf5', border: `1px solid ${C.rule}`,
                  padding: '24px 28px',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 28,
                }}>
                  {/* Smoker status */}
                  <FilterGroup label="Smoker status">
                    <FilterRadio name="smoker" value="any" current={filters.smokerStatus}
                      onChange={() => setFilters({ ...filters, smokerStatus: 'any' })}>Any</FilterRadio>
                    <FilterRadio name="smoker" value="non-smoker" current={filters.smokerStatus}
                      onChange={() => setFilters({ ...filters, smokerStatus: 'non-smoker' })}>Non-smokers only</FilterRadio>
                    <FilterRadio name="smoker" value="no-indoor" current={filters.smokerStatus}
                      onChange={() => setFilters({ ...filters, smokerStatus: 'no-indoor' })}>No indoor smoking</FilterRadio>
                  </FilterGroup>

                  {/* Pets */}
                  <FilterGroup label="Pets">
                    <FilterRadio name="pets" value="any" current={filters.pets}
                      onChange={() => setFilters({ ...filters, pets: 'any' })}>Any</FilterRadio>
                    <FilterRadio name="pets" value="no-pets" current={filters.pets}
                      onChange={() => setFilters({ ...filters, pets: 'no-pets' })}>No pets only</FilterRadio>
                    <FilterRadio name="pets" value="with-pets" current={filters.pets}
                      onChange={() => setFilters({ ...filters, pets: 'with-pets' })}>Pet owners only</FilterRadio>
                  </FilterGroup>

                  {/* Co-applicant */}
                  <FilterGroup label="Applicant type">
                    <FilterRadio name="co" value="any" current={filters.coApplicant}
                      onChange={() => setFilters({ ...filters, coApplicant: 'any' })}>Any</FilterRadio>
                    <FilterRadio name="co" value="single" current={filters.coApplicant}
                      onChange={() => setFilters({ ...filters, coApplicant: 'single' })}>Single applicants only</FilterRadio>
                    <FilterRadio name="co" value="with-co" current={filters.coApplicant}
                      onChange={() => setFilters({ ...filters, coApplicant: 'with-co' })}>Joint applicants only</FilterRadio>
                  </FilterGroup>

                  {/* Min income */}
                  <FilterGroup label={`Min combined income: $${filters.minIncome.toLocaleString()}`}>
                    <input
                      type="range"
                      min="0" max="200000" step="5000"
                      value={filters.minIncome}
                      onChange={e => setFilters({ ...filters, minIncome: parseInt(e.target.value) })}
                      style={{ width: '100%', accentColor: C.red }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.inkMute, marginTop: 4 }}>
                      <span>$0</span>
                      <span>$200k+</span>
                    </div>
                  </FilterGroup>

                  {/* Max rent-to-income */}
                  <FilterGroup label={`Max rent-to-income: ${filters.maxRentToIncome}%`}>
                    <input
                      type="range"
                      min="10" max="100" step="5"
                      value={filters.maxRentToIncome}
                      onChange={e => setFilters({ ...filters, maxRentToIncome: parseInt(e.target.value) })}
                      style={{ width: '100%', accentColor: C.red }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.inkMute, marginTop: 4 }}>
                      <span>10%</span>
                      <span>100%</span>
                    </div>
                  </FilterGroup>
                </div>
              )}
            </section>
          )}

          {/* ── VIEW SWITCHER ────────────────────────────────── */}
          {applications.length > 0 && (
            <section style={{ marginBottom: 32, borderTop: `1px solid ${C.rule}`, paddingTop: 32 }}>
              <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.rule}`, marginBottom: 32 }}>
                {[
                  { id: 'detail', label: 'Detail', enabled: true },
                  { id: 'compare', label: 'Compare', enabled: filteredApplications.length >= 2 },
                  { id: 'ranked', label: 'Ranked by weights', enabled: filteredApplications.length >= 2 },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => tab.enabled && setView(tab.id)}
                    disabled={!tab.enabled}
                    style={{
                      background: 'transparent', border: 'none',
                      padding: '14px 24px', fontSize: 14,
                      fontWeight: view === tab.id ? 700 : 500,
                      color: view === tab.id ? C.ink : (tab.enabled ? C.inkSoft : C.inkMute),
                      borderBottom: view === tab.id ? `2px solid ${C.red}` : '2px solid transparent',
                      cursor: tab.enabled ? 'pointer' : 'not-allowed',
                      opacity: tab.enabled ? 1 : 0.4,
                      marginBottom: -1,
                    }}
                  >
                    {tab.label}
                    {tab.id !== 'detail' && !tab.enabled && (
                      <span style={{ fontSize: 11, color: C.inkMute, marginLeft: 8 }}>
                        (need 2+)
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* ── DETAIL VIEW ─────────────────────────────── */}
              {view === 'detail' && (
                <DetailView
                  applications={applications}
                  activeIdx={activeAppIdx}
                  setActiveIdx={setActiveAppIdx}
                  onRemove={removeApplication}
                />
              )}

              {/* ── COMPARE VIEW ────────────────────────────── */}
              {view === 'compare' && filteredApplications.length >= 2 && (
                <CompareView
                  applications={filteredApplications}
                  onRemove={removeApplication}
                />
              )}

              {/* ── RANKED VIEW ─────────────────────────────── */}
              {view === 'ranked' && filteredApplications.length >= 2 && (
                <RankedView
                  applications={filteredApplications}
                  weights={weights}
                  setWeights={setWeights}
                  onRemove={removeApplication}
                />
              )}
            </section>
          )}

          {/* ── FOOTER NOTE ─────────────────────────────────── */}
          <footer style={{ marginTop: 80, paddingTop: 32, borderTop: `1px solid ${C.rule}` }}>
            <p style={{ fontSize: 12, color: C.inkMute, maxWidth: 760, lineHeight: 1.6 }}>
              Rentletter applications are generated by tenants and stored privately. The Scorecard reflects honest, factual assessment based on tenant inputs — not promotional self-rating. Free for landlords and realtors. If you find this useful, share it with other landlords.
            </p>
          </footer>
          </div>{/* close inner padded wrapper */}
        </div>
      </div>
    </>
  );
}

// ════════════════════════════════════════════════════════════
// DETAIL VIEW — single tenant deep dive
// ════════════════════════════════════════════════════════════
function DetailView({ applications, activeIdx, setActiveIdx, onRemove }) {
  const app = applications[activeIdx];
  if (!app) return null;

  return (
    <div>
      {/* Application tabs (only show if multiple) */}
      {applications.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          {applications.map((a, idx) => (
            <button
              key={a.applicationNumber}
              onClick={() => setActiveIdx(idx)}
              style={{
                background: activeIdx === idx ? C.ink : 'transparent',
                color: activeIdx === idx ? C.paper : C.inkSoft,
                border: `1px solid ${activeIdx === idx ? C.ink : C.rule}`,
                padding: '8px 14px', fontSize: 13, fontWeight: 500,
              }}
            >
              {a.tenant.fullName}
            </button>
          ))}
        </div>
      )}

      {/* Card */}
      <div style={{ border: `1px solid ${C.rule}`, background: '#fafaf5' }}>
        {/* Top bar with name + actions */}
        <div style={{ padding: '24px 28px', borderBottom: `1px solid ${C.rule}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: C.inkMute, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6, fontFamily: 'monospace' }}>
              {app.applicationNumber}
            </div>
            <h2 style={{ fontSize: 32, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', lineHeight: 1 }}>
              {app.tenant.fullName}
              {app.tenant.age && <span style={{ fontSize: 18, color: C.inkMute, fontWeight: 500, marginLeft: 12 }}>{app.tenant.age}</span>}
            </h2>
            <div style={{ marginTop: 8, fontSize: 14, color: C.inkSoft }}>
              {app.employment.jobTitle} at {app.employment.employer}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <ScoreBadge score={app.scorecard.overall} />
            <button onClick={() => onRemove(app.applicationNumber)}
              style={{ background: 'transparent', border: `1px solid ${C.rule}`, color: C.inkSoft, padding: '8px 14px', fontSize: 12, fontWeight: 500 }}>
              Remove
            </button>
          </div>
        </div>

        {/* Two-column body */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 0 }}>

          {/* LEFT: Profile facts */}
          <div style={{ padding: '28px', borderRight: `1px solid ${C.rule}` }}>
            <DataSection title="Employment">
              <DataRow label="Position" value={`${app.employment.jobTitle} at ${app.employment.employer}`} />
              <DataRow label="Tenure" value={app.employment.yearsAtJob ? `${app.employment.yearsAtJob} years` : 'Not specified'} />
              <DataRow label="Annual income" value={`$${(app.employment.annualIncome || 0).toLocaleString()} CAD`} />
              <DataRow label="Monthly income" value={`$${(app.employment.monthlyIncome || 0).toLocaleString()} CAD`} />
            </DataSection>

            {/* CO-APPLICANT — only if exists */}
            {app.coApplicant && (
              <DataSection title="Co-applicant">
                <DataRow label="Name" value={`${app.coApplicant.name}${app.coApplicant.age ? `, age ${app.coApplicant.age}` : ''}`} />
                <DataRow label="Relationship" value={app.coApplicant.relationship || 'Not specified'} />
                <DataRow label="Position" value={`${app.coApplicant.jobTitle || 'Not specified'} at ${app.coApplicant.employer || 'Not specified'}`} />
                {app.coApplicant.annualIncome && (
                  <DataRow label="Their income" value={`$${app.coApplicant.annualIncome.toLocaleString()} CAD`} />
                )}
                <DataRow
                  label="Combined household"
                  value={`$${((app.employment.annualIncome || 0) + (app.coApplicant.annualIncome || 0)).toLocaleString()} CAD/year`}
                  highlight
                />
              </DataSection>
            )}

            <DataSection title="Current rental">
              {app.rental.previousAddress ? (
                <>
                  <DataRow label="Current address" value={app.rental.previousAddress} />
                  <DataRow label="Years there" value={app.rental.yearsAtPrevious || 'Not specified'} />
                  {app.rental.currentRent && (
                    <DataRow label="Current rent" value={`$${app.rental.currentRent.toLocaleString()}/mo`} />
                  )}
                  <DataRow label="Current landlord" value={app.rental.previousLandlordName || 'Not specified'} />
                  <DataRow label="Contact" value={app.rental.previousLandlordContact || 'Available on request'} />
                </>
              ) : (
                <div style={{ fontSize: 13, color: C.inkSoft, fontStyle: 'italic' }}>
                  First-time renter or rental history not provided
                </div>
              )}
            </DataSection>

            <DataSection title="Apartment they're applying for">
              <DataRow label="Address" value={app.apartment.address || 'Not specified'} />
              <DataRow label="Details" value={app.apartment.description || 'Not specified'} />
              {app.apartment.rentToIncomeRatio && (
                <DataRow label="Rent-to-income" value={`${app.apartment.rentToIncomeRatio}%${app.coApplicant ? ' (combined)' : ''}`} highlight={app.apartment.rentToIncomeRatio <= 30} />
              )}
            </DataSection>

            <DataSection title="Move details">
              <DataRow label="Move-in" value={app.move.moveInDate} />
              <DataRow label="Reason" value={app.move.reasonForMoving || 'Not specified'} multiline />
            </DataSection>

            {/* HOUSEHOLD */}
            {app.household && (
              <DataSection title="Household">
                <DataRow label="Occupants" value={app.household.numberOfOccupants || '1'} />
                <DataRow
                  label="Smoker"
                  value={
                    app.household.smoker === 'no' ? 'Non-smoker' :
                    app.household.smoker === 'outdoor' ? 'Outdoor only' :
                    app.household.smoker === 'yes' ? 'Yes' : '—'
                  }
                  highlight={app.household.smoker === 'no'}
                />
                {app.household.occupantsDetails && (
                  <DataRow label="Details" value={app.household.occupantsDetails} multiline />
                )}
              </DataSection>
            )}

            {(app.lifestyle.personality || app.lifestyle.pets) && (
              <DataSection title="Lifestyle">
                {app.lifestyle.personality && <DataRow label="Personality" value={app.lifestyle.personality} multiline />}
                {app.lifestyle.pets && <DataRow label="Pets" value={app.lifestyle.pets} />}
              </DataSection>
            )}

            {/* VEHICLE */}
            {app.vehicle && (
              <DataSection title="Vehicle">
                <DataRow label="Make/Model" value={`${app.vehicle.makeModel || 'Not specified'}${app.vehicle.year ? ` (${app.vehicle.year})` : ''}`} />
              </DataSection>
            )}

            {/* REFERENCES */}
            {app.references && app.references.length > 0 && (
              <DataSection title="References (named)">
                {app.references.map((ref, idx) => (
                  <div key={idx} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: idx < app.references.length - 1 ? `1px solid ${C.rule}` : 'none' }}>
                    <div style={{ fontSize: 13, color: C.ink, fontWeight: 600 }}>{ref.name}</div>
                    <div style={{ fontSize: 12, color: C.inkSoft }}>
                      {ref.relationship}{ref.contact ? ` · ${ref.contact}` : ''}
                    </div>
                  </div>
                ))}
              </DataSection>
            )}

            {app.disclosures && (
              <DataSection title="Disclosures" highlightRed>
                <div style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.55 }}>
                  {app.disclosures}
                </div>
              </DataSection>
            )}
          </div>

          {/* RIGHT: Landlord Scorecard */}
          <div style={{ padding: '28px', background: C.paper }}>
            <div style={{ fontSize: 11, color: C.red, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
              The Landlord Scorecard
            </div>
            <p style={{ fontSize: 12, color: C.inkMute, marginBottom: 24, lineHeight: 1.5 }}>
              Calculated by Rentletter from the tenant's inputs. Honest, not promotional.
            </p>

            {[
              { key: 'incomeStability', label: 'Income stability' },
              { key: 'rentAffordability', label: 'Rent affordability' },
              { key: 'rentalHistory', label: 'Rental history' },
              { key: 'longTermIntent', label: 'Long-term intent' },
              { key: 'disclosures', label: 'Disclosures' },
            ].map(({ key, label }) => (
              <div key={key} style={{ marginBottom: 18, paddingBottom: 18, borderBottom: `1px solid ${C.rule}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{label}</span>
                  <Stars score={app.scorecard[key].score} />
                </div>
                <div style={{ fontSize: 12, color: C.inkSoft }}>
                  {app.scorecard[key].note}
                </div>
              </div>
            ))}

            <div style={{ marginTop: 24, padding: 20, background: C.ink, color: C.paper }}>
              <div style={{ fontSize: 11, color: '#a4adbb', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                Overall score
              </div>
              <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>
                {app.scorecard.overall} <span style={{ fontSize: 16, color: '#a4adbb', fontWeight: 500 }}>/ 5</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// COMPARE VIEW — side-by-side table
// ════════════════════════════════════════════════════════════
function CompareView({ applications, onRemove }) {
  const factors = [
    { label: 'Annual income', get: a => `$${(a.employment.annualIncome || 0).toLocaleString()}` },
    { label: 'Combined household income', get: a => {
      const total = (a.employment.annualIncome || 0) + (a.coApplicant?.annualIncome || 0);
      return a.coApplicant ? `$${total.toLocaleString()} (joint)` : `$${total.toLocaleString()}`;
    }},
    { label: 'Job tenure', get: a => a.employment.yearsAtJob ? `${a.employment.yearsAtJob} years` : '—' },
    { label: 'Employer', get: a => a.employment.employer },
    { label: 'Rental history', get: a => a.rental.previousAddress ? `${a.rental.yearsAtPrevious || '?'} yrs` : 'First-time' },
    { label: 'Current rent', get: a => a.rental?.currentRent ? `$${a.rental.currentRent.toLocaleString()}` : '—' },
    { label: 'Previous landlord', get: a => a.rental.previousLandlordName || '—' },
    { label: 'Rent-to-income', get: a => a.apartment.rentToIncomeRatio ? `${a.apartment.rentToIncomeRatio}%` : '—' },
    { label: 'Move-in date', get: a => a.move.moveInDate },
    { label: 'Occupants', get: a => a.household?.numberOfOccupants || '1' },
    { label: 'Smoker', get: a => {
      const s = a.household?.smoker;
      return s === 'no' ? 'Non-smoker' : s === 'outdoor' ? 'Outdoor' : s === 'yes' ? 'Yes' : '—';
    }},
    { label: 'Co-applicant', get: a => a.coApplicant ? `${a.coApplicant.name} (${a.coApplicant.relationship || '—'})` : 'Single' },
    { label: 'Pets', get: a => a.lifestyle.pets || 'None' },
    { label: 'Vehicle', get: a => a.vehicle ? `${a.vehicle.makeModel || 'Yes'}${a.vehicle.year ? ` (${a.vehicle.year})` : ''}` : 'None' },
    { label: 'Named references', get: a => a.references && a.references.length > 0 ? `${a.references.length} provided` : 'On request' },
    { label: 'Disclosures', get: a => a.disclosures ? 'Yes — see detail' : 'None' },
  ];

  const scorecardRows = [
    { key: 'incomeStability', label: 'Income stability' },
    { key: 'rentAffordability', label: 'Rent affordability' },
    { key: 'rentalHistory', label: 'Rental history' },
    { key: 'longTermIntent', label: 'Long-term intent' },
    { key: 'disclosures', label: 'Disclosures' },
  ];

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 + applications.length * 200 }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, textAlign: 'left', width: 200 }}></th>
            {applications.map(app => (
              <th key={app.applicationNumber} style={thStyle}>
                <div style={{ marginBottom: 8 }}>
                  <ScoreBadge score={app.scorecard.overall} small />
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em', marginBottom: 2 }}>
                  {app.tenant.fullName}
                </div>
                <div style={{ fontSize: 10, color: C.inkMute, fontFamily: 'monospace', marginBottom: 8 }}>
                  {app.applicationNumber}
                </div>
                <button onClick={() => onRemove(app.applicationNumber)}
                  style={{ background: 'transparent', border: `1px solid ${C.rule}`, color: C.inkSoft, padding: '4px 10px', fontSize: 11, fontWeight: 500 }}>
                  Remove
                </button>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {/* Profile facts */}
          <tr><td colSpan={applications.length + 1} style={{ padding: '20px 0 8px', fontSize: 11, fontWeight: 600, color: C.inkMute, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Profile</td></tr>
          {factors.map(f => (
            <tr key={f.label}>
              <td style={tdLabelStyle}>{f.label}</td>
              {applications.map(app => (
                <td key={app.applicationNumber} style={tdStyle}>
                  {f.get(app)}
                </td>
              ))}
            </tr>
          ))}

          {/* Scorecard */}
          <tr><td colSpan={applications.length + 1} style={{ padding: '20px 0 8px', fontSize: 11, fontWeight: 600, color: C.red, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Scorecard</td></tr>
          {scorecardRows.map(({ key, label }) => (
            <tr key={key}>
              <td style={tdLabelStyle}>{label}</td>
              {applications.map(app => (
                <td key={app.applicationNumber} style={tdStyle}>
                  <Stars score={app.scorecard[key].score} size={12} />
                  <div style={{ fontSize: 10, color: C.inkMute, marginTop: 4 }}>
                    {app.scorecard[key].note}
                  </div>
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <td style={{ ...tdLabelStyle, fontWeight: 700, color: C.ink }}>Overall</td>
            {applications.map(app => (
              <td key={app.applicationNumber} style={{ ...tdStyle, fontWeight: 800, color: C.ink, fontSize: 20 }}>
                {app.scorecard.overall} <span style={{ fontSize: 12, color: C.inkMute, fontWeight: 500 }}>/ 5</span>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// RANKED VIEW — the crown jewel
// Weighted decision engine with presets, animation, and defensible output
// ════════════════════════════════════════════════════════════

const PRIORITY_PRESETS = [
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'All factors weighted equally — a fair starting point.',
    weights: { incomeStability: 1.0, rentAffordability: 1.0, rentalHistory: 1.0, longTermIntent: 1.0, disclosures: 1.0 },
  },
  {
    id: 'conservative',
    label: 'Conservative',
    description: 'For high-value properties. Income, references, and clean disclosures matter most.',
    weights: { incomeStability: 2.5, rentAffordability: 2.0, rentalHistory: 2.5, longTermIntent: 1.0, disclosures: 2.5 },
  },
  {
    id: 'affordability',
    label: 'Affordability-focused',
    description: 'For value properties. Make sure they can comfortably afford rent without stretching.',
    weights: { incomeStability: 2.0, rentAffordability: 3.0, rentalHistory: 1.5, longTermIntent: 1.5, disclosures: 2.0 },
  },
  {
    id: 'longterm',
    label: 'Long-term tenant',
    description: 'For family homes or units you want stable for 2+ years. Stability over short-term metrics.',
    weights: { incomeStability: 2.0, rentAffordability: 1.5, rentalHistory: 2.5, longTermIntent: 3.0, disclosures: 1.5 },
  },
  {
    id: 'risk',
    label: 'Risk-averse',
    description: 'For first-time landlords or shared buildings. Heavy weight on history and disclosures.',
    weights: { incomeStability: 2.0, rentAffordability: 2.0, rentalHistory: 3.0, longTermIntent: 1.5, disclosures: 3.0 },
  },
];

const FACTOR_DEFS = [
  { key: 'incomeStability', label: 'Income stability', short: 'income', help: 'How reliable their paycheck is. High for long tenure at stable employers.' },
  { key: 'rentAffordability', label: 'Rent affordability', short: 'affordability', help: 'Rent vs. monthly income. Below 30% is the lending standard.' },
  { key: 'rentalHistory', label: 'Rental history', short: 'history', help: 'Previous landlord references and length of past tenancies.' },
  { key: 'longTermIntent', label: 'Long-term intent', short: 'commitment', help: 'How likely they are to stay 1-2+ years vs. leave early.' },
  { key: 'disclosures', label: 'Disclosures', short: 'transparency', help: 'Honesty about credit, gaps, or other potential concerns.' },
];

function RankedView({ applications, weights, setWeights, onRemove }) {
  const [previousOrder, setPreviousOrder] = useState({});
  const [activePreset, setActivePreset] = useState('balanced');
  const [recentlyChanged, setRecentlyChanged] = useState({});

  // Calculate ranked applications with weighted scores + per-factor contributions
  const ranked = [...applications]
    .map(app => {
      const score = calculateWeightedScore(app.scorecard, weights);
      // Find which factors are pulling the score up the most
      const contributions = FACTOR_DEFS.map(f => ({
        key: f.key, label: f.label, short: f.short,
        contribution: app.scorecard[f.key].score * weights[f.key],
        rawScore: app.scorecard[f.key].score,
        weight: weights[f.key],
      })).sort((a, b) => b.contribution - a.contribution);

      return {
        ...app,
        weightedScore: score,
        topFactors: contributions.slice(0, 2),
        weakFactor: contributions[contributions.length - 1],
      };
    })
    .sort((a, b) => b.weightedScore - a.weightedScore);

  // Track movement for animation
  useEffect(() => {
    const newOrder = {};
    ranked.forEach((app, idx) => {
      newOrder[app.applicationNumber] = idx;
    });

    // Determine which applications changed position
    if (Object.keys(previousOrder).length > 0) {
      const changes = {};
      ranked.forEach((app, idx) => {
        const previousIdx = previousOrder[app.applicationNumber];
        if (previousIdx !== undefined && previousIdx !== idx) {
          changes[app.applicationNumber] = previousIdx > idx ? 'up' : 'down';
        }
      });
      if (Object.keys(changes).length > 0) {
        setRecentlyChanged(changes);
        const timer = setTimeout(() => setRecentlyChanged({}), 1800);
        return () => clearTimeout(timer);
      }
    }
    setPreviousOrder(newOrder);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weights]);

  // Generate human-readable summary of weights
  const getPrioritySentence = () => {
    const sorted = FACTOR_DEFS
      .map(f => ({ ...f, weight: weights[f.key] }))
      .sort((a, b) => b.weight - a.weight);

    // Find factors that are meaningfully above average
    const avg = Object.values(weights).reduce((a, b) => a + b, 0) / 5;
    const high = sorted.filter(f => f.weight > avg * 1.3);
    const low = sorted.filter(f => f.weight < avg * 0.5);

    if (high.length === 0 && low.length === 0) {
      return 'All factors weighted equally — looking for a well-rounded tenant.';
    }
    let parts = [];
    if (high.length > 0) {
      const names = high.map(f => f.short);
      parts.push(`prioritizing ${formatList(names)}`);
    }
    if (low.length > 0) {
      const names = low.map(f => f.short);
      parts.push(`deprioritizing ${formatList(names)}`);
    }
    return parts.join(', ') + '.';
  };

  // Apply preset
  const applyPreset = (preset) => {
    setActivePreset(preset.id);
    setWeights(preset.weights);
  };

  // Detect if current weights match a preset
  useEffect(() => {
    const matching = PRIORITY_PRESETS.find(p =>
      Object.keys(p.weights).every(k => Math.abs(p.weights[k] - weights[k]) < 0.05)
    );
    if (matching) {
      setActivePreset(matching.id);
    } else {
      setActivePreset('custom');
    }
  }, [weights]);

  // Calculate max weight for chart visualization
  const maxWeight = Math.max(...Object.values(weights), 1);

  return (
    <div>

      {/* ── PRESETS BAR ─────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Step 1 · Choose your priorities
          </div>
          <div style={{ fontSize: 12, color: C.inkMute }}>
            Pick a preset or adjust manually below
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PRIORITY_PRESETS.map(preset => (
            <button
              key={preset.id}
              onClick={() => applyPreset(preset)}
              title={preset.description}
              style={{
                background: activePreset === preset.id ? C.ink : C.paper,
                color: activePreset === preset.id ? C.paper : C.ink,
                border: `1px solid ${activePreset === preset.id ? C.ink : C.rule}`,
                padding: '10px 16px', fontSize: 13, fontWeight: 600,
                transition: 'all 0.15s',
                position: 'relative',
              }}>
              {preset.label}
              {activePreset === preset.id && (
                <span style={{ marginLeft: 8, color: C.red, fontSize: 11 }}>●</span>
              )}
            </button>
          ))}
          {activePreset === 'custom' && (
            <span style={{
              padding: '10px 16px', fontSize: 12,
              color: C.red, border: `1px dashed ${C.red}`,
              fontWeight: 600, letterSpacing: '0.05em',
            }}>
              Custom weights
            </span>
          )}
        </div>
        {/* Active preset description */}
        {activePreset !== 'custom' && (
          <p style={{ marginTop: 12, fontSize: 13, color: C.inkSoft, fontStyle: 'italic', lineHeight: 1.5 }}>
            {PRIORITY_PRESETS.find(p => p.id === activePreset)?.description}
          </p>
        )}
      </div>

      {/* ── MAIN TWO-COLUMN LAYOUT ──────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 340px) 1fr', gap: 32, alignItems: 'start' }}
           className="ranked-grid">

        {/* ╔══ LEFT: WEIGHT CONTROLS ══════════════════════════╗ */}
        <div style={{ background: C.paper, border: `2px solid ${C.ink}`, position: 'sticky', top: 20 }}>
          {/* Header */}
          <div style={{ padding: '20px 24px', borderBottom: `2px solid ${C.ink}`, background: C.ink, color: C.paper }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.red, marginBottom: 4 }}>
              Step 2 · Fine-tune
            </div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              Weight each factor
            </div>
          </div>

          {/* Sliders */}
          <div style={{ padding: '20px 24px' }}>
            {FACTOR_DEFS.map((f, idx) => {
              const pct = (weights[f.key] / 3) * 100;
              const isHigh = weights[f.key] > 1.5;
              const isLow = weights[f.key] < 0.5;
              return (
                <div key={f.key} style={{ marginBottom: idx === FACTOR_DEFS.length - 1 ? 0 : 22 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
                      {f.label}
                    </span>
                    <span style={{
                      fontSize: 13, fontWeight: 700,
                      fontFamily: 'monospace',
                      color: isHigh ? C.red : isLow ? C.inkMute : C.ink,
                    }}>
                      {weights[f.key].toFixed(1)}×
                    </span>
                  </div>
                  {/* Visual weight bar */}
                  <div style={{ height: 4, background: C.rule, marginBottom: 6, position: 'relative' }}>
                    <div style={{
                      height: '100%',
                      width: `${pct}%`,
                      background: isHigh ? C.red : C.ink,
                      transition: 'width 0.2s, background 0.2s',
                    }} />
                  </div>
                  <input
                    type="range"
                    min="0" max="3" step="0.1"
                    value={weights[f.key]}
                    onChange={e => setWeights({ ...weights, [f.key]: parseFloat(e.target.value) })}
                    style={{ width: '100%', accentColor: C.red, cursor: 'pointer' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.inkMute, marginTop: 2 }}>
                    <span>Ignore</span>
                    <span>Normal</span>
                    <span>Critical</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Priority sentence */}
          <div style={{ padding: '18px 24px', background: '#fafaf5', borderTop: `1px solid ${C.rule}` }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: C.inkMute, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
              Your weighting reads as
            </div>
            <p style={{ fontSize: 13, color: C.ink, lineHeight: 1.5, fontWeight: 500 }}>
              You're {getPrioritySentence()}
            </p>
          </div>

          <button onClick={() => applyPreset(PRIORITY_PRESETS[0])}
            style={{
              width: '100%', background: 'transparent',
              border: 'none', borderTop: `1px solid ${C.rule}`,
              padding: 14, fontSize: 12, fontWeight: 500, color: C.inkSoft,
            }}>
            ↺ Reset to balanced
          </button>
        </div>

        {/* ╔══ RIGHT: RANKED CARDS ════════════════════════════╗ */}
        <div>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Step 3 · See the ranking
            </div>
            <div style={{ fontSize: 12, color: C.inkMute }}>
              {ranked.length} tenants · Ranked by your priorities
            </div>
          </div>

          {/* The animated ranked list */}
          <div style={{ position: 'relative' }}>
            {ranked.map((app, idx) => {
              const movement = recentlyChanged[app.applicationNumber];
              const isFirst = idx === 0;
              const isSecond = idx === 1;
              const gap = app.weightedScore - (ranked[idx + 1]?.weightedScore ?? 0);

              return (
                <div
                  key={app.applicationNumber}
                  style={{
                    background: isFirst ? C.ink : isSecond ? '#fafaf5' : C.paper,
                    color: isFirst ? C.paper : C.ink,
                    border: isFirst
                      ? `2px solid ${C.red}`
                      : isSecond
                      ? `1px solid ${C.ink}`
                      : `1px solid ${C.rule}`,
                    padding: '24px 28px', marginBottom: 14,
                    position: 'relative', overflow: 'hidden',
                    transition: 'transform 0.5s cubic-bezier(0.34, 1.4, 0.64, 1), background 0.3s, border-color 0.3s',
                    transform: movement ? (movement === 'up' ? 'translateY(-2px)' : 'translateY(2px)') : 'translateY(0)',
                    animation: movement === 'up' ? 'glowUp 1.5s ease-out' : movement === 'down' ? 'glowDown 1.5s ease-out' : 'none',
                  }}>

                  {/* Movement indicator */}
                  {movement && (
                    <div style={{
                      position: 'absolute', top: 14, right: 14,
                      background: movement === 'up' ? C.red : C.inkMute,
                      color: C.paper, fontSize: 10, fontWeight: 700,
                      letterSpacing: '0.08em', textTransform: 'uppercase',
                      padding: '4px 10px',
                      animation: 'fadeOut 1.8s ease-out forwards',
                    }}>
                      {movement === 'up' ? '↑ Moved up' : '↓ Moved down'}
                    </div>
                  )}

                  {/* Top section: rank, name, score */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
                    <div style={{ flex: 1, minWidth: 240, display: 'flex', alignItems: 'flex-start', gap: 18 }}>
                      <div style={{
                        fontSize: isFirst ? 48 : 36,
                        fontWeight: 900,
                        lineHeight: 0.9,
                        color: isFirst ? C.red : C.inkMute,
                        letterSpacing: '-0.04em',
                        minWidth: isFirst ? 70 : 54,
                        fontFamily: 'Inter, sans-serif',
                      }}>
                        #{idx + 1}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4 }}>
                          {app.tenant.fullName}
                          {isFirst && (
                            <span style={{
                              fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                              marginLeft: 12, padding: '3px 8px',
                              background: C.red, color: C.paper,
                              textTransform: 'uppercase',
                              verticalAlign: 'middle',
                            }}>
                              Top pick
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 13, color: isFirst ? '#a4adbb' : C.inkSoft, marginBottom: 2 }}>
                          {app.employment.jobTitle} at {app.employment.employer}
                        </div>
                        <div style={{ fontSize: 11, color: isFirst ? '#7a8392' : C.inkMute, fontFamily: 'monospace' }}>
                          {app.applicationNumber}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', minWidth: 110 }}>
                      <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1, color: isFirst ? C.paper : C.ink, letterSpacing: '-0.02em' }}>
                        {app.weightedScore.toFixed(1)}
                        <span style={{ fontSize: 14, fontWeight: 500, color: isFirst ? '#a4adbb' : C.inkMute, marginLeft: 2 }}>
                          / 5
                        </span>
                      </div>
                      <div style={{ fontSize: 10, color: isFirst ? '#a4adbb' : C.inkMute, marginTop: 4, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>
                        Weighted score
                      </div>
                      {idx < ranked.length - 1 && gap > 0 && (
                        <div style={{ fontSize: 10, color: isFirst ? '#a4adbb' : C.inkMute, marginTop: 2 }}>
                          +{gap.toFixed(1)} over next
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Why this ranking — top contributing factors */}
                  <div style={{
                    padding: '14px 16px',
                    background: isFirst ? 'rgba(255,255,255,0.06)' : '#fafaf5',
                    borderLeft: `3px solid ${C.red}`,
                    fontSize: 12,
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: isFirst ? C.red : C.red, marginBottom: 8 }}>
                      Why this ranking
                    </div>
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                      {app.topFactors.map(f => (
                        <div key={f.key} style={{ flex: 1, minWidth: 140 }}>
                          <div style={{ fontSize: 11, color: isFirst ? '#a4adbb' : C.inkMute, marginBottom: 2 }}>
                            Strong: {f.label}
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: isFirst ? C.paper : C.ink }}>
                            {f.rawScore} / 5 × {f.weight.toFixed(1)} weight
                          </div>
                        </div>
                      ))}
                      {app.weakFactor && app.weakFactor.rawScore < 4 && (
                        <div style={{ flex: 1, minWidth: 140 }}>
                          <div style={{ fontSize: 11, color: isFirst ? '#a4adbb' : C.inkMute, marginBottom: 2 }}>
                            Weakest: {app.weakFactor.label}
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: isFirst ? '#ffa8a8' : C.red }}>
                            {app.weakFactor.rawScore} / 5 × {app.weakFactor.weight.toFixed(1)} weight
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Remove button */}
                  <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={() => onRemove(app.applicationNumber)}
                      style={{
                        background: 'transparent',
                        border: `1px solid ${isFirst ? '#3a3a3c' : C.rule}`,
                        color: isFirst ? '#a4adbb' : C.inkSoft,
                        padding: '6px 12px', fontSize: 11, fontWeight: 500,
                      }}>
                      Remove from list
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── DECISION SUMMARY — defensible, copyable ───── */}
          {ranked.length >= 2 && (
            <div style={{ marginTop: 32, background: C.paper, border: `2px solid ${C.ink}` }}>
              <div style={{
                padding: '14px 20px', background: C.red, color: C.paper,
                fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span>Step 4 · Your defensible decision</span>
                <button
                  onClick={() => {
                    const summary = buildDecisionSummary(ranked, weights, activePreset);
                    navigator.clipboard.writeText(summary);
                    alert('Decision summary copied to clipboard');
                  }}
                  style={{
                    background: C.paper, color: C.red, border: 'none',
                    padding: '6px 12px', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
                  }}>
                  Copy summary
                </button>
              </div>
              <div style={{ padding: '22px 24px' }}>
                <p style={{ fontSize: 14, lineHeight: 1.7, color: C.ink, marginBottom: 14 }}>
                  Based on the priorities you've set <span style={{ fontStyle: 'italic', color: C.inkSoft }}>({getPrioritySentence()})</span>, the recommended tenant is{' '}
                  <strong style={{ color: C.red }}>{ranked[0].tenant.fullName}</strong> with a weighted score of{' '}
                  <strong>{ranked[0].weightedScore.toFixed(1)} / 5</strong>.
                </p>
                <p style={{ fontSize: 13, lineHeight: 1.7, color: C.inkSoft }}>
                  Strongest factors driving this ranking:{' '}
                  <strong style={{ color: C.ink }}>
                    {ranked[0].topFactors.map(f => f.label.toLowerCase()).join(' and ')}
                  </strong>
                  {ranked[1] && (
                    <>
                      . Second-ranked is <strong style={{ color: C.ink }}>{ranked[1].tenant.fullName}</strong> at {ranked[1].weightedScore.toFixed(1)} / 5
                      {' '}— gap of {(ranked[0].weightedScore - ranked[1].weightedScore).toFixed(1)} points.
                    </>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes glowUp {
          0% { box-shadow: 0 0 0 0 rgba(215, 32, 39, 0); }
          50% { box-shadow: 0 0 0 6px rgba(215, 32, 39, 0.25); }
          100% { box-shadow: 0 0 0 0 rgba(215, 32, 39, 0); }
        }
        @keyframes glowDown {
          0% { box-shadow: 0 0 0 0 rgba(134, 134, 139, 0); }
          50% { box-shadow: 0 0 0 6px rgba(134, 134, 139, 0.2); }
          100% { box-shadow: 0 0 0 0 rgba(134, 134, 139, 0); }
        }
        @keyframes fadeOut {
          0%, 70% { opacity: 1; }
          100% { opacity: 0; }
        }
        @media (max-width: 900px) {
          .ranked-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

// ─── Helpers for RankedView ───────────────────────────────
function formatList(arr) {
  if (arr.length === 0) return '';
  if (arr.length === 1) return arr[0];
  if (arr.length === 2) return `${arr[0]} and ${arr[1]}`;
  return arr.slice(0, -1).join(', ') + ', and ' + arr[arr.length - 1];
}

function buildDecisionSummary(ranked, weights, activePreset) {
  const presetName = activePreset === 'custom' ? 'a custom priority weighting' : `the "${PRIORITY_PRESETS.find(p => p.id === activePreset)?.label}" priority preset`;
  let summary = `TENANT EVALUATION — DECISION SUMMARY\n`;
  summary += `Generated by Rentletter (rentletter.ca/landlord)\n`;
  summary += `Date: ${new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}\n\n`;

  summary += `METHODOLOGY\n`;
  summary += `Tenants evaluated using ${presetName}, with the following factor weights:\n`;
  FACTOR_DEFS.forEach(f => {
    summary += `  - ${f.label}: ${weights[f.key].toFixed(1)}× weight\n`;
  });
  summary += `\n`;

  summary += `RANKING (${ranked.length} applicants)\n`;
  summary += `\n`;
  ranked.forEach((app, idx) => {
    summary += `#${idx + 1}  ${app.tenant.fullName} — ${app.weightedScore.toFixed(1)} / 5\n`;
    summary += `    Application: ${app.applicationNumber}\n`;
    summary += `    ${app.employment.jobTitle} at ${app.employment.employer}\n`;
    summary += `    Income: $${(app.employment.annualIncome || 0).toLocaleString()} CAD/year\n`;
    if (app.apartment.rentToIncomeRatio) summary += `    Rent-to-income: ${app.apartment.rentToIncomeRatio}%\n`;
    summary += `    Top factors: ${app.topFactors.map(f => `${f.label} (${f.rawScore}/5)`).join(', ')}\n`;
    summary += `\n`;
  });

  summary += `RECOMMENDATION\n`;
  summary += `Based on the priority weighting applied, ${ranked[0].tenant.fullName} (${ranked[0].applicationNumber}) is the recommended applicant.\n`;
  if (ranked[1]) {
    const gap = ranked[0].weightedScore - ranked[1].weightedScore;
    summary += `Margin over second-ranked applicant (${ranked[1].tenant.fullName}): ${gap.toFixed(1)} points.\n`;
  }
  summary += `\nThis evaluation reflects the priorities of the decision-maker as expressed via the weight settings above.\n`;
  summary += `Rentletter Scorecard values are calculated from tenant-provided data and reflect honest factual assessment.\n`;

  return summary;
}

// ─── HELPERS ──────────────────────────────────────────────
const thStyle = {
  padding: '20px 16px 16px',
  textAlign: 'left',
  verticalAlign: 'top',
  borderBottom: `2px solid ${C.ink}`,
  background: C.paper,
};

const tdStyle = {
  padding: '12px 16px',
  fontSize: 13,
  color: C.inkSoft,
  borderBottom: `1px solid ${C.rule}`,
  verticalAlign: 'top',
};

const tdLabelStyle = {
  ...tdStyle,
  fontWeight: 600,
  color: C.ink,
  fontSize: 12,
  background: '#fafaf5',
};

function DataSection({ title, highlightRed, children }) {
  return (
    <div style={{ marginBottom: 28, paddingBottom: 28, borderBottom: `1px solid ${C.rule}` }}>
      <div style={{
        fontSize: 11, fontWeight: 600,
        color: highlightRed ? C.red : C.inkMute,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        marginBottom: 16,
      }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {children}
      </div>
    </div>
  );
}

function DataRow({ label, value, multiline, highlight }) {
  return (
    <div style={{ display: multiline ? 'block' : 'flex', gap: 12 }}>
      <div style={{ fontSize: 12, color: C.inkMute, minWidth: 110, fontWeight: 500 }}>
        {label}
      </div>
      <div style={{
        fontSize: 13, color: highlight ? C.green : C.ink,
        fontWeight: highlight ? 600 : 400,
        lineHeight: 1.55, marginTop: multiline ? 4 : 0,
      }}>
        {value}
      </div>
    </div>
  );
}

function ScoreBadge({ score, small }) {
  let color = C.inkMute;
  if (score >= 4.5) color = C.green;
  else if (score >= 3.5) color = C.ink;
  else if (score >= 2.5) color = C.inkSoft;
  else color = C.red;

  return (
    <div style={{
      background: color, color: C.paper,
      padding: small ? '4px 10px' : '6px 14px',
      fontSize: small ? 12 : 14, fontWeight: 700,
      display: 'inline-flex', alignItems: 'baseline', gap: 4,
    }}>
      {score} <span style={{ fontSize: small ? 10 : 11, fontWeight: 500, opacity: 0.7 }}>/ 5</span>
    </div>
  );
}

// ─── Filter helpers ─────────────────────────────────────
function FilterGroup({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.ink, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {children}
      </div>
    </div>
  );
}

function FilterRadio({ name, value, current, onChange, children }) {
  const selected = current === value;
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '2px 0' }}>
      <input
        type="radio"
        name={name}
        checked={selected}
        onChange={onChange}
        style={{ accentColor: C.red, cursor: 'pointer' }}
      />
      <span style={{ fontSize: 13, color: selected ? C.ink : C.inkSoft, fontWeight: selected ? 600 : 400 }}>
        {children}
      </span>
    </label>
  );
}
