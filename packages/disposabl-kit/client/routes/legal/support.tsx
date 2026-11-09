import { createFileRoute } from "@tanstack/react-router";
import { legalConfig } from "../../../legal";

export const Route = createFileRoute("/_providers/support")({
  head: () => ({ meta: [{ title: `Support | ${legalConfig.appName}` }] }),
  component: Support,
});

function Support() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-4xl font-semibold">Support</h1>
      {legalConfig.privacyEmail ? (
        <p className="mt-6">
          Contact{" "}
          <a className="underline" href={`mailto:${legalConfig.privacyEmail}`}>
            {legalConfig.privacyEmail}
          </a>{" "}
          for help.
        </p>
      ) : (
        <p className="mt-6">
          The publisher has not provided a support contact yet.
        </p>
      )}
      <p className="mt-4">
        <a className="underline" href="/legal">
          Legal and privacy information
        </a>
      </p>
    </main>
  );
}
