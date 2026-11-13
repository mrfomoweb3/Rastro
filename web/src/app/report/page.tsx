import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ReportChat } from "@/components/ReportChat";

export const metadata = { title: "Report a scam | Rastro" };

export default function ReportPage() {
  return (
    <div className="light flex min-h-screen flex-col bg-bg text-fg">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
          <Link href="/" aria-label="Rastro home"><Logo className="text-[17px]" /></Link>
          <Link href="/console" className="text-sm text-muted hover:text-fg">I work in fraud</Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10">
        <div className="mb-8 max-w-xl">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Report a scam</h1>
          <p className="mt-2 text-muted">Tell us what happened in your own words. We will ask for anything missing, then give you a packet your bank can act on. No account needed.</p>
        </div>
        <ReportChat />
      </main>
      <footer className="border-t border-line py-6 text-center text-sm text-muted">
        All data in this demo is synthetic. Rastro does not freeze money. Your bank decides what to do with the packet.
      </footer>
    </div>
  );
}
