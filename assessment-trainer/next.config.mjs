/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Native / worker based packages must stay outside the server bundle.
    serverComponentsExternalPackages: ["tesseract.js", "@prisma/client", "sharp"],
  },
};

export default nextConfig;
