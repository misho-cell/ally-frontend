import type { CSSProperties } from "react";

// The assistant's figure (D702): the app's own clip, with its poster
// underneath for a phone that will not autoplay or lacks the codec. A clip
// that fails to load hides itself and leaves the poster.
//
// 4922 (13 Oct, Giorgi): every figure showed twice and too small.
// - Twice: poster and clip are both multiplied onto the page, so the poster's
//   figure stayed visible under the moving one. The poster now hides the
//   moment the clip plays.
// - Too small: the clips are 854x480 with the figure in a third of the frame,
//   so a box sized for the figure drew her at a third of the design's size.
//   Each clip is cropped to where its figure moves, measured over every frame
//   (ally-walk walks in from the left and settles; the crop is where she
//   settles, and the poster is a frame from there). The height of the figure
//   is then set where it is used, in globals.css.
//
// #5417 (Giorgi's new clips, 17 Oct): the working pair arrive already cut to
// where their figure moves (measured over every frame, plus a small margin),
// so their crop is the whole file and they carry their own frame size.
const FRAME = { w: 854, h: 480 };
const CROP: Record<string, { x0: number; y0: number; x1: number; y1: number; w?: number; h?: number }> = {
  "ally-walk": { x0: 290, y0: 92, x1: 545, y1: 420 },
  "ally-loading": { x0: 328, y0: 26, x1: 530, y1: 454 },
  "ally-working-1": { x0: 0, y0: 0, x1: 402, y1: 414, w: 402, h: 414 },
  "ally-working-2": { x0: 0, y0: 0, x1: 164, y1: 284, w: 164, h: 284 },
};

export default function AnimFigure({ clip, className = "" }: { clip: string; className?: string }) {
  const c = CROP[clip];
  const box: CSSProperties | undefined = c ? { aspectRatio: `${c.x1 - c.x0} / ${c.y1 - c.y0}` } : undefined;
  const inner: CSSProperties | undefined = c
    ? {
        position: "absolute",
        width: `${((c.w ?? FRAME.w) / (c.x1 - c.x0)) * 100}%`,
        height: `${((c.h ?? FRAME.h) / (c.y1 - c.y0)) * 100}%`,
        left: `${(-c.x0 / (c.x1 - c.x0)) * 100}%`,
        top: `${(-c.y0 / (c.y1 - c.y0)) * 100}%`,
        maxWidth: "none",
      }
    : undefined;
  return (
    <span className={`dz-anim${c ? " cropped" : ""} ${className}`} style={box} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/assets/ally/anim/${clip}-poster.jpg`} alt="" style={inner} onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
      <video
        autoPlay muted loop playsInline
        src={`/assets/ally/anim/${clip}.mp4`}
        style={inner}
        onPlaying={(e) => {
          const poster = e.currentTarget.previousElementSibling as HTMLElement | null;
          if (poster) poster.style.visibility = "hidden";
        }}
        onError={(e) => {
          e.currentTarget.style.display = "none";
          const poster = e.currentTarget.previousElementSibling as HTMLElement | null;
          if (poster) poster.style.visibility = "";
        }}
      />
    </span>
  );
}
