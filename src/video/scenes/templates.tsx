/**
 * Reusable shot templates. The Storyboard agent picks one per shot and fills its props; code turns cue words
 * into `...AtMs` times (relative to the shot start). Every template follows the calm-motion rules in
 * docs/BRAND.md: pieces settle in once, then hold still, and only one thing moves for attention at a time.
 *
 * Layout: the series badge sits at y≈190 and captions at y≈1250, so the subject lives in y≈300–1180.
 * Images are paper cut-outs from the library (src/assets/images.ts); a drawn placeholder stands in when an
 * image is missing so a shot never fails to render.
 */
import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, random, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { useTheme } from "../primitives";
import type { SceneProps } from "./moon";

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

export type Mood = "night" | "day" | "warm" | "mint" | "coral" | "deep" | "lilac";
const MOODS: Record<Mood, [string, string]> = {
  night: ["#1C2752", "#34407A"],
  day: ["#8ECAE6", "#CDEBF6"],
  warm: ["#F4C77B", "#FBE3B8"],
  mint: ["#7FCBA4", "#C6EBD6"],
  coral: ["#FF8A80", "#FFC9B9"],
  deep: ["#0E1530", "#22306A"],
  lilac: ["#9B8FD9", "#D2CBF2"],
};
const DARK_MOODS: Mood[] = ["night", "deep"];

/** An image reference resolved by the spec builder: a library file, or null for a placeholder. */
export type ImageRef = { file: string | null; label: string };

const useFps = () => useVideoConfig().fps;
const f = (ms: unknown, fps: number) => Math.round(((typeof ms === "number" ? ms : 0) / 1000) * fps);
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const img = (v: unknown): ImageRef | null => {
  if (!v || typeof v !== "object") return null;
  const o = v as { file?: unknown; label?: unknown };
  return { file: typeof o.file === "string" ? o.file : null, label: str(o.label) };
};

/** Paper backdrop: a soft two-tone gradient with a few large, still paper scraps for texture. */
export const PaperBackdrop: React.FC<{ mood?: Mood; seed?: string }> = ({ mood = "day", seed = "bg" }) => {
  const [top, bottom] = MOODS[mood] ?? MOODS.day;
  const scraps = [0, 1, 2].map((i) => ({
    x: random(`${seed}-x${i}`) * 1080,
    y: 300 + random(`${seed}-y${i}`) * 1300,
    r: 260 + random(`${seed}-r${i}`) * 240,
    rot: random(`${seed}-o${i}`) * 360,
  }));
  return (
    <AbsoluteFill style={{ background: `linear-gradient(${top}, ${bottom})` }}>
      <svg viewBox="0 0 1080 1920" width={1080} height={1920} style={{ position: "absolute", inset: 0 }}>
        {scraps.map((s, i) => (
          <path
            key={i}
            transform={`translate(${s.x} ${s.y}) rotate(${s.rot})`}
            d={`M ${-s.r} 0 Q ${-s.r * 0.6} ${-s.r * 0.9} 0 ${-s.r * 0.7} Q ${s.r * 0.8} ${-s.r * 0.8} ${s.r} 0 Q ${s.r * 0.7} ${s.r * 0.8} 0 ${s.r * 0.75} Q ${-s.r * 0.8} ${s.r * 0.7} ${-s.r} 0 Z`}
            fill="#FFFFFF"
            opacity={DARK_MOODS.includes(mood) ? 0.05 : 0.18}
          />
        ))}
      </svg>
    </AbsoluteFill>
  );
};

type From = "pop" | "left" | "right" | "up" | "down" | "none";

/** One paper piece (HTML) with the theme's entrance and stop-motion wobble. Centered on (x, y). */
export const Piece: React.FC<{
  at?: number;
  from?: From;
  x: number;
  y: number;
  w?: number;
  rotate?: number;
  seed: string;
  shadow?: boolean;
  children: React.ReactNode;
}> = ({ at = 0, from = "pop", x, y, w, rotate = 0, seed, shadow = true, children }) => {
  const t = useTheme();
  const raw = useCurrentFrame();
  const frame = Math.floor(raw / t.hold) * t.hold;
  const p = interpolate(frame - at, [0, 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.back(t.motion.overshoot)),
  });
  if (from !== "none" && p <= 0.001) return null;
  const tick = Math.floor(raw / t.motion.jitterEvery);
  const jr = (random(`${seed}-r-${tick}`) - 0.5) * 2 * t.motion.jitterDeg;
  const jx = (random(`${seed}-x-${tick}`) - 0.5) * 2 * t.motion.jitterPx;
  const jy = (random(`${seed}-y-${tick}`) - 0.5) * 2 * t.motion.jitterPx;
  const inv = from === "none" ? 0 : 1 - Math.min(p, 1.2);
  const dist = 1000;
  const dx = from === "left" ? -dist * inv : from === "right" ? dist * inv : 0;
  const dy = from === "up" ? -dist * inv : from === "down" ? dist * inv : 0;
  const s = from === "pop" ? Math.max(p, 0) : 1;
  const tilt = from !== "pop" && from !== "none" ? inv * t.motion.slideTilt : 0;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        transform: `translate(-50%, -50%) translate(${dx + jx}px, ${dy + jy}px) rotate(${rotate + jr + tilt}deg) scale(${s})`,
        filter: shadow ? "drop-shadow(10px 14px 4px rgba(0,0,0,0.38))" : undefined,
      }}
    >
      {children}
    </div>
  );
};

/** A library cut-out, or a drawn paper placeholder with the subject's name. */
export const Cutout: React.FC<{ image: ImageRef | null; size: number }> = ({ image, size }) => {
  const t = useTheme();
  if (image?.file) {
    return <Img src={staticFile(image.file)} style={{ width: size, height: size, objectFit: "contain", display: "block" }} />;
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: t.colors.accent,
        border: `12px solid ${t.colors.paperWhite}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        boxSizing: "border-box",
        padding: size * 0.12,
        fontFamily: t.badge.font,
        fontSize: Math.max(28, size * 0.12),
        color: t.colors.ink,
        lineHeight: 1.05,
      }}
    >
      {image?.label ?? "?"}
    </div>
  );
};

/** White paper card with ink text. */
export const Card: React.FC<{ children: React.ReactNode; size?: number; maxWidth?: number; color?: string; bg?: string }> = ({
  children,
  size = 64,
  maxWidth = 900,
  color,
  bg,
}) => {
  const t = useTheme();
  return (
    <div
      style={{
        background: bg ?? t.colors.paperWhite,
        color: color ?? t.colors.ink,
        fontFamily: t.badge.font,
        fontSize: size,
        lineHeight: 1.08,
        padding: `${size * 0.32}px ${size * 0.5}px`,
        borderRadius: 26,
        maxWidth,
        textAlign: "center",
        width: "max-content",
      }}
    >
      {children}
    </div>
  );
};

/** Slow push-in over the shot (theme-limited). */
const Push: React.FC<{ dur: number; children: React.ReactNode }> = ({ dur, children }) => {
  const t = useTheme();
  const frame = useCurrentFrame();
  const held = Math.floor(frame / t.hold) * t.hold;
  const s = interpolate(held, [0, Math.max(dur, 1)], [1, t.motion.cameraZoom], { extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ transform: `scale(${s})`, transformOrigin: "540px 740px" }}>{children}</AbsoluteFill>;
};

const Shot: React.FC<{ dur: number; mood: Mood; seed: string; children: React.ReactNode }> = ({ dur, mood, seed, children }) => (
  <AbsoluteFill>
    <PaperBackdrop mood={mood} seed={seed} />
    <Push dur={dur}>{children}</Push>
  </AbsoluteFill>
);

const moodOf = (p: Record<string, unknown>, d: Mood = "day"): Mood => (Object.keys(MOODS).includes(str(p.mood)) ? (p.mood as Mood) : d);

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

/** hero: one big subject, an optional label card that drops in on a cue word. */
const Hero: React.FC<SceneProps> = ({ dur, props = {} }) => {
  const fps = useFps();
  const label = str(props.label);
  return (
    <Shot dur={dur} mood={moodOf(props)} seed={`hero-${label}`}>
      <Piece seed="hero" x={540} y={label ? 700 : 760} at={0}>
        <Cutout image={img(props.image)} size={760} />
      </Piece>
      {label && (
        <Piece seed="hero-label" x={540} y={1130} at={f(props.labelAtMs, fps)} from="up" rotate={-1.5}>
          <Card size={68}>{label}</Card>
        </Piece>
      )}
    </Shot>
  );
};

/** title: the hook question on a big card, with the subject above it. */
const Title: React.FC<SceneProps> = ({ dur, props = {} }) => {
  const fps = useFps();
  return (
    <Shot dur={dur} mood={moodOf(props, "night")} seed="title">
      <Piece seed="title-img" x={540} y={620} at={0}>
        <Cutout image={img(props.image)} size={620} />
      </Piece>
      <Piece seed="title-card" x={540} y={1060} at={f(props.textAtMs, fps)} from="down" rotate={1.2}>
        <Card size={78} maxWidth={940}>
          {str(props.text)}
        </Card>
      </Piece>
    </Shot>
  );
};

/** big-number: a counter that runs up to a value on a cue word, with a unit card and an optional icon. */
const BigNumber: React.FC<SceneProps> = ({ dur, props = {} }) => {
  const t = useTheme();
  const fps = useFps();
  const frame = useCurrentFrame();
  const held = Math.floor(frame / t.hold) * t.hold;
  const start = f(props.countAtMs, fps);
  const value = num(props.value);
  const from = num(props.from);
  const decimals = num(props.decimals);
  const p = interpolate(held, [start, start + Math.round(fps * 1.1)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const shown = from + (value - from) * p;
  const text = `${str(props.prefix)}${shown.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${str(props.suffix)}`;
  const icon = img(props.image);
  return (
    <Shot dur={dur} mood={moodOf(props, "warm")} seed="num">
      {icon && (
        <Piece seed="num-icon" x={540} y={520} at={0}>
          <Cutout image={icon} size={440} />
        </Piece>
      )}
      <Piece seed="num-value" x={540} y={icon ? 880 : 720} at={Math.max(0, start - 4)}>
        <Card size={text.length > 9 ? 120 : 160} bg={t.colors.accent}>
          {text}
        </Card>
      </Piece>
      {str(props.unit) && (
        <Piece seed="num-unit" x={540} y={icon ? 1090 : 960} at={start + Math.round(fps * 1.1)} from="up" rotate={-1}>
          <Card size={60}>{str(props.unit)}</Card>
        </Piece>
      )}
    </Shot>
  );
};

/** compare: two subjects side by side (or stacked); the second arrives on its cue word. */
const Compare: React.FC<SceneProps> = ({ dur, props = {} }) => {
  const t = useTheme();
  const fps = useFps();
  const a = img(props.left);
  const b = img(props.right);
  const stacked = props.layout === "stacked";
  const second = f(props.rightAtMs, fps);
  const pos = stacked
    ? [
        { x: 540, y: 480, lx: 540, ly: 720 },
        { x: 540, y: 900, lx: 540, ly: 1140 },
      ]
    : [
        { x: 290, y: 680, lx: 290, ly: 990 },
        { x: 790, y: 680, lx: 790, ly: 990 },
      ];
  const size = stacked ? 380 : 440;
  return (
    <Shot dur={dur} mood={moodOf(props, "mint")} seed="cmp">
      <Piece seed="cmp-a" x={pos[0].x} y={pos[0].y} at={0} from={stacked ? "up" : "left"}>
        <Cutout image={a} size={size} />
      </Piece>
      <Piece seed="cmp-al" x={pos[0].lx} y={pos[0].ly} at={4} rotate={-1.5}>
        <Card size={52} maxWidth={470}>
          {a?.label}
        </Card>
      </Piece>
      <Piece seed="cmp-vs" x={540} y={stacked ? 690 : 680} at={second} shadow={false}>
        <Card size={50} bg={t.colors.accent2} color={t.colors.paperWhite}>
          {str(props.joiner, "vs")}
        </Card>
      </Piece>
      <Piece seed="cmp-b" x={pos[1].x} y={pos[1].y} at={second} from={stacked ? "down" : "right"}>
        <Cutout image={b} size={size} />
      </Piece>
      <Piece seed="cmp-bl" x={pos[1].lx} y={pos[1].ly} at={second + 4} rotate={1.5}>
        <Card size={52} maxWidth={470}>
          {b?.label}
        </Card>
      </Piece>
    </Shot>
  );
};

/** scale: a tiny subject next to a huge one, then a card with the ratio. */
const Scale: React.FC<SceneProps> = ({ dur, props = {} }) => {
  const fps = useFps();
  const big = img(props.big);
  const small = img(props.small);
  return (
    <Shot dur={dur} mood={moodOf(props, "deep")} seed="scale">
      <Piece seed="scale-big" x={600} y={730} at={0}>
        <Cutout image={big} size={780} />
      </Piece>
      <Piece seed="scale-small" x={150} y={1040} at={f(props.smallAtMs, fps)}>
        <Cutout image={small} size={Math.max(40, Math.min(220, num(props.smallSize, 90)))} />
      </Piece>
      {str(props.ratio) && (
        <Piece seed="scale-ratio" x={540} y={1150} at={f(props.ratioAtMs, fps)} from="down" rotate={-1}>
          <Card size={64}>{str(props.ratio)}</Card>
        </Piece>
      )}
    </Shot>
  );
};

/** list: 2–4 short cards that drop in one by one on cue words, under an optional heading and icon. */
const List: React.FC<SceneProps> = ({ dur, props = {} }) => {
  const t = useTheme();
  const fps = useFps();
  const items = (Array.isArray(props.items) ? props.items : []).slice(0, 4) as { text?: unknown; atMs?: unknown }[];
  const icon = img(props.image);
  const heading = str(props.heading);
  const top = icon ? 700 : heading ? 600 : 480;
  const gap = items.length > 3 ? 150 : 175;
  return (
    <Shot dur={dur} mood={moodOf(props, "lilac")} seed="list">
      {icon && (
        <Piece seed="list-icon" x={540} y={460} at={0}>
          <Cutout image={icon} size={300} />
        </Piece>
      )}
      {heading && !icon && (
        <Piece seed="list-h" x={540} y={420} at={0} rotate={-1}>
          <Card size={64} bg={t.colors.accent}>
            {heading}
          </Card>
        </Piece>
      )}
      {items.map((it, i) => (
        <Piece key={i} seed={`list-${i}`} x={540} y={top + i * gap} at={f(it.atMs, fps)} from={i % 2 ? "right" : "left"} rotate={i % 2 ? 1 : -1}>
          <Card size={58} maxWidth={920}>
            {str(it.text)}
          </Card>
        </Piece>
      ))}
    </Shot>
  );
};

/** arrows: a subject with paper arrows pointing in (forces, inputs) or out (outputs), with labels. */
const Arrows: React.FC<SceneProps> = ({ dur, props = {} }) => {
  const t = useTheme();
  const fps = useFps();
  const labels = (Array.isArray(props.labels) ? props.labels : []).slice(0, 4).map((l) => str(l));
  const n = Math.max(labels.length, num(props.count, 4));
  const inward = props.direction !== "out";
  const at = f(props.arrowsAtMs, fps);
  const cx = 540;
  const cy = 750;
  return (
    <Shot dur={dur} mood={moodOf(props, "night")} seed="arrows">
      <Piece seed="arr-c" x={cx} y={cy} at={0}>
        <Cutout image={img(props.image)} size={460} />
      </Piece>
      {new Array(n).fill(0).map((_, i) => {
        const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
        const r = 360;
        const x = cx + Math.cos(ang) * r;
        const y = cy + Math.sin(ang) * r * 0.85;
        const rot = (ang * 180) / Math.PI + (inward ? 180 : 0);
        return (
          <React.Fragment key={i}>
            <Piece seed={`arr-${i}`} x={x} y={y} at={at + i * 3} rotate={rot}>
              <svg width={170} height={90} viewBox="0 0 170 90">
                <path d="M 8 30 L 110 30 L 110 8 L 162 45 L 110 82 L 110 60 L 8 60 Z" fill={t.colors.accent2} stroke={t.colors.paperWhite} strokeWidth={8} strokeLinejoin="round" paintOrder="stroke" />
              </svg>
            </Piece>
            {labels[i] && (
              <Piece seed={`arr-l-${i}`} x={cx + Math.cos(ang) * (r + 10)} y={cy + Math.sin(ang) * (r * 0.85) + (Math.sin(ang) > 0.3 ? 95 : Math.sin(ang) < -0.3 ? -95 : 80)} at={at + i * 3 + 4}>
                <Card size={42} maxWidth={360}>
                  {labels[i]}
                </Card>
              </Piece>
            )}
          </React.Fragment>
        );
      })}
    </Shot>
  );
};

/** progress: a paper track from A to B; the subject travels along it between two cue words. */
const Progress: React.FC<SceneProps> = ({ dur, props = {} }) => {
  const t = useTheme();
  const fps = useFps();
  const frame = useCurrentFrame();
  const held = Math.floor(frame / t.hold) * t.hold;
  const start = f(props.moveAtMs, fps);
  const end = Math.max(start + fps, f(props.arriveAtMs, fps) || start + fps * 2);
  const p = interpolate(held, [start, end], [0, num(props.fraction, 1)], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });
  const x0 = 210;
  const x1 = 870;
  const y = 760;
  return (
    <Shot dur={dur} mood={moodOf(props, "warm")} seed="prog">
      <Piece seed="prog-track" x={540} y={y + 90} at={0} shadow>
        <div style={{ width: x1 - x0 + 60, height: 46, borderRadius: 23, background: t.colors.paperWhite, position: "relative" }}>
          <div style={{ position: "absolute", left: 8, top: 8, height: 30, borderRadius: 15, width: `${p * (x1 - x0 + 44)}px`, background: t.colors.accent2 }} />
        </div>
      </Piece>
      <Piece seed="prog-a" x={x0} y={y + 210} at={2} rotate={-2}>
        <Card size={46} maxWidth={340}>
          {str(props.fromLabel)}
        </Card>
      </Piece>
      <Piece seed="prog-b" x={x1} y={y + 210} at={4} rotate={2}>
        <Card size={46} maxWidth={340}>
          {str(props.toLabel)}
        </Card>
      </Piece>
      <Piece seed="prog-m" x={x0 + p * (x1 - x0)} y={y - 120} at={0} from="none">
        <Cutout image={img(props.image)} size={260} />
      </Piece>
      {str(props.valueText) && (
        <Piece seed="prog-v" x={540} y={420} at={end} from="up" rotate={-1}>
          <Card size={72} bg={t.colors.accent}>
            {str(props.valueText)}
          </Card>
        </Piece>
      )}
    </Shot>
  );
};

/** fact: one short statement on a big card, with a small subject and an optional source chip. */
const Fact: React.FC<SceneProps> = ({ dur, props = {} }) => {
  const t = useTheme();
  const fps = useFps();
  const icon = img(props.image);
  return (
    <Shot dur={dur} mood={moodOf(props, "coral")} seed="fact">
      {icon && (
        <Piece seed="fact-icon" x={540} y={500} at={0}>
          <Cutout image={icon} size={420} />
        </Piece>
      )}
      <Piece seed="fact-card" x={540} y={icon ? 920 : 760} at={f(props.textAtMs, fps)} from="down" rotate={-1}>
        <Card size={66} maxWidth={940}>
          {str(props.text)}
        </Card>
      </Piece>
      {str(props.source) && (
        <Piece seed="fact-src" x={540} y={icon ? 1120 : 960} at={f(props.textAtMs, fps) + 8} shadow={false}>
          <Card size={34} bg={t.colors.ink} color={t.colors.paperWhite}>
            {str(props.source)}
          </Card>
        </Piece>
      )}
    </Shot>
  );
};

/** count: many copies of a subject filling a grid, for "how many" and funny-unit moments. */
const Count: React.FC<SceneProps> = ({ dur, props = {} }) => {
  const t = useTheme();
  const fps = useFps();
  const frame = useCurrentFrame();
  const held = Math.floor(frame / t.hold) * t.hold;
  const shownMax = Math.max(1, Math.min(48, num(props.shown, 24)));
  const cols = shownMax > 30 ? 8 : shownMax > 12 ? 6 : 4;
  const cell = 900 / cols;
  const start = f(props.fillAtMs, fps);
  const visible = Math.round(interpolate(held, [start, start + fps * 1.2], [1, shownMax], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const image = img(props.image);
  return (
    <Shot dur={dur} mood={moodOf(props, "mint")} seed="count">
      {new Array(visible).fill(0).map((_, i) => (
        <Piece key={i} seed={`c-${i}`} x={90 + cell / 2 + (i % cols) * cell} y={330 + cell / 2 + Math.floor(i / cols) * cell} at={i === 0 ? 0 : start} from="none" shadow={false}>
          <Cutout image={image} size={cell * 0.86} />
        </Piece>
      ))}
      {str(props.label) && (
        <Piece seed="count-l" x={540} y={1150} at={start + Math.round(fps * 1.2)} from="down" rotate={1}>
          <Card size={66} bg={t.colors.accent}>
            {str(props.label)}
          </Card>
        </Piece>
      )}
    </Shot>
  );
};

/** Template name -> component. The Storyboard agent's schema lists the same names (storyboard.ts). */
export const TEMPLATE_SCENES: Record<string, React.FC<SceneProps>> = {
  hero: Hero,
  title: Title,
  "big-number": BigNumber,
  compare: Compare,
  scale: Scale,
  list: List,
  arrows: Arrows,
  progress: Progress,
  fact: Fact,
  count: Count,
};
