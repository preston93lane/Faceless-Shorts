import type { ThemeId } from "./types";

/** Semantic color roles. Scenes paint with roles; the theme decides the actual look. */
export type Role =
  | "star"
  | "moon"
  | "moonShade"
  | "ocean"
  | "land"
  | "sea"
  | "seaDeep"
  | "sand"
  | "hill"
  | "hill2"
  | "house"
  | "roof"
  | "window"
  | "tree"
  | "sun"
  | "snow"
  | "axis"
  | "accent"
  | "accent2"
  | "ink"
  | "paperWhite"
  | "mantle"
  | "outerCore"
  | "innerCore"
  | "tunnel"
  | "figure"
  | "skin";

export type Theme = {
  id: ThemeId;
  label: string;
  colors: Record<Role, string>;
  /** Night backdrop gradient (top, bottom). */
  night: [string, string];
  /** Day backdrop gradient (top, bottom). */
  day: [string, string];
  caption: {
    font: string;
    weight: number;
    size: number;
    fill: string;
    stroke: string;
    highlight: string;
    uppercase: boolean;
  };
  badge: { font: string; bg: string; fg: string };
  /** 1 = smooth motion every frame; 2 = "on twos" like stop-motion. */
  hold: number;
  /** Motion intensity. Kept in one place so "calmer / livelier" is a single edit. */
  motion: {
    /** Max random rotation per jitter tick, degrees (paper stop-motion wobble). */
    jitterDeg: number;
    /** Max random offset per jitter tick, px. */
    jitterPx: number;
    /** Frames between jitter changes (higher = calmer). */
    jitterEvery: number;
    /** Overshoot of the entrance ease (1 = none, 1.6 = bouncy). */
    overshoot: number;
    /** Extra tilt while a piece slides in, degrees. */
    slideTilt: number;
    /** Camera push-in over a scene (1.04 = 4%). */
    cameraZoom: number;
    /** Tilt of caption cards / scene transitions, degrees. */
    cardTilt: number;
  };
};

export const THEMES: Record<ThemeId, Theme> = {
  neon: {
    id: "neon",
    label: "Flat Neon",
    colors: {
      star: "#FFFFFF",
      moon: "#F4F1FF",
      moonShade: "#C9C2F2",
      ocean: "#2EC4F1",
      land: "#3DDC97",
      sea: "#2EC4F1",
      seaDeep: "#1A6FD6",
      sand: "#FFC857",
      hill: "#2B2F77",
      hill2: "#3B3F9A",
      house: "#6C63FF",
      roof: "#FF4FA3",
      window: "#FFD23F",
      tree: "#1FBF8F",
      sun: "#FFD23F",
      snow: "#8BE9FF",
      axis: "#FF4FA3",
      accent: "#FFD23F",
      accent2: "#FF4FA3",
      ink: "#0B1026",
      paperWhite: "#FFFFFF",
      mantle: "#FF8A3D",
      outerCore: "#FF4FA3",
      innerCore: "#FFD23F",
      tunnel: "#05071A",
      figure: "#9B5DE5",
      skin: "#FFD7B0",
    },
    night: ["#070B24", "#1E1B57"],
    day: ["#0E2A6B", "#2E66D6"],
    caption: {
      font: "Montserrat",
      weight: 900,
      size: 92,
      fill: "#FFFFFF",
      stroke: "#0B1026",
      highlight: "#FFD23F",
      uppercase: true,
    },
    badge: { font: "Montserrat", bg: "#FF4FA3", fg: "#FFFFFF" },
    hold: 1,
    motion: { jitterDeg: 0, jitterPx: 0, jitterEvery: 1, overshoot: 1, slideTilt: 0, cameraZoom: 1.07, cardTilt: 0 },
  },
  paper: {
    id: "paper",
    label: "Paper Cutout",
    colors: {
      star: "#FFF6D8",
      moon: "#FFF1C9",
      moonShade: "#E8D29A",
      ocean: "#3A86FF",
      land: "#8AC926",
      sea: "#3A86FF",
      seaDeep: "#1F5FCC",
      sand: "#F4C77B",
      hill: "#2F5D50",
      hill2: "#3E7C59",
      house: "#FF924C",
      roof: "#FF595E",
      window: "#FFCA3A",
      tree: "#52A447",
      sun: "#FFCA3A",
      snow: "#BDE7FF",
      axis: "#FF595E",
      accent: "#FFCA3A",
      accent2: "#FF595E",
      ink: "#1D2440",
      paperWhite: "#FFFDF5",
      mantle: "#FF924C",
      outerCore: "#FF595E",
      innerCore: "#FFCA3A",
      tunnel: "#1D2440",
      figure: "#9B5DE5",
      skin: "#F6C9A0",
    },
    night: ["#1C2752", "#34407A"],
    day: ["#8ECAE6", "#CDEBF6"],
    caption: {
      font: "Lilita One",
      weight: 400,
      size: 96,
      fill: "#FFFDF5",
      stroke: "#1D2440",
      highlight: "#FFCA3A",
      uppercase: false,
    },
    badge: { font: "Lilita One", bg: "#FFCA3A", fg: "#1D2440" },
    hold: 2,
    // Calm paper (owner feedback 2026-11-27: the first demo moved "a little too much, chaotic").
    // Before: jitter ±0.8° / ±1.5px every 2 frames, overshoot 1.6, slide tilt 14°, zoom 1.07, card tilt 1.6°.
    motion: { jitterDeg: 0.25, jitterPx: 0.5, jitterEvery: 6, overshoot: 1.15, slideTilt: 4, cameraZoom: 1.03, cardTilt: 0.6 },
  },
  chalk: {
    id: "chalk",
    label: "Chalkboard Doodle",
    colors: {
      star: "#FFF7C2",
      moon: "#F5F5F0",
      moonShade: "#BFC3C0",
      ocean: "#8FD3FF",
      land: "#A8E6A1",
      sea: "#8FD3FF",
      seaDeep: "#5FA8E0",
      sand: "#FFE3A3",
      hill: "#A8E6A1",
      hill2: "#7CCB8A",
      house: "#F5F5F0",
      roof: "#FFA6C9",
      window: "#FFE680",
      tree: "#A8E6A1",
      sun: "#FFE680",
      snow: "#8FD3FF",
      axis: "#FFA6C9",
      accent: "#FFE680",
      accent2: "#FFA6C9",
      ink: "#1F2A2E",
      paperWhite: "#F5F5F0",
      mantle: "#FFC59E",
      outerCore: "#FFA6C9",
      innerCore: "#FFE680",
      tunnel: "#11181A",
      figure: "#C9B6FF",
      skin: "#F5E0C8",
    },
    night: ["#1B2427", "#26343A"],
    day: ["#1B2427", "#26343A"],
    caption: {
      font: "Gaegu",
      weight: 700,
      size: 104,
      fill: "#F5F5F0",
      stroke: "#11181A",
      highlight: "#FFE680",
      uppercase: false,
    },
    badge: { font: "Gaegu", bg: "transparent", fg: "#FFE680" },
    hold: 1,
    motion: { jitterDeg: 0, jitterPx: 0, jitterEvery: 1, overshoot: 1, slideTilt: 0, cameraZoom: 1.06, cardTilt: 0 },
  },
};
