// Server-side only: keeps DEMO_KEY out of the browser. The engine also checks the
// analyst's session cookie, which is passed through from the browser.
export async function POST(req: Request) {
  const base = process.env.RASTRO_API_URL ?? "http://localhost:8000";
  const res = await fetch(`${base}/demo/reset`, {
    method: "POST",
    headers: { "X-Demo-Key": process.env.DEMO_KEY ?? "change-me", cookie: req.headers.get("cookie") ?? "" },
    cache: "no-store",
  });
  return new Response(await res.text(), {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
