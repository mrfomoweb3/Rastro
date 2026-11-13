import { SiteNav } from "@/components/SiteNav";
import { PillLink } from "@/components/Pill";
import { NetworkPreview } from "@/components/NetworkPreview";
import { HeroFact, StatsRow } from "@/components/StatsRow";
import { Logo } from "@/components/Logo";

const steps = [
  {
    title: "Collects the report in a chat",
    body: "The victim answers a few questions in plain language. Rastro asks only for what is missing: the amount, when they paid, how they were reached and the account they paid.",
  },
  {
    title: "Builds the evidence packet",
    body: "It writes a PDF for the victim's bank with the story, the amounts and every account, phone number and link in the report.",
  },
  {
    title: "Links and ranks the networks",
    body: "Reports that share an account, phone or link join one network. Fraud teams see the biggest and most urgent network first, with a brief that says why.",
  },
];

const limits = [
  { title: "Never freezes money", body: "Rastro ranks, packages and explains. The bank decides what to do with a packet." },
  { title: "Never says anyone is guilty", body: "Briefs that use words like guilty or criminal fail the check and go to a person for review." },
  { title: "Never links by name alone", body: "Two people with similar names stay separate unless an account, phone or link connects them." },
];

export default function Home() {
  return (
    <>
      <SiteNav />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="grid-bg pointer-events-none absolute inset-0" aria-hidden="true" />
          <div className="relative mx-auto max-w-6xl px-5 pb-20 pt-20 md:pt-28">
            <div className="enter mx-auto flex max-w-3xl flex-col items-center text-center">
              <h1 className="text-balance text-5xl font-semibold leading-[1.02] tracking-[-0.04em] md:text-7xl">
                Scam report triage for bank fraud teams
              </h1>
              <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted md:text-xl">
                Victims report a scam in a short chat. Rastro builds the evidence packet, links it to earlier reports that share an account or phone, and ranks which network to act on first.
              </p>
              <div className="mt-9 flex flex-wrap justify-center gap-3">
                <PillLink href="/console?demo=1" className="!px-6 !py-3">Try the live demo</PillLink>
                <PillLink href="/report" variant="outline" className="!px-6 !py-3">Report a scam</PillLink>
              </div>
              <div className="mt-8"><HeroFact /></div>
            </div>
            <div className="enter mx-auto mt-16 max-w-5xl [animation-delay:150ms]">
              <NetworkPreview />
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="border-t border-line">
          <div className="mx-auto max-w-6xl px-5 py-24">
            <h2 className="max-w-2xl text-balance text-3xl font-semibold tracking-tight md:text-5xl">How it works</h2>
            <p className="mt-4 max-w-xl text-lg text-muted">One report goes in. A packet and a ranked network come out, usually in under a minute.</p>
            <ol className="mt-14 grid gap-10 md:grid-cols-3">
              {steps.map((s, i) => (
                <li key={s.title} className="flex flex-col gap-3 border-t-2 border-fg pt-5">
                  <span className="font-mono text-sm text-muted">Step {i + 1}</span>
                  <h3 className="text-xl font-semibold tracking-tight">{s.title}</h3>
                  <p className="text-[15px] leading-relaxed text-muted">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Numbers */}
        <section id="numbers" className="border-t border-line">
          <div className="mx-auto max-w-6xl px-5 py-24">
            <h2 className="max-w-2xl text-balance text-3xl font-semibold tracking-tight md:text-5xl">What it did on the demo data</h2>
            <p className="mt-4 max-w-xl text-lg text-muted">These numbers come straight from the engine's audit log.</p>
            <div className="mt-12"><StatsRow /></div>
            <p className="mt-4 text-sm text-faint">Hours saved is an estimate: 0.75 hours per packet and 2 hours per network brief, if built by hand.</p>
          </div>
        </section>

        {/* Two ways in */}
        <section className="border-t border-line">
          <div className="mx-auto max-w-6xl px-5 py-24">
            <h2 className="max-w-2xl text-balance text-3xl font-semibold tracking-tight md:text-5xl">Two ways in</h2>
            <div className="mt-12 grid gap-5 md:grid-cols-2">
              <div className="flex flex-col items-start gap-4 rounded-2xl border border-line bg-bg-raised p-8">
                <h3 className="text-2xl font-semibold tracking-tight">If you were scammed</h3>
                <p className="text-muted">Report it in a few minutes. No account needed.</p>
                <ul className="flex flex-col gap-2 text-[15px]">
                  <li>Answer a few questions in a chat</li>
                  <li>Download a PDF packet for your bank</li>
                </ul>
                <PillLink href="/report" variant="outline" className="mt-2">Report a scam</PillLink>
              </div>
              <div className="flex flex-col items-start gap-4 rounded-2xl border border-line bg-bg-raised p-8">
                <h3 className="text-2xl font-semibold tracking-tight">If you work in fraud</h3>
                <p className="text-muted">See which network to act on first, and why.</p>
                <ul className="flex flex-col gap-2 text-[15px]">
                  <li>Networks ranked by urgency</li>
                  <li>A graph of every shared account and phone</li>
                  <li>An audit log of each step the agent took</li>
                </ul>
                <PillLink href="/console" className="mt-2">Open the console</PillLink>
              </div>
            </div>
          </div>
        </section>

        {/* Limits */}
        <section className="border-t border-line">
          <div className="mx-auto max-w-6xl px-5 py-24">
            <h2 className="max-w-2xl text-balance text-3xl font-semibold tracking-tight md:text-5xl">What Rastro will not do</h2>
            <ul className="mt-12 grid gap-10 md:grid-cols-3">
              {limits.map((l) => (
                <li key={l.title} className="flex flex-col gap-2">
                  <h3 className="text-lg font-semibold">{l.title}</h3>
                  <p className="text-[15px] leading-relaxed text-muted">{l.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-5 py-10 text-sm text-muted md:flex-row md:items-center">
          <Logo className="text-fg" />
          <p>All data in this demo is synthetic. Built for the SERV Hackathon, Edition 02.</p>
        </div>
      </footer>
    </>
  );
}
