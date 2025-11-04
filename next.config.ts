/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // ❗ build will still succeed even if there are type errors
    ignoreBuildErrors: true,
  },
  eslint: {
    // ❗ skip ESLint during build
    ignoreDuringBuilds: true,
  },
};
module.exports = nextConfig;
