import { FileText, Link2, ListOrdered, ScrollText, Target, Search, UserCheck } from "lucide-react";
import { SiteNav } from "@/components/SiteNav";
import { PillLink } from "@/components/Pill";
import { StatsRow } from "@/components/StatsRow";
import { ProductWindow } from "@/components/ProductWindow";
import { MiniBrief, MiniChat, MiniGraph } from "@/components/MiniCards";
import { Faq } from "@/components/Faq";
import { Logo } from "@/components/Logo";
import { NeonHead } from "@/components/NeonHead";

const features = [
  { icon: FileText, title: "Builds the evidence packet", body: "A PDF for the victim's bank, ready in under a second." },
  { icon: Link2, title: "Links shared accounts and phones", body: "Reports with one account, phone or link become one network." },
  { icon: ListOrdered, title: "Ranks networks by urgency", body: "Fraud teams see the network to act on first." },
  { icon: ScrollText, title: "Logs every step it takes", body: "Each step shows if rules, SERV or a person did it." },
];

const steps = [
  { title: "Collects the report in a chat", body: "The victim answers a few questions in plain language. Rastro asks only for what is missing: the amount, when they paid, how they were reached and the account they paid." },
  { title: "Builds the evidence packet", body: "It writes a PDF for the victim's bank with the story, the amounts and every account, phone number and link in the report." },
  { title: "Links and ranks the networks", body: "Reports that share an account, phone or link join one network. Fraud teams see the biggest and most urgent network first, with a brief that says why." },
];

const benefits = [
  { icon: Target, title: "Acts on the worst network first", body: "One shared account across 40 victims outranks ten unrelated reports. The ranking follows the money, not the order reports arrive." },
  { icon: Search, title: "Shows the evidence behind each claim", body: "Every statement in a brief points to the links that prove it. Select a reason and the graph lights up." },
  { icon: UserCheck, title: "Leaves the decision to a person", body: "Rastro never freezes money or says anyone is guilty. Doubtful cases go to review instead of being guessed." },
];

const limits = [
  { title: "Never freezes money", body: "Rastro ranks, packages and explains. The bank decides what to do with a packet." },
  { title: "Never says anyone is guilty", body: "Briefs that use words like guilty or criminal fail the check and go to a person for review." },
  { title: "Never links by name alone", body: "Two people with similar names stay separate unless an account, phone or link connects them." },
];

const h2 = "max-w-2xl text-balance text-3xl font-semibold tracking-tight md:text-5xl";

export default function Home() {
  return (
    <>
      <SiteNav />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="grid-bg pointer-events-none absolute inset-0" aria-hidden="true" />
          <NeonHead className="[mask-image:linear-gradient(to_bottom,#000_62%,transparent_100%)]" />
          <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-12 md:pb-20 md:pt-24">
            <div className="enter relative mx-auto flex max-w-3xl flex-col items-center text-center">
              {/* Soft white veil so the copy stays crisp over the glow */}
              <div className="pointer-events-none absolute -inset-x-4 -inset-y-6 -z-10 rounded-[48px] bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,.62)_30%,rgba(255,255,255,.4)_60%,transparent_80%)] sm:-inset-x-10" aria-hidden="true" />
              <a href="#how" className="mb-7 inline-flex items-center gap-2 rounded-full border border-line-strong bg-bg px-3.5 py-1.5 text-[13px] text-muted hover:text-fg">
                <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-on-accent">New</span>
                Built on SERV Reasoning
              </a>
              <h1 className="text-balance text-[2.6rem] font-semibold leading-[1.04] tracking-[-0.04em] [text-shadow:0_0_14px_#fff] sm:text-5xl md:text-7xl">
                Scam report triage for bank fraud teams
              </h1>
              <p className="mt-6 max-w-xl text-pretty text-base leading-relaxed text-fg/75 [text-shadow:0_0_10px_#fff,0_0_22px_#fff] sm:text-lg md:text-xl">
                Victims report a scam in a short chat. Rastro builds the evidence packet, links it to earlier reports that share an account or phone, and ranks which network to act on first.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3 md:mt-9">
                <PillLink href="/console?demo=1" className="!px-6 !py-3">Try the live demo</PillLink>
                <PillLink href="/report" variant="outline" className="!px-6 !py-3">Report a scam</PillLink>
              </div>
            </div>
            <div className="enter mx-auto mt-14 max-w-5xl [animation-delay:150ms]">
              <ProductWindow />
            </div>
          </div>
        </section>

        {/* Feature row */}
        <section className="border-y border-line bg-raised">
          <ul className="mx-auto grid max-w-6xl gap-px bg-line px-0 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <li key={f.title} className="flex flex-col gap-3 bg-raised px-6 py-8">
                <f.icon className="size-6 text-accent" strokeWidth={1.6} aria-hidden="true" />
                <h3 className="text-[17px] font-semibold tracking-tight">{f.title}</h3>
                <p className="text-[15px] leading-snug text-muted">{f.body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* One platform */}
        <section className="mx-auto max-w-6xl px-5 py-24">
          <h2 className={h2}>One platform from first report to ranked network</h2>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            <MiniChat />
            <MiniGraph />
            <MiniBrief />
          </div>
        </section>

        {/* Numbers */}
        <section id="numbers" className="mx-auto max-w-6xl px-5 pb-24">
          <div className="rounded-[28px] bg-gradient-to-b from-accent-soft to-accent-mid p-6 md:p-12">
            <h2 className={h2}>What it did on the demo data</h2>
            <p className="mt-3 max-w-xl text-lg text-muted">These numbers come straight from the engine's audit log.</p>
            <div className="mt-10"><StatsRow /></div>
            <p className="mt-4 text-sm text-muted">Hours saved is an estimate: 0.75 hours per packet and 2 hours per network brief, if built by hand.</p>
          </div>
        </section>

        {/* Benefits */}
        <section className="border-t border-line">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-24 md:grid-cols-[1fr_1.4fr]">
            <div>
              <h2 className={h2}>Benefits for fraud teams</h2>
              <p className="mt-4 max-w-sm text-lg text-muted">Less time stitching reports together. More time on the networks that matter.</p>
              <PillLink href="/console" className="mt-8">Open the console</PillLink>
            </div>
            <ul className="flex flex-col divide-y divide-line border-y border-line">
              {benefits.map((b) => (
                <li key={b.title} className="flex gap-5 py-7">
                  <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><b.icon className="size-6" strokeWidth={1.6} aria-hidden="true" /></span>
                  <div>
                    <h3 className="text-xl font-semibold tracking-tight">{b.title}</h3>
                    <p className="mt-1.5 max-w-xl text-[15px] leading-relaxed text-muted">{b.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="border-t border-line bg-raised">
          <div className="mx-auto max-w-6xl px-5 py-24">
            <h2 className={h2}>How it works</h2>
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

        {/* Two ways in */}
        <section className="mx-auto max-w-6xl px-5 py-24">
          <h2 className={h2}>Two ways in</h2>
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            <div className="flex flex-col items-start gap-4 rounded-2xl border border-line bg-raised p-8">
              <h3 className="text-2xl font-semibold tracking-tight">If you were scammed</h3>
              <p className="text-muted">Report it in a few minutes. No account needed.</p>
              <ul className="flex flex-col gap-2 text-[15px]">
                <li>Answer a few questions in a chat</li>
                <li>Download a PDF packet for your bank</li>
              </ul>
              <PillLink href="/report" variant="outline" className="mt-2">Report a scam</PillLink>
            </div>
            <div className="flex flex-col items-start gap-4 rounded-2xl border border-line bg-raised p-8">
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
        </section>

        {/* Limits */}
        <section className="border-t border-line">
          <div className="mx-auto max-w-6xl px-5 py-24">
            <h2 className={h2}>What Rastro will not do</h2>
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

        {/* FAQ */}
        <section id="faq" className="border-t border-line">
          <div className="mx-auto max-w-4xl px-5 py-24">
            <h2 className={h2}>Questions</h2>
            <div className="mt-10"><Faq /></div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="mx-auto max-w-6xl px-5 pb-24">
          <div className="flex flex-col items-start justify-between gap-8 rounded-[28px] bg-gradient-to-b from-accent-soft to-accent-mid p-8 md:flex-row md:items-center md:p-14">
            <h2 className="max-w-xl text-balance text-3xl font-semibold tracking-tight md:text-5xl">See which network to act on first</h2>
            <div className="flex flex-wrap gap-3">
              <PillLink href="/console?demo=1" className="!px-6 !py-3">Try the live demo</PillLink>
              <PillLink href="/report" variant="outline" className="!px-6 !py-3 bg-bg">Report a scam</PillLink>
            </div>
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
