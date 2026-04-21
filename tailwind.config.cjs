module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './App.tsx',
    './index.tsx',
    './comps/**/*.{ts,tsx}',
    './seo/**/*.{ts,tsx}',
    './scripts/**/*.{ts,tsx}',
    './svcs/**/*.{ts,tsx}',
    './hks/**/*.{ts,tsx}',
    './utl/**/*.{ts,tsx}',
    './types.ts',
  ],
  theme: {
    extend: {
      colors: {
        neutral: {
          850: '#1f1f1f',
        },
      },
    },
  },
  plugins: [],
};
