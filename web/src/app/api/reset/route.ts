// Server-side only: keeps DEMO_KEY out of the browser.
export async function POST() {
  const base = process.env.RASTRO_API_URL ?? "http://localhost:8000";
  const res = await fetch(`${base}/demo/reset`, {
    method: "POST",
    headers: { "X-Demo-Key": process.env.DEMO_KEY ?? "change-me" },
    cache: "no-store",
  });
  return new Response(await res.text(), {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
