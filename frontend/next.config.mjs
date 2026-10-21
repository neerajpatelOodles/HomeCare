const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The browser only ever talks to this app (same origin). Next forwards /api/*
  // to the Express backend, so login cookies are first-party and no CORS setup is needed.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${BACKEND_URL}/api/:path*` }];
  },
};

export default nextConfig;
