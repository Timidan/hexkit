import React, { useEffect, useRef, useState } from "react";

/**
 * 20 animated sparkle/loading indicators — pick one to replace the current
 * ShimmerSparkle in IntentPanel. Open via the Earn page or import directly.
 */

// ─── 1. Hue-cycling ✦ (current) ──────────────────────────────────────────────
function S01() {
  return (
    <span className="inline-block text-sm" style={{ animation: "s01 3s ease-in-out infinite" }}>
      ✦
      <style>{`@keyframes s01 { 0%{color:#e87461} 25%{color:#d4a054} 50%{color:#c084fc} 75%{color:#60a5fa} 100%{color:#e87461} }`}</style>
    </span>
  );
}

// ─── 2. Pulsing gradient dot ──────────────────────────────────────────────────
function S02() {
  return (
    <span
      className="inline-block h-3 w-3 rounded-full"
      style={{
        background: "conic-gradient(from 0deg, #e87461, #d4a054, #c084fc, #60a5fa, #e87461)",
        animation: "s02-pulse 1.5s ease-in-out infinite, s02-spin 4s linear infinite",
      }}
    >
      <style>{`
        @keyframes s02-pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(0.7);opacity:0.6} }
        @keyframes s02-spin { to{filter:hue-rotate(360deg)} }
      `}</style>
    </span>
  );
}

// ─── 3. Three-dot breathing ───────────────────────────────────────────────────
function S03() {
  return (
    <span className="inline-flex gap-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-1.5 w-1.5 rounded-full bg-current"
          style={{
            animation: `s03 1.4s ease-in-out ${i * 0.16}s infinite`,
            opacity: 0.4,
          }}
        />
      ))}
      <style>{`@keyframes s03 { 0%,80%,100%{opacity:0.4;transform:scale(1)} 40%{opacity:1;transform:scale(1.4)} }`}</style>
    </span>
  );
}

// ─── 4. SVG rotating star with gradient ───────────────────────────────────────
function S04() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" style={{ animation: "s04 6s linear infinite" }}>
      <defs>
        <linearGradient id="s04g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e87461"><animate attributeName="stop-color" values="#e87461;#c084fc;#60a5fa;#e87461" dur="3s" repeatCount="indefinite" /></stop>
          <stop offset="100%" stopColor="#60a5fa"><animate attributeName="stop-color" values="#60a5fa;#e87461;#c084fc;#60a5fa" dur="3s" repeatCount="indefinite" /></stop>
        </linearGradient>
      </defs>
      <path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16.4l-6.4 4.8 2.4-7.2-6-4.8h7.6z" fill="url(#s04g)" />
      <style>{`@keyframes s04 { to{transform:rotate(360deg)} }`}</style>
    </svg>
  );
}

// ─── 5. Orbit dots ────────────────────────────────────────────────────────────
function S05() {
  return (
    <span className="relative inline-flex h-4 w-4 items-center justify-center">
      <span className="absolute h-1.5 w-1.5 rounded-full bg-rose-400" style={{ animation: "s05 1.6s linear infinite" }} />
      <span className="absolute h-1.5 w-1.5 rounded-full bg-violet-400" style={{ animation: "s05 1.6s linear -0.8s infinite" }} />
      <span className="absolute h-1 w-1 rounded-full bg-foreground/40" />
      <style>{`@keyframes s05 { 0%{transform:rotate(0deg) translateX(6px) scale(1)} 50%{transform:rotate(180deg) translateX(6px) scale(0.6)} 100%{transform:rotate(360deg) translateX(6px) scale(1)} }`}</style>
    </span>
  );
}

// ─── 6. Morphing blob ─────────────────────────────────────────────────────────
function S06() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24">
      <path fill="#c084fc" opacity="0.8">
        <animate
          attributeName="d"
          dur="3s"
          repeatCount="indefinite"
          values="M12,4 Q18,4 20,12 Q18,20 12,20 Q6,20 4,12 Q6,4 12,4Z;M12,2 Q20,6 22,12 Q20,18 12,22 Q4,18 2,12 Q4,6 12,2Z;M12,4 Q18,4 20,12 Q18,20 12,20 Q6,20 4,12 Q6,4 12,4Z"
        />
      </path>
    </svg>
  );
}

// ─── 7. Waveform bars ─────────────────────────────────────────────────────────
function S07() {
  return (
    <span className="inline-flex items-end gap-px h-3.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="w-[2px] rounded-full bg-current"
          style={{
            animation: `s07 1.2s ease-in-out ${i * 0.1}s infinite`,
            height: "40%",
          }}
        />
      ))}
      <style>{`@keyframes s07 { 0%,100%{height:40%} 50%{height:100%} }`}</style>
    </span>
  );
}

// ─── 8. DNA helix dots ────────────────────────────────────────────────────────
function S08() {
  return (
    <span className="inline-flex items-center gap-[3px]">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="flex flex-col gap-0.5">
          <span
            className="h-1 w-1 rounded-full bg-rose-400"
            style={{ animation: `s08a 1s ease-in-out ${i * 0.15}s infinite` }}
          />
          <span
            className="h-1 w-1 rounded-full bg-blue-400"
            style={{ animation: `s08b 1s ease-in-out ${i * 0.15}s infinite` }}
          />
        </span>
      ))}
      <style>{`
        @keyframes s08a { 0%,100%{transform:translateY(-2px);opacity:1} 50%{transform:translateY(2px);opacity:0.3} }
        @keyframes s08b { 0%,100%{transform:translateY(2px);opacity:0.3} 50%{transform:translateY(-2px);opacity:1} }
      `}</style>
    </span>
  );
}

// ─── 9. Ripple ring ───────────────────────────────────────────────────────────
function S09() {
  return (
    <span className="relative inline-flex h-4 w-4 items-center justify-center">
      <span className="absolute h-2 w-2 rounded-full bg-violet-400" />
      <span className="absolute h-full w-full rounded-full border border-violet-400" style={{ animation: "s09 1.5s ease-out infinite" }} />
      <span className="absolute h-full w-full rounded-full border border-violet-400" style={{ animation: "s09 1.5s ease-out 0.5s infinite" }} />
      <style>{`@keyframes s09 { 0%{transform:scale(0.5);opacity:1} 100%{transform:scale(2);opacity:0} }`}</style>
    </span>
  );
}

// ─── 10. Rotating diamond chain ───────────────────────────────────────────────
function S10() {
  return (
    <span className="inline-flex items-center gap-1" style={{ animation: "s10-container 3s linear infinite" }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-2 w-2 border border-current"
          style={{
            animation: `s10 1.6s ease-in-out ${i * 0.2}s infinite`,
            transform: "rotate(45deg)",
          }}
        />
      ))}
      <style>{`
        @keyframes s10 { 0%,100%{opacity:0.3;transform:rotate(45deg) scale(0.8)} 50%{opacity:1;transform:rotate(45deg) scale(1.2)} }
        @keyframes s10-container { 0%{filter:hue-rotate(0deg)} 100%{filter:hue-rotate(360deg)} }
      `}</style>
    </span>
  );
}

// ─── 11. SVG draw-in sparkle ──────────────────────────────────────────────────
function S11() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path
        d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
        style={{
          strokeDasharray: 60,
          animation: "s11 2s ease-in-out infinite",
        }}
      />
      <circle cx="12" cy="12" r="2" fill="currentColor" style={{ animation: "s11-dot 2s ease-in-out infinite" }} />
      <style>{`
        @keyframes s11 { 0%{stroke-dashoffset:60;opacity:0.3} 50%{stroke-dashoffset:0;opacity:1} 100%{stroke-dashoffset:-60;opacity:0.3} }
        @keyframes s11-dot { 0%,100%{transform:scale(0.8);opacity:0.5} 50%{transform:scale(1.2);opacity:1} }
      `}</style>
    </svg>
  );
}

// ─── 12. Breathing ring with inner glow ───────────────────────────────────────
function S12() {
  return (
    <span className="relative inline-flex h-4 w-4 items-center justify-center">
      <span
        className="absolute inset-0 rounded-full border-2 border-amber-400/60"
        style={{ animation: "s12-ring 2s ease-in-out infinite" }}
      />
      <span
        className="h-2 w-2 rounded-full bg-amber-400"
        style={{ animation: "s12-core 2s ease-in-out infinite", filter: "blur(1px)" }}
      />
      <style>{`
        @keyframes s12-ring { 0%,100%{transform:scale(0.8);opacity:0.4} 50%{transform:scale(1.2);opacity:1} }
        @keyframes s12-core { 0%,100%{transform:scale(1);opacity:0.6} 50%{transform:scale(0.6);opacity:1} }
      `}</style>
    </span>
  );
}

// ─── 13. Staggered cross ─────────────────────────────────────────────────────
function S13() {
  const arms = [
    { x: 0, y: -5 }, { x: 5, y: 0 }, { x: 0, y: 5 }, { x: -5, y: 0 },
    { x: -3.5, y: -3.5 }, { x: 3.5, y: -3.5 }, { x: 3.5, y: 3.5 }, { x: -3.5, y: 3.5 },
  ];
  return (
    <span className="relative inline-flex h-4 w-4 items-center justify-center">
      {arms.map((a, i) => (
        <span
          key={i}
          className="absolute h-1 w-1 rounded-full bg-current"
          style={{
            left: `calc(50% + ${a.x}px - 2px)`,
            top: `calc(50% + ${a.y}px - 2px)`,
            animation: `s13 1.6s ease-in-out ${i * 0.1}s infinite`,
          }}
        />
      ))}
      <style>{`@keyframes s13 { 0%,100%{opacity:0.2;transform:scale(0.5)} 50%{opacity:1;transform:scale(1.3)} }`}</style>
    </span>
  );
}

// ─── 14. Rotating gradient arc ────────────────────────────────────────────────
function S14() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" style={{ animation: "s14 1s linear infinite" }}>
      <defs>
        <linearGradient id="s14g">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="1" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="9" fill="none" stroke="url(#s14g)" strokeWidth="2" strokeLinecap="round" strokeDasharray="42 14" />
      <style>{`@keyframes s14 { to{transform:rotate(360deg)} }`}</style>
    </svg>
  );
}

// ─── 15. Layered spinning squares ─────────────────────────────────────────────
function S15() {
  return (
    <span className="relative inline-flex h-4 w-4 items-center justify-center">
      <span className="absolute h-3 w-3 border border-rose-400/60" style={{ animation: "s15a 3s linear infinite" }} />
      <span className="absolute h-2 w-2 border border-violet-400/60" style={{ animation: "s15b 2s linear infinite" }} />
      <style>{`
        @keyframes s15a { to{transform:rotate(360deg)} }
        @keyframes s15b { to{transform:rotate(-360deg)} }
      `}</style>
    </span>
  );
}

// ─── 16. Twinkling star field ─────────────────────────────────────────────────
function S16() {
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
            animation: `s16 1.8s ease-in-out ${s.s}s infinite`,
          }}
        >
          ✦
        </span>
      ))}
      <style>{`@keyframes s16 { 0%,100%{opacity:0.1;transform:scale(0.5)} 50%{opacity:1;transform:scale(1.2)} }`}</style>
    </span>
  );
}

// ─── 17. Canvas particle swirl ────────────────────────────────────────────────
function S17() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    const dpr = 2;
    c.width = 32; c.height = 32;
    const particles = Array.from({ length: 12 }, (_, i) => ({
      angle: (i / 12) * Math.PI * 2,
      r: 6 + Math.random() * 4,
      speed: 0.02 + Math.random() * 0.02,
      size: 1 + Math.random(),
      hue: (i / 12) * 360,
    }));
    let raf: number;
    const draw = () => {
      ctx.clearRect(0, 0, 32, 32);
      for (const p of particles) {
        p.angle += p.speed;
        const x = 16 + Math.cos(p.angle) * p.r;
        const y = 16 + Math.sin(p.angle) * p.r;
        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 70%, 65%, 0.8)`;
        ctx.fill();
        p.hue = (p.hue + 0.5) % 360;
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="h-4 w-4" />;
}

// ─── 18. Neon pulse ───────────────────────────────────────────────────────────
function S18() {
  return (
    <span
      className="inline-block text-sm"
      style={{
        animation: "s18 2s ease-in-out infinite",
        textShadow: "0 0 6px currentColor",
      }}
    >
      ✧
      <style>{`@keyframes s18 { 0%,100%{color:#e87461;text-shadow:0 0 4px #e87461} 33%{color:#c084fc;text-shadow:0 0 8px #c084fc} 66%{color:#60a5fa;text-shadow:0 0 4px #60a5fa} }`}</style>
    </span>
  );
}

// ─── 19. Pendulum wave ────────────────────────────────────────────────────────
function S19() {
  return (
    <span className="inline-flex items-center gap-[2px]">
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <span
          key={i}
          className="inline-block h-1 w-1 rounded-full bg-current"
          style={{ animation: `s19 1.4s ease-in-out ${i * 0.08}s infinite alternate` }}
        />
      ))}
      <style>{`@keyframes s19 { 0%{transform:translateY(-4px)} 100%{transform:translateY(4px)} }`}</style>
    </span>
  );
}

// ─── 20. Converging triangles ─────────────────────────────────────────────────
function S20() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24">
      <polygon points="12,2 14,6 10,6" fill="#e87461" style={{ animation: "s20a 2s ease-in-out infinite", transformOrigin: "12px 12px" }} />
      <polygon points="22,12 18,14 18,10" fill="#d4a054" style={{ animation: "s20b 2s ease-in-out infinite", transformOrigin: "12px 12px" }} />
      <polygon points="12,22 10,18 14,18" fill="#c084fc" style={{ animation: "s20c 2s ease-in-out infinite", transformOrigin: "12px 12px" }} />
      <polygon points="2,12 6,10 6,14" fill="#60a5fa" style={{ animation: "s20d 2s ease-in-out infinite", transformOrigin: "12px 12px" }} />
      <style>{`
        @keyframes s20a { 0%,100%{transform:translateY(0)} 50%{transform:translateY(3px)} }
        @keyframes s20b { 0%,100%{transform:translateX(0)} 50%{transform:translateX(-3px)} }
        @keyframes s20c { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-3px)} }
        @keyframes s20d { 0%,100%{transform:translateX(0)} 50%{transform:translateX(3px)} }
      `}</style>
    </svg>
  );
}

// ─── Showcase grid ────────────────────────────────────────────────────────────
const ALL: { name: string; C: React.FC }[] = [
  { name: "1. Hue-cycling ✦", C: S01 },
  { name: "2. Conic gradient dot", C: S02 },
  { name: "3. Breathing dots", C: S03 },
  { name: "4. Gradient star", C: S04 },
  { name: "5. Orbit dots", C: S05 },
  { name: "6. Morphing blob", C: S06 },
  { name: "7. Waveform bars", C: S07 },
  { name: "8. DNA helix", C: S08 },
  { name: "9. Ripple ring", C: S09 },
  { name: "10. Diamond chain", C: S10 },
  { name: "11. Draw-in sparkle", C: S11 },
  { name: "12. Breathing glow", C: S12 },
  { name: "13. Staggered cross", C: S13 },
  { name: "14. Gradient arc", C: S14 },
  { name: "15. Spinning squares", C: S15 },
  { name: "16. Twinkling field", C: S16 },
  { name: "17. Particle swirl", C: S17 },
  { name: "18. Neon pulse", C: S18 },
  { name: "19. Pendulum wave", C: S19 },
  { name: "20. Converging triangles", C: S20 },
];

// Fake typewriter for preview
function TypewriterPreview() {
  const words = ["Pondering", "Analyzing", "Searching", "Evaluating"];
  const [wordIdx, setWordIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const word = words[wordIdx];
    if (!deleting) {
      if (charIdx < word.length) {
        const id = setTimeout(() => setCharIdx((c) => c + 1), 60);
        return () => clearTimeout(id);
      }
      const id = setTimeout(() => setDeleting(true), 1400);
      return () => clearTimeout(id);
    }
    if (charIdx > 0) {
      const id = setTimeout(() => setCharIdx((c) => c - 1), 30);
      return () => clearTimeout(id);
    }
    setDeleting(false);
    setWordIdx((i) => (i + 1) % words.length);
  }, [wordIdx, charIdx, deleting]);

  return (
    <span className="min-w-[6ch] text-xs text-foreground/80">
      {words[wordIdx].slice(0, charIdx)}
      <span className="animate-pulse">|</span>
    </span>
  );
}

export function SparkleShowcase() {
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h2 className="text-lg font-semibold">Sparkle Indicators</h2>
        <p className="text-sm text-muted-foreground">
          Pick a sparkle to preview it in the button context below.
        </p>
      </div>

      {/* Grid of all 20 */}
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
        {ALL.map(({ name, C }, i) => (
          <button
            key={i}
            onClick={() => setSelected(i)}
            className={`flex flex-col items-center gap-2 rounded-lg border p-3 transition-colors ${
              selected === i
                ? "border-primary bg-primary/10"
                : "border-border/40 bg-muted/10 hover:border-border"
            }`}
          >
            <div className="flex h-8 items-center justify-center">
              <C />
            </div>
            <span className="text-[9px] leading-tight text-muted-foreground text-center">
              {name}
            </span>
          </button>
        ))}
      </div>

      {/* Live preview in button context */}
      <div className="rounded-lg border border-border/40 bg-muted/10 p-6">
        <p className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Button preview
        </p>
        <div className="flex items-center justify-center gap-4">
          {/* Idle state */}
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs text-foreground/80 shadow-sm backdrop-blur-md">
            Get recommendations
          </button>
          {/* Active state with selected sparkle */}
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs text-foreground/80 shadow-sm backdrop-blur-md">
            {selected !== null ? (
              <>
                {React.createElement(ALL[selected].C)}
                <TypewriterPreview />
              </>
            ) : (
              <>
                <S01 />
                <TypewriterPreview />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SparkleShowcase;
