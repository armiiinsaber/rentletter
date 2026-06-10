// /pages/faq.js
// FAQ — public-friendly, grouped by audience (tenants / landlords / general)

import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import ChatWidget from '../components/ChatWidget';

const C = {
  paper: '#faf8f3',
  paperDeep: '#f2eee3',
  ink: '#0f0f10',
  inkSoft: '#3a3a3c',
  inkMute: '#86868b',
  rule: '#e3ddd0',
  red: '#d72027',
};

const FAQS = [
  // ─── GENERAL ─────────────────────────────────────
  {
    category: 'General',
    q: 'What is Rentletter?',
    a: 'Rentletter is a Canadian platform with two sides: tenants generate professional rental cover letters with a unique application number, and landlords (or realtors and investors) use a free dashboard to look up applications, shortlist favourites, and document their decisions. Built in Toronto, covers all 10 provinces.',
  },
  {
    category: 'General',
    q: 'How is this different from just using ChatGPT to write a cover letter?',
    a: 'A general AI gives you a one-off letter. Rentletter is tailored to Canadian rental conventions, gives the tenant a verifiable application number landlords can look up, includes a structured tenant resume, and delivers everything in PDF + Word format. Landlords trust the format because they see consistent, comparable applications.',
  },
  {
    category: 'General',
    q: 'Is Rentletter only for Toronto?',
    a: 'No. Rentletter covers all 10 Canadian provinces. The product was built in Toronto and Ontario is our primary market right now, but tenants and landlords anywhere in Canada can use it.',
  },
  {
    category: 'General',
    q: 'Who is behind Rentletter?',
    a: 'Built solo by Armin, an independent founder in Toronto. For any question this FAQ does not cover, email hello@rentletter.ca and you will hear back within 24 hours.',
  },

  // ─── FOR TENANTS ─────────────────────────────────
  {
    category: 'For tenants',
    q: 'How much does it cost?',
    a: 'CAD $0.99 for a single application during the launch promotion (until July 1, 2026). After July 1, 2026, the price will be $9.99. A 30-day pass is $19.99 and lets you update your application, re-tailor letters for different listings, and keep it live for any landlord to look up for 30 days.',
  },
  {
    category: 'For tenants',
    q: 'How long does the form take?',
    a: 'About 10 minutes if you have your employment, rental history, and reference info handy. You can pause and come back — the form remembers what you have entered (in the current browser session).',
  },
  {
    category: 'For tenants',
    q: 'What is an RL number?',
    a: 'When your application is generated, you receive a unique identifier in the format RL-2026-XXXX-XXXX. You share this number with landlords. They look it up at rentletter.ca/landlord and see your full standardized profile. It is your shareable proof that you have a complete, professionally formatted application ready.',
  },
  {
    category: 'For tenants',
    q: 'Will the landlord I share my application with be charged?',
    a: 'No. The landlord dashboard is completely free. Landlords, realtors, and investors never pay anything to look up your application or use any of the screening tools.',
  },
  {
    category: 'For tenants',
    q: 'Can I edit my application after submitting it?',
    a: 'A single $0.99 application is locked once generated — but you can purchase a new one any time. With the $19.99 30-day pass you can update your application, re-tailor letters for different listings, and keep it live for 30 days.',
  },
  {
    category: 'For tenants',
    q: 'What if I do not have a job yet?',
    a: 'The form has sections for student status, co-applicant income, guarantors, savings, and other context. You can submit a complete application even without traditional employment — landlords will see the full picture.',
  },
  {
    category: 'For tenants',
    q: 'Is my application private?',
    a: 'Yes. Your application is visible only to landlords you give your RL number to. You can view an audit log of every lookup (showing landlord email, an anonymized IP/UA hash, and timestamp) via the "Manage your application" link in your confirmation email. You can revoke your application at any time from that page.',
  },
  {
    category: 'For tenants',
    q: 'How do I share my application with a landlord?',
    a: 'Just send them your RL number by text, email, or include it in your inquiry message. They open rentletter.ca/landlord, paste it in the lookup field, and see your full profile.',
  },
  {
    category: 'For tenants',
    q: 'Can I get a refund?',
    a: 'For technical issues (no letter delivered, duplicate charges, or system errors), email hello@rentletter.ca within 7 days. Because the service delivers immediate AI-generated content, refunds for change of mind are generally not provided — but we will always look at your case individually.',
  },

  // ─── FOR LANDLORDS ──────────────────────────────
  {
    category: 'For landlords, realtors, investors',
    q: 'Do I have to pay anything?',
    a: 'No. The landlord dashboard is completely free — lookups, shortlist tools, AI rationale, PDF exports, email summaries. We make money from tenants paying for their applications, not from landlords.',
  },
  {
    category: 'For landlords, realtors, investors',
    q: 'Is Rentletter a property management system?',
    a: 'No. It is a focused screening tool for individual landlords and small property owners (1 to 5 units typically). If you manage 80+ units with your own CRM and process, this is not the right tool. If you are screening 5 to 20 applicants for one unit and want a clean way to compare them, this is built for you.',
  },
  {
    category: 'For landlords, realtors, investors',
    q: 'How do I get tenants to apply through Rentletter?',
    a: 'In your dashboard, use the "Ask tenants to apply through Rentletter" template. It generates a ready-to-send email or text asking applicants to create their Rentletter application before submitting to you. Every applicant comes back with a verifiable RL number, so you can compare apples to apples.',
  },
  {
    category: 'For landlords, realtors, investors',
    q: 'Does the dashboard work on my phone?',
    a: 'Yes. Sign in once with your email — your shortlist, notes, and unit details sync between laptop and phone automatically.',
  },
  {
    category: 'For landlords, realtors, investors',
    q: 'How do I avoid violating the Ontario Human Rights Code?',
    a: 'Rentletter is designed to focus your attention on financial fit, employment, rental history, references, and stated intent — never on protected grounds (race, ancestry, place of origin, citizenship, ethnic origin, creed, sex, sexual orientation, gender identity, age, marital status, family status, disability, or receipt of public assistance). The AI rationale feature explicitly excludes protected grounds. But you are responsible for your own compliance — Rentletter is a tool, not a substitute for legal knowledge.',
  },
  {
    category: 'For landlords, realtors, investors',
    q: 'What is the "AI rationale" feature?',
    a: 'After you make a decision about an applicant, you can ask the AI to draft a written rationale that articulates the reasons in compliant language (focusing on legitimate factors, excluding protected grounds). This is helpful for your internal records and provides an audit trail in case a rejected applicant ever questions your decision. It is not legal advice — but it helps you document your thinking clearly.',
  },

  // ─── ABOUT THE COMPANY + LEGAL ──────────────────
  {
    category: 'Privacy and legal',
    q: 'Where is my data stored?',
    a: 'All Rentletter data is stored in encrypted databases (Upstash Redis) located in North America. Tenant applications expire automatically after 90 days. Landlord workspaces are deleted 30 days after the last sign-in. See our Privacy Policy for full retention details.',
  },
  {
    category: 'Privacy and legal',
    q: 'Do you sell my information?',
    a: 'No. We do not sell, rent, or trade your information to third parties. We do not use advertising cookies. Our revenue comes from tenants paying for their own applications, period.',
  },
  {
    category: 'Privacy and legal',
    q: 'Can I delete my account?',
    a: 'Yes. Tenants: use the "Manage your application" link in your confirmation email to revoke and delete. Landlords: email hello@rentletter.ca and we will delete your workspace within 24 hours. Under PIPEDA, you also have the right to request a copy of all data we hold about you.',
  },
  {
    category: 'Privacy and legal',
    q: 'Is the AI assistant giving legal advice?',
    a: 'No. The chat assistant provides general information about how Rentletter works. It is explicitly programmed to refuse legal advice, account-specific lookups, and predictions about applications. For legal questions, consult a lawyer or the Landlord and Tenant Board. For account-specific issues, email hello@rentletter.ca.',
  },
];

export default function FAQ() {
  const [open, setOpen] = useState(null);
  const categories = [...new Set(FAQS.map(f => f.category))];

  return (
    <>
      <Head>
        <title>FAQ — Rentletter</title>
        <meta name="description" content="Common questions about Rentletter — for tenants, landlords, and realtors." />
      </Head>

      <div style={{ minHeight: '100vh', background: C.paper, fontFamily: "-apple-system, 'Inter', sans-serif", color: C.ink }}>

        <header style={{ background: C.red, color: C.paper, padding: '20px 0', borderBottom: `1px solid ${C.rule}` }}>
          <div style={{ maxWidth: 880, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <Link href="/" style={{ color: C.paper, textDecoration: 'none', fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 3, height: 16, background: C.paper, display: 'inline-block' }} />
              Rentletter
            </Link>
            <Link href="/" style={{ color: C.paper, fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', textDecoration: 'none', opacity: 0.9 }}>
              ← Back to home
            </Link>
          </div>
        </header>

        <main style={{ maxWidth: 760, margin: '0 auto', padding: 'clamp(40px, 8vw, 80px) clamp(20px, 4vw, 40px)' }}>

          <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 14 }}>
            Frequently Asked Questions
          </div>
          <h1 style={{ fontSize: 'clamp(34px, 6vw, 52px)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05, marginBottom: 18 }}>
            Quick answers.
          </h1>
          <p style={{ fontSize: 'clamp(15px, 3vw, 17px)', color: C.inkSoft, marginBottom: 44, lineHeight: 1.6 }}>
            Cannot find what you need? Email <a href="mailto:hello@rentletter.ca" style={{ color: C.red, textDecoration: 'underline' }}>hello@rentletter.ca</a> or use the chat in the corner — Armin (the founder) responds within 24 hours.
          </p>

          {categories.map(cat => (
            <section key={cat} style={{ marginBottom: 48 }}>
              <h2 style={{
                fontSize: 13, fontWeight: 700, color: C.inkMute,
                letterSpacing: '0.12em', textTransform: 'uppercase',
                marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${C.rule}`,
              }}>
                {cat}
              </h2>
              {FAQS.filter(f => f.category === cat).map((f, i) => {
                const key = `${cat}-${i}`;
                const isOpen = open === key;
                return (
                  <div key={key} style={{ borderBottom: `1px solid ${C.rule}` }}>
                    <button onClick={() => setOpen(isOpen ? null : key)}
                      style={{
                        width: '100%', textAlign: 'left',
                        background: 'transparent', border: 'none',
                        padding: '20px 0',
                        cursor: 'pointer',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14,
                      }}>
                      <span style={{ fontSize: 16, fontWeight: 600, color: C.ink, lineHeight: 1.45 }}>
                        {f.q}
                      </span>
                      <span style={{
                        fontSize: 22, color: C.red, fontWeight: 400, lineHeight: 1, marginTop: 2,
                        transform: isOpen ? 'rotate(45deg)' : 'rotate(0)',
                        transition: 'transform 0.2s',
                        flexShrink: 0,
                      }}>
                        +
                      </span>
                    </button>
                    {isOpen && (
                      <div style={{ paddingBottom: 24, paddingRight: 36 }}>
                        <p style={{ fontSize: 15, color: C.inkSoft, lineHeight: 1.7, whiteSpace: 'pre-line' }}>
                          {f.a}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          ))}

          {/* CTA at bottom */}
          <section style={{ marginTop: 32, padding: 'clamp(24px, 4vw, 36px)', background: C.ink, color: C.paper }}>
            <div style={{ fontSize: 11, color: '#f0b8bb', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
              Still have a question?
            </div>
            <h3 style={{ fontSize: 'clamp(20px, 4vw, 26px)', fontWeight: 800, color: C.paper, marginBottom: 10, letterSpacing: '-0.02em' }}>
              Email Armin directly.
            </h3>
            <p style={{ fontSize: 14, color: '#c8c2b3', lineHeight: 1.6, marginBottom: 18 }}>
              Real human responses within 24 hours. Or open the chat assistant in the bottom corner for instant answers about how the product works.
            </p>
            <a href="mailto:hello@rentletter.ca" style={{
              display: 'inline-block',
              background: C.red, color: C.paper, padding: '14px 24px',
              fontSize: 14, fontWeight: 700, textDecoration: 'none', letterSpacing: '0.02em',
            }}>
              hello@rentletter.ca →
            </a>
          </section>

          <div style={{ marginTop: 60, paddingTop: 32, borderTop: `1px solid ${C.rule}`, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
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
