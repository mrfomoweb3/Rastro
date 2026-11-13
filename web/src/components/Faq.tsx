const items = [
  { q: "Does Rastro freeze accounts or block payments?", a: "No. Rastro ranks, packages and explains. A person at the bank decides what to do with a packet or a network." },
  { q: "How does it decide which network comes first?", a: "A written rulebook in code scores each network on how recently victims paid, how many victims share one account, and how fast reports are arriving. A SERV model checks that reasoning, and when the two disagree the more cautious result wins." },
  { q: "Can it link two people because their names look alike?", a: "No. Networks form only from shared accounts, phones and links. A similar name appears as a weak, dashed link and never merges two networks." },
  { q: "What if the AI is wrong or unavailable?", a: "Every brief is checked: each claim must point to a real link, and every number must match the data. A failed check sends the network to review. Without a SERV key the engine falls back to plain rules, and the audit log says so." },
  { q: "Is this real victim data?", a: "No. Every name, phone number and account in this demo is synthetic." },
];

export function Faq() {
  return (
    <div className="divide-y divide-line border-y border-line">
      {items.map((i) => (
        <details key={i.q} className="group py-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-lg font-medium tracking-tight [&::-webkit-details-marker]:hidden">
            {i.q}
            <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full border border-line-strong text-muted transition-transform group-open:rotate-45">+</span>
          </summary>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">{i.a}</p>
        </details>
      ))}
    </div>
  );
}
