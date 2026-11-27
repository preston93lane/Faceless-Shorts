import React, { createContext, useContext } from "react";
import { Easing, Img, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { THEMES, type Role, type Theme } from "./themes";
import type { ThemeId } from "./types";

// ---------------------------------------------------------------------------
// Theme context
// ---------------------------------------------------------------------------

const ThemeCtx = createContext<Theme>(THEMES.neon);
export const ThemeProvider: React.FC<{ theme: ThemeId; children: React.ReactNode }> = ({ theme, children }) => (
  <ThemeCtx.Provider value={THEMES[theme]}>{children}</ThemeCtx.Provider>
);
export const useTheme = () => useContext(ThemeCtx);

/** Current frame, quantized for themes that animate "on twos" (stop-motion feel). */
export function useStyledFrame(): number {
  const frame = useCurrentFrame();
  const { hold } = useTheme();
  return Math.floor(frame / hold) * hold;
}

// ---------------------------------------------------------------------------
// Global SVG defs (filters + chalk hatch patterns). Rendered once per video.
// ---------------------------------------------------------------------------

const HATCH_ROLES: Role[] = [
  "moon", "moonShade", "ocean", "land", "sea", "seaDeep", "sand", "hill", "hill2", "house",
  "roof", "window", "tree", "sun", "snow", "accent", "accent2", "star", "paperWhite",
];

export const ThemeDefs: React.FC = () => {
  const t = useTheme();
  return (
    <svg width={0} height={0} style={{ position: "absolute" }}>
      <defs>
        {/* Flat neon: soft colored glow */}
        <filter id="fx-neon" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="14" result="blur" />
          <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.75 0" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Paper cutout: drop shadow only. The white cut edge is a stroke from usePaint()
            (an SVG dilate filter looked the same but made renders ~3x slower). Paper grain is a
            static texture overlay (PaperGrain). */}
        <filter id="fx-paper" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="10" dy="14" stdDeviation="4" floodColor="#000000" floodOpacity="0.38" />
        </filter>

        {/* Chalk: roughened edges + speckled texture */}
        <filter id="fx-chalk" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="3" result="warp" />
          <feDisplacementMap in="SourceGraphic" in2="warp" scale="7" xChannelSelector="R" yChannelSelector="G" result="rough" />
          <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="1" seed="9" result="grain" />
          <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  3 0 0 0 -0.85" result="speckle" />
          <feComposite in="rough" in2="speckle" operator="in" />
        </filter>

        {/* Chalkboard smudges */}
        <filter id="fx-chalk-bg">
          <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="21" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.35 0 0 0 -0.12" />
        </filter>

        {HATCH_ROLES.map((r) => (
          <pattern key={r} id={`hatch-${r}`} width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
            <line x1="0" y1="0" x2="0" y2="18" stroke={t.colors[r]} strokeWidth="5" />
          </pattern>
        ))}
      </defs>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Thing: one animated object. Applies the theme's entrance motion + surface filter.
// ---------------------------------------------------------------------------

type ThingCtxValue = { progress: number };
const ThingCtx = createContext<ThingCtxValue>({ progress: 1 });

export type Entrance = "pop" | "left" | "right" | "up" | "down" | "none";

export const Thing: React.FC<{
  /** Frame (relative to the scene) at which the object enters. */
  at?: number;
  from?: Entrance;
  x?: number;
  y?: number;
  scale?: number;
  rotate?: number;
  /** Seed so each object jitters differently in the paper theme. */
  seed?: string;
  /** Skip the surface filter (e.g. for tiny particles). */
  plain?: boolean;
  opacity?: number;
  children: React.ReactNode;
}> = ({ at = 0, from = "pop", x = 0, y = 0, scale = 1, rotate = 0, seed = "thing", plain = false, opacity = 1, children }) => {
  const t = useTheme();
  const rawFrame = useCurrentFrame();
  const frame = Math.floor(rawFrame / t.hold) * t.hold;
  const { fps } = useVideoConfig();
  const f = frame - at;

  let progress: number;
  let dx = 0;
  let dy = 0;
  let s = 1;
  let r = 0;

  if (t.id === "chalk") {
    progress = interpolate(f, [0, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });
  } else if (t.id === "neon") {
    progress = spring({ frame: f, fps, config: { damping: 12, mass: 0.7, stiffness: 140 } });
    if (from === "pop") s = Math.max(progress, 0);
  } else {
    progress = interpolate(f, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.back(t.motion.overshoot)) });
    if (from === "pop") s = Math.max(progress, 0);
    // stop-motion jitter, changes every held frame
    const tick = Math.floor(rawFrame / t.motion.jitterEvery);
    r = (random(`${seed}-r-${tick}`) - 0.5) * 2 * t.motion.jitterDeg;
    dx = (random(`${seed}-x-${tick}`) - 0.5) * 2 * t.motion.jitterPx;
    dy = (random(`${seed}-y-${tick}`) - 0.5) * 2 * t.motion.jitterPx;
  }

  if (t.id !== "chalk") {
    const dist = 900;
    const inv = 1 - Math.min(Math.max(progress, 0), 1.2);
    if (from === "left") dx -= dist * inv;
    if (from === "right") dx += dist * inv;
    if (from === "up") dy -= dist * inv;
    if (from === "down") dy += dist * inv;
    if (from !== "pop" && from !== "none") r += inv * t.motion.slideTilt;
  }

  const visible = t.id === "chalk" ? f >= 0 : progress > 0.001 || from === "none";
  if (!visible) return null;

  const filter = plain ? undefined : t.id === "neon" ? "url(#fx-neon)" : t.id === "paper" ? "url(#fx-paper)" : "url(#fx-chalk)";
  return (
    <ThingCtx.Provider value={{ progress: from === "none" ? 1 : progress }}>
      <g transform={`translate(${x + dx} ${y + dy}) rotate(${rotate + r}) scale(${scale * s})`} filter={filter} opacity={opacity}>
        {children}
      </g>
    </ThingCtx.Provider>
  );
};

/**
 * Returns SVG paint props for a semantic role.
 * Neon/paper: solid fills. Chalk: drawn-on outline + hatched fill that fades in after the stroke.
 */
export function usePaint() {
  const t = useTheme();
  const { progress } = useContext(ThingCtx);
  return (role: Role, opts: { strokeOnly?: boolean; width?: number } = {}) => {
    const color = t.colors[role];
    if (t.id === "chalk") {
      const p = Math.min(Math.max(progress, 0), 1);
      return {
        fill: opts.strokeOnly ? "none" : `url(#hatch-${role})`,
        fillOpacity: opts.strokeOnly ? 0 : interpolate(p, [0.55, 1], [0, 0.55], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        stroke: color,
        strokeWidth: opts.width ?? 8,
        strokeLinecap: "round" as const,
        strokeLinejoin: "round" as const,
        pathLength: 1,
        strokeDasharray: "1 1",
        strokeDashoffset: 1 - p,
      };
    }
    if (opts.strokeOnly) {
      return { fill: "none", stroke: color, strokeWidth: opts.width ?? 8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
    }
    if (t.id === "paper") {
      // White cut edge around every paper piece, drawn behind the fill.
      return { fill: color, stroke: t.colors.paperWhite, strokeWidth: 12, strokeLinejoin: "round" as const, paintOrder: "stroke" };
    }
    return { fill: color, stroke: "none" };
  };
}

// ---------------------------------------------------------------------------
// Backdrop + camera
// ---------------------------------------------------------------------------

export const Backdrop: React.FC<{ mood: "night" | "day"; darken?: number }> = ({ mood, darken = 0 }) => {
  const t = useTheme();
  const [top, bottom] = mood === "night" ? t.night : t.day;
  return (
    <svg viewBox="0 0 1080 1920" width={1080} height={1920} style={{ position: "absolute", inset: 0 }}>
      <defs>
        <linearGradient id={`bg-${mood}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="1" stopColor={bottom} />
        </linearGradient>
        <radialGradient id="vignette" cx="0.5" cy="0.45" r="0.75">
          <stop offset="0.55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.45" />
        </radialGradient>
      </defs>
      <rect width="1080" height="1920" fill={`url(#bg-${mood})`} />
      {t.id === "chalk" && <rect width="1080" height="1920" filter="url(#fx-chalk-bg)" />}
      {t.id !== "paper" && <rect width="1080" height="1920" fill="url(#vignette)" />}
      {darken > 0 && <rect width="1080" height="1920" fill="#000" opacity={darken} />}
    </svg>
  );
};

/** Whole-frame paper texture (multiply). Static image, so it costs almost nothing per frame. */
export const PaperGrain: React.FC = () => {
  const t = useTheme();
  if (t.id !== "paper") return null;
  return (
    <Img
      src={staticFile("textures/paper-grain.jpg")}
      style={{ position: "absolute", inset: 0, width: 1080, height: 1920, mixBlendMode: "multiply", opacity: 0.85 }}
    />
  );
};

/** Slow push-in over the scene, for a sense of motion even on static moments. */
export const Camera: React.FC<{ durationInFrames: number; from?: number; /** Defaults to the theme zoom. */ to?: number; children: React.ReactNode }> = ({
  durationInFrames,
  from = 1,
  to,
  children,
}) => {
  const frame = useStyledFrame();
  const t = useTheme();
  const s = interpolate(frame, [0, durationInFrames], [from, to ?? t.motion.cameraZoom], { extrapolateRight: "clamp" });
  return (
    <svg viewBox="0 0 1080 1920" width={1080} height={1920} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      <g transform={`translate(540 760) scale(${s}) translate(-540 -760)`}>{children}</g>
    </svg>
  );
};

/** Twinkling star field. */
export const Stars: React.FC<{ count?: number; brightness?: number; area?: [number, number] }> = ({ count = 44, brightness = 1, area = [120, 1150] }) => {
  const frame = useStyledFrame();
  const t = useTheme();
  return (
    <g>
      {new Array(count).fill(0).map((_, i) => {
        const x = random(`sx${i}`) * 1080;
        const y = area[0] + random(`sy${i}`) * (area[1] - area[0]);
        const r = 2 + random(`sr${i}`) * 4;
        const tw = 0.55 + 0.45 * Math.sin(frame / (6 + random(`sp${i}`) * 10) + i);
        const op = Math.min(1, tw * brightness);
        if (t.id === "chalk") {
          return (
            <g key={i} opacity={op} transform={`translate(${x} ${y})`} stroke={t.colors.star} strokeWidth={3} strokeLinecap="round">
              <line x1={-r * 1.6} y1={0} x2={r * 1.6} y2={0} />
              <line x1={0} y1={-r * 1.6} x2={0} y2={r * 1.6} />
            </g>
          );
        }
        return <circle key={i} cx={x} cy={y} r={r} fill={t.colors.star} opacity={op} />;
      })}
    </g>
  );
};
