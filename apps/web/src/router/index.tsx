import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_providers/")({
  head: () => ({
    meta: [
      { title: "Disposabl | Build your app" },
      {
        name: "description",
        content:
          "A clean starting point for your next application.",
      },
    ],
  }),
  component: () => (
    <main className="mx-auto max-w-5xl px-6 py-24">
      <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">A clean start for your next app.</h1>
      <p className="mt-6 max-w-xl text-lg text-neutral-600">Build something useful with a simple foundation ready to make your own.</p>
    </main>
  ),
});
