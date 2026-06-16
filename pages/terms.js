// /pages/terms.js
// Terms of Service — Ontario jurisdiction, AI-aware, includes Air Canada precedent protection.

import Head from 'next/head';
import Link from 'next/link';
import ChatWidget from '../components/ChatWidget';
import { C, R } from '../components/theme';
import { GlobalStyle, Wordmark, ScrollHeader, Icon } from '../components/ui';

export default function Terms() {
  return (
    <>
      <Head>
        <title>Terms of Service — Rentletter</title>
        <meta name="description" content="The terms that govern your use of Rentletter." />
      </Head>
      <GlobalStyle />

      <div style={{ minHeight: '100vh', background: C.paper, color: C.ink }}>

        <ScrollHeader maxWidth={880}>
          <Link href="/" style={{ textDecoration: 'none', display: 'inline-flex' }}><Wordmark /></Link>
          <Link href="/" style={{ color: C.inkSoft, fontSize: 13, fontWeight: 500, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}><Icon name="arrow" size={14} /></span> Back to home
          </Link>
        </ScrollHeader>

        <main style={{ maxWidth: 720, margin: '0 auto', padding: 'clamp(40px, 8vw, 80px) clamp(20px, 4vw, 40px)' }}>

          <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 14 }}>
            Terms of Service
          </div>
          <h1 className="rl-serif" style={{ fontSize: 'clamp(34px, 6vw, 48px)', letterSpacing: '-0.025em', lineHeight: 1.05, marginBottom: 16 }}>
            The terms of using Rentletter.
          </h1>
          <p style={{ fontSize: 14, color: C.inkSoft, marginBottom: 40, lineHeight: 1.6 }}>
            Last updated: May 23, 2026 · Governed by the laws of Ontario, Canada
          </p>

          <Section title="1. Agreement">
            <P>By using Rentletter (the "Service"), you agree to these Terms of Service ("Terms"). If you do not agree, do not use the Service. These Terms form a binding agreement between you and Rentletter ("we", "us"), a sole proprietorship based in Toronto, Ontario, Canada.</P>
            <P>You must be at least 18 years old and legally able to enter contracts in your jurisdiction.</P>
          </Section>

          <Section title="2. What we provide">
            <P>Rentletter offers two services:</P>
            <UL>
              <LI><strong>Tenant service</strong> — for a one-time fee, we generate an AI-assisted rental cover letter and tenant resume based on information you provide, deliver them by email in PDF and Word formats, and assign a unique application number that landlords can use to look up your profile.</LI>
              <LI><strong>Landlord service</strong> — free for landlords, realtors, and investors. Sign in by email to look up Rentletter application numbers, organize and shortlist applicants, generate AI-assisted decision rationale, and export your shortlist.</LI>
            </UL>
            <P>We may add, change, or remove features at any time.</P>
          </Section>

          <Section title="3. Pricing and payments">
            <P>Current pricing (subject to change):</P>
            <UL>
              <LI><strong>Single application</strong> — CAD $0.99 (launch promotion until July 1, 2026). After July 1, 2026: CAD $9.99.</LI>
              <LI><strong>30-day pass</strong> — CAD $19.99. Allows updates and re-tailoring of the application for 30 days.</LI>
              <LI><strong>Landlord service</strong> — Free.</LI>
            </UL>
            <P>Payments are processed by Stripe Inc. Charges appear on your statement as "Rentletter" or "STRIPE *RENTLETTER". All prices are in Canadian dollars and exclude applicable taxes unless stated.</P>
            <P>By providing payment information, you confirm you are authorized to use the payment method.</P>
          </Section>

          <Section title="4. Refunds">
            <P>Because our service delivers immediate AI-generated digital content, all sales are generally final.</P>
            <P>However, we will issue a refund in the following cases:</P>
            <UL>
              <LI>The letter was not delivered to you due to a technical error on our side.</LI>
              <LI>You were charged but no application was generated.</LI>
              <LI>Duplicate charges due to a payment system error.</LI>
            </UL>
            <P>To request a refund, email <A href="mailto:info@rentletter.ca">info@rentletter.ca</A> within 7 days of the charge with your receipt and a description of the issue. We will respond within 24 hours.</P>
          </Section>

          <Section title="5. Your account and your data">
            <P>You are responsible for:</P>
            <UL>
              <LI>The accuracy of all information you provide. Providing false information may result in account termination and is your sole legal responsibility.</LI>
              <LI>Keeping your sign-in email and access secure. If your email account is compromised, your Rentletter access may be too.</LI>
              <LI>Choosing who you share your application number with. We do not control how landlords use the profile information they look up.</LI>
            </UL>
            <P>Our handling of your information is governed by our <A href="/privacy">Privacy Policy</A>.</P>
          </Section>

          <Section title="6. Acceptable use">
            <P>You agree not to:</P>
            <UL>
              <LI>Submit false, misleading, or impersonated information.</LI>
              <LI>Use the Service to harass, defame, discriminate against, or harm any person.</LI>
              <LI>Use the Service for any unlawful purpose or to violate any applicable law (including the Ontario Residential Tenancies Act, the Ontario Human Rights Code, or PIPEDA).</LI>
              <LI>Attempt to access another user's account, application, or workspace without authorization.</LI>
              <LI>Reverse engineer, scrape, copy, or attempt to derive the source of the Service or any of its components.</LI>
              <LI>Use automated tools, bots, or scripts to interact with the Service except as we explicitly permit.</LI>
              <LI>Bypass rate limits, abuse the chat assistant for purposes unrelated to Rentletter, or attempt to overload our infrastructure.</LI>
              <LI>Use the Service in a way that could create liability for us or disrupt other users.</LI>
            </UL>
            <P>We may suspend or terminate your access at any time for actual or suspected violation of these Terms, with or without notice.</P>
          </Section>

          <Section title="7. Landlord obligations and Ontario Human Rights Code">
            <P>If you use the landlord service, you acknowledge that:</P>
            <UL>
              <LI>Under the Ontario Human Rights Code, you must not discriminate against tenants on the basis of race, ancestry, place of origin, colour, ethnic origin, citizenship, creed, sex, sexual orientation, gender identity, gender expression, age, marital status, family status, disability, or receipt of public assistance.</LI>
              <LI>Rentletter is a tool, not a substitute for legal compliance. Your screening decisions are your own legal responsibility.</LI>
              <LI>The AI-generated decision rationale feature is designed to help you articulate compliant reasoning, but the decision itself — and any legal consequences of it — is yours.</LI>
              <LI>You must comply with all applicable provincial and federal laws including the Residential Tenancies Act, the Personal Information Protection and Electronic Documents Act (PIPEDA), and any municipal bylaws.</LI>
              <LI>You may not share applicant information beyond what is reasonably necessary to make a rental decision.</LI>
            </UL>
          </Section>

          <Section title="8. AI-generated content">
            <P>Rentletter uses artificial intelligence (Anthropic's Claude API) to generate cover letters, decision rationale, and chat responses.</P>
            <UL>
              <LI><strong>Cover letters</strong> are AI-drafted based on inputs you provide. You should review every letter before sending it to a landlord. You are responsible for the accuracy of the content.</LI>
              <LI><strong>Decision rationale</strong> for landlords is AI-drafted as a starting point. It is not legal advice. Verify all facts (especially references) before relying on the rationale.</LI>
              <LI><strong>The AI chat assistant</strong> provides general information about Rentletter only. It does not provide legal, financial, or professional advice. We are not bound by statements made by the chatbot that are inconsistent with these Terms, our Privacy Policy, or other official Rentletter documentation. For account-specific questions, always confirm via <A href="mailto:info@rentletter.ca">info@rentletter.ca</A>.</LI>
              <LI>AI may produce inaccurate, incomplete, or unexpected output. You are responsible for verifying any AI-generated content before relying on it.</LI>
            </UL>
          </Section>

          <Section title="9. Service limits">
            <P>We do not guarantee:</P>
            <UL>
              <LI>That any landlord will accept your application.</LI>
              <LI>That any tenant will pass a landlord's screening.</LI>
              <LI>That the Service will be available without interruption or error.</LI>
              <LI>That any specific feature will continue to exist.</LI>
            </UL>
          </Section>

          <Section title="10. Intellectual property">
            <P>The Rentletter name, logo, brand, code, design, and original written content are our intellectual property. You may not copy, modify, redistribute, or use them for commercial purposes without our written permission.</P>
            <P>You retain ownership of the information you submit. By submitting it, you grant us a limited, non-exclusive licence to use, store, and display it for the purposes of providing the Service to you and the landlords you authorize.</P>
            <P>The cover letter we generate from your inputs is yours to use. You may share it, print it, or send it to landlords as you wish.</P>
          </Section>

          <Section title="11. Disclaimers and limitation of liability">
            <P style={{ textTransform: 'uppercase', fontSize: 13, lineHeight: 1.6 }}>The Service is provided "AS IS" and "AS AVAILABLE" without warranties of any kind, whether express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, accuracy, or non-infringement.</P>
            <P>To the maximum extent permitted by Ontario law, in no event will Rentletter be liable for:</P>
            <UL>
              <LI>Any indirect, incidental, consequential, special, or punitive damages.</LI>
              <LI>Lost profits, lost rental opportunities, lost data, or business interruption.</LI>
              <LI>Any decision a landlord makes (or does not make) based on a Rentletter application.</LI>
              <LI>Any decision a tenant makes about which landlord to apply to or which property to rent.</LI>
              <LI>Any inaccuracy or unexpected output of AI-generated content.</LI>
              <LI>Any damage caused by a third-party service we use (Stripe, Resend, Anthropic, Vercel, Upstash, Google).</LI>
            </UL>
            <P>Our total cumulative liability to you for all claims arising from your use of the Service is limited to the greater of: (a) the total amount you paid us in the 12 months before the claim arose, or (b) CAD $100.</P>
            <P>Some jurisdictions do not allow the exclusion of certain warranties or limitation of liability. In those cases, our liability is limited to the maximum extent permitted by law.</P>
          </Section>

          <Section title="12. Indemnification">
            <P>You agree to defend, indemnify, and hold harmless Rentletter, its operator, and its service providers from any claim, damage, loss, liability, or expense (including reasonable legal fees) arising from:</P>
            <UL>
              <LI>Your use of the Service.</LI>
              <LI>Your violation of these Terms.</LI>
              <LI>Your violation of any law or third party's rights, including any landlord-tenant or human-rights claim arising from how you used Rentletter or how you screened or were screened by another party.</LI>
              <LI>Information you submitted being false or misleading.</LI>
            </UL>
          </Section>

          <Section title="13. Termination">
            <P>You may stop using the Service at any time. Tenants can revoke their application via the "Manage your application" link in their confirmation email. Landlords can sign out and request workspace deletion via <A href="mailto:info@rentletter.ca">info@rentletter.ca</A>.</P>
            <P>We may suspend or terminate your access at any time, with or without notice, for any reason, including violation of these Terms.</P>
            <P>Sections that by their nature should survive termination — including liability, indemnification, intellectual property, and governing law — will survive.</P>
          </Section>

          <Section title="14. Governing law and disputes">
            <P>These Terms are governed by the laws of the Province of Ontario and the federal laws of Canada applicable in Ontario, without regard to conflict-of-law principles.</P>
            <P>Any dispute arising from these Terms or the Service will be resolved in the courts of Ontario, and you consent to the exclusive jurisdiction of those courts.</P>
            <P>You agree to first attempt to resolve any dispute by contacting us at <A href="mailto:info@rentletter.ca">info@rentletter.ca</A>. We will respond within a reasonable time and attempt to resolve the matter in good faith.</P>
          </Section>

          <Section title="15. Changes to these Terms">
            <P>We may modify these Terms at any time. Material changes will be announced at the top of this page and, for active users, by email. Continued use of the Service after changes are posted constitutes your acceptance of the new Terms. If you do not agree, stop using the Service.</P>
          </Section>

          <Section title="16. Severability">
            <P>If any provision of these Terms is found to be unenforceable, the remaining provisions will continue in full force and effect.</P>
          </Section>

          <Section title="17. Entire agreement">
            <P>These Terms, together with our Privacy Policy, constitute the entire agreement between you and Rentletter regarding the Service. They supersede any prior or contemporaneous agreements, communications, or representations.</P>
          </Section>

          <Section title="18. Contact">
            <P>Questions about these Terms:</P>
            <P style={{ marginLeft: 20, marginTop: 14 }}>
              <strong>Email:</strong> <A href="mailto:info@rentletter.ca">info@rentletter.ca</A>
            </P>
          </Section>

          <div style={{ marginTop: 60, paddingTop: 32, borderTop: `1px solid ${C.rule}`, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <Link href="/" style={FOOTLINK_STYLE}>← Back to home</Link>
            <Link href="/privacy" style={FOOTLINK_STYLE}>Privacy Policy</Link>
            <Link href="/faq" style={FOOTLINK_STYLE}>FAQ</Link>
          </div>
        </main>

        <ChatWidget />
      </div>
    </>
  );
}

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
