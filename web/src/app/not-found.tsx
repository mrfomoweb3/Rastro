import { SiteNav } from "@/components/SiteNav";
import { PillLink } from "@/components/Pill";

export default function NotFound() {
  return (
    <>
      <SiteNav />
      <main className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center gap-5 px-5 py-32 text-center">
        <p className="font-mono text-sm text-muted">404</p>
        <h1 className="text-4xl font-semibold tracking-tight">This page does not exist</h1>
        <p className="text-muted">Check the address, or go back to the start.</p>
        <PillLink href="/">Go to the home page</PillLink>
      </main>
    </>
  );
}
