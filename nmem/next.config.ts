import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    root: path.join(__dirname, ".."),
    // The harness runs proofs in temp dirs it names at runtime. This app runs on the Mac that holds the repos, so whole-project tracing costs nothing.
    ignoreIssue: [
      {
        path: "**/fixtures/lib/checks.mjs",
        title: /Dynamic filesystem access/,
      },
    ],
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
