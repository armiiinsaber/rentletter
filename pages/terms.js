// /pages/terms.js
// Terms of Service — public, indexable. Content is rendered verbatim by LegalPage.
// Carries a "Draft — pending legal review" banner until counsel sign-off.
import LegalPage from '../components/LegalPage';

const CONTENT = `# Terms of Service
1001557180 Ontario Inc., operating as Rentletter
Effective date: ____________, 2026

These Terms of Service ("Terms") are a binding agreement between you and 1001557180 Ontario Inc., operating as Rentletter ("we," "us," "our," or "Rentletter"). They govern your access to and use of the rentletter.ca website and the Rentletter application (together, the "Service"). By creating an account or using the Service, you agree to these Terms. If you do not agree, do not use the Service.

## 1. The Service
Rentletter provides software that helps real estate professionals ("Realtors") collect standardized rental applications, organize and rank applicants against a landlord's stated criteria, verify applicant-provided documents, generate factual insights, and produce reports for landlord clients. Rentletter is a software tool that organizes and surfaces information. It is not a party to any tenancy, does not make rental decisions, and does not provide legal, financial, or professional advice.

## 2. Eligibility and accounts
- You must be at least the age of majority in your province and, where you use the Service as a real estate professional, hold any licences or registrations required for your work.
- You are responsible for the accuracy of your account information, for keeping your credentials secure, and for all activity under your account.
- You must notify us promptly of any unauthorized use of your account.

## 3. Realtor responsibilities and lawful use
As a Realtor using the Service, you agree that:
- **You make all decisions.** You (and/or your landlord client) are solely responsible for any decision to accept, decline, shortlist, or otherwise act on any applicant. Rentletter does not recommend that any applicant be accepted or rejected, and any ranking, insight, or report is a tool to assist your own independent judgment.
- **You will comply with human rights and housing law.** You will use the Service in compliance with all applicable laws, including the Ontario Human Rights Code, the human rights legislation of other provinces, and all applicable fair-housing, landlord-tenant, consumer-protection, and privacy laws. You will not use the Service to discriminate against any person on the basis of a protected ground.
- **You have the right to the information you provide.** You represent that you are permitted to collect and submit any applicant or third-party information you provide to the Service, and that you have provided any required notices and obtained any required consents.
- **You will use information appropriately.** You will use applicant information only for the legitimate purpose of assessing rental applications and will handle it in accordance with applicable privacy law.

## 4. Applicants
Individuals who submit rental application information ("Applicants") do so to have their application assessed by the relevant Realtor and landlord. Applicant information is handled in accordance with our Privacy Policy. Applicants are responsible for the accuracy of the information they provide.

## 5. AI features — no guarantee of accuracy
The Service uses automated and artificial-intelligence features to read documents, extract and compare information, and generate insights and report text. These features are provided to assist you and **may contain errors or omissions**. Rentletter does not warrant that any extracted data, verification result, ranking, or insight is accurate, complete, or current. You are responsible for independently verifying any information before relying on it or acting on it. Automated output is not a background check, credit check, or guarantee of an applicant's suitability, identity, income, or truthfulness.

## 6. Acceptable use
You agree not to:
- Use the Service in violation of any law or the rights of others;
- Upload information you are not authorized to provide, or that is unlawful, infringing, or harmful;
- Attempt to gain unauthorized access to the Service, other accounts, or our systems, or interfere with the Service's operation;
- Reverse engineer, resell, or misuse the Service except as permitted by these Terms or applicable law.

## 7. Fees
The Service may be offered free of charge during a launch or trial period. We may introduce fees for the Service or for certain features in the future. If we do, we will provide notice and the applicable pricing and payment terms before charging you, and your continued use after fees take effect will be subject to those terms.

## 8. Intellectual property
The Service, including its software, design, and content (excluding information you or Applicants provide), is owned by 1001557180 Ontario Inc. or its licensors and is protected by intellectual-property laws. We grant you a limited, non-exclusive, non-transferable, revocable licence to use the Service in accordance with these Terms. Branding assets you generate or upload remain yours; you grant us the licence needed to host and display them within the Service.

## 9. Disclaimers
The Service is provided on an "as is" and "as available" basis. To the fullest extent permitted by law, Rentletter disclaims all warranties, whether express, implied, statutory, or otherwise, including implied warranties of merchantability, fitness for a particular purpose, and non-infringement. We do not warrant that the Service will be uninterrupted, error-free, or secure, or that any output will be accurate or reliable. Nothing in these Terms excludes any warranty or condition that cannot be excluded under applicable law.

## 10. Limitation of liability
To the fullest extent permitted by applicable law, Rentletter, 1001557180 Ontario Inc., and its directors, officers, employees, and agents will not be liable for any indirect, incidental, special, consequential, exemplary, or punitive damages, or for any loss of profits, revenue, data, goodwill, or business, arising out of or related to your use of (or inability to use) the Service, even if advised of the possibility of such damages.

To the fullest extent permitted by applicable law, our total aggregate liability for all claims arising out of or related to the Service will not exceed the greater of (a) the amount you paid us for the Service in the twelve (12) months before the event giving rise to the claim, or (b) one hundred Canadian dollars (CAD $100). Some jurisdictions do not allow certain limitations, in which case the above applies to the maximum extent permitted.

## 11. Indemnification
You agree to indemnify and hold harmless 1001557180 Ontario Inc., operating as Rentletter, and its directors, officers, employees, and agents from and against any claims, damages, liabilities, losses, and expenses (including reasonable legal fees) arising out of or related to: (a) your use of the Service; (b) your decisions regarding any applicant or tenancy; (c) your violation of these Terms or of any applicable law, including human rights, fair-housing, landlord-tenant, or privacy law; or (d) information you provide to the Service that you were not authorized to provide.

## 12. Suspension and termination
You may stop using the Service and close your account at any time. We may suspend or terminate your access if you violate these Terms, if required by law, or if necessary to protect the Service or others. On termination, your right to use the Service ends. Provisions that by their nature should survive termination (including Sections 5, 9, 10, 11, and 13) will survive.

## 13. Governing law and disputes
These Terms are governed by the laws of the Province of Ontario and the federal laws of Canada applicable there, without regard to conflict-of-laws rules. The Service is intended for use across Canada, and you are responsible for complying with the laws applicable in your province. Subject to applicable law, you agree that the courts located in Ontario will have jurisdiction over any dispute arising out of or relating to these Terms or the Service, except where mandatory consumer-protection law in your province provides otherwise.

## 14. Changes to these Terms
We may update these Terms from time to time. When we make material changes, we will update the effective date and, where appropriate, provide additional notice. Your continued use of the Service after changes take effect constitutes acceptance of the updated Terms.

## 15. Contact
Questions about these Terms can be directed to:
**1001557180 Ontario Inc.**, operating as Rentletter
Email: info@rentletter.ca`;

export default function Terms() {
  return (
    <LegalPage
      content={CONTENT}
      metaTitle="Terms of Service — Rentletter"
      metaDescription="The terms that govern your use of Rentletter, operated by 1001557180 Ontario Inc."
    />
  );
}
