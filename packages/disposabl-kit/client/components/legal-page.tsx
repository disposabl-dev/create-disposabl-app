import { legalConfig, legalDocuments, legalIsDraft } from "../../legal";
import type { ReactNode } from "react";

export function legalHead(slug?: string) {
  const document = legalDocuments.find((item) => item.slug === slug);
  return {
    meta: [
      {
        title: `${document?.title ?? "Legal & privacy"} | ${legalConfig.appName}`,
      },
      {
        name: "description",
        content:
          document?.description ??
          `Legal documents for ${legalConfig.appName}.`,
      },
    ],
  };
}

export function LegalPage({
  slug,
  children,
}: {
  slug?: string;
  children?: ReactNode;
}) {
  const document = legalDocuments.find((item) => item.slug === slug);
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <a
        href={slug ? "/legal" : "/"}
        className="text-sm underline underline-offset-4"
      >
        {slug ? "All legal documents" : "Back to home"}
      </a>
      <h1 className="mt-6 text-4xl font-semibold tracking-tight">
        {document?.title ?? "Legal & privacy"}
      </h1>
      <p className="mt-4 text-muted-foreground">
        {document?.description ??
          `Documents and privacy contacts for ${legalConfig.appName}.`}
      </p>
      {legalIsDraft() && (
        <p
          role="note"
          className="mt-6 rounded-lg border bg-muted p-4 text-sm leading-6"
        >
          Draft documents. Publisher details and data practices are still being
          reviewed. These documents are not yet final.
        </p>
      )}
      {legalConfig.effectiveDate && (
        <p className="mt-4 text-sm">Effective {legalConfig.effectiveDate}</p>
      )}
      {document ? (
        <div className="mt-10 space-y-9">
          {document.sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-semibold">{section.title}</h2>
              <div className="mt-3 space-y-3 leading-7 text-muted-foreground">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <nav aria-label="Legal documents" className="mt-10 grid gap-4">
          {legalDocuments.map((item) => (
            <a
              href={`/legal/${item.slug}`}
              key={item.slug}
              className="rounded-lg border p-5 hover:bg-muted"
            >
              <h2 className="font-semibold">{item.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {item.description}
              </p>
            </a>
          ))}
        </nav>
      )}
      {children}
      {(slug === "privacy-request" || slug === "delete-account") && (
        <section className="mt-9">
          <h2 className="text-xl font-semibold">Privacy contact</h2>
          {legalConfig.privacyEmail ? (
            <a
              className="mt-3 inline-block underline"
              href={`mailto:${legalConfig.privacyEmail}`}
            >
              {legalConfig.privacyEmail}
            </a>
          ) : (
            <p className="mt-3 text-muted-foreground">
              The publisher has not provided a privacy contact yet.
            </p>
          )}
        </section>
      )}
    </main>
  );
}

export function LegalFooter() {
  return (
    <footer
      className="mx-auto flex max-w-5xl flex-wrap justify-center gap-x-6 gap-y-2 px-6 py-8 text-xs text-muted-foreground"
      aria-label="Legal"
    >
      <a href="/legal/privacy" className="hover:underline">
        Privacy
      </a>
      <a href="/legal/terms" className="hover:underline">
        Terms
      </a>
      <a href="/legal" className="hover:underline">
        Legal & privacy
      </a>
      <a href="/support" className="hover:underline">
        Support
      </a>
    </footer>
  );
}
