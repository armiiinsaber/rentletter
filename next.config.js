/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @resvg/resvg-js is a native Node addon that loads a platform-specific .node
  // binary via dynamic require(). Webpack can't bundle that, so it must be kept
  // external — otherwise the binary is missing from the serverless function and
  // the SVG→PNG rasterize in /api/branding/use-logo throws at runtime.
  serverExternalPackages: ['@resvg/resvg-js'],
  // The landlord-report routes embed the realtor's chosen TTF fonts into the PDF
  // (read from assets/fonts at runtime). Force those files into the serverless
  // function bundles so they're present in production.
  outputFileTracingIncludes: {
    '/api/listings/report-pdf': ['./assets/fonts/**'],
    '/api/listings/send-report': ['./assets/fonts/**'],
  },
};

module.exports = nextConfig;
