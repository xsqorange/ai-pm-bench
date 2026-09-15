/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      // REST proxy: /api/backend/* -> http://127.0.0.1:8000/api/v1/*
      { source: "/api/backend/:path*", destination: "http://127.0.0.1:8000/api/v1/:path*" },
    ];
  },
};
export default nextConfig;