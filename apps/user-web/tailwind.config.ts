import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#e6f4ff',
          500: '#1677ff',
          600: '#0958d9',
        },
        traffic: {
          fast: '#52c41a',
          moderate: '#faad14',
          slow: '#ff4d4f',
          jam: '#cf1322',
        },
      },
    },
  },
  plugins: [],
};

export default config;
