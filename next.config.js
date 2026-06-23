/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @resvg/resvg-js is a native Node addon that loads a platform-specific .node
  // binary via dynamic require(). Webpack can't bundle that, so it must be kept
  // external — otherwise the binary is missing from the serverless function and
  // the SVG→PNG rasterize in /api/branding/use-logo throws at runtime.
  serverExternalPackages: ['@resvg/resvg-js'],
};

module.exports = nextConfig;
