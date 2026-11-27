/**
 * Scenes for Pilot 01, "What if you jumped into a hole through the Earth?".
 * One cut-open Earth (crust, mantle, outer core, inner core) with a tunnel, and a small paper traveler.
 * Calm-motion rule (docs/BRAND.md): one thing moves for attention at a time; cue times come from
 * word timings in the spec (props.*AtMs, relative to the scene start).
 */
import React from "react";
import { Easing, interpolate, useVideoConfig } from "remotion";
import { Backdrop, Camera, Stars, Thing, usePaint, useStyledFrame, useTheme } from "../primitives";
import { Label, type SceneProps } from "./moon";

/** Earth center and radius, shared by every scene so cuts between scenes line up. */
const C = { x: 540, y: 800 };
const R = 340;
const TUNNEL = 36; // half-width
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

function useCue(props: SceneProps["props"]) {
  const { fps } = useVideoConfig();
  return (name: string, fallbackMs: number) => Math.round((Number(props?.[name] ?? fallbackMs) / 1000) * fps);
}

// ---------------------------------------------------------------------------
// Drawings
// ---------------------------------------------------------------------------

/** Earth cut in half like a cake. `tunnel`: vertical tunnel through the center; `chord`: a straight tunnel between two surface points (angles in degrees from the top). */
const CutEarth: React.FC<{ id: string; tunnel?: boolean; chord?: [number, number]; chordReveal?: number }> = ({
  id,
  tunnel = true,
  chord,
  chordReveal = 1,
}) => {
  const p = usePaint();
  const t = useTheme();
  const pt = (deg: number, r = R) => [Math.sin((deg * Math.PI) / 180) * r, -Math.cos((deg * Math.PI) / 180) * r] as const;
  return (
    <g>
      <defs>
        <clipPath id={`crust-${id}`}>
          <circle r={R} />
        </clipPath>
      </defs>
      {/* Crust: ocean with land patches, visible as a ring around the cut face */}
      <circle r={R} {...p("ocean")} />
      <g clipPath={`url(#crust-${id})`}>
        {[0, 70, 150, 215, 290].map((a, i) => {
          const [x, y] = pt(a, R);
          return <ellipse key={i} cx={x} cy={y} rx={90 + (i % 2) * 40} ry={60} transform={`rotate(${a} ${x} ${y})`} fill={t.colors.land} />;
        })}
      </g>
      <circle r={R * 0.86} {...p("mantle")} />
      <circle r={R * 0.55} {...p("outerCore")} />
      <circle r={R * 0.2} {...p("innerCore")} />
      {tunnel && <rect x={-TUNNEL} y={-R - 8} width={TUNNEL * 2} height={R * 2 + 16} rx={10} {...p("tunnel")} />}
      {chord && (() => {
        const [x1, y1] = pt(chord[0]);
        const [x2, y2] = pt(chord[1]);
        const xe = x1 + (x2 - x1) * chordReveal;
        const ye = y1 + (y2 - y1) * chordReveal;
        return (
          <g>
            <line x1={x1} y1={y1} x2={xe} y2={ye} stroke={t.colors.paperWhite} strokeWidth={TUNNEL * 2 + 12} strokeLinecap="round" />
            <line x1={x1} y1={y1} x2={xe} y2={ye} stroke={t.colors.tunnel} strokeWidth={TUNNEL * 2 - 12} strokeLinecap="round" />
          </g>
        );
      })()}
    </g>
  );
};

/** A small paper traveler. Origin at the feet; about 140 px tall. */
const Traveler: React.FC<{ arms?: "down" | "up" | "wave" }> = ({ arms = "down" }) => {
  const p = usePaint();
  const arm = (side: 1 | -1) => {
    const end = arms === "up" ? [side * 44, -132] : arms === "wave" && side === 1 ? [48, -128] : [side * 40, -48];
    return <line key={side} x1={side * 20} y1={-84} x2={end[0]} y2={end[1]} {...p("figure", { strokeOnly: true, width: 14 })} />;
  };
  return (
    <g>
      {arm(-1)}
      {arm(1)}
      <rect x={-19} y={-46} width={15} height={46} rx={7} {...p("figure")} />
      <rect x={4} y={-46} width={15} height={46} rx={7} {...p("figure")} />
      <rect x={-25} y={-96} width={50} height={58} rx={20} {...p("figure")} />
      <circle cy={-120} r={25} {...p("skin")} />
    </g>
  );
};

/** White paper card with ink text. */
const Card: React.FC<{ w: number; h: number; text: string; size?: number; sub?: string }> = ({ w, h, text, size = 72, sub }) => {
  const t = useTheme();
  return (
    <g>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={8} fill={t.colors.paperWhite} />
      <text
        y={sub ? -h * 0.12 : 4}
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily={t.caption.font}
        fontWeight={t.caption.weight}
        fontSize={size}
        fill={t.colors.ink}
      >
        {text}
      </text>
      {sub && (
        <text y={h * 0.27} textAnchor="middle" dominantBaseline="middle" fontFamily={t.caption.font} fontWeight={t.caption.weight} fontSize={size * 0.45} fill={t.colors.accent2}>
          {sub}
        </text>
      )}
    </g>
  );
};

/** Stopwatch face. `minutes` sets the hand (the dial is one hour). */
const Stopwatch: React.FC<{ r: number; minutes: number }> = ({ r, minutes }) => {
  const p = usePaint();
  const t = useTheme();
  const a = (Math.min(minutes, 59.9) / 60) * Math.PI * 2;
  const rr = r * 0.82;
  const wedge = `M 0 0 L 0 ${-rr} A ${rr} ${rr} 0 ${a > Math.PI ? 1 : 0} 1 ${Math.sin(a) * rr} ${-Math.cos(a) * rr} Z`;
  return (
    <g>
      <rect x={-r * 0.16} y={-r * 1.28} width={r * 0.32} height={r * 0.3} rx={6} {...p("accent2")} />
      <circle r={r} {...p("paperWhite")} />
      <circle r={r} fill="none" stroke={t.colors.ink} strokeWidth={10} />
      {minutes > 0.2 && <path d={wedge} fill={t.colors.accent} opacity={0.85} />}
      {new Array(12).fill(0).map((_, i) => (
        <line key={i} x1={0} y1={-r * 0.86} x2={0} y2={-r * 0.72} stroke={t.colors.ink} strokeWidth={8} strokeLinecap="round" transform={`rotate(${i * 30})`} />
      ))}
      <line x1={0} y1={0} x2={Math.sin(a) * rr * 0.95} y2={-Math.cos(a) * rr * 0.95} stroke={t.colors.accent2} strokeWidth={12} strokeLinecap="round" />
      <circle r={14} fill={t.colors.ink} />
    </g>
  );
};

/** Outward arrow, length `len`, pointing along +x. */
const Arrow: React.FC<{ len: number }> = ({ len }) => {
  const p = usePaint();
  return (
    <g>
      <line x1={0} y1={0} x2={len - 34} y2={0} {...p("accent", { strokeOnly: true, width: 18 })} />
      <path d={`M ${len} 0 L ${len - 46} -30 L ${len - 46} 30 Z`} {...p("accent")} />
    </g>
  );
};

/** Contiguous US outline (rough), from lon/lat. Paper-cutout roughness is the point. */
const US_LONLAT: [number, number][] = [
  [-124.7, 48.4], [-124, 46.2], [-124.2, 42], [-123.8, 39.8], [-122.4, 37.8], [-120.6, 34.6], [-117.1, 32.5],
  [-114.7, 32.7], [-111, 31.3], [-108.2, 31.3], [-106.5, 31.8], [-104.5, 29.6], [-103, 29], [-101.4, 29.8], [-99.5, 27.5], [-97.4, 25.9],
  [-97.4, 27.8], [-94.7, 29.4], [-91, 29.2], [-89.2, 29.3], [-89.6, 30.2], [-88, 30.4], [-85.5, 30], [-84, 30.1], [-82.7, 28], [-82.2, 26.5], [-80.4, 25.2],
  [-80, 26.8], [-80.6, 28.5], [-81.4, 30.7], [-81, 32], [-79, 33.5], [-76.5, 34.7], [-75.5, 35.3], [-76, 37], [-75.9, 38.3], [-74.9, 38.9], [-74, 40.5],
  [-72, 41], [-70, 41.6], [-70.6, 42.6], [-70.2, 43.7], [-67, 44.8], [-67.8, 47.1], [-69.2, 47.4], [-70.9, 45.3], [-75, 45], [-79.2, 43.4], [-82.5, 42],
  [-82.5, 45.3], [-84.5, 46.4], [-88.4, 48.3], [-89.6, 48], [-95.2, 49], [-123.3, 49],
];
const US_SCALE = 18.5;
const usXY = (lon: number, lat: number) => [(lon + 125) * 0.8 * US_SCALE, (49 - lat) * US_SCALE] as const;
const US_PATH = "M " + US_LONLAT.map(([lo, la]) => usXY(lo, la).join(" ")).join(" L ") + " Z";
const US_W = 58 * 0.8 * US_SCALE; // ≈ 858
const US_H = 24 * US_SCALE; // ≈ 444

// ---------------------------------------------------------------------------
// b1 hook: the traveler walks to the hole and jumps in
// ---------------------------------------------------------------------------

const onSurface = (deg: number) => ({
  x: C.x + Math.sin((deg * Math.PI) / 180) * R,
  y: C.y - Math.cos((deg * Math.PI) / 180) * R,
  rot: deg,
});

export const HoleHook: React.FC<SceneProps> = ({ dur, props }) => {
  const frame = useStyledFrame();
  const t = useTheme();
  const cue = useCue(props);
  const jump = cue("jumpAtMs", 900);
  const through = cue("throughAtMs", 2600);

  // walk along the surface toward the hole, then hop in
  const walkDeg = interpolate(frame, [0, Math.max(jump - 2, 1)], [13, 8], clamp);
  const hop = interpolate(frame, [jump, jump + 12], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
  const sink = interpolate(frame, [jump + 12, jump + 30], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) });
  const s = onSurface(walkDeg * (1 - hop));
  const x = s.x;
  const y = s.y - Math.sin(hop * Math.PI) * 70 + sink * 150;
  const draw = interpolate(frame, [through, through + 22], [0, 1], clamp);

  return (
    <>
      <Backdrop mood="night" />
      <Camera durationInFrames={dur}>
        <Stars count={36} area={[120, 1200]} />
        <Thing from="none" x={C.x} y={C.y} seed="earth">
          <CutEarth id="h1" />
        </Thing>
        {/* the tunnel mouth hides the traveler once they are in */}
        <g clipPath={sink > 0 ? "url(#hole-mouth)" : undefined}>
          <Thing from="none" x={x} y={y} rotate={s.rot * (1 - hop)} scale={1 - sink * 0.2} seed="trav">
            <Traveler arms={hop > 0 ? "up" : "down"} />
          </Thing>
        </g>
        <defs>
          <clipPath id="hole-mouth">
            <rect x={C.x - 300} y={0} width={600} height={C.y - R + 4} />
            <rect x={C.x - TUNNEL} y={C.y - R} width={TUNNEL * 2} height={R * 2} />
          </clipPath>
        </defs>
        {draw > 0 && (
          <line
            x1={C.x}
            y1={C.y - R + 40}
            x2={C.x}
            y2={C.y - R + 40 + (R * 2 - 80) * draw}
            stroke={t.colors.accent}
            strokeWidth={10}
            strokeDasharray="22 18"
            strokeLinecap="round"
          />
        )}
      </Camera>
    </>
  );
};

// ---------------------------------------------------------------------------
// b2 surprise: a stopwatch sweeps to 38 minutes
// ---------------------------------------------------------------------------

export const StopwatchScene: React.FC<SceneProps> = ({ dur, props }) => {
  const frame = useStyledFrame();
  const cue = useCue(props);
  const sweep = cue("sweepAtMs", 1500);
  const pop = cue("popAtMs", 2600);
  const minutes = interpolate(frame, [sweep - 4, sweep + 26], [0, 38], { ...clamp, easing: Easing.out(Easing.cubic) });
  // after "pop", the traveler pops out of the bottom of the small Earth
  const out = interpolate(frame, [pop, pop + 14], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.15)) });
  const e = { x: 300, y: 860, s: 0.5 };
  return (
    <>
      <Backdrop mood="night" />
      <Camera durationInFrames={dur}>
        <Stars count={30} area={[120, 1200]} />
        <Thing at={0} from="left" x={e.x} y={e.y} scale={e.s} seed="earth-s">
          <CutEarth id="h2" />
        </Thing>
        {out > 0 && (
          <Thing from="none" x={e.x} y={e.y + R * e.s - 6 + out * 4} rotate={180} scale={0.55 * out} seed="trav2">
            <Traveler arms="up" />
          </Thing>
        )}
        <Thing at={4} from="right" x={760} y={700} seed="watch">
          <Stopwatch r={170} minutes={minutes} />
        </Thing>
        {frame >= sweep + 22 && (
          <Thing at={sweep + 22} x={760} y={990} rotate={-3} seed="38">
            <Card w={330} h={120} text="38 min!" size={76} />
          </Thing>
        )}
      </Camera>
    </>
  );
};

// ---------------------------------------------------------------------------
// b3a: falling faster and faster, a speed card counts up to 5 miles per second
// ---------------------------------------------------------------------------

export const FallSpeed: React.FC<SceneProps> = ({ dur, props }) => {
  const frame = useStyledFrame();
  const t = useTheme();
  const cue = useCue(props);
  const drop = cue("dropAtMs", 2400);
  const five = cue("fiveAtMs", 4200);
  const end = Math.max(five + 18, drop + 30);
  const p = interpolate(frame, [drop, end], [0, 1], clamp);
  // simple-harmonic fall from the surface to the center: depth = 1 - cos, speed = sin
  const depth = 1 - Math.cos((p * Math.PI) / 2);
  const speed = Math.sin((p * Math.PI) / 2) * 5;
  const y = C.y - R + 150 + depth * (R - 80);
  const lines = Math.min(1, speed / 3);
  return (
    <>
      <Backdrop mood="night" />
      <Camera durationInFrames={dur}>
        <Stars count={30} area={[120, 1200]} />
        <Thing from="none" x={C.x} y={C.y} seed="earth">
          <CutEarth id="h3" />
        </Thing>
        {/* "no air, nothing melts": a bubble around the traveler */}
        <g opacity={interpolate(frame, [6, 14], [0, 1], clamp)}>
          <circle cx={C.x} cy={y - 66} r={84} fill={t.colors.snow} fillOpacity={0.25} stroke={t.colors.paperWhite} strokeWidth={6} strokeDasharray="14 10" />
        </g>
        {lines > 0.05 &&
          [-1, 0, 1].map((k) => (
            <line
              key={k}
              x1={C.x + k * 22}
              y1={y - 170}
              x2={C.x + k * 22}
              y2={y - 170 - 140 * lines}
              stroke={t.colors.paperWhite}
              strokeWidth={8}
              strokeLinecap="round"
              opacity={0.85}
            />
          ))}
        <Thing from="none" x={C.x} y={y} scale={0.62} seed="trav3">
          <Traveler arms="up" />
        </Thing>
        <Thing at={drop} from="right" x={800} y={480} rotate={3} seed="speed">
          <Card w={300} h={190} text={speed >= 4.95 ? "5" : speed.toFixed(1)} size={110} sub="miles / second" />
        </Thing>
      </Camera>
    </>
  );
};

// ---------------------------------------------------------------------------
// b3b: across America in about 10 minutes
// ---------------------------------------------------------------------------

export const UsaDash: React.FC<SceneProps> = ({ dur, props }) => {
  const frame = useStyledFrame();
  const t = useTheme();
  const cue = useCue(props);
  const dash = cue("dashAtMs", 300);
  const ten = cue("tenAtMs", 1600);
  const [ax, ay] = usXY(-122.4, 37.8); // San Francisco
  const [bx, by] = usXY(-74, 40.7); // New York
  const k = interpolate(frame, [dash, Math.max(ten, dash + 20)], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
  const ox = 540 - US_W / 2;
  const oy = 760 - US_H / 2;
  return (
    <>
      <Backdrop mood="day" />
      <Camera durationInFrames={dur}>
        <Thing from="none" x={ox} y={oy} seed="usa">
          <path d={US_PATH} {...usePaintFixed("land")} />
        </Thing>
        <g transform={`translate(${ox} ${oy})`}>
          <line x1={ax} y1={ay} x2={ax + (bx - ax) * k} y2={ay + (by - ay) * k} stroke={t.colors.accent2} strokeWidth={12} strokeDasharray="4 22" strokeLinecap="round" />
          <circle cx={ax} cy={ay} r={14} fill={t.colors.ink} />
          <circle cx={ax + (bx - ax) * k} cy={ay + (by - ay) * k} r={18} fill={t.colors.accent2} stroke={t.colors.paperWhite} strokeWidth={6} />
        </g>
        {frame >= ten && (
          <Thing at={ten} x={540} y={1110} rotate={-2} seed="ten">
            <Card w={420} h={120} text="≈ 10 minutes" size={70} />
          </Thing>
        )}
      </Camera>
    </>
  );
};

/** usePaint inside a Thing; hoisted helper so the path can use paper paint at the top level of a scene. */
function usePaintFixed(role: "land") {
  const p = usePaint();
  return p(role);
}

// ---------------------------------------------------------------------------
// b4: zero gravity at the center; arrows pull in every direction and cancel
// ---------------------------------------------------------------------------

export const ZeroG: React.FC<SceneProps> = ({ dur, props }) => {
  const frame = useStyledFrame();
  const cue = useCue(props);
  const zero = cue("zeroAtMs", 700);
  const pull = cue("pullAtMs", 1500);
  const cancel = cue("cancelAtMs", 3200);
  const grow = interpolate(frame, [pull, pull + 12], [0, 1], { ...clamp, easing: Easing.out(Easing.quad) });
  const pulse = frame < cancel ? 1 + 0.06 * Math.sin((frame - pull) / 5) : interpolate(frame, [cancel, cancel + 10], [1, 0.0], clamp);
  return (
    <>
      <Backdrop mood="night" />
      <Camera durationInFrames={dur}>
        <Stars count={24} area={[120, 1200]} />
        <Thing from="none" x={C.x} y={C.y} scale={1.2} seed="earth-z">
          <CutEarth id="h4" />
        </Thing>
        {grow > 0 &&
          new Array(8).fill(0).map((_, i) => (
            <g key={i} transform={`translate(${C.x} ${C.y}) rotate(${i * 45 + 22.5}) translate(90 0) scale(${grow * pulse})`}>
              <Arrow len={150} />
            </g>
          ))}
        <Thing from="none" x={C.x} y={C.y + 60} rotate={-12} scale={0.62} seed="trav4">
          <Traveler arms="wave" />
        </Thing>
        {frame >= zero && (
          <Thing at={zero} x={820} y={420} rotate={4} seed="0g">
            <Card w={260} h={120} text="0 g" size={84} />
          </Thing>
        )}
        {frame >= cancel && (
          <Thing at={cancel} x={300} y={1150} rotate={-3} seed="cancel">
            <Card w={380} h={110} text="all cancels!" size={62} />
          </Thing>
        )}
      </Camera>
    </>
  );
};

// ---------------------------------------------------------------------------
// b5: up the other side, slowing, stopping right at the surface
// ---------------------------------------------------------------------------

export const OtherSide: React.FC<SceneProps> = ({ dur, props }) => {
  const frame = useStyledFrame();
  const cue = useCue(props);
  const stop = Math.max(cue("stopAtMs", 2600), 24);
  const p = interpolate(frame, [0, stop], [0, 1], clamp);
  const depth = Math.sin((p * Math.PI) / 2); // decelerating
  const flip = interpolate(frame, [0, Math.min(18, stop)], [0, 180], { ...clamp, easing: Easing.inOut(Easing.quad) });
  // head leads on the way out, so the traveler peeks out of the bottom
  const y = C.y + depth * (R + 40);
  return (
    <>
      <Backdrop mood="night" />
      <Camera durationInFrames={dur}>
        <Stars count={30} area={[120, 1200]} />
        <Thing from="none" x={C.x} y={C.y} seed="earth">
          <CutEarth id="h5" />
        </Thing>
        <Thing from="none" x={C.x} y={y - 100} rotate={flip} scale={0.62} seed="trav5">
          <g transform="translate(0 -60)">
            <Traveler arms={frame >= stop ? "wave" : "up"} />
          </g>
        </Thing>
      </Camera>
    </>
  );
};

// ---------------------------------------------------------------------------
// b6 crazy part: a straight tunnel between two cities takes about the same time
// ---------------------------------------------------------------------------

export const GravityTrain: React.FC<SceneProps> = ({ dur, props }) => {
  const frame = useStyledFrame();
  const t = useTheme();
  const cue = useCue(props);
  const tunnelAt = cue("tunnelAtMs", 1300);
  const cities = cue("citiesAtMs", 3000);
  const same = cue("sameAtMs", 5000);
  const forty = cue("fortyAtMs", 6500);
  const A = -42;
  const B = 42;
  const reveal = interpolate(frame, [tunnelAt, tunnelAt + 18], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
  const ride = interpolate(frame, [same - 6, forty + 10], [0, 1], clamp);
  const k = (1 - Math.cos(ride * Math.PI)) / 2; // slow-fast-slow, like the real ride
  const minutes = interpolate(frame, [same - 6, forty + 10], [0, 40], clamp);
  const pt = (deg: number, r = R) => ({ x: C.x + Math.sin((deg * Math.PI) / 180) * r, y: C.y - Math.cos((deg * Math.PI) / 180) * r });
  const a = pt(A);
  const b = pt(B);
  const tx = a.x + (b.x - a.x) * k;
  const ty = a.y + (b.y - a.y) * k;
  const pin = (p0: { x: number; y: number }, label: string, at: number, side: 1 | -1, seed: string) => (
    <Thing at={at} from="up" x={p0.x} y={p0.y} seed={seed}>
      <path d="M 0 0 C -30 -40 -36 -60 -36 -78 A 36 36 0 1 1 36 -78 C 36 -60 30 -40 0 0 Z" fill={t.colors.accent2} stroke={t.colors.paperWhite} strokeWidth={8} />
      <circle cy={-80} r={13} fill={t.colors.paperWhite} />
      <g transform={`translate(${side * 40} -150)`}>
        <Label text={label} size={58} role="paperWhite" anchor={side === 1 ? "start" : "middle"} />
      </g>
    </Thing>
  );
  return (
    <>
      <Backdrop mood="night" />
      <Camera durationInFrames={dur}>
        <Stars count={30} area={[120, 1200]} />
        <Thing from="none" x={C.x} y={C.y + 80} seed="earth-t">
          <g transform="translate(0 -80)">
            <CutEarth id="h6" tunnel={false} chord={reveal > 0 ? [A, B] : undefined} chordReveal={reveal} />
          </g>
        </Thing>
        {frame >= cities && pin(a, "New York", cities, -1, "ny")}
        {frame >= cities + 6 && pin(b, "London", cities + 6, -1, "ldn")}
        {ride > 0 && (
          <g transform={`translate(${tx} ${ty}) rotate(${interpolate(k, [0, 1], [A + 90, B + 90]) - 90})`}>
            <rect x={-46} y={-26} width={92} height={46} rx={14} fill={t.colors.accent} stroke={t.colors.paperWhite} strokeWidth={6} />
            <rect x={-30} y={-16} width={24} height={16} rx={3} fill={t.colors.paperWhite} />
            <rect x={6} y={-16} width={24} height={16} rx={3} fill={t.colors.paperWhite} />
          </g>
        )}
        {frame >= same - 6 && (
          <Thing at={same - 6} from="right" x={800} y={1030} scale={0.62} seed="watch2">
            <Stopwatch r={170} minutes={minutes} />
          </Thing>
        )}
        {frame >= forty && (
          <Thing at={forty} x={360} y={1060} rotate={-3} seed="40">
            <Card w={330} h={120} text="≈ 40 min" size={72} />
          </Thing>
        )}
      </Camera>
    </>
  );
};

// ---------------------------------------------------------------------------
// b7 loop: back up at the top, then slipping back in (cuts cleanly into b1)
// ---------------------------------------------------------------------------

export const FallAgain: React.FC<SceneProps> = ({ dur, props }) => {
  const frame = useStyledFrame();
  const cue = useCue(props);
  const slip = cue("slipAtMs", 1400);
  const rise = interpolate(frame, [0, Math.min(16, slip)], [0, 1], { ...clamp, easing: Easing.out(Easing.quad) });
  const fall = interpolate(frame, [slip, slip + 16], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) });
  const y = C.y - R + 140 - rise * 150 + fall * 200;
  return (
    <>
      <Backdrop mood="night" />
      <Camera durationInFrames={dur} to={1}>
        <Stars count={36} area={[120, 1200]} />
        <Thing from="none" x={C.x} y={C.y} seed="earth">
          <CutEarth id="h7" />
        </Thing>
        <g clipPath="url(#loop-mouth)">
          <Thing from="none" x={C.x} y={y} scale={0.8} seed="trav7">
            <Traveler arms={fall > 0 ? "up" : "wave"} />
          </Thing>
        </g>
        <defs>
          <clipPath id="loop-mouth">
            <rect x={C.x - 300} y={0} width={600} height={C.y - R + 4} />
            <rect x={C.x - TUNNEL} y={C.y - R} width={TUNNEL * 2} height={R * 2} />
          </clipPath>
        </defs>
      </Camera>
    </>
  );
};

export const HOLE_SCENES: Record<string, React.FC<SceneProps>> = {
  "hole-hook": HoleHook,
  stopwatch: StopwatchScene,
  "fall-speed": FallSpeed,
  "usa-dash": UsaDash,
  "zero-g": ZeroG,
  "other-side": OtherSide,
  "gravity-train": GravityTrain,
  "fall-again": FallAgain,
};
