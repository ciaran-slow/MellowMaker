import tokens from '@/ui/theme/tokens.json';

type FontDefinition = [
  number,
  {
    lineHeight: string;
    fontWeight: number;
  },
];

type TailwindTheme = {
  theme: {
    extend: {
      fontSize: Record<string, FontDefinition>;
    };
  };
};

const tailwindTheme = jest.requireActual<TailwindTheme>('../tailwind.config.js');

describe('Playful Craft typography tokens', () => {
  it.each(Object.entries(tokens.typography))(
    'maps %s to its exact font size and pixel line height',
    (name, typography) => {
      expect(tailwindTheme.theme.extend.fontSize[name]).toEqual([
        typography.fontSize,
        {
          lineHeight: `${typography.lineHeight}px`,
          fontWeight: typography.fontWeight,
        },
      ]);
    },
  );
});
