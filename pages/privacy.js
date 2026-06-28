// /pages/privacy.js
// Privacy Policy — public, indexable. Content is rendered verbatim by LegalPage.
// Carries a "Draft — pending legal review" banner until counsel sign-off.
import LegalPage from '../components/LegalPage';

const CONTENT = `# Privacy Policy
1001557180 Ontario Inc., operating as Rentletter
Effective date: ____________, 2026

1001557180 Ontario Inc., operating as Rentletter ("we," "us," "our," or "Rentletter"), provides software that helps real estate professionals collect, organize, and assess residential rental applications. This Privacy Policy explains what personal information we collect, how we use and protect it, who we share it with, and the rights available to you under the Personal Information Protection and Electronic Documents Act (PIPEDA) and applicable provincial privacy laws across Canada.

We are committed to handling personal information responsibly and collecting only what we need. This policy applies to our website at rentletter.ca and the Rentletter application (the "Service").

## 1. Who this policy covers
The Service is used by three types of people, and this policy applies to all of them:
- **Realtors** (our customers) — real estate professionals who hold accounts and use the Service to manage rental applications.
- **Applicants (tenants)** — individuals who submit rental application information through a realtor's invitation link.
- **Landlords** — property owners or their representatives who receive screening reports from a realtor.

## 2. Information we collect
**2.1 Realtor account information.** When a realtor creates an account, we collect their name, email address, password (stored in hashed form), brokerage name, phone number, and professional licence number, along with branding preferences (such as a logo, brand colours, and fonts) used to personalize reports.

**2.2 Applicant (tenant) information.** When an applicant completes a rental application, we collect the information they provide, which may include: name, contact details, current address, employment details and income, household composition and household income, rental history, references, requested move-in date, and similar information relevant to assessing a rental application. Applicants provide this information directly.

**2.3 Documents — processed and not stored.** A realtor may upload supporting documents an applicant has provided (such as a pay stub, employment letter, or identification) so that the Service can read and verify the information against the application. **We do not store these documents.** The uploaded files are processed in memory to extract relevant, factual information (for example, stated income and employer name), and the file itself is then discarded — it is not written to our database, file storage, or logs. Only the extracted factual results and verification outcomes are retained.

**2.4 Information we collect automatically.** Like most online services, we and our service providers may collect limited technical information such as IP address, browser type, device information, and usage activity, to operate, secure, and improve the Service.

## 3. How we use personal information
We use personal information to:
- Provide and operate the Service — receiving applications, organizing and ranking them against a landlord's stated criteria, verifying applicant-provided documents, generating insights, and producing reports for landlords.
- Create and manage realtor accounts and apply realtor branding to reports.
- Communicate with users, including transactional emails (such as account confirmation and report delivery).
- Maintain the security, integrity, and proper functioning of the Service.
- Comply with legal obligations.

**Rentletter assesses applicants only on the basis of factual, screenable criteria** relevant to tenancy (such as income, rent-to-income ratio, employment, rental tenure, and references). The Service is designed not to assess or surface characteristics protected under human rights legislation. Final decisions about any applicant are made by the realtor and/or landlord, not by Rentletter.

## 4. Consent
We collect, use, and disclose personal information with consent, except where otherwise permitted or required by law. Applicants provide their information directly when applying and consent to its use for the purpose of having their rental application assessed and shared with the relevant realtor and landlord. Realtors are responsible for ensuring they have an appropriate basis to collect and submit any information they provide to the Service. You may withdraw consent as described in Section 9, subject to legal and contractual limits.

## 5. Who we share information with
We do not sell personal information. We share it only as needed to operate the Service:
- **With landlords:** a realtor uses the Service to share screening reports about applicants with the landlord client for the listing the applicant applied to.
- **With service providers (processors)** who help us run the Service, described in Section 6.
- **For legal reasons:** where required by law, regulation, legal process, or to protect the rights, safety, and property of Rentletter, our users, or others.
- **In a business transaction:** if we are involved in a merger, acquisition, financing, or sale of assets, personal information may be transferred as part of that transaction, subject to appropriate protections.

## 6. Service providers and cross-border processing
We use trusted third-party providers to deliver the Service. Some of these providers process data outside Canada (including in the United States). Where information is processed outside Canada, it may be subject to the laws of that jurisdiction, including lawful access by courts and government authorities. Our current key providers are:
- **Supabase** — database, authentication, and storage hosting. Our primary application data is hosted in a **Canadian region**.
- **Anthropic** — artificial-intelligence processing used to read uploaded documents, generate applicant insights, and produce report text. This processing occurs in the **United States**. Documents are processed transiently and are not retained by us (see Section 2.3).
- **Resend** — transactional email delivery (for example, account confirmation and report emails). This provider operates in the **United States**.
- **Vercel** — application hosting and delivery.

We enter into agreements with our providers requiring them to protect personal information and to use it only to provide services to us. The list of providers may change as the Service evolves; we will update this policy accordingly.

## 7. How long we keep information (retention)
We keep personal information only as long as necessary for the purposes described in this policy, after which we delete or anonymize it:
- **Applicant application data:** retained while the related listing is active and for up to **twelve (12) months** after the last activity on that application, after which it is deleted or anonymized, unless a longer period is required by law or to resolve a dispute.
- **Uploaded documents:** not stored (processed and discarded; see Section 2.3). Only extracted factual results are retained, subject to the same retention period as the related application.
- **Realtor account data:** retained while the account is active and for a reasonable period after account closure to meet legal, tax, and record-keeping obligations, then deleted or anonymized.

Applicants and realtors may request earlier deletion as described in Section 9.

## 8. How we protect information
We use administrative, technical, and physical safeguards appropriate to the sensitivity of the information, including encryption in transit, access controls, hosting with reputable providers, and the practice of not storing sensitive source documents. No method of transmission or storage is completely secure, but we work to protect personal information and to address security risks responsibly. If we become aware of a privacy breach that creates a real risk of significant harm, we will respond in accordance with our obligations under applicable law, including notification where required.

## 9. Your privacy rights
Subject to applicable law, you have the right to:
- **Access** the personal information we hold about you and request information about how it has been used and disclosed.
- **Correct** information that is inaccurate or incomplete.
- **Withdraw consent** or request **deletion** of your information, subject to legal and contractual limits.

To exercise these rights, contact us at info@rentletter.ca. We may need to verify your identity before responding. We will respond within the timeframes required by applicable law. If an applicant submitted information through a realtor, we may direct certain requests to, or coordinate with, that realtor, who also has responsibilities for the information they collect.

## 10. Children
The Service is intended for use by real estate professionals and adult rental applicants. It is not directed to children, and we do not knowingly collect personal information from children.

## 11. Changes to this policy
We may update this Privacy Policy from time to time. When we make material changes, we will update the effective date above and, where appropriate, provide additional notice. Continued use of the Service after changes take effect constitutes acceptance of the updated policy.

## 12. Contact us and complaints
If you have questions, requests, or concerns about this policy or our handling of personal information, contact:
**1001557180 Ontario Inc.**, operating as Rentletter
Email: info@rentletter.ca
Province of incorporation: Ontario, Canada

If you are not satisfied with our response, you have the right to contact the Office of the Privacy Commissioner of Canada, or the privacy regulator in your province, to make a complaint.`;

export default function PrivacyPolicy() {
  return (
    <LegalPage
      content={CONTENT}
      metaTitle="Privacy Policy — Rentletter"
      metaDescription="How Rentletter collects, uses, and protects personal information under PIPEDA and Canadian privacy law."
    />
  );
}
