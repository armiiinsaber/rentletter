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
- **Realtors** (our customers), real estate professionals who hold accounts and use the Service to manage rental applications.
- **Applicants (tenants)**, individuals who submit rental application information through a realtor's invitation link.
- **Landlords**, property owners or their representatives who receive screening reports from a realtor.

## 2. Information we collect
**2.1 Realtor account information.** When a realtor creates an account, we collect their name, email address, password (stored in hashed form), brokerage name, phone number, and professional licence number, along with branding preferences (such as a logo, brand colours, and fonts) used to personalize reports.

**2.2 Applicant (tenant) information.** When an applicant completes a rental application, we collect the information they provide, which may include: name, contact details, current address, employment details and income, household composition and household income, rental history, references, requested move-in date, and similar information relevant to assessing a rental application. Applicants provide this information directly.

**2.3 Documents: held for the realtor's review, then deleted.** A realtor may upload supporting documents an applicant has provided (such as a pay stub, employment letter, or identification), or an applicant may upload them through a secure link, so that the Service can read the information and compare it with the application. The file is analyzed to extract relevant, factual information (for example, stated income and employer name). **The original is then held in private storage for 14 days, or until the realtor deletes it, whichever comes first.** During that time only the realtor handling the listing can view it, through a short lived link that expires within one minute, and every view and deletion is logged. Documents are never written to logs, never shared with landlords or other realtors, and are removed from storage when they expire or are deleted. The extracted factual results and comparison outcomes are retained separately.

**Documents a tenant keeps in their own profile.** A tenant who is signed in to their profile may add their own documents to it (identification, a pay stub or other proof of income, an employment letter), after agreeing to this on the profile page. Each file is read once to extract relevant, factual information, and the file is then kept in private storage as part of that tenant's profile: **identification for 14 days, and other documents for 90 days**. The tenant can renew a document other than identification for a further 90 days from the profile page, and can delete any document at any time from the same page, which removes the file immediately. The facts read from a document (for example, that the name on the identification matches, the income before tax, the employer and the start date) are kept with the profile until the tenant removes them, or until the profile has not been signed in to for twelve (12) months, when the stored documents and those facts are deleted. A credit report is never kept in a profile. **No realtor or landlord can view a document or a fact in a tenant's profile unless the tenant approves it.**

When you apply to a listing with your profile, you approve sharing it with that listing's realtor. You can also share your profile with the listing agent. It's always your choice, and you can stop sharing at any time. They can see the facts in your profile and, for 14 days, open your income and employment documents. They never see your ID image. Every view and every document opened shows in your profile, and you can stop sharing at any time.

**What you choose to add about yourself.** A tenant may add a photo of themselves, a few words about themselves and an offer to prepay rent. Each is optional and the tenant's own choice, and each can be changed or deleted at any time from the profile page; deleting the photo removes the file. A realtor sees them only through a share the tenant approved. The words and the offer may appear in the report that realtor sends a landlord, unless the tenant turns that off; the photo is never in a report. If a realtor has already sent a report to a landlord, stopping sharing does not take back that report. None of them is used to score, rank or screen anyone, and nothing reads the photo. If a tenant asks for help with the wording, the text they typed is sent to our AI provider to suggest a rewording, and nothing changes unless the tenant accepts it.

**2.4 Information we collect automatically.** Like most online services, we and our service providers may collect limited technical information such as IP address, browser type, device information, and usage activity, to operate, secure, and improve the Service.

We set one cookie that remembers how you first found Rentletter, such as a referral link. It holds a single word and never your name, email or anything you type.

## 3. How we use personal information
We use personal information to:
- Provide and operate the Service · receiving applications, organizing and ranking them against a landlord's stated criteria, reading the documents an applicant provides and comparing them with the application, generating insights, and producing reports for landlords.
- Create and manage realtor accounts and apply realtor branding to reports.
- Communicate with users, including transactional emails (such as account confirmation and report delivery).
- Maintain the security, integrity, and proper functioning of the Service.
- Comply with legal obligations.

**Rentletter assesses applicants only on the basis of factual, screenable criteria** relevant to tenancy (such as income, rent to income ratio, employment, rental tenure, and references). The Service is designed not to assess or surface characteristics protected under human rights legislation. Final decisions about any applicant are made by the realtor and/or landlord, not by Rentletter.

## 4. Consent
We collect, use, and disclose personal information with consent, except where otherwise permitted or required by law. Applicants provide their information directly when applying and consent to its use for the purpose of having their rental application assessed and shared with the relevant realtor and landlord. Realtors are responsible for ensuring they have an appropriate basis to collect and submit any information they provide to the Service. You may withdraw consent as described in Section 9, subject to legal and contractual limits.

## 5. Who we share information with
We do not sell personal information. We share it only as needed to operate the Service:
- **With landlords:** a realtor uses the Service to share screening reports about applicants with the landlord client for the listing the applicant applied to.
- **A realtor you choose.** When you apply with your profile, the realtor for that listing can read it as described in Section 2.3, until you stop sharing or the application closes.
- **With service providers (processors)** who help us run the Service, described in Section 6.
- **For legal reasons:** where required by law, regulation, legal process, or to protect the rights, safety, and property of Rentletter, our users, or others.
- **In a business transaction:** if we are involved in a merger, acquisition, financing, or sale of assets, personal information may be transferred as part of that transaction, subject to appropriate protections.

## 6. Service providers and cross-border processing
We use trusted third-party providers to deliver the Service. Some of these providers process data outside Canada (including in the United States). Where information is processed outside Canada, it may be subject to the laws of that jurisdiction, including lawful access by courts and government authorities. Our current key providers are:
- **Supabase** · database, authentication, and storage hosting. Our primary application data is hosted in a **Canadian region**.
- **Anthropic** · artificial-intelligence processing used to read uploaded documents and produce report text. This processing occurs in the **United States**. Documents are processed transiently by this provider; how long we hold them is set out in Sections 2.3 and 7.
- **Resend**, transactional email delivery (for example, account confirmation and report emails). This provider operates in the **United States**.
- **Vercel**, application hosting and delivery.

We enter into agreements with our providers requiring them to protect personal information and to use it only to provide services to us. The list of providers may change as the Service evolves; we will update this policy accordingly.

## 7. How long we keep information (retention)
We keep personal information only as long as necessary for the purposes described in this policy, after which we delete or anonymize it:
- **Applicant application data:** retained while the related listing is active and for up to **twelve (12) months** after the last activity on that application, after which it is deleted or anonymized, unless a longer period is required by law or to resolve a dispute.
- **Documents uploaded for a realtor's review:** held for up to **fourteen (14) days** after upload, or until the realtor deletes them, whichever comes first (see Section 2.3). Extracted factual results are retained subject to the same retention period as the related application.
- **Documents in a tenant's own profile:** identification is held for **fourteen (14) days** after upload, and other documents for **ninety (90) days**, renewable by the tenant, or until the tenant deletes them, whichever comes first. Facts read from them are kept until the tenant removes them or the profile has not been signed in to for **twelve (12) months** (see Section 2.3).
- **Realtor account data:** retained while the account is active and for a reasonable period after account closure to meet legal, tax, and record-keeping obligations, then deleted or anonymized.

Applicants and realtors may request earlier deletion as described in Section 9.

## 8. How we protect information
We use administrative, technical, and physical safeguards appropriate to the sensitivity of the information, including encryption in transit, access controls, hosting with reputable providers, and the practice of holding source documents only for the limited periods set out in Section 7. No method of transmission or storage is completely secure, but we work to protect personal information and to address security risks responsibly. If we become aware of a privacy breach that creates a real risk of significant harm, we will respond in accordance with our obligations under applicable law, including notification where required.

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
      metaTitle="Privacy Policy · Rentletter"
      metaDescription="How Rentletter collects, uses, and protects personal information under PIPEDA and Canadian privacy law."
    />
  );
}
