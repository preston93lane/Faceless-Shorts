import React from "react";
import { Composition } from "remotion";
import { durationFrames, ShortVideo } from "./ShortVideo";
import { FPS, HEIGHT, WIDTH, type VideoSpec } from "./types";

const placeholder: VideoSpec = {
  id: "placeholder",
  theme: "neon",
  series: "WHAT IF?",
  audio: "generated/moon/voice_af_heart.wav",
  durationMs: 3000,
  captions: [],
  scenes: [{ kind: "moon-vanish", startMs: 0, endMs: 3000 }],
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Short"
    component={ShortVideo}
    width={WIDTH}
    height={HEIGHT}
    fps={FPS}
    durationInFrames={90}
    defaultProps={{ spec: placeholder }}
    calculateMetadata={({ props }) => ({ durationInFrames: durationFrames(props.spec, FPS) })}
  />
);
