import type { NextConfig } from "next";

/** Packages Node must load itself (CommonJS / native), not the Next bundler. */
const SERVER_EXTERNAL = [
  "@pump-fun/pump-sdk",
  "@pump-fun/pump-swap-sdk",
  "@coral-xyz/anchor",
  "sharp",
  "@electric-sql/pglite",
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  serverExternalPackages: SERVER_EXTERNAL,
  // Make sure the launch API routes ship the pump SDK and its dependencies.
  outputFileTracingIncludes: {
    "/api/**": [
      "./node_modules/@pump-fun/pump-sdk/**/*",
      "./node_modules/@pump-fun/pump-swap-sdk/**/*",
      "./node_modules/@coral-xyz/anchor/**/*",
      "./drizzle/**/*",
    ],
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
