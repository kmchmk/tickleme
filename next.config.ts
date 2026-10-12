import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false, // do not auto-generate AGENTS.md in the repo
  // The in-memory dev database is for local development only; never bundle it into the server build.
  async redirects() {
    // Old per-outfit links now live under one avatar.
    return [
      { source: "/a/woman-in-jeans", destination: "/a/avatar-1?v=jeans", permanent: true },
      { source: "/a/woman-in-bikini", destination: "/a/avatar-1?v=bikini", permanent: true },
      { source: "/a/woman-in-nude", destination: "/a/avatar-1?v=explicit", permanent: true },
    ];
  },
  serverExternalPackages: ["@electric-sql/pglite"],
  outputFileTracingExcludes: { "*": ["node_modules/@electric-sql/**"] },
};

export default nextConfig;
