// /pages/faq.js
// FAQ — current model: realtors first, plus solo landlords and property
// managers. Grouped by audience. Smooth accordion animation.

import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import ChatWidget from '../components/ChatWidget';
import { C, R } from '../components/theme';
import { GlobalStyle, Wordmark, ScrollHeader, Icon } from '../components/ui';

const FAQS = [
  // ─── GENERAL ─────────────────────────────────────
  {
    category: 'General',
    q: 'What is Rentletter?',
    a: 'Rentletter is a tenant-screening dashboard for Canadian realtors, landlords, and property managers. You create a listing, share one application link, and standardized applications land in your dashboard. From there you compare candidates, shortlist your top picks, document each decision, and send a co-branded shortlist to your landlord client. Built in Toronto, available across Canada.',
  },
  {
    category: 'General',
    q: 'Does it run credit or background checks?',
    a: 'No. Rentletter organizes and presents your applicants — it standardizes applications, compares candidates, and documents your decisions. It is not a verification or credit-check product. Run any checks through whatever service you already use.',
  },
  {
    category: 'General',
    q: 'Is it only for Ontario?',
    a: 'No. Ontario is our primary market, but realtors and landlords anywhere in Canada can use it.',
  },
  {
    category: 'General',
    q: 'Who is behind Rentletter?',
    a: 'Rentletter is an independent product built in Toronto. For anything this page does not cover, email info@rentletter.ca or use the chat in the corner — the Rentletter team responds within 24 hours.',
  },

  // ─── FOR REALTORS ────────────────────────────────
  {
    category: 'For realtors',
    q: 'How much does it cost?',
    a: 'The first 50 realtors to sign up are founding members — free forever. After that, new accounts get a 7-day free trial, then $49.99/month (HST included). No setup fees, cancel any time.',
  },
  {
    category: 'For realtors',
    q: 'How does it actually work?',
    a: 'Create a listing, then share its application link with prospective tenants by text or email. Each applicant fills the same standardized form, so everything arrives in one comparable format. You shortlist, add notes, and send a polished report — with your name and brokerage on it — to your landlord client.',
  },
  {
    category: 'For realtors',
    q: 'What does my landlord client see?',
    a: 'A clean, co-branded shortlist page: your branding, the unit, your landlord’s stated preferences, and each candidate scored against those preferences. They can add their own notes and remove anyone they are not interested in — all of which syncs back to you.',
  },
  {
    category: 'For realtors',
    q: 'Does it work on my phone?',
    a: 'Yes. Sign in once with your email and your listings, shortlists, notes, and unit details sync between laptop and phone automatically.',
  },

  // ─── FOR LANDLORDS WITHOUT A REALTOR ─────────────
  {
    category: 'For landlords renting it yourself',
    q: 'I don’t use a realtor. Can I still use Rentletter?',
    a: 'Yes. If you are renting your own unit and want to handle it yourself — and keep the commission — Rentletter gives you the same dashboard realtors use. Post one link, collect standardized applications, compare candidates side by side, and pick with confidence.',
  },
  {
    category: 'For landlords renting it yourself',
    q: 'Why not just take applications by email?',
    a: 'Email gets you ten different formats, missing details, and no easy way to compare. Rentletter sends every applicant through the same form, so you see the same facts for everyone, in one place — and you have a documented record of how you decided.',
  },
  {
    category: 'For landlords renting it yourself',
    q: 'Do my applicants pay anything?',
    a: 'No. Tenants apply for free through your link. They never pay to apply or to be considered.',
  },

  // ─── FOR PROPERTY MANAGERS ───────────────────────
  {
    category: 'For property managers',
    q: 'Can I run more than one listing?',
    a: 'Yes. Each unit gets its own listing, its own application link, and its own shortlist, so you can keep multiple vacancies organized in one workspace.',
  },
  {
    category: 'For property managers',
    q: 'Is this a full property-management system?',
    a: 'No. Rentletter is focused on the applicant funnel — collecting, comparing, and presenting applicants for a vacancy. It is not a rent-collection or maintenance platform. It is the clean front end to your leasing decision.',
  },

  // ─── COMPLIANCE + DATA ───────────────────────────
  {
    category: 'Compliance and data',
    q: 'How does it help with the Ontario Human Rights Code?',
    a: 'Rentletter keeps your attention on legally screenable factors — income, employment, rental history, references, and stated intent — and never asks about protected grounds. The optional AI rationale feature drafts your reasons in compliant language and excludes protected grounds. You remain responsible for your own compliance; Rentletter is a tool, not legal advice.',
  },
  {
    category: 'Compliance and data',
    q: 'What is the AI rationale feature?',
    a: 'After you decide on an applicant, you can ask the AI to draft a short written rationale focused on legitimate factors. It gives you a clear, documented record of your reasoning — useful if a decision is ever questioned. It is not legal advice.',
  },
  {
    category: 'Compliance and data',
    q: 'Where is my data stored, and do you sell it?',
    a: 'Data is encrypted and stored on North American infrastructure. We never sell, rent, or trade your information, and we use no advertising cookies. Tenant applications and inactive workspaces expire automatically — see the Privacy Policy for retention details.',
  },
  {
    category: 'Compliance and data',
    q: 'Can I delete my account?',
    a: 'Yes. Email info@rentletter.ca and we will delete your workspace within 24 hours. Under PIPEDA you can also request a copy of the data we hold about you.',
  },
];

export default function FAQ() {
  const [open, setOpen] = useState(null);
  const categories = [...new Set(FAQS.map(f => f.category))];

  return (
    <>
      <Head>
        <title>FAQ — Rentletter</title>
        <meta name="description" content="Common questions about Rentletter — for realtors, landlords, and property managers." />
      </Head>
      <GlobalStyle />

      <div style={{ minHeight: '100vh', background: C.paper, color: C.ink }}>

        <ScrollHeader maxWidth={820}>
          <Link href="/" style={{ textDecoration: 'none', display: 'inline-flex' }}><Wordmark /></Link>
          <Link href="/" style={{ color: C.inkSoft, fontSize: 13, fontWeight: 500, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}><Icon name="arrow" size={14} /></span> Back to home
          </Link>
        </ScrollHeader>

        <main style={{ maxWidth: 820, margin: '0 auto', padding: 'clamp(40px, 8vw, 80px) clamp(20px, 4vw, 40px)' }}>

          <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 14 }}>
            Frequently asked questions
          </div>
          <h1 className="rl-serif" style={{ fontSize: 'clamp(34px, 6vw, 52px)', letterSpacing: '-0.025em', lineHeight: 1.04, marginBottom: 18 }}>
            Quick answers.
          </h1>
          <p style={{ fontSize: 'clamp(15px, 3vw, 17px)', color: C.inkSoft, marginBottom: 40, lineHeight: 1.6, maxWidth: 600 }}>
            Can&apos;t find what you need? Email{' '}
            <a href="mailto:info@rentletter.ca" style={{ color: C.red, textDecoration: 'underline' }}>info@rentletter.ca</a>{' '}
            or use the chat in the corner — the Rentletter team replies within 24 hours.
          </p>

          {categories.map(cat => (
            <section key={cat} style={{ marginBottom: 40 }}>
              <h2 style={{
                fontSize: 12, fontWeight: 700, color: C.red,
                letterSpacing: '0.12em', textTransform: 'uppercase',
                marginBottom: 8, paddingBottom: 12, borderBottom: `1px solid ${C.rule}`,
              }}>
                {cat}
              </h2>
              {FAQS.filter(f => f.category === cat).map((f, i) => {
                const key = `${cat}-${i}`;
                const isOpen = open === key;
                return (
                  <div key={key} style={{ borderBottom: `1px solid ${C.rule}` }}>
                    <button onClick={() => setOpen(isOpen ? null : key)}
                      aria-expanded={isOpen}
                      style={{
                        width: '100%', textAlign: 'left',
                        background: 'transparent', border: 'none',
                        padding: '20px 0', cursor: 'pointer',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14,
                      }}>
                      <span style={{ fontSize: 16.5, fontWeight: 600, color: C.ink, lineHeight: 1.4 }}>
                        {f.q}
                      </span>
                      <span className={`rl-chev${isOpen ? ' rl-chev-open' : ''}`} style={{ flexShrink: 0, display: 'inline-flex', color: isOpen ? C.red : C.inkMute }}>
                        <Icon name="chevronD" size={20} />
                      </span>
                    </button>
                    {/* Smooth height animation via grid-rows trick */}
                    <div className={`rl-acc${isOpen ? ' rl-acc-open' : ''}`}>
                      <div>
                        <p style={{ fontSize: 15, color: C.inkSoft, lineHeight: 1.7, padding: '0 36px 24px 0', margin: 0 }}>
                          {f.a}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </section>
          ))}

          {/* CTA at bottom */}
          <section className="rl-card" style={{ marginTop: 36, padding: 'clamp(24px, 4vw, 40px)', background: C.ink, color: C.paper, border: 'none' }}>
            <div style={{ fontSize: 11, color: '#f0b8bb', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
              Still have a question?
            </div>
            <h3 className="rl-serif" style={{ fontSize: 'clamp(22px, 4vw, 30px)', color: C.paper, marginBottom: 10, letterSpacing: '-0.02em' }}>
              Talk to the Rentletter team.
            </h3>
            <p style={{ fontSize: 14.5, color: C.inkInverse, lineHeight: 1.6, marginBottom: 20, maxWidth: 520 }}>
              Real human responses within 24 hours — or open the chat assistant in the corner for instant answers about how the product works.
            </p>
            <a href="mailto:info@rentletter.ca" className="rl-btn" style={{
              display: 'inline-flex', alignItems: 'center', gap: 9,
              background: C.red, color: C.paper, padding: '14px 24px', borderRadius: R.ctrl,
              fontSize: 14, fontWeight: 600, textDecoration: 'none',
            }}>
              <Icon name="mail" size={16} /> info@rentletter.ca
            </a>
          </section>

          <div style={{ marginTop: 48, paddingTop: 28, borderTop: `1px solid ${C.rule}`, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <Link href="/" style={FOOTLINK_STYLE}>← Back to home</Link>
            <Link href="/privacy" style={FOOTLINK_STYLE}>Privacy Policy</Link>
            <Link href="/terms" style={FOOTLINK_STYLE}>Terms of Service</Link>
          </div>
        </main>

        <ChatWidget />
      </div>
    </>
  );
}

const FOOTLINK_STYLE = { color: C.inkSoft, fontSize: 13, fontWeight: 600, textDecoration: 'underline' };
