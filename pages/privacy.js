// /pages/privacy.js
// Privacy Policy — PIPEDA-compliant, Ontario-focused.

import Head from 'next/head';
import Link from 'next/link';
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

export default function PrivacyPolicy() {
  return (
    <>
      <Head>
        <title>Privacy Policy — Rentletter</title>
        <meta name="description" content="How Rentletter collects, uses, and protects your personal information. PIPEDA-compliant." />
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

        <main style={{ maxWidth: 720, margin: '0 auto', padding: 'clamp(40px, 8vw, 80px) clamp(20px, 4vw, 40px)' }}>

          <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 14 }}>
            Privacy Policy
          </div>
          <h1 style={{ fontSize: 'clamp(34px, 6vw, 48px)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 16 }}>
            How we handle your information.
          </h1>
          <p style={{ fontSize: 14, color: C.inkSoft, marginBottom: 40, lineHeight: 1.6 }}>
            Last updated: May 23, 2026 · Effective for all users in Canada
          </p>

          <Section title="1. Who we are">
            <P>Rentletter ("we", "us", "our") is a Canadian rental-application platform operated as a sole proprietorship in Toronto, Ontario. We provide:</P>
            <UL>
              <LI>An AI-assisted cover letter and tenant resume service for rental applicants ("tenant service").</LI>
              <LI>A free dashboard that landlords, realtors, and investors can use to review applicant profiles ("landlord service").</LI>
            </UL>
            <P>This Privacy Policy explains what personal information we collect, why we collect it, how we use and protect it, and your rights regarding your information. It is intended to comply with the Personal Information Protection and Electronic Documents Act (PIPEDA) and Ontario privacy expectations.</P>
          </Section>

          <Section title="2. What information we collect">
            <H3>From tenants</H3>
            <P>When you create a Rentletter application, you provide:</P>
            <UL>
              <LI>Identity information (full name, contact email, phone number, current address).</LI>
              <LI>Employment information (job title, employer, annual income, employment duration).</LI>
              <LI>Rental history (previous addresses, dates, references with contact info).</LI>
              <LI>Household details (co-applicants, dependents, pets where you choose to disclose).</LI>
              <LI>Stated lifestyle and rental intent (move-in date, length of stay, smoking/non-smoking).</LI>
              <LI>Payment information processed by Stripe — we do not store credit card numbers ourselves.</LI>
            </UL>
            <H3>From landlords, realtors, and investors</H3>
            <P>When you sign in to the landlord dashboard, you provide:</P>
            <UL>
              <LI>Your email address (used to authenticate you and sync your workspace across devices).</LI>
              <LI>Optional unit information you enter (address, monthly rent, pet policy, etc.).</LI>
              <LI>Decisions and notes you record about tenant applications you have looked up.</LI>
            </UL>
            <H3>Automatically collected</H3>
            <P>When you visit Rentletter we collect standard technical data via Vercel hosting and Google Analytics: IP address, browser type, referring URL, pages viewed, and approximate location (city-level only). We do not use third-party advertising cookies or sell this data.</P>
          </Section>

          <Section title="3. Why we collect it (purposes)">
            <P>We collect personal information for the following specific purposes:</P>
            <UL>
              <LI><strong>To generate your rental application</strong> — your inputs are sent to Anthropic's Claude API to draft your cover letter, then stored in our database with a unique application number so landlords you share it with can look it up.</LI>
              <LI><strong>To authenticate you</strong> — sign-in by email link (no passwords).</LI>
              <LI><strong>To process payments</strong> — payments are handled by Stripe; we receive only confirmation that payment occurred.</LI>
              <LI><strong>To deliver your letter</strong> — we email you the generated PDF and Word documents via Resend.</LI>
              <LI><strong>To provide the landlord dashboard</strong> — we store the decisions and notes a landlord records about applications they have looked up, tied to their email.</LI>
              <LI><strong>To prevent abuse</strong> — we apply rate limits per IP and log suspicious activity.</LI>
              <LI><strong>To improve the product</strong> — aggregate, non-identifying analytics about usage.</LI>
            </UL>
            <P>We do not use your information for any other purpose without your consent.</P>
          </Section>

          <Section title="4. Who can see your information">
            <H3>Tenant applications</H3>
            <P>Your Rentletter application is <strong>private by default</strong>. Anyone with your unique application number (RL-2026-XXXX-XXXX) can look up the full profile via the landlord dashboard. You control who has this number by choosing who you share it with.</P>
            <P>You can see an <strong>audit log</strong> of every lookup of your application — including the landlord's email (if signed in), an anonymized IP/user-agent hash, and the timestamp — by visiting the "Manage your application" link in your confirmation email. From that page you can also revoke your application at any time, which immediately stops further lookups.</P>
            <H3>Landlord workspaces</H3>
            <P>Your landlord workspace (the list of applications you've looked up, your decisions, and your notes) is visible only to people signed in with your email. It is not visible to applicants, other landlords, or any third party.</P>
            <H3>Service providers</H3>
            <P>We share data only with the following service providers, each contractually obligated to protect the information:</P>
            <UL>
              <LI><strong>Anthropic PBC</strong> — Claude API (cover letter generation, AI assistant). Inputs are processed but, per their API terms, not used to train their models.</LI>
              <LI><strong>Vercel Inc.</strong> — hosting and edge infrastructure.</LI>
              <LI><strong>Upstash Inc.</strong> — encrypted Redis storage for application data and session tokens.</LI>
              <LI><strong>Stripe Inc.</strong> — payment processing. Stripe handles all credit card data; we never see it.</LI>
              <LI><strong>Resend</strong> — transactional email delivery.</LI>
              <LI><strong>Google Analytics</strong> — anonymized usage statistics.</LI>
            </UL>
            <P>Some of these providers are located in the United States. By using Rentletter, you consent to your information being processed in the United States, subject to U.S. laws.</P>
            <H3>Legal disclosures</H3>
            <P>We may disclose information if required by Canadian law, a valid court order, or to investigate fraud or abuse. We will never sell your personal information.</P>
          </Section>

          <Section title="5. How long we keep it">
            <UL>
              <LI><strong>Single-application data</strong> — retained for 90 days after generation, then automatically deleted.</LI>
              <LI><strong>30-day pass applications</strong> — retained for 30 days after the last update, then deleted unless renewed.</LI>
              <LI><strong>Landlord workspaces</strong> — retained for 30 days after the last sign-in.</LI>
              <LI><strong>Sign-in sessions</strong> — 30 days, then expire automatically.</LI>
              <LI><strong>Audit logs</strong> — same retention as the underlying application.</LI>
              <LI><strong>Aggregate analytics</strong> — retained indefinitely but not linked to identifiable individuals.</LI>
            </UL>
            <P>You can request earlier deletion at any time by emailing <A href="mailto:hello@rentletter.ca">hello@rentletter.ca</A>.</P>
          </Section>

          <Section title="6. Your rights under PIPEDA">
            <P>Under the Personal Information Protection and Electronic Documents Act, you have the right to:</P>
            <UL>
              <LI><strong>Access</strong> — request a copy of the personal information we hold about you.</LI>
              <LI><strong>Correction</strong> — request that we correct inaccurate or incomplete information.</LI>
              <LI><strong>Withdrawal of consent</strong> — withdraw consent to our processing of your information, subject to legal or contractual restrictions.</LI>
              <LI><strong>Deletion</strong> — request that we delete your information (we will comply unless we are legally required to retain it).</LI>
              <LI><strong>Complaint</strong> — file a complaint with the Office of the Privacy Commissioner of Canada if you believe we have violated your privacy rights.</LI>
            </UL>
            <P>To exercise these rights, email <A href="mailto:hello@rentletter.ca">hello@rentletter.ca</A>. We will respond within 30 days. Tenants can also use the self-serve revocation tool linked in their confirmation email.</P>
            <P>If you are unsatisfied with our response, you may contact the Office of the Privacy Commissioner of Canada at <A href="https://www.priv.gc.ca" target="_blank" rel="noopener noreferrer">priv.gc.ca</A>.</P>
          </Section>

          <Section title="7. How we protect your information">
            <UL>
              <LI>All data is transmitted over HTTPS (TLS 1.2+).</LI>
              <LI>Data is stored in encrypted databases (Upstash Redis with at-rest encryption).</LI>
              <LI>Sign-in is passwordless via short-lived email links and rotating session tokens.</LI>
              <LI>Sensitive payment data is handled entirely by Stripe and never touches our servers.</LI>
              <LI>We log access to systems containing personal data.</LI>
              <LI>We apply rate limits and abuse detection to prevent enumeration attacks.</LI>
            </UL>
            <P>No system is perfectly secure. In the event of a data breach affecting your information, we will notify affected individuals and the Office of the Privacy Commissioner of Canada within a reasonable time, as required by law.</P>
          </Section>

          <Section title="8. Children">
            <P>Rentletter is intended for adults (18+) who are legally entitled to rent residential property in Canada. We do not knowingly collect information from anyone under 18. If you believe a minor has provided us with personal information, please email <A href="mailto:hello@rentletter.ca">hello@rentletter.ca</A> and we will delete it.</P>
          </Section>

          <Section title="9. International users">
            <P>Rentletter is intended for use in Canada. If you access the service from outside Canada, your information will be transferred to and processed in Canada and the United States. By using Rentletter, you consent to this transfer.</P>
          </Section>

          <Section title="10. Cookies and analytics">
            <P>We use minimal cookies — essential cookies for sign-in sessions, and Google Analytics cookies for anonymized usage statistics. We do not use advertising or tracking cookies. You can disable cookies in your browser, but sign-in will not work.</P>
          </Section>

          <Section title="11. AI assistant">
            <P>We provide an AI chatbot for general support. Messages you send to the chatbot are processed by Anthropic Claude to generate responses. Conversations are not retained beyond your browser session. The chatbot provides general information about Rentletter — it does not provide legal, financial, or professional advice and should not be relied upon as such. For account-specific questions, the chatbot will route you to email support.</P>
          </Section>

          <Section title="12. Changes to this policy">
            <P>We may update this Privacy Policy from time to time. Material changes will be announced at the top of this page and, for active users, by email. The "Last updated" date at the top of the page indicates the most recent revision.</P>
          </Section>

          <Section title="13. Contact">
            <P>Questions, requests, or complaints about this Privacy Policy or our handling of your information:</P>
            <P style={{ marginLeft: 20, marginTop: 14 }}>
              <strong>Email:</strong> <A href="mailto:hello@rentletter.ca">hello@rentletter.ca</A><br />
              <strong>Mailing address:</strong> Available on request.
            </P>
          </Section>

          <div style={{ marginTop: 60, paddingTop: 32, borderTop: `1px solid ${C.rule}`, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <Link href="/" style={FOOTLINK_STYLE}>← Back to home</Link>
            <Link href="/terms" style={FOOTLINK_STYLE}>Terms of Service</Link>
            <Link href="/faq" style={FOOTLINK_STYLE}>FAQ</Link>
          </div>
        </main>

        <ChatWidget />
      </div>
    </>
  );
}

// ─── Helper components ────────────────────────────────────
function Section({ title, children }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: C.ink, letterSpacing: '-0.015em', marginBottom: 14, marginTop: 8 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}
function H3({ children }) {
  return <h3 style={{ fontSize: 16, fontWeight: 700, color: C.ink, marginBottom: 8, marginTop: 20 }}>{children}</h3>;
}
function P({ children, style }) {
  return <p style={{ fontSize: 15, color: C.ink, lineHeight: 1.65, marginBottom: 12, ...style }}>{children}</p>;
}
function UL({ children }) {
  return <ul style={{ paddingLeft: 20, marginBottom: 14 }}>{children}</ul>;
}
function LI({ children }) {
  return <li style={{ fontSize: 15, color: C.ink, lineHeight: 1.65, marginBottom: 8 }}>{children}</li>;
}
function A({ children, ...props }) {
  return <a {...props} style={{ color: C.red, textDecoration: 'underline' }}>{children}</a>;
}

const FOOTLINK_STYLE = { color: C.inkSoft, fontSize: 13, fontWeight: 600, textDecoration: 'underline' };
