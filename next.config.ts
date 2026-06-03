/** @type {import('next').NextConfig} */
const nextConfig = {
  // Type errors fail the build — the codebase is type-clean (npx tsc --noEmit).
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
