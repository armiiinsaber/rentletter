// /pages/compliance.js
// Public-facing compliance / HRTO documentation page.
// Designed to be sent to PMC legal teams to short-circuit early objections.

import Head from 'next/head';
import Link from 'next/link';
import { C, R } from '../components/theme';
import { GlobalStyle, Wordmark, ScrollHeader } from '../components/ui';

export default function CompliancePage() {
  return (
    <>
      <Head>
        <title>Compliance & Fair Housing — Rentletter</title>
        <meta name="description" content="How Rentletter helps Canadian property managers meet HRTO and provincial human rights obligations during tenant screening." />
      </Head>
      <GlobalStyle />

      <div style={{ minHeight: '100vh', background: C.paper, color: C.ink }}>

        {/* TOP NAV */}
        <ScrollHeader maxWidth={1100}>
          <Link href="/" style={{ textDecoration: 'none', display: 'inline-flex' }}><Wordmark /></Link>
          <div style={{ display: 'flex', gap: 'clamp(16px, 2vw, 24px)', alignItems: 'center', fontSize: 13.5 }}>
            <Link href="/landlord" style={{ color: C.inkSoft, textDecoration: 'none', fontWeight: 500 }}>Dashboard</Link>
            <Link href="/privacy" style={{ color: C.inkSoft, textDecoration: 'none', fontWeight: 500 }}>Privacy</Link>
          </div>
        </ScrollHeader>

        {/* HERO */}
        <section style={{ padding: 'clamp(48px, 8vw, 90px) 0 clamp(36px, 6vw, 60px)', borderBottom: `1px solid ${C.rule}` }}>
          <div style={{ maxWidth: 820, margin: '0 auto', padding: '0 clamp(20px, 4vw, 32px)' }}>
            <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 16 }}>
              Compliance overview · for property managers & legal teams
            </div>
            <h1 className="rl-serif" style={{ fontSize: 'clamp(34px, 5.5vw, 52px)', letterSpacing: '-0.025em', lineHeight: 1.04, marginBottom: 20 }}>
              Built to help Canadian landlords and property managers screen tenants defensibly.
            </h1>
            <p style={{ fontSize: 'clamp(15px, 2vw, 18px)', color: C.inkSoft, lineHeight: 1.65 }}>
              Rentletter is designed to support fair housing obligations under the Ontario Human Rights Code (and equivalent provincial human rights legislation across Canada). This page explains the safeguards built into the product so legal and compliance teams can evaluate it quickly.
            </p>
          </div>
        </section>

        {/* MAIN CONTENT */}
        <main style={{ maxWidth: 820, margin: '0 auto', padding: 'clamp(36px, 6vw, 56px) clamp(20px, 4vw, 32px) 80px' }}>

          <Section title="What Rentletter is">
            <p>Rentletter is a standardized rental application and screening platform. Prospective tenants submit a structured application that includes employment, income, household composition, rental history, and references. Landlords and property managers receive these applications via a dashboard where they can review, compare, shortlist, and document decisions.</p>
            <p>Rentletter does not perform credit checks, criminal record checks, or background verification. It is a structured intake and decision-documentation layer that complements (rather than replaces) traditional verification services.</p>
          </Section>

          <Section title="Protected grounds under the Ontario Human Rights Code">
            <p>The Ontario Human Rights Code prohibits discrimination in rental housing on the basis of race, ancestry, place of origin, colour, ethnic origin, citizenship, creed, sex, sexual orientation, gender identity, gender expression, age, marital status, family status, disability, and receipt of public assistance.</p>
            <p>Equivalent grounds exist in the human rights legislation of every other Canadian province and territory.</p>
          </Section>

          <Section title="How Rentletter helps">
            <SubSection title="1. Standardized intake reduces inconsistent questioning">
              Every applicant submits the same structured fields. The application form does not request information about protected characteristics such as religion, ethnic origin, citizenship status, family planning, disability, or receipt of public assistance. By collecting only objective, non-protected information, Rentletter helps reduce the risk that screening decisions are influenced by protected grounds, whether intentionally or implicitly.
            </SubSection>

            <SubSection title="2. AI-drafted rationale focuses on legitimate factors">
              When a landlord uses the optional AI rationale feature, the system is instructed to base reasoning only on legitimate, non-discriminatory factors: income-to-rent ratio, employment stability, rental history, references, and stated move-in alignment. The system is prompted to avoid any reference to protected characteristics. Output is editable by the user before being saved.
            </SubSection>

            <SubSection title="3. Documented decision trail">
              Every accept, reject, or shortlist action is timestamped and saved with the user account that took the action. Optional written reasons can be attached to each decision. This produces a contemporaneous record that demonstrates the basis for screening decisions — useful in the event of a Human Rights Tribunal of Ontario (HRTO) complaint or equivalent provincial proceeding.
            </SubSection>

            <SubSection title="4. Consistent treatment across applicants">
              Because all applicants flow through the same dashboard with the same fields and same scoring approach, Rentletter makes it easier to demonstrate that comparable applicants were treated comparably. The platform retains records of which applicants were reviewed for which listing, in what order, and how each was categorized.
            </SubSection>

            <SubSection title="5. Tenant transparency and data rights">
              Each tenant who submits an application receives a unique application number and an owner token that lets them view their submission, see which landlords have viewed it, and revoke access at any time. This supports tenant consent and Personal Information Protection and Electronic Documents Act (PIPEDA) compliance.
            </SubSection>
          </Section>

          <Section title="What Rentletter does NOT do">
            <ul style={ul}>
              <li style={li}>It does not make screening decisions on the user's behalf. All accept/reject/shortlist actions are taken by the user.</li>
              <li style={li}>It does not provide legal advice. The platform supports the user's decision-making but does not warrant compliance with any specific human rights legislation.</li>
              <li style={li}>It does not run credit checks, criminal record checks, or third-party verification services.</li>
              <li style={li}>It does not assess or score applicants based on protected characteristics.</li>
            </ul>
          </Section>

          <Section title="Data handling">
            <p>Applicant data is stored on Canadian infrastructure via Vercel (with Upstash Redis as the data layer). Data is encrypted in transit and at rest. Applicants can revoke access to their application at any time, which removes the data from active landlord dashboards. Full details are in the <Link href="/privacy" style={{ color: C.red, textDecoration: 'underline' }}>Privacy Policy</Link>.</p>
            <p>Rentletter is governed by Canadian privacy law (PIPEDA) and, where applicable, provincial privacy statutes.</p>
          </Section>

          <Section title="For institutional buyers — what we can provide">
            <p>If you are a property management company, build-to-rent operator, student housing operator, or other institutional user evaluating Rentletter, we can provide on request:</p>
            <ul style={ul}>
              <li style={li}>A data processing agreement (DPA) suitable for institutional data handling requirements</li>
              <li style={li}>A security overview describing infrastructure, encryption, access controls, and breach notification</li>
              <li style={li}>A custom audit log export tailored to your retention and reporting needs</li>
              <li style={li}>A pilot deployment with a sandboxed environment scoped to a subset of your portfolio</li>
              <li style={li}>White-label branding so deliverables to your owners or stakeholders carry your brand</li>
            </ul>
            <p style={{ marginTop: 16 }}>Contact <a href="mailto:info@rentletter.ca" style={{ color: C.red, textDecoration: 'underline' }}>info@rentletter.ca</a> for institutional evaluations.</p>
          </Section>

          <Section title="Not legal advice">
            <p style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.65 }}>
              This page describes design choices Rentletter has made to support its users in meeting their fair housing obligations. It is not legal advice. Landlords, property managers, and realtors remain solely responsible for ensuring their screening practices comply with applicable human rights and privacy legislation. We recommend reviewing any screening process with qualified Canadian counsel before deploying it across a portfolio.
            </p>
          </Section>

          <div style={{ marginTop: 40, paddingTop: 20, borderTop: `1px solid ${C.rule}`, fontSize: 12, color: C.inkMute }}>
            Last updated: May 2026 · For institutional inquiries: <a href="mailto:info@rentletter.ca" style={{ color: C.inkSoft, textDecoration: 'underline' }}>info@rentletter.ca</a>
          </div>
        </main>
      </div>
    </>
  );
}

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <h2 style={{ fontSize: 'clamp(20px, 3vw, 24px)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 14, color: C.ink }}>
        {title}
      </h2>
      <div style={{ fontSize: 15, color: C.inkSoft, lineHeight: 1.7 }}>
        {children}
      </div>
    </section>
  );
}

function SubSection({ title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 8 }}>
        {title}
      </h3>
      <p style={{ fontSize: 15, color: C.inkSoft, lineHeight: 1.7, margin: 0 }}>
        {children}
      </p>
    </div>
  );
}

const ul = { paddingLeft: 22, margin: '12px 0', listStyle: 'disc' };
const li = { fontSize: 15, color: C.inkSoft, lineHeight: 1.7, marginBottom: 8 };
