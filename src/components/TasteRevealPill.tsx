import { BannerPill } from './Banners';

/** One-time "Your taste is taking shape" moment over the deck. */
export function TasteRevealPill({
  onOpen,
  onClose,
  reduceMotion,
}: {
  onOpen: () => void;
  onClose: () => void;
  reduceMotion?: boolean;
}) {
  return (
    <BannerPill
      icon="sparkles"
      title="Your taste is taking shape"
      subtitle="See what we've learned"
      onPress={onOpen}
      onClose={onClose}
      reduceMotion={reduceMotion}
    />
  );
}
