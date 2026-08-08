const tokens = require('./src/ui/theme/tokens.json');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: tokens.colors,
      spacing: tokens.spacing,
      borderRadius: tokens.radii,
      fontSize: Object.fromEntries(
        Object.entries(tokens.typography).map(([name, value]) => [
          name,
          [value.fontSize, { lineHeight: value.lineHeight, fontWeight: value.fontWeight }],
        ]),
      ),
      minHeight: {
        touch: tokens.touch.minimum,
      },
      minWidth: {
        touch: tokens.touch.minimum,
      },
    },
  },
  plugins: [],
};
