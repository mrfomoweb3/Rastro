import type { AuditEvent } from "./contract";

/**
 * Turns engine wording into plain language for analysts: drops rule ids, model notes and
 * "(s)" plurals. Saved data from older runs still holds the technical wording, so this
 * runs on everything the console shows.
 */
export function plain(s: string): string {
  return s
    .replace(/\s*\((?:offline|no SERV|SERV did not answer)[^)]*\)/gi, "")
    .replace(/\s*\(R\d+\)/g, "")
    .replace(/Pattern looks like (unknown|mixed); rated P\d under [R\d, ]+\./, "The scam pattern is mixed or not yet clear.")
    .replace(/Pattern looks like ([\w ]+); rated P\d under [R\d, ]+\./, "The pattern looks like a $1.")
    .replace(/;?\s*rated P\d under [R\d, ]+/g, "")
    .replace(/Contains (\d+) P1 case\(s\) with the freeze window open; raised P\d→(P\d)\./, (_, n, t) =>
      `${n} ${n === "1" ? "report was" : "reports were"} paid in the last 24 hours, so a bank hold may still work. Priority raised to ${t}.`)
    .replace("No escalation rule applies; default tier.", "Nothing here calls for a higher priority yet.")
    .replace(/Typology confidence [\d.]+ (?:is )?below [\d.]+;? ?(needs human review)?\.?/, "The scam pattern is not clear enough, so a person should review it.")
    .replace("Held together only by name look-alikes; needs human review.", "Only similar names connect these reports, so a person should review them.")
    .replace(/Total loss \$([\d,]+) with (\d+) cases in the last 7 days\./, "$$$1 lost in total, with $2 new reports in the last 7 days.")
    .replace(/, 0 of them in the last 7 days/, ", none in the last 7 days")
    .replace(/\b1 (\w+)\(s\) are\b/g, "1 $1 is")
    .replace(/\b1 (\w+)\(s\)/g, "1 $1")
    .replace(/(\d+) (\w+)\(s\)/g, "$1 $2s")
    .replace(/\(acct /g, "(account ")
    .replace(/looks like a ([aeiou])/gi, "looks like an $1")
    .replace("Name look-alikes are shown as weak links only and were not used to join reports.",
      "Similar names are shown as dotted lines only. They were not used to join reports.")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const stepText: Record<string, string> = {
  intake: "Report received",
  guard: "Screened for manipulation",
  completeness: "Checked the report is complete",
  urgency: "Set urgency",
  extract: "Found accounts, phones and links",
  link: "Matched to earlier reports",
  networks: "Updated the network",
  packet: "Evidence packet ready",
  decide: "Set priority",
  brief: "Wrote the brief",
  verify: "Fact-checked the brief",
  rank: "Updated the ranking",
  identity: "Checked the reporter",
  feedback: "Analyst feedback",
  export: "Exported for case management",
};

export const stepTitle = (step: string) =>
  stepText[step] ?? step.charAt(0).toUpperCase() + step.slice(1).replace(/_/g, " ");

export const actorText: Record<AuditEvent["actor"], string> = {
  code: "Automatic", serv: "AI", shadow: "AI check", human: "Analyst",
};

/** One short sentence per step, without scores, model names or rule ids. */
export function stepDetail(a: AuditEvent): string {
  const s = a.summary;
  switch (a.step) {
    case "decide": {
      const tier = s.match(/^(P\d)/)?.[1];
      const rest = s.split(" | ")[0].replace(/^[^.]*score [\d.]+\.\s*/, "");
      return plain(`${tier ? `Priority ${tier}. ` : ""}${rest}`);
    }
    case "brief":
      if (s.includes("failed the fact-check")) return "The AI draft failed the fact-check, so the standard brief was used.";
      if (s.startsWith("SERV brief failed")) return "The AI did not answer in time, so the standard brief was used.";
      return a.actor === "code" ? "Brief written from the standard template." : "Brief written by the AI and checked by a second AI pass.";
    case "verify":
      return s.startsWith("Brief passed") ? "Every claim matches the linked reports. No names, no accusations." : plain(s);
    case "extract": {
      if (s.startsWith("Seed case")) return "Details came with the imported report.";
      const kinds = s.match(/\(([^)]*)\)/)?.[1];
      return kinds ? `Found ${kinds.split(",").map((k) => k.trim()).join(" and ")}.` : plain(s);
    }
    case "urgency": {
      const m = s.match(/^(P\d): paid ([\d.]+) h ago, (\$[\d,.]+)/);
      if (!m) return plain(s);
      const h = Number(m[2]);
      const when = h < 48 ? `${Math.round(h)} hours ago` : `${Math.round(h / 24)} days ago`;
      return `${m[1]}. ${m[3].replace(/\.00$/, "")} paid ${when}.`;
    }
    case "guard":
      return s.startsWith("No injection")
        ? "Nothing suspicious in the text."
        : "The text tried to instruct the system. It was kept as evidence and could not change the result.";
    case "link":
      return plain(s.replace(" via shared account/phone/link", " through a shared account, phone or link"));
    case "rank":
      return s.replace(/^Re-ranked (#\d+) → (#\d+) by score\./, "Moved from $1 to $2.");
    case "packet":
      return "One-page PDF ready to send to the bank.";
    default:
      return plain(s);
  }
}
