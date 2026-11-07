import { useEffect, useState } from "react";
import {
  Star,
  Heart,
  Moon,
  Sun,
  Zap,
  Flower2,
  RotateCcw,
  Gamepad2,
} from "lucide-react";
import "./specialist-previews.css";

const symbols = {
  star: Star,
  heart: Heart,
  moon: Moon,
  sun: Sun,
  bolt: Zap,
  flower: Flower2,
};
const cards = [
  "star",
  "heart",
  "moon",
  "sun",
  "bolt",
  "star",
  "flower",
  "moon",
  "heart",
  "flower",
  "sun",
  "bolt",
] as const;

export function GameDemo({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  useEffect(() => {
    if (open.length !== 2) return;
    const timer = window.setTimeout(() => setOpen([]), 900);
    return () => window.clearTimeout(timer);
  }, [open]);
  function reveal(index: number) {
    if (open.length === 2 || open.includes(index) || matched.includes(index))
      return;
    const first = open.at(0);
    if (first !== undefined) {
      setMoves((value) => value + 1);
      if (cards[first] === cards[index]) {
        setMatched([...matched, first, index]);
        setOpen([]);
        return;
      }
    }
    setOpen([...open, index]);
  }
  return (
    <div className="special-game game-app">
      <header className="special-game-header">
        <div className="special-game-logo">
          <Gamepad2 size={20} /> flip club
        </div>
      </header>
      <div className="special-game-intro">
        <div>
          <h4>
            {matched.length === cards.length
              ? "Nicely matched!"
              : "Find your pairs."}
          </h4>
        </div>
        <div className="game-score" aria-live="polite">
          <span>{matched.length / 2} / 6 pairs</span>
          <span>{moves} moves</span>
        </div>
      </div>
      <div
        className="game-board"
        role="group"
        aria-label="Memory matching game"
      >
        {cards.map((name, index) => {
          const Icon = symbols[name];
          const faceUp = open.includes(index) || matched.includes(index);
          return (
            <button
              type="button"
              key={index}
              disabled={disabled || matched.includes(index)}
              className={faceUp ? "is-revealed" : ""}
              aria-label={`Card ${index + 1}, ${faceUp ? name : "face down"}`}
              aria-pressed={faceUp}
              onClick={() => reveal(index)}
            >
              {faceUp ? (
                <Icon size={30} strokeWidth={2.2} />
              ) : (
                <span aria-hidden="true">✦</span>
              )}
            </button>
          );
        })}
      </div>
      <footer className="special-game-footer">
        <span>Take your time. Enjoy the game.</span>
        <button
          className="game-reset"
          disabled={disabled}
          onClick={() => {
            setOpen([]);
            setMatched([]);
            setMoves(0);
          }}
        >
          <RotateCcw size={18} />
          Play again
        </button>
      </footer>
    </div>
  );
}
