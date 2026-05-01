import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  // The FSRS optimizer ships a NAPI/WASI native binding that uses
  // `createRequire` and platform-specific `.node` artifacts. Turbopack can't
  // bundle those into ESM chunks, so we mark the package external and let
  // Next resolve it at runtime via the standard Node resolver.
  serverExternalPackages: ["@open-spaced-repetition/binding"],
};

export default nextConfig;
