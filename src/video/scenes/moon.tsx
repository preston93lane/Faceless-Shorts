/**
 * Demo scenes for "What if the Moon disappeared?".
 * Geometry is written once; each theme changes how it is painted and how it moves.
 * (In production, objects like these come from style-locked AI illustrations; these demo
 * shapes are hand-drawn in code so the style comparison needs no API keys.)
 */
import React from "react";
import { interpolate, random, useVideoConfig } from "remotion";
import { Backdrop, Camera, Stars, Thing, usePaint, useStyledFrame, useTheme } from "../primitives";

export type SceneProps = { dur: number; props?: Record<string, unknown> };

const ms2f = (ms: number, fps: number) => Math.round((ms / 1000) * fps);

// ---------------------------------------------------------------------------
// Reusable drawings
// ---------------------------------------------------------------------------

const Earth: React.FC<{ r: number; spin?: number; id: string }> = ({ r, spin = 0, id }) => {
  const p = usePaint();
  const t = useTheme();
  const off = (spin % 1) * r * 2;
  return (
    <g>
      <defs>
        <clipPath id={`earth-clip-${id}`}>
          <circle r={r} />
        </clipPath>
      </defs>
      <circle r={r} {...p("ocean")} />
      <g clipPath={`url(#earth-clip-${id})`}>
        {[-1, 0, 1].map((k) => (
          <g key={k} transform={`translate(${k * r * 2 - off} 0)`}>
            <path d={`M ${-r * 0.7} ${-r * 0.45} q ${r * 0.35} ${-r * 0.35} ${r * 0.7} ${-r * 0.1} q ${r * 0.2} ${r * 0.3} ${-r * 0.1} ${r * 0.55} q ${-r * 0.4} ${r * 0.1} ${-r * 0.6} ${-r * 0.45} z`} {...p("land")} />
            <path d={`M ${r * 0.15} ${r * 0.15} q ${r * 0.4} ${-r * 0.1} ${r * 0.55} ${r * 0.25} q ${-r * 0.05} ${r * 0.4} ${-r * 0.35} ${r * 0.45} q ${-r * 0.3} ${-r * 0.25} ${-r * 0.2} ${-r * 0.7} z`} {...p("land")} />
          </g>
        ))}
      </g>
      {t.id === "neon" && <circle r={r} fill="none" stroke="#FFFFFF" strokeOpacity={0.35} strokeWidth={6} />}
    </g>
  );
};

const Moon: React.FC<{ r: number }> = ({ r }) => {
  const p = usePaint();
  return (
    <g>
      <circle r={r} {...p("moon")} />
      <circle cx={-r * 0.35} cy={-r * 0.2} r={r * 0.22} {...p("moonShade")} />
      <circle cx={r * 0.3} cy={r * 0.3} r={r * 0.15} {...p("moonShade")} />
      <circle cx={r * 0.25} cy={-r * 0.45} r={r * 0.1} {...p("moonShade")} />
    </g>
  );
};

const Sun: React.FC<{ r: number }> = ({ r }) => {
  const p = usePaint();
  return (
    <g>
      {new Array(10).fill(0).map((_, i) => (
        <line key={i} x1={0} y1={-r * 1.25} x2={0} y2={-r * 1.6} transform={`rotate(${i * 36})`} {...p("sun", { strokeOnly: true, width: 12 })} />
      ))}
      <circle r={r} {...p("sun")} />
    </g>
  );
};

const Snowflake: React.FC<{ r: number }> = ({ r }) => {
  const p = usePaint();
  return (
    <g>
      {[0, 60, 120].map((a) => (
        <g key={a} transform={`rotate(${a})`}>
          <line x1={0} y1={-r} x2={0} y2={r} {...p("snow", { strokeOnly: true, width: 12 })} />
          <polyline points={`${-r * 0.3},${-r * 0.75} 0,${-r * 0.5} ${r * 0.3},${-r * 0.75}`} {...p("snow", { strokeOnly: true, width: 10 })} />
          <polyline points={`${-r * 0.3},${r * 0.75} 0,${r * 0.5} ${r * 0.3},${r * 0.75}`} {...p("snow", { strokeOnly: true, width: 10 })} />
        </g>
      ))}
    </g>
  );
};

/** Text label drawn in the theme's display font. */
const Label: React.FC<{ text: string; size: number; role?: "accent" | "accent2" | "paperWhite"; anchor?: "middle" | "start" }> = ({
  text,
  size,
  role = "accent",
  anchor = "middle",
}) => {
  const t = useTheme();
  const color = t.colors[role];
  return (
    <text
      textAnchor={anchor}
      dominantBaseline="middle"
      fontFamily={t.caption.font}
      fontWeight={t.caption.weight}
      fontSize={size}
      fill={color}
      stroke={t.colors.ink}
      strokeWidth={t.id === "chalk" ? 0 : size * 0.14}
      paintOrder="stroke"
    >
      {text}
    </text>
  );
};

// ---------------------------------------------------------------------------
// Scene 1: the hook. Earth and Moon, then the Moon vanishes.
// ---------------------------------------------------------------------------

export const MoonVanish: React.FC<SceneProps> = ({ dur, props }) => {
  const { fps } = useVideoConfig();
  const frame = useStyledFrame();
  const t = useTheme();
  const vanish = ms2f(Number(props?.vanishAtMs ?? 1400), fps);
  const gone = frame >= vanish;
  const shrink = interpolate(frame, [vanish, vanish + 6], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const poof = interpolate(frame, [vanish, vanish + 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <>
      <Backdrop mood="night" />
      <Camera durationInFrames={dur} to={1.08}>
        <Stars />
        <Thing at={0} from="down" x={540} y={980} seed="earth">
          <Earth r={280} spin={frame / 400} id="s1" />
        </Thing>
        {!gone || shrink > 0 ? (
          <Thing at={4} from="right" x={760} y={470} scale={Math.max(shrink, 0.001)} seed="moon">
            <Moon r={120} />
          </Thing>
        ) : null}
        {gone && poof < 1 && (
          <g transform="translate(760 470)" opacity={1 - poof}>
            <circle r={60 + poof * 260} fill="none" stroke={t.colors.moon} strokeWidth={14 * (1 - poof)} />
            {new Array(14).fill(0).map((_, i) => {
              const a = (i / 14) * Math.PI * 2 + random(`pa${i}`);
              const d = 40 + poof * (180 + random(`pd${i}`) * 140);
              return <circle key={i} cx={Math.cos(a) * d} cy={Math.sin(a) * d} r={10 * (1 - poof) + 3} fill={t.colors.moon} />;
            })}
          </g>
        )}
        {gone && poof >= 1 && (
          <Thing at={vanish + 18} x={760} y={470} seed="q">
            <circle r={120} {...{ fill: "none", stroke: t.colors.moon, strokeWidth: 6, strokeDasharray: "18 18", opacity: 0.6 }} />
            <Label text="?" size={150} role="accent" />
          </Thing>
        )}
      </Camera>
    </>
  );
};

// ---------------------------------------------------------------------------
// Scene 2: the night sky goes dark over a little town.
// ---------------------------------------------------------------------------

const Hills: React.FC = () => {
  const p = usePaint();
  return (
    <g>
      <path d="M -60 1120 Q 260 960 560 1080 T 1140 1010 L 1140 2000 L -60 2000 Z" {...p("hill2")} />
      <path d="M -60 1230 Q 300 1110 640 1220 T 1140 1180 L 1140 2000 L -60 2000 Z" {...p("hill")} />
    </g>
  );
};

const House: React.FC<{ glow: number }> = ({ glow }) => {
  const p = usePaint();
  const t = useTheme();
  return (
    <g>
      <rect x={-110} y={-90} width={220} height={170} {...p("house")} />
      <path d="M -140 -80 L 0 -200 L 140 -80 Z" {...p("roof")} />
      <rect x={-60} y={-50} width={60} height={60} {...p("window")} />
      <rect x={30} y={-10} width={50} height={90} {...p("roof")} />
      {t.id !== "chalk" && <rect x={-60} y={-50} width={60} height={60} fill={t.colors.window} opacity={glow} filter="url(#fx-neon)" />}
    </g>
  );
};

const Tree: React.FC = () => {
  const p = usePaint();
  return (
    <g>
      <rect x={-14} y={0} width={28} height={70} {...p("roof")} />
      <path d="M -70 10 L 0 -150 L 70 10 Z" {...p("tree")} />
    </g>
  );
};

export const DarkNight: React.FC<SceneProps> = ({ dur }) => {
  const frame = useStyledFrame();
  const t = useTheme();
  const darken = interpolate(frame, [8, dur - 10], [0, 0.5], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <>
      <Backdrop mood="night" darken={0} />
      <Camera durationInFrames={dur} to={1.06}>
        <Stars brightness={1 + darken * 1.4} area={[120, 1000]} />
        {/* Where the Moon used to be */}
        <Thing at={2} x={780} y={380} seed="ghost">
          <circle r={110} fill="none" stroke={t.colors.moon} strokeWidth={6} strokeDasharray="16 18" opacity={0.55} />
        </Thing>
        <Thing at={0} from="down" seed="hills">
          <Hills />
        </Thing>
        <Thing at={6} from="down" x={420} y={1080} seed="house">
          <House glow={0.6 + darken} />
        </Thing>
        <Thing at={10} from="down" x={700} y={1060} scale={0.9} seed="tree1">
          <Tree />
        </Thing>
        <Thing at={13} from="down" x={830} y={1095} scale={0.7} seed="tree2">
          <Tree />
        </Thing>
        <rect x={-200} y={-200} width={1480} height={2400} fill="#000" opacity={darken} />
        <Stars count={18} brightness={darken * 2} area={[140, 900]} />
      </Camera>
    </>
  );
};

// ---------------------------------------------------------------------------
// Scene 3: tides shrink to about a third.
// ---------------------------------------------------------------------------

export const Tides: React.FC<SceneProps> = ({ dur, props }) => {
  const { fps } = useVideoConfig();
  const frame = useStyledFrame();
  const t = useTheme();
  const p = usePaint();
  const shrinkAt = ms2f(Number(props?.shrinkAtMs ?? 1100), fps);
  const thirdAt = ms2f(Number(props?.thirdAtMs ?? 2200), fps);
  const amp = interpolate(frame, [shrinkAt, shrinkAt + 30], [1, 1 / 3], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const base = 1010;
  const range = 230;
  const level = base - range * amp * (0.75 + 0.25 * Math.sin(frame / 9));
  const wave = (phase: number) => {
    let d = `M -100 ${level}`;
    for (let x = -100; x <= 1180; x += 40) d += ` L ${x} ${level + Math.sin(x / 70 + phase) * 14}`;
    return d + " L 1180 2000 L -100 2000 Z";
  };
  return (
    <>
      <Backdrop mood="day" />
      <Camera durationInFrames={dur} to={1.05}>
        {/* Beach */}
        <Thing at={0} from="right" seed="sand">
          <path d="M 560 2000 L 760 900 Q 900 860 1180 880 L 1180 2000 Z" {...p("sand")} />
        </Thing>
        {/* Water */}
        <Thing at={0} from="left" seed="sea" plain={t.id === "neon"}>
          <path d={wave(frame / 6)} {...p("seaDeep")} />
          <path d={wave(frame / 5 + 1.5)} {...p("sea")} opacity={t.id === "chalk" ? 1 : 0.85} transform="translate(0 24)" />
        </Thing>
        {/* Tide gauge */}
        <Thing at={6} from="down" x={300} y={0} seed="gauge">
          <rect x={-16} y={700} width={32} height={520} {...p("paperWhite")} />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <line key={i} x1={-34} x2={34} y1={760 + i * 80} y2={760 + i * 80} {...p("accent2", { strokeOnly: true, width: 8 })} />
          ))}
        </Thing>
        {/* High tide marker "now" */}
        <Thing at={10} from="left" x={360} y={base - range} seed="now">
          <line x1={-120} x2={250} y1={0} y2={0} stroke={t.colors.accent} strokeWidth={8} strokeDasharray="22 16" />
          <g transform="translate(320 0)">
            <Label text="TODAY" size={56} role="accent" anchor="start" />
          </g>
        </Thing>
        {frame >= thirdAt && (
          <Thing at={thirdAt} x={760} y={520} seed="third">
            <circle r={150} {...p("accent2")} />
            <Label text="1/3" size={130} role="paperWhite" />
          </Thing>
        )}
      </Camera>
    </>
  );
};

// ---------------------------------------------------------------------------
// Scene 4: Earth's tilt wobbles and the seasons scramble.
// ---------------------------------------------------------------------------

export const TiltWobble: React.FC<SceneProps> = ({ dur, props }) => {
  const { fps } = useVideoConfig();
  const frame = useStyledFrame();
  const t = useTheme();
  const wobbleAt = ms2f(Number(props?.wobbleAtMs ?? 2600), fps);
  const scrambleAt = ms2f(Number(props?.scrambleAtMs ?? 3900), fps);
  const amp = interpolate(frame, [wobbleAt, wobbleAt + 40], [0, 26], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const tilt = 23.4 + amp * Math.sin((frame - wobbleAt) / 5);
  const scramble = interpolate(frame, [scrambleAt, scrambleAt + 24], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const orbit = (i: number) => {
    const a = (i * Math.PI) + scramble * (frame / 6) + scramble * i;
    return { x: 540 + Math.cos(a) * 380, y: 720 + Math.sin(a) * 300 * (0.4 + 0.6 * scramble) };
  };
  const sunPos = orbit(0);
  const snowPos = orbit(1);
  return (
    <>
      <Backdrop mood="night" />
      <Camera durationInFrames={dur} to={1.06}>
        <Stars count={30} />
        <Thing at={0} x={540} y={720} seed="earth2">
          <g transform={`rotate(${tilt})`}>
            <line x1={0} y1={-400} x2={0} y2={400} stroke={t.colors.axis} strokeWidth={12} strokeLinecap="round" />
            <Earth r={250} spin={frame / 300} id="s4" />
          </g>
        </Thing>
        <Thing at={8} x={820} y={470} seed="deg">
          <Label text={amp > 4 ? "??°" : "23.4°"} size={80} role="accent" />
        </Thing>
        <Thing at={14} x={sunPos.x} y={sunPos.y} scale={0.9} seed="sun">
          <Sun r={70} />
        </Thing>
        <Thing at={18} x={snowPos.x} y={snowPos.y} scale={0.9} seed="snow">
          <Snowflake r={80} />
        </Thing>
      </Camera>
    </>
  );
};

export const MOON_SCENES: Record<string, React.FC<SceneProps>> = {
  "moon-vanish": MoonVanish,
  "dark-night": DarkNight,
  tides: Tides,
  "tilt-wobble": TiltWobble,
};
