/** @type {import('next').NextConfig} */

// When building for GitHub Pages the site is served from /<repo>, so we need a
// basePath. On Vercel (or local dev) it serves from the root, so basePath stays
// empty. The Pages workflow sets GITHUB_PAGES=true.
const isPages = process.env.GITHUB_PAGES === "true";
const repo = "Dugsi";

const nextConfig = {
  output: "export", // fully static site — no server needed, free to host anywhere
  reactStrictMode: true,
  trailingSlash: true,
  images: { unoptimized: true },
  basePath: isPages ? `/${repo}` : undefined,
  assetPrefix: isPages ? `/${repo}/` : undefined,
  // Lets client code build absolute paths (service worker, manifest, icons)
  // that work both at the root and under /<repo> on GitHub Pages.
  env: { NEXT_PUBLIC_BASE_PATH: isPages ? `/${repo}` : "" },
};

export default nextConfig;
