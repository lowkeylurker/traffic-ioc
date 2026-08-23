/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@traffic-ioc/shared'],
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
  },
};

export default nextConfig;
