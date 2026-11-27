import { createTikTokStyleCaptions, type Caption } from "@remotion/captions";
import React, { useMemo } from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { useTheme } from "./primitives";

/** Word-by-word captions, a few words per "page", current word highlighted. */
export const Captions: React.FC<{ captions: Caption[] }> = ({ captions }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = useTheme();
  const pages = useMemo(
    () => createTikTokStyleCaptions({ captions, combineTokensWithinMilliseconds: 900 }).pages,
    [captions],
  );
  const nowMs = (frame / fps) * 1000;
  const idx = pages.findIndex((p, i) => nowMs >= p.startMs && nowMs < (pages[i + 1]?.startMs ?? p.startMs + p.durationMs + 600));
  if (idx < 0) return null;
  const page = pages[idx];
  const pageFrame = frame - Math.round((page.startMs / 1000) * fps);
  const held = Math.floor(pageFrame / t.hold) * t.hold;

  const enter =
    t.id === "neon"
      ? 0.7 + 0.3 * spring({ frame: pageFrame, fps, config: { damping: 14, stiffness: 220 } })
      : t.id === "paper"
        ? interpolate(held, [0, 4], [0.6, 1], { extrapolateRight: "clamp" })
        : interpolate(pageFrame, [0, 5], [0, 1], { extrapolateRight: "clamp" });

  const isPaper = t.id === "paper";
  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center" }}>
      <div
        style={{
          position: "absolute",
          top: 1250,
          maxWidth: 920,
          textAlign: "center",
          fontFamily: t.caption.font,
          fontWeight: t.caption.weight,
          fontSize: t.caption.size,
          lineHeight: 1.12,
          textTransform: t.caption.uppercase ? "uppercase" : "none",
          scale: t.id === "chalk" ? 1 : enter,
          opacity: t.id === "chalk" ? enter : 1,
          rotate: isPaper ? `${((idx % 3) - 1) * 1.6}deg` : "0deg",
          padding: isPaper ? "18px 36px 26px" : 0,
          background: isPaper ? t.colors.paperWhite : "transparent",
          boxShadow: isPaper ? "10px 14px 0 rgba(0,0,0,0.30)" : "none",
          borderRadius: isPaper ? 6 : 0,
        }}
      >
        {page.tokens.map((tok, i) => {
          const active = nowMs >= tok.fromMs && nowMs < tok.toMs;
          const spoken = nowMs >= tok.fromMs;
          const color = isPaper ? (active ? t.colors.accent2 : t.colors.ink) : active ? t.caption.highlight : t.caption.fill;
          return (
            <span
              key={i}
              style={{
                color,
                opacity: t.id === "chalk" && !spoken ? 0.45 : 1,
                WebkitTextStroke: isPaper ? "0px" : `${Math.round(t.caption.size * 0.17)}px ${t.caption.stroke}`,
                paintOrder: "stroke fill",
                display: "inline-block",
                translate: active && t.id !== "chalk" ? "0px -6px" : "0px 0px",
                textDecoration: t.id === "chalk" && active ? "underline" : "none",
                textDecorationThickness: 8,
                textUnderlineOffset: 14,
                whiteSpace: "pre",
              }}
            >
              {tok.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/** Recurring series label at the top so viewers recognise the format. */
export const SeriesBadge: React.FC<{ text: string }> = ({ text }) => {
  const t = useTheme();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 14 } });
  const chalk = t.id === "chalk";
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div
        style={{
          position: "absolute",
          top: 190,
          scale: s,
          rotate: t.id === "paper" ? "-3deg" : "0deg",
          fontFamily: t.badge.font,
          fontWeight: t.id === "neon" ? 900 : 700,
          fontSize: 64,
          letterSpacing: chalk ? 2 : 4,
          color: t.badge.fg,
          background: t.badge.bg,
          padding: "10px 34px 12px",
          borderRadius: t.id === "neon" ? 999 : 4,
          border: chalk ? `5px solid ${t.badge.fg}` : "none",
          boxShadow:
            t.id === "neon" ? `0 0 40px ${t.badge.bg}` : t.id === "paper" ? "8px 10px 0 rgba(0,0,0,0.3)" : "none",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};
