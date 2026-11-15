"""One-page evidence packet (reportlab). Rendered on demand from stored data, so a packet
downloaded later always shows the current state of the report's network."""
from __future__ import annotations

from io import BytesIO
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import KeepInFrame, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app import core, db, wording
from app.timeutil import iso, now

INK = colors.HexColor("#111418")
MUTED = colors.HexColor("#5b6470")
LINE = colors.HexColor("#d9dde3")
ACCENT = colors.HexColor("#b4321f")


def _esc(s: str) -> str:
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def render_packet(case_id: str) -> Optional[bytes]:
    c = db.get_case(case_id)
    if not c:
        return None
    c = core.hydrate(c)
    net = db.get_network(c["network_id"]) if c["network_id"] else None
    events = db.list_audit(case_id)
    # A live report's packet is ready before its network has been re-ranked. Until that is
    # done, the packet says so instead of printing a priority that is about to change.
    pending = bool(c["source"] == "live" and c["network_id"] and not db.get_case_meta(case_id).get("network_done"))

    ss = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=ss["Title"], fontSize=16, leading=19, textColor=INK, alignment=0, spaceAfter=2)
    h2 = ParagraphStyle("h2", parent=ss["Heading3"], fontSize=9.5, leading=12, textColor=ACCENT, spaceBefore=6,
                        spaceAfter=2)
    body = ParagraphStyle("b", parent=ss["BodyText"], fontSize=8, leading=10.2, textColor=INK)
    small = ParagraphStyle("s", parent=body, fontSize=7, leading=9, textColor=MUTED)

    def table(rows, widths):
        t = Table([[Paragraph(_esc(str(a)), small), Paragraph(_esc(str(b)), body)] for a, b in rows],
                  colWidths=widths)
        t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEBELOW", (0, 0), (-1, -1), 0.3, LINE),
                               ("TOPPADDING", (0, 0), (-1, -1), 1.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5)]))
        return t

    cols = [38 * mm, 134 * mm]
    flagged = "injection_attempt" in c["flags"]
    story = [
        Paragraph(f"Evidence packet · Report {c['id']}", h1),
        Paragraph(f"Prepared {wording.when(iso(now()))} for the victim's bank.", small),
        Paragraph("What was reported", h2),
        table([
            ("Reported by", c["victim_alias"]),
            ("Amount sent", f"${float(c['amount']):,.2f}"),
            ("Money sent", wording.when(c["paid_at"])),
            ("Reported", wording.when(c["reported_at"])),
            ("How they made contact", wording.CHANNEL.get(c["channel"], c["channel"])),
            ("Type of scam", wording.SCAM.get(c["scam_type"]["label"], "Not clear yet")),
            ("Urgency", wording.urgency(c["urgency"])),
        ], cols),
        Paragraph("In the victim's own words", h2),
        Paragraph(_esc(c["narrative"][:900]), body),
    ]
    if c["scam_messages"]:
        story.append(Paragraph("Messages from the scammer (quoted as received)", h2))
        for m in c["scam_messages"][:4]:
            story.append(Paragraph("“" + _esc(m[:300]) + "”", body))
    if flagged:
        story.append(Paragraph("Note: this report contains text that tried to give instructions to the system. It is "
                               "quoted above as evidence only and did not change any result.", small))
    story.append(Paragraph("Details that can be traced", h2))
    story.append(table([(wording.KIND.get(e["kind"], e["kind"]),
                         f"{e['value']}  ({wording.others(len(e['case_ids']))})") for e in c["entities"]]
                       or [("None", "No account, phone, link, email or wallet was given.")], cols))
    story.append(Paragraph("Linked reports", h2))
    if c["network_id"] and (pending or not net):
        rows = [("Network", c["network_id"])]
        if net:
            m = net["metrics"]
            rows.append(("Size", f"{m['case_count']} reports from {m['victim_count']} victims, "
                                 f"${m['total_loss']:,.2f} lost in total"))
        rows.append(("Priority", "Being reviewed now. Download this packet again in a minute for the result."))
        story.append(table(rows, cols))
    elif net:
        m, p, b = net["metrics"], net["priority"], net["brief"] or {}
        total = len(db.list_networks())
        rows = [
            ("Network", f"{net['id']} · {wording.PATTERN.get(net['typology']['label'], 'Not clear yet')}"),
            ("Size", f"{m['case_count']} reports from {m['victim_count']} victims, ${m['total_loss']:,.2f} lost in "
                     f"total, {m['cases_last_7d']} in the last 7 days"),
            ("Priority", f"{wording.TIER.get(p['tier'], p['tier'])}. Ranked #{p['rank']} of {total} networks."
                         + (" A person needs to review this network." if net["status"] == "needs_review" else "")),
        ]
        if p["reasons"]:
            rows.append(("Why", " ".join(p["reasons"][:4])))
        if b.get("summary") and b.get("checked"):
            rows.append(("Summary", b["summary"]))
            rows.append(("Fact-check", "Passed. Every statement matches the linked reports."))
        elif b.get("summary"):
            rows.append(("Fact-check", "Not passed yet. " + " ".join(b.get("check_notes", [])[:2])))
        story.append(table(rows, cols))
    else:
        story.append(Paragraph("None. No other report shares an account, phone, link, email or wallet with this one.",
                               body))
    story.append(Paragraph("How this packet was prepared", h2))
    story.append(table([(wording.STEP.get(e["step"], e["step"].capitalize()),
                         f"{wording.step_detail(e)}  [{wording.ACTOR.get(e['actor'], e['actor'])}]")
                        for e in _steps(events)] or [("None", "No steps recorded.")], cols))
    refs = sorted(r for r in {r for e in events for r in e["rule_ids"]}
                  | set((net or {}).get("priority", {}).get("rule_ids", []))
                  if len(r) == 2 and r[0] in "UR" and r[1].isdigit())
    story.append(Spacer(1, 6))
    story.append(Paragraph("Prepared by Rastro for human review. Rastro does not freeze funds, block accounts or "
                           "determine guilt. All data in this demo is synthetic."
                           + (f" Rule references: {', '.join(refs)}." if refs else ""), small))

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=14 * mm,
                            bottomMargin=12 * mm, title=f"Rastro packet {c['id']}", author="Rastro")
    frame_w, frame_h = A4[0] - 32 * mm, A4[1] - 26 * mm
    doc.build([KeepInFrame(frame_w, frame_h, story, mode="shrink")])  # always one page
    return buf.getvalue()


def _steps(events: list) -> list:
    """The case's steps, with the intake chat turns folded into one line."""
    out, chat = [], 0
    for e in events:
        if e["step"] == "intake" and e["actor"] == "serv":
            chat += 1
            continue
        out.append(e)
    if chat:
        out.insert(0, {"step": "intake", "actor": "serv", "rule_ids": [],
                       "summary": f"Chat with the victim ({chat} turns, PromptGuard on)."})
    return out[-9:]
