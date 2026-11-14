import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The end-to-end server runs beside `npm run dev`, so it needs its own build directory.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Lets a phone on the same network use `npm run dev` through this Mac's .local name.
  allowedDevOrigins: ["*.local"],
  serverExternalPackages: ["sharp", "unpdf", "mammoth", "nodemailer"],
  // Agents read their AGENT.md at runtime, so the files must ship with every server function.
  outputFileTracingIncludes: { "/**": ["./agents/**/AGENT.md"] },
  turbopack: {
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    serverActions: { bodySizeLimit: "26mb" },
  },
};

export default nextConfig;
