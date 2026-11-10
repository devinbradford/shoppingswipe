import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

import { colors } from '@/theme/tokens';

export type RoomDrawingKind = 'living-room' | 'bedroom' | 'kitchen-dining' | 'browsing';

/**
 * Hand-drawn line pieces for "What are you shopping for?": a sofa, a bed, a dining set,
 * and a chair, lamp and side table for "Just browsing". Each sits on a soft circle of
 * light with one floor line. Drawn at a 128×100 ratio; give it a width and it scales.
 */
export function RoomDrawing({ kind, width }: { kind: RoomDrawingKind; width: number }) {
  return (
    <Svg
      width={width}
      height={(width * 100) / 128}
      viewBox="6 6 128 100"
      fill="none"
      stroke={colors.accent}
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Circle cx={70} cy={54} r={40} fill={colors.paperGlow} stroke="none" />
      <Path d="M16 92h108" strokeOpacity={0.22} />
      <G transform="translate(10 14)">{PIECES[kind]}</G>
    </Svg>
  );
}

const PIECES: Record<RoomDrawingKind, React.ReactNode> = {
  'living-room': (
    <>
      <Rect x={22} y={30} width={76} height={24} rx={6} />
      <Path d="M60 30v24" />
      <Rect x={14} y={48} width={92} height={18} rx={5} />
      <Rect x={8} y={40} width={16} height={30} rx={6} />
      <Rect x={96} y={40} width={16} height={30} rx={6} />
      <Path d="M22 70v8M98 70v8" />
    </>
  ),
  bedroom: (
    <>
      <Path d="M20 72V36a10 10 0 0 1 10-10h60a10 10 0 0 1 10 10v36" />
      <Rect x={14} y={52} width={92} height={16} rx={4} />
      <Rect x={28} y={40} width={26} height={10} rx={4} />
      <Rect x={66} y={40} width={26} height={10} rx={4} />
      <Path d="M18 68v10M102 68v10" />
    </>
  ),
  'kitchen-dining': (
    <>
      <Ellipse cx={60} cy={46} rx={24} ry={5} />
      <Path d="M60 51v25M50 78h20" />
      <Path d="M14 20v58M14 54h22v24" />
      <Path d="M106 20v58M106 54H84v24" />
    </>
  ),
  // A little of everything: armchair in front, floor lamp behind, side table.
  browsing: (
    <>
      <Path d="M58 12h20l7 16H51z" />
      <Path d="M68 28v48M60 78h16" />
      <Rect x={10} y={34} width={36} height={28} rx={9} />
      <Rect x={4} y={52} width={48} height={14} rx={5} />
      <Path d="M10 66v12M46 66v12" />
      <Ellipse cx={98} cy={54} rx={15} ry={4} />
      <Path d="M98 58v18M90 78h16" />
    </>
  ),
};
