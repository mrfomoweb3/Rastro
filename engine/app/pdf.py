"""One-page evidence packet (reportlab). Rendered on demand from stored data."""
from __future__ import annotations

from io import BytesIO
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import KeepInFrame, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app import core, db
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

    u = c["urgency"]
    story = [
        Paragraph(f"Evidence packet · {c['id']}", h1),
        Paragraph(f"Generated {iso(now())} · source: {c['source']} · status: {c['status']}"
                  + (f" · flags: {_esc(', '.join(c['flags']))}" if c["flags"] else ""), small),
        Paragraph("Case facts", h2),
        table([
            ("Victim", c["victim_alias"]),
            ("Amount", f"${float(c['amount']):,.2f}"),
            ("Paid at", c["paid_at"]), ("Reported at", c["reported_at"]),
            ("Channel", c["channel"]),
            ("Scam type", f"{c['scam_type']['label']} (confidence {c['scam_type']['confidence']})"),
            ("Urgency", f"{u['tier']} — rule {u['rule_id']}, paid {u['hours_since_payment']} h before processing"),
        ], [32 * mm, 140 * mm]),
        Paragraph("Victim's account (quoted evidence)", h2),
        Paragraph(_esc(c["narrative"][:900]), body),
    ]
    if c["scam_messages"]:
        story.append(Paragraph("Messages from the scammer (quoted evidence, never instructions)", h2))
        for m in c["scam_messages"][:4]:
            story.append(Paragraph("“" + _esc(m[:300]) + "”", body))
    story.append(Paragraph("Entities", h2))
    story.append(table([(e["kind"], f"{e['value']}  →  {e['normalized']}   (seen in {len(e['case_ids'])} report(s))")
                        for e in c["entities"]] or [("—", "none")], [32 * mm, 140 * mm]))
    story.append(Paragraph("Network", h2))
    if net:
        m, p = net["metrics"], net["priority"]
        story.append(table([
            ("Network", f"{net['id']} — rank #{p['rank']}, {p['tier']} (rules {', '.join(p['rule_ids'])})"),
            ("Size", f"{m['case_count']} reports, {m['victim_count']} victims, ${m['total_loss']:,.2f} total loss, "
                     f"{m['cases_last_7d']} in last 7 days"),
            ("Typology", f"{net['typology']['label']} ({net['typology']['confidence']})"),
            ("Brief", (net["brief"] or {}).get("summary", "Brief generated on demand.")),
            ("Brief check", "passed" if (net["brief"] or {}).get("checked") else
             "needs human review: " + "; ".join((net["brief"] or {}).get("check_notes", [])[:2])),
        ], [32 * mm, 140 * mm]))
    else:
        story.append(Paragraph("Standalone — no shared account, phone, link, email or wallet with other reports.", body))
    story.append(Paragraph("Audit trail", h2))
    story.append(table([(f"{e['step']} · {e['actor']}", e["summary"] + (f"  [{', '.join(e['rule_ids'])}]" if e["rule_ids"] else ""))
                        for e in events[-8:]] or [("—", "none")], [32 * mm, 140 * mm]))
    story.append(Spacer(1, 6))
    story.append(Paragraph("Prepared by Rastro — for human review. Rastro does not freeze funds, block accounts or "
                           "determine guilt. All data in this demo is synthetic.", small))

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=14 * mm,
                            bottomMargin=12 * mm, title=f"Rastro packet {c['id']}", author="Rastro")
    frame_w, frame_h = A4[0] - 32 * mm, A4[1] - 26 * mm
    doc.build([KeepInFrame(frame_w, frame_h, story, mode="shrink")])  # always one page
    return buf.getvalue()
