import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow large video uploads
  serverExternalPackages: ["bcryptjs", "jsonwebtoken"],
};

export default nextConfig;
