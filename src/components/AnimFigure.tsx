// The assistant's figure (D702): the app's own clip, with its poster
// underneath for a phone that will not autoplay or lacks the codec. A clip
// that fails to load hides itself and leaves the poster.
export default function AnimFigure({ clip, className = "" }: { clip: string; className?: string }) {
  return (
    <span className={`dz-anim ${className}`} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/assets/ally/anim/${clip}-poster.jpg`} alt="" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
      <video
        autoPlay muted loop playsInline
        src={`/assets/ally/anim/${clip}.mp4`}
        onError={(e) => { e.currentTarget.style.display = "none"; }}
      />
    </span>
  );
}
