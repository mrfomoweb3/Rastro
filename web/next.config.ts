import type { NextConfig } from "next";

const API_URL = process.env.RASTRO_API_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  // The browser only talks to this app. Next forwards /api/rastro/* to the engine,
  // so there is no CORS to configure and the PDF download works the same way.
  async rewrites() {
    return [{ source: "/api/rastro/:path*", destination: `${API_URL}/:path*` }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
