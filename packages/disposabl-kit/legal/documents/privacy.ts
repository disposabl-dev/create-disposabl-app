import { legalConfig as c } from "../config";
import type { LegalDocument } from "../types";

export const privacy: LegalDocument = {
  slug: "privacy",
  title: "Privacy policy",
  description: `How ${c.appName} handles personal information and how to exercise your rights.`,
  sections: [
    {
      title: "Who is responsible",
      paragraphs: [
        `${c.operatorName || "[Operator name required]"} operates ${c.appName} and is responsible for the personal information described here. Address: ${c.operatorAddress || "[Operator address required]"}. Country: ${c.country || "[Country required]"}.`,
        `For privacy questions or requests, contact ${c.privacyEmail || "[Privacy contact required]"}. This policy covers our website and mobile app. Third-party services you visit have their own policies.`,
      ],
    },
    {
      title: "Information we handle and why",
      paragraphs: [
        "When you use account features, we handle account identifiers and the profile information supplied through sign-in to authenticate you and provide access to your account. We handle content you submit to provide the features you request.",
        "Our infrastructure processes technical information needed to deliver requests, protect the service, and investigate faults. Avoid sending information we do not need.",
        "The legal basis for providing requested account and service features is performance of our contract with you. Security and abuse prevention rely on our legitimate interest in protecting the service, balanced against your rights. We also process information where required by law. Where we rely on consent, you may withdraw it without affecting earlier lawful processing.",
      ],
    },
    {
      title: "Service providers and disclosures",
      paragraphs: [
        "We use service providers to operate the service. They receive information needed for their role, subject to the applicable agreements and legal obligations.",
        ...c.providers.map((p) => `${p.name}: ${p.purpose}.`),
        "We may disclose information where required by law, to protect legal rights or safety, or as part of a business transfer subject to applicable protections and notices.",
      ],
    },
    {
      title: "International transfers",
      paragraphs: [
        c.internationalTransfers ||
          "[Before publication, identify processing locations and the lawful safeguards for international transfers, including how to obtain a copy where applicable.]",
      ],
    },
    {
      title: "Retention and security",
      paragraphs: [
        c.retention ||
          "[Before publication, specify retention periods or meaningful criteria for account data, content, requests, technical logs, and backups, including applicable legal exceptions.]",
        "Access controls and technical safeguards help protect personal information. No service can guarantee absolute security. Contact us if you believe your account or information has been compromised.",
      ],
    },
    {
      title: "Your privacy rights",
      paragraphs: [
        "Depending on the laws that apply, you may request access to your personal information, correction, erasure, restriction of processing, or a portable copy. You may object to processing based on legitimate interests and withdraw consent where processing relies on it. These rights can have legal exceptions.",
        "Use the privacy request page to contact us. We may need proportionate information to verify your identity. Under the GDPR, we respond without undue delay and normally within one month. If a permitted extension is needed, we explain the reasons within that first month. You may complain to your competent data protection authority, including where you live or work in the EEA.",
        "Account deletion can be requested through the privacy contact on the account-deletion page. Submitting a request does not mean deletion is complete. Some records may need to be retained for an identified legal reason; we explain any applicable exceptions when handling your request.",
      ],
    },
    {
      title: "Audience",
      paragraphs: [
        c.audience ||
          "[Before publication, specify the intended audience and age eligibility. Apps used by children need an appropriate data and consent design.]",
      ],
    },
    {
      title: "Changes and contact",
      paragraphs: [
        "We update this policy when our practices change and publish the effective date here. Where required, we provide additional notice or obtain consent before a change takes effect. Use the privacy contact above for questions.",
      ],
    },
  ],
};
