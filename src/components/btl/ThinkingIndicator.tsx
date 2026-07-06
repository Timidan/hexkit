import { useEffect, useState } from "react";

const THINKING_WORDS = [
  "Pondering",
  "Analyzing",
  "Searching",
  "Evaluating",
  "Reasoning",
  "Inspecting",
];
const STAR_COLORS = ["#e87461", "#d4a054", "#c084fc", "#60a5fa", "#34d399", "#f472b6"];

/** Typewriter hook: types out the current word, pauses, erases, moves on. */
function useThinkingLabel(): string {
  const [wordIndex, setWordIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const word = THINKING_WORDS[wordIndex];
    if (!deleting) {
      if (charIndex < word.length) {
        const id = setTimeout(() => setCharIndex((c) => c + 1), 60);
        return () => clearTimeout(id);
      }
      const id = setTimeout(() => setDeleting(true), 1400);
      return () => clearTimeout(id);
    }
    if (charIndex > 0) {
      const id = setTimeout(() => setCharIndex((c) => c - 1), 30);
      return () => clearTimeout(id);
    }
    setDeleting(false);
    setWordIndex((i) => (i + 1) % THINKING_WORDS.length);
  }, [wordIndex, charIndex, deleting]);

  return THINKING_WORDS[wordIndex].slice(0, charIndex);
}

/** Twinkling ✦ star field — small color-cycling glyphs. */
function TwinklingField() {
  const stars = [
    { x: 2, y: 3, s: 0 }, { x: 10, y: 1, s: 0.3 }, { x: 6, y: 8, s: 0.6 },
    { x: 14, y: 5, s: 0.9 }, { x: 1, y: 10, s: 0.4 }, { x: 12, y: 11, s: 0.7 },
  ];
  return (
    <span className="relative inline-flex h-4 w-4">
      {stars.map((s, i) => (
        <span
          key={i}
          className="absolute text-[6px]"
          style={{
            left: s.x,
            top: s.y,
            color: STAR_COLORS[i % STAR_COLORS.length],
            animation: `twinkle 1.8s ease-in-out ${s.s}s infinite`,
          }}
        >
          ✦
        </span>
      ))}
      <style>{`@keyframes twinkle { 0%,100%{opacity:0.1;transform:scale(0.5)} 50%{opacity:1;transform:scale(1.2)} }`}</style>
    </span>
  );
}

/**
 * Animated "AI is working" indicator — a twinkling star field + a typewriter
 * word cycling through synonyms for thinking. Shared by the BTL weave panels.
 */
export function ThinkingIndicator() {
  const label = useThinkingLabel();
  return (
    <span className="inline-flex items-center gap-2 text-muted-foreground">
      <TwinklingField />
      <span className="text-sm">
        {label || "Thinking"}
        <span className="animate-pulse">…</span>
      </span>
    </span>
  );
}

export default ThinkingIndicator;
