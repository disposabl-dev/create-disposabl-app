import { createFileRoute } from "@tanstack/react-router";
import {
  starterFeatures,
  starterPlatforms,
} from "../../../../packages/disposabl-kit/lib/starter";
import { docsEnabled } from "../../../../packages/disposabl-kit/features";

export const Route = createFileRoute("/_providers/")({ component: Welcome });

function Welcome() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12 sm:py-20">
      <section className="grid gap-10 rounded-3xl bg-neutral-950 p-8 text-white sm:grid-cols-[1.4fr_1fr] sm:p-12">
        <div>
          <p className="mb-6 text-sm text-neutral-400">
            Your starting point is live
          </p>
          <h1 className="max-w-lg text-4xl font-semibold tracking-tight sm:text-6xl">
            Make something
            <br />
            worth opening.
          </h1>
          <p className="mt-6 max-w-md text-lg text-neutral-300">
            Your workspace is ready. Build on this foundation while your app
            takes shape.
          </p>
          {docsEnabled && (
            <a
              className="mt-8 inline-flex rounded-full bg-white px-6 py-3 font-medium text-neutral-950"
              href="/docs/getting-started"
            >
              Explore your starter{" "}
              <span aria-hidden="true" className="ml-5">
                ↗
              </span>
            </a>
          )}
        </div>
        <div
          aria-hidden="true"
          className="relative flex min-h-56 items-center justify-center overflow-hidden rounded-2xl bg-neutral-800"
        >
          <div className="absolute h-52 w-52 rounded-full border border-white/15" />
          <div className="absolute h-36 w-36 rotate-12 rounded-3xl border border-white/30 bg-white/5" />
          <div className="z-10 grid h-20 w-20 place-items-center rounded-2xl bg-white text-4xl text-neutral-900">
            ✦
          </div>
        </div>
      </section>
      <section className="mt-12" aria-labelledby="platforms">
        <h2 id="platforms" className="text-2xl font-semibold tracking-tight">
          Built for your platforms
        </h2>
        <p className="mt-2 text-neutral-500">
          Selected in your workspace configuration.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {starterPlatforms.map(({ id, title, detail, guide }, index) => (
            <article
              key={id}
              className="rounded-2xl border border-neutral-200 p-6"
            >
              <p
                aria-hidden="true"
                className="mb-8 font-mono text-sm text-neutral-400"
              >
                {String(index + 1).padStart(2, "0")}
              </p>
              <h3 className="text-xl font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-neutral-500">
                {detail}
              </p>
              {docsEnabled && (
                <a
                  className="mt-5 inline-block text-sm font-medium underline underline-offset-4"
                  href={`/docs/${guide}`}
                >
                  Get started with {title}
                </a>
              )}
            </article>
          ))}
        </div>
      </section>
      {starterFeatures.length > 0 && (
        <section className="mt-10" aria-label="Included features">
          <h2 className="text-sm font-medium text-neutral-500">
            Also included
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {starterFeatures.map((feature) => (
              <li
                key={feature}
                className="rounded-full bg-neutral-100 px-4 py-2 text-sm"
              >
                {feature}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
