import { loadFont } from "@remotion/fonts";
import { Audio } from "@remotion/media";
import React from "react";
import { AbsoluteFill, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Captions, SeriesBadge } from "./Captions";
import { PaperGrain, ThemeDefs, ThemeProvider, useTheme } from "./primitives";
import { MOON_SCENES, type SceneProps } from "./scenes/moon";
import { TAIL_MS, type VideoSpec } from "./types";

// Fonts are bundled in public/fonts (all SIL Open Font License) so renders never depend on a font CDN.
loadFont({ family: "Montserrat", url: staticFile("fonts/Montserrat-Black.woff2"), weight: "900" });
loadFont({ family: "Lilita One", url: staticFile("fonts/LilitaOne-Regular.woff2"), weight: "400" });
loadFont({ family: "Gaegu", url: staticFile("fonts/Gaegu-Bold.woff2"), weight: "700" });

const SCENES: Record<string, React.FC<SceneProps>> = { ...MOON_SCENES };

/** Frames over which a new scene transitions in (the previous scene keeps playing underneath). */
const TRANSITION = 8;

const SceneShell: React.FC<{ first: boolean; children: React.ReactNode }> = ({ first, children }) => {
  const t = useTheme();
  const frame = useCurrentFrame();
  if (first) return <AbsoluteFill>{children}</AbsoluteFill>;
  const held = Math.floor(frame / t.hold) * t.hold;
  const p = interpolate(held, [0, TRANSITION], [0, 1], { extrapolateRight: "clamp" });
  if (t.id === "neon") {
    return (
      <AbsoluteFill style={{ opacity: p, scale: interpolate(p, [0, 1], [1.15, 1]), filter: `blur(${(1 - p) * 14}px)` }}>
        {children}
      </AbsoluteFill>
    );
  }
  if (t.id === "paper") {
    return (
      <AbsoluteFill
        style={{
          translate: `${(1 - p) * 1080}px 0px`,
          rotate: `${(1 - p) * 4}deg`,
          boxShadow: "-24px 0 40px rgba(0,0,0,0.35)",
        }}
      >
        {children}
      </AbsoluteFill>
    );
  }
  return <AbsoluteFill style={{ clipPath: `inset(0 ${(1 - p) * 100}% 0 0)` }}>{children}</AbsoluteFill>;
};

export const ShortVideo: React.FC<{ spec: VideoSpec }> = ({ spec }) => {
  const { fps, durationInFrames } = useVideoConfig();
  const toF = (ms: number) => Math.round((ms / 1000) * fps);
  return (
    <ThemeProvider theme={spec.theme}>
      <AbsoluteFill style={{ backgroundColor: "#000" }}>
        <ThemeDefs />
        {spec.scenes.map((scene, i) => {
          const Comp = SCENES[scene.kind];
          if (!Comp) throw new Error(`Unknown scene kind: ${scene.kind}`);
          const from = toF(scene.startMs);
          const next = spec.scenes[i + 1];
          const end = next ? toF(next.startMs) + TRANSITION : durationInFrames;
          const dur = end - from;
          return (
            <Sequence key={i} from={from} durationInFrames={dur} name={scene.kind}>
              <SceneShell first={i === 0}>
                <Comp dur={dur} props={scene.props} />
              </SceneShell>
            </Sequence>
          );
        })}
        <SeriesBadge text={spec.series} />
        <Captions captions={spec.captions} />
        <PaperGrain />
        <Audio src={staticFile(spec.audio)} />
      </AbsoluteFill>
    </ThemeProvider>
  );
};

export const durationFrames = (spec: VideoSpec, fps: number) => Math.ceil(((spec.durationMs + TAIL_MS) / 1000) * fps);
