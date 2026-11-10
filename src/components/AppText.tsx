import { Text, type TextProps } from 'react-native';

import { colors, type as typeScale } from '@/theme/tokens';

type Variant = keyof typeof typeScale;

/** The swipe card's name and price grow at most this much with the phone's text size. */
export const CARD_TEXT_MAX_SCALE = 1.3;

interface AppTextProps extends TextProps {
  variant?: Variant;
  color?: string;
}

/** Big display text grows less with the phone's text size so it can't overflow cards. */
const MAX_SCALE: Partial<Record<Variant, number>> = {
  hero: 1.3,
  price: 1.3,
  title: 1.4,
  heading: 1.6,
  cardTitle: CARD_TEXT_MAX_SCALE,
  cardPrice: CARD_TEXT_MAX_SCALE,
};

export function AppText({ variant = 'body', color = colors.ink, style, ...rest }: AppTextProps) {
  return (
    <Text maxFontSizeMultiplier={MAX_SCALE[variant] ?? 2} {...rest} style={[typeScale[variant], { color }, style]} />
  );
}
