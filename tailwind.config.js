/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#14283A',
        paper: '#F4F7F8',
        line: '#D9E2E6',
        brand: '#17788C',
        brandDark: '#0F5667',
      },
      fontFamily: { sans: ['Vazirmatn', 'Tahoma', 'sans-serif'] },
    },
  },
  plugins: [],
};
