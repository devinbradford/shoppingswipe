import { Text, type TextProps } from 'react-native';

import { colors, type as typeScale } from '@/theme/tokens';

type Variant = keyof typeof typeScale;

interface AppTextProps extends TextProps {
  variant?: Variant;
  color?: string;
}

export function AppText({ variant = 'body', color = colors.ink, style, ...rest }: AppTextProps) {
  return <Text {...rest} style={[typeScale[variant], { color }, style]} />;
}
