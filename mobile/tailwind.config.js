/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        bg: '#0A0A0F',
        card: '#14141E',
        border: '#22222E',
        accent: '#00D4FF',
        up: '#10B981',
        down: '#EF4444',
        muted: '#8A8A9A',
        navy: '#0A1128',
        gold: '#D4AF37',
      },
    },
  },
  plugins: [],
}
