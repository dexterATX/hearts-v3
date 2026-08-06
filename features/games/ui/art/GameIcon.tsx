// features/games/ui/art/GameIcon.tsx — the arcade's real icons: the
// iridescent glass set, rasterized once at 256px and bundled as assets
// (exactly how the mood bunnies ship). All five tiles use these.
import { Image } from 'expo-image';

const SOURCES = {
  hangman: require('../assets/daisy.png'),
  battleship: require('../assets/hearts.png'),
  quiz: require('../assets/quiz.png'),
  cards: require('../assets/deck.png'),
  canvas: require('../assets/canvas.png'),
} as const;

function makeIcon(source: (typeof SOURCES)[keyof typeof SOURCES]) {
  return function GameIcon({ size = 56 }: { size?: number }) {
    return (
      <Image
        source={source}
        style={{ width: size, height: size }}
        contentFit="contain"
        cachePolicy="memory-disk"
      />
    );
  };
}

export const DaisyIcon = makeIcon(SOURCES.hangman);
export const HeartsIcon = makeIcon(SOURCES.battleship);
export const QuizIcon = makeIcon(SOURCES.quiz);
export const DeckIcon = makeIcon(SOURCES.cards);
export const CanvasIcon = makeIcon(SOURCES.canvas);
