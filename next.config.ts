import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@moss-js/moss", "neo4j-driver"],
  cacheComponents: true,
  partialPrefetching: true,
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
