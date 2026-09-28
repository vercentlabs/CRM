/** Mobile type scale (system font; sizes scale with the OS text-size setting). */
export const typography = {
  fontSize: {
    xs: 12,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 20,
    xxl: 24,
  },
  weight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
} as const;

export type TypographyScale = typeof typography;
