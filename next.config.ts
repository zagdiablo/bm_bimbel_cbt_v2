import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: [
    "pdf-parse",
    "mammoth",
    "xlsx",
    "@react-pdf/renderer",
  ],
};

export default nextConfig;
