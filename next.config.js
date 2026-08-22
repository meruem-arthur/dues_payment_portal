/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: { bodySizeLimit: '5mb' },
    // Required on Next.js 14 for instrumentation.ts's register() to run
    // (stable-by-default from Next.js 15 on, no flag needed there).
    // This is what loads sentry.server.config.ts / sentry.edge.config.ts -
    // see instrumentation.ts.
    instrumentationHook: true,
  },
};
module.exports = nextConfig;
