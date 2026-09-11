// pages/index.js
// The homepage. One screen of copy for Ontario and BC realtors, a frame showing the real listing
// page's applicants section rendered from the sandbox fixture at build time (components/dashboard/
// ApplicantCardRest.js, read only, no network), the proof line, the trust chips and the footer.
// Motion: the hero rises 8px and fades in on load through CSS keyframes, the frame's meters fill on
// mount as they do in the product, the proof numbers count up once on a timer (lib/motion.js), all
// behind the motion query. Nothing waits on scroll or an observer; nothing loops.
import { useState, useEffect } from 'react';
import Head from 'next/head';
import { C, R } from '../components/theme';
import { GlobalStyle, Wordmark } from '../components/ui';
import { MotionStyles } from '../components/motion';
import ApplicantCardRest from '../components/dashboard/ApplicantCardRest';
import { tween, DURATION, CURVE, MOTION_QUERY } from '../lib/motion';
import { noWidow, NBSP } from '../lib/typeset';

const BOOK_URL = 'mailto:info@rentletter.ca?subject=Demo%20request%20-%20Rentletter&body=Hi%20Rentletter%20team%2C%0A%0AI%27d%20like%20to%20book%20a%2015-minute%20demo%20of%20Rentletter.%0A%0AMy%20brokerage%3A%20%0AMy%20preferred%20time%3A%20%0A%0AThanks!';
const STEPS = ['Share your link, tenants apply', 'Tick the checklist as you call', 'Send the landlord a branded report'];
const SENTENCE = 'Tenants apply through your link, the AI reads their documents, you confirm the facts, and the landlord gets a branded report with your reasons.';
const LINE = 'We do not verify anything, you do: Rentletter reads the documents, matches them to the application, and records every call you make.';

// The frame's data, at build time: the Carlaw listing's top three active applicants from the
// sandbox fixture, scored the way the listing page scores them. Dates and Fit are frozen in the
// static props, so the server and the client render the same card.
export async function getStaticProps() {
  const { DEMO_LISTINGS, DEMO_PROFILE, buildDemoApplicants } = await import('../lib/demoFixture');
  const { withLiveScore } = await import('../lib/deriveScorecard');
  const { computeFit, compareFit } = await import('../lib/fitScore');
  const { isActive, isWithdrawn } = await import('../lib/listingApplicantsVocabulary');
  const listing = DEMO_LISTINGS[0];
  const applicants = (buildDemoApplicants()[listing.id] || [])
    .filter((a) => !isWithdrawn(a) && isActive(a))
    .map((a) => withLiveScore(a, listing))
    .map((x) => ({ ...x, application: { ...x.application, fit: computeFit({ application: x.application, listing, verification: x.docVerifications?.[0] || null, confirmations: x.confirmations }) } }))
    .sort(compareFit)
    .slice(0, 3);
  const frame = JSON.parse(JSON.stringify({ listing, profile: { full_name: DEMO_PROFILE.full_name }, applicants }));
  return { props: { frame } };
}

// A proof number that counts up once on load, on a timer (lib/motion.js tween). It renders at its
// final value first, so the number reads without JS and under reduced motion.
function Proof({ value, unit, label }) {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (!value) return undefined;
    const cancel = tween({ from: 0, to: value, ms: DURATION.long, onFrame: (v) => setShown(Math.round(v)) });
    return () => cancel(true);
  }, [value]);
  return (
    <div>
      <div className="lp-proof-n num">{shown}{unit ? `${NBSP}${unit}` : ''}</div>
      <div className="lp-proof-l">{noWidow(label)}</div>
    </div>
  );
}

export default function Home({ frame }) {
  const year = new Date().getFullYear();
  return (
    <>
      <Head>
        <title>Rentletter, rental screening for Ontario and BC realtors</title>
        <meta name="description" content={SENTENCE} />
      </Head>
      <GlobalStyle /><MotionStyles />
      <div className="lp-page">
        <header className="lp-header">
          <a href="/" aria-label="Rentletter home" style={{ textDecoration: 'none', display: 'inline-flex' }}><Wordmark /></a>
          <nav className="lp-nav" aria-label="Account">
            <a href="/signin" className="lp-link">Sign in</a>
            <a href="/signup" className="lp-link">Sign up</a>
          </nav>
        </header>

        <main className="lp-main">
          <section className="lp-hero" aria-label="Rentletter">
            <div className="lp-copy">
              <div className="lp-eyebrow lp-rise" style={{ animationDelay: '0ms' }}><span className="lp-dash" aria-hidden="true" />For Ontario and BC realtors</div>
              <h1 className="lp-h1 lp-rise" style={{ animationDelay: '60ms' }}>Screen every applicant. Send the landlord <span className="lp-red">one clear{NBSP}report</span>.</h1>
              <p className="lp-p lp-rise" style={{ animationDelay: '120ms' }}>{noWidow(SENTENCE)}</p>
              <div className="lp-actions lp-rise" style={{ animationDelay: '180ms' }}>
                <a href="/demo/dashboard" className="lp-btn lp-btn-red">Try it with sample data</a>
                <a href={BOOK_URL} className="lp-btn">Book a demo</a>
              </div>
              <ol className="lp-steps">
                {STEPS.map((s, i) => <li key={s}><span className="lp-num" aria-hidden="true">{i + 1}</span><span>{noWidow(s)}</span></li>)}
              </ol>
            </div>

            {/* The frame: a phone at 390, a laptop from 900px up. Inside, the listing page's applicants
                section from the fixture, the real card, the real meter, read only. */}
            <div className="lp-frame-wrap">
              <div className="lp-frame" role="img" aria-label="The listing page's applicants section, sample data">
                <div className="lp-screen">
                  <div className="lp-screen-head">
                    <span className="t-d3" style={{ color: C.ink }}>Applicants</span>
                    <span className="lp-count num">{frame.applicants.length}</span>
                  </div>
                  <div className="lp-cards">
                    {frame.applicants.map((a, i) => (
                      <div key={a.linkId} className="lp-card" style={{ border: `1px solid ${i === 0 ? 'var(--action)' : C.rule}`, borderLeft: `4px solid ${i === 0 ? 'var(--action)' : C.ruleDark}` }}>
                        <ApplicantCardRest a={a} rank={i + 1} listing={frame.listing} profile={frame.profile} tracking fresh={false} readOnly />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="lp-foot" aria-hidden="true" />
              <p className="lp-muted">{noWidow('Sample data. The real thing looks exactly like this.')}</p>
            </div>
          </section>

          <section className="lp-proof" aria-label="What you get back">
            <Proof value={2} unit="hours" label="saved on every rental screened" />
            <Proof value={0} unit="" label="documents left in your inbox" />
          </section>

          <section className="lp-chips" aria-label="Terms">
            <span className="lp-chip">Free trial</span>
            <span className="lp-chip">No credit card</span>
            <span className="lp-chip">Nothing to set up</span>
          </section>

          <p className="lp-line">{noWidow(LINE)}</p>
        </main>

        <footer className="lp-footer">
          <div className="lp-footer-inner">
            <a href="/my-application" className="lp-link">{noWidow('Applied somewhere? Open your application')}</a>
            <nav className="lp-legal" aria-label="Legal">
              <a href="/faq">FAQ</a>
              <a href="/compliance">Compliance</a>
              <a href="/privacy">Privacy</a>
              <a href="/terms">Terms</a>
              <a href="mailto:info@rentletter.ca">info@rentletter.ca</a>
            </nav>
            <p className="lp-line">{`© ${year} Rentletter`}<span className="lp-sep">{`·${NBSP}Ontario and BC, Canada`}</span><span className="lp-sep">{`·${NBSP}Not legal${NBSP}advice`}</span></p>
          </div>
        </footer>
      </div>
      <style jsx global>{`
        .lp-page { min-height: 100vh; background: ${C.paper}; color: ${C.ink}; }
        .lp-header { display: flex; justify-content: space-between; align-items: center; gap: var(--s-4); padding: var(--s-3) var(--s-4); padding-top: calc(var(--s-3) + env(safe-area-inset-top, 0px)); border-bottom: 1px solid var(--rule); background: ${C.paper}; }
        .lp-nav { display: flex; gap: var(--gap-card); }
        .lp-link { display: inline-flex; align-items: center; min-height: 44px; color: ${C.ink}; font-size: var(--t-body-2); font-weight: 700; text-decoration: underline; }
        .lp-main { max-width: 1200px; margin: 0 auto; padding: var(--gap-section) var(--s-4) var(--s-7); display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--gap-section); }
        .lp-hero { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--gap-section); align-items: start; }
        .lp-copy { min-width: 0; }
        .lp-eyebrow { display: inline-flex; align-items: center; gap: var(--s-2); font-size: var(--t-eyebrow); line-height: var(--lh-eyebrow); font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${C.inkMute}; }
        .lp-dash { display: inline-block; width: 3px; height: 11px; background: ${C.red}; border-radius: 1px; }
        .lp-h1 { font-family: var(--f-display); font-size: var(--t-d1); line-height: var(--lh-display); font-weight: 600; letter-spacing: -0.02em; margin: var(--gap-line) 0 0; text-wrap: balance; }
        .lp-red { color: ${C.red}; }
        .lp-p { font-size: var(--t-body); line-height: var(--lh-body); color: ${C.inkSoft}; margin: var(--gap-card) 0 0; text-wrap: pretty; max-width: 36em; }
        .lp-actions { display: flex; flex-direction: column; gap: var(--gap-card); margin-top: var(--gap-card); }
        .lp-btn { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; width: 100%; height: 44px; padding: 0 var(--s-4); border: 1.5px solid ${C.ink}; border-radius: ${R.ctrl}px; color: ${C.ink}; font-size: var(--t-body-2); font-weight: 700; text-decoration: none; white-space: nowrap; }
        .lp-btn-red { background: var(--action); border-color: var(--action); color: ${C.paper}; }
        .lp-steps { list-style: none; margin: var(--gap-section) 0 0; padding: 0; display: grid; gap: var(--gap-card); }
        .lp-steps li { display: flex; align-items: baseline; gap: var(--s-3); font-size: var(--t-body); line-height: var(--lh-body); color: ${C.ink}; }
        .lp-num { font-family: var(--f-display); font-size: var(--t-d3); font-weight: 600; color: ${C.red}; min-width: 1.1em; }
        .lp-frame-wrap { min-width: 0; }
        .lp-frame { background: ${C.ink}; border-radius: 28px; padding: 12px; }
        .lp-screen { background: ${C.paperDeep}; border-radius: 18px; padding: var(--s-4); overflow: hidden; min-width: 0; }
        .lp-foot { display: none; }
        .lp-screen-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--s-3); }
        .lp-count { font-size: var(--t-d3); font-weight: 800; letter-spacing: -0.02em; color: ${C.ink}; line-height: 1; }
        .lp-cards { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--s-2); margin-top: var(--gap-card); }
        .lp-card { background: ${C.card}; border-radius: ${R.card}px; padding: var(--card-pad); min-width: 0; }
        .lp-muted { font-size: var(--t-body-2); line-height: var(--lh-body); color: ${C.inkMute}; margin: var(--gap-card) 0 0; text-wrap: pretty; }
        .lp-proof { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gap-card); }
        .lp-proof-n { font-family: var(--f-display); font-size: var(--t-d1); line-height: var(--lh-display); font-weight: 600; letter-spacing: -0.02em; color: ${C.ink}; }
        .lp-proof-l { font-size: var(--t-body-2); line-height: var(--lh-body); color: ${C.inkSoft}; margin-top: var(--gap-line); text-wrap: pretty; }
        .lp-chips { display: flex; flex-wrap: wrap; gap: var(--gap-card); }
        .lp-chip { display: inline-flex; align-items: center; min-height: 44px; padding: 0 var(--s-4); border: 1.5px solid ${C.ink}; border-radius: 999px; font-size: var(--t-body-2); font-weight: 700; color: ${C.ink}; }
        .lp-line { font-size: var(--t-body-2); line-height: var(--lh-body); color: ${C.inkMute}; margin: 0; max-width: 44em; text-wrap: pretty; }
        .lp-sep { display: inline-block; margin-left: 0.35em; }
        .lp-footer { border-top: 1px solid var(--rule); padding: var(--gap-section) var(--s-4) var(--s-6); background: ${C.paper}; }
        .lp-footer-inner { max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--gap-card); }
        .lp-legal { display: flex; flex-wrap: wrap; gap: var(--gap-card); }
        .lp-legal a { display: inline-flex; align-items: center; min-height: 44px; color: ${C.inkSoft}; font-size: var(--t-body-2); font-weight: 600; text-decoration: none; }
        @media (min-width: 900px) {
          .lp-hero { grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); gap: var(--s-7); }
          .lp-actions { flex-direction: row; }
          .lp-actions .lp-btn { width: auto; min-width: 220px; }
          .lp-frame { border-radius: 14px 14px 3px 3px; padding: 10px; }
          .lp-screen { border-radius: 6px; }
          .lp-foot { display: block; height: 12px; background: #1c1c1f; border-radius: 0 0 12px 12px; margin: 0 -16px; }
          .lp-proof { max-width: 560px; }
        }
        /* The hero rises 8px and fades in on load, staggered 60ms through animation-delay; nothing
           here waits on scroll. Reduced motion: the final state, no animation. */
        @media ${MOTION_QUERY} {
          @keyframes lp-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
          .lp-rise { animation: lp-rise ${DURATION.short}ms ${CURVE.enter} both; }
        }
      `}</style>
    </>
  );
}
