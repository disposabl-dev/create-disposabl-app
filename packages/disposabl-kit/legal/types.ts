export type LegalDocument = {
  slug: string;
  title: string;
  description: string;
  sections: { title: string; paragraphs: string[] }[];
};

export type Publisher = {
  operatorName: string;
  operatorAddress: string;
  country: string;
  privacyEmail: string;
  providers: { name: string; purpose: string }[];
  policy?: {
    reviewed?: boolean;
    effectiveDate?: string;
    dataNotice?: string;
    retention?: string;
    internationalTransfers?: string;
    audience?: string;
    aiNotice?: string;
    deletionInstructions?: string[];
  };
};
