export type LegalDocument = {
  slug: string;
  title: string;
  description: string;
  sections: { title: string; paragraphs: string[] }[];
};
