import Link from "next/link";
import { Logo } from "./Logo";
import { PillLink } from "./Pill";

export function SiteNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/80 backdrop-blur-md">
      <nav className="mx-auto grid h-16 max-w-6xl grid-cols-[1fr_auto_1fr] items-center px-5">
        <Link href="/" aria-label="Rastro home" className="justify-self-start"><Logo className="text-[17px]" /></Link>
        <div className="flex items-center gap-6 text-sm text-muted">
          <a href="/#how" className="hidden sm:inline hover:text-fg">How it works</a>
          <a href="/#numbers" className="hidden sm:inline hover:text-fg">Results</a>
          <a href="/#faq" className="hidden md:inline hover:text-fg">FAQ</a>
          <Link href="/report" className="hidden sm:inline hover:text-fg">Report a scam</Link>
        </div>
        <div className="justify-self-end">
          <PillLink href="/console" className="!py-2">Open the console</PillLink>
        </div>
      </nav>
    </header>
  );
}
