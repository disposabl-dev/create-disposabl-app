import { legalConfig as c } from "../config";
import type { LegalDocument } from "../types";

export const terms: LegalDocument = {
  slug: "terms",
  title: "Terms of service",
  description: `The terms for using ${c.appName} on the web and mobile.`,
  sections: [
    {
      title: "About these terms",
      paragraphs: [
        `These terms govern use of ${c.appName}, provided by ${c.operatorName || "[Operator name required]"}, ${c.operatorAddress || "[Operator address required]"}. Contact: ${c.privacyEmail || "[Contact required]"}.`,
        "By using the service, you agree to these terms. If you act for an organisation, you must have authority to bind it. Mandatory consumer rights remain unaffected by these terms.",
      ],
    },
    {
      title: "Eligibility and your account",
      paragraphs: [
        c.audience ||
          "[Before publication, specify age eligibility and the intended audience.]",
        "Provide accurate account information, keep your sign-in credentials secure, and tell us promptly about unauthorised use. You are responsible for activity you authorise through your account.",
      ],
    },
    {
      title: "Acceptable use",
      paragraphs: [
        "Use the service lawfully. Do not infringe others' rights, submit unlawful content, distribute malware, attempt unauthorised access, harass others, or disrupt the service. Do not evade security controls or abuse service resources.",
      ],
    },
    {
      title: "Your content",
      paragraphs: [
        "You retain your rights in content you submit. You give us permission to host, process, and display that content only as needed to provide and maintain the service you request. You must have the rights and permissions needed to submit it.",
        "Our software, branding, and other materials remain subject to their applicable ownership and licences. These terms do not replace a separate open-source licence that applies to code.",
      ],
    },
    {
      title: "Third-party services and purchases",
      paragraphs: [
        "Third-party services linked from or used with the service may have separate terms. Any paid offer must disclose its price, renewal, cancellation, and refund terms before purchase. Your store's applicable purchase rules and mandatory consumer protections continue to apply.",
        "Deleting an app or requesting account deletion does not itself cancel a subscription managed by an app store. You can manage those subscriptions through the store where you purchased them.",
      ],
    },
    {
      title: "Availability and responsibility",
      paragraphs: [
        "We work to keep the service available but cannot promise uninterrupted or error-free operation. Features may change. Keep a copy of information you need independently of the service.",
        "To the extent permitted by applicable law, the service is provided as available without additional implied warranties. Nothing excludes liability or remedies that cannot lawfully be excluded, including applicable consumer guarantees or liability for fraud.",
      ],
    },
    {
      title: "Ending use",
      paragraphs: [
        "You may stop using the service and request account deletion at any time. We may restrict access where reasonably necessary to address a breach, protect the service, or comply with law. Where appropriate and lawful, we provide notice and a way to raise a concern.",
        "Our privacy policy and deletion page explain how personal information is handled after a deletion request and any permitted retention.",
      ],
    },
    {
      title: "Changes and disputes",
      paragraphs: [
        "We publish updated terms with their effective date and provide additional notice where required. Material changes apply prospectively in accordance with applicable law.",
        `Contact us first at ${c.privacyEmail || "[Contact required]"} so we can try to resolve a concern. Applicable law determines your rights and the competent courts; these terms do not waive mandatory protections in your country of residence.`,
      ],
    },
  ],
};
