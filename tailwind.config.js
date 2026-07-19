/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"IBM Plex Sans Arabic"', 'system-ui', 'sans-serif'] },
      colors: {
        brand: {
          DEFAULT: '#CE8F64',
          50:  '#FDF6EF',
          100: '#FAE8D4',
          200: '#F3CBAA',
          300: '#E8A97C',
          500: '#CE8F64',
          600: '#B87A4E',
          700: '#9A6640',
        },
        ink: { DEFAULT: '#273240', muted: '#737B8B', faint: '#9AA1AE' },
        line: '#E6E8EC',
        canvas: '#F7F8FB',
      },
      boxShadow: {
        card: '0 1px 2px rgba(64,72,82,0.05), 0 6px 24px rgba(64,72,82,0.06)',
        pop: '0 12px 40px rgba(39,50,64,0.18)',
      },
      borderRadius: { xl2: '1.25rem' },
    },
  },
  plugins: [],
};
