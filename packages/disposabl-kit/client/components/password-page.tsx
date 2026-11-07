import type { ReactNode } from "react";
import { Logo } from "./logo";

export function PasswordPage({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-[calc(100svh-73px)] items-center justify-center bg-[#faf9f6] px-5 py-12 text-[#161b2e] sm:px-8">
      <div className="w-full max-w-md">
        <a
          href="/"
          className="mb-8 inline-block rounded-md focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          <Logo />
        </a>
        <section className="rounded-2xl border border-[#e0e4ed] bg-white p-6 shadow-[0_12px_40px_-24px_rgba(22,27,46,0.2)] sm:p-8">
          <p className="mb-3 text-xs font-bold tracking-[0.15em] text-[#687080] uppercase">
            Your Disposabl account
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          {description && (
            <p className="mt-2 text-sm leading-6 text-[#495269]">
              {description}
            </p>
          )}
          <div className="mt-7 space-y-5 text-sm leading-6">{children}</div>
        </section>
      </div>
    </main>
  );
}
