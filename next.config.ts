/** @type {import('next').NextConfig} */
const nextConfig = {
  // Type errors now fail the build — the codebase is type-clean (npx tsc --noEmit).
  typescript: {
    ignoreBuildErrors: false,
  },
  // ESLint is run separately; don't block builds on lint.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
