// Terra: a small, friendly Earth character who guides students through the app.
export type Mood = "happy" | "talk" | "think" | "wow";

export function TerraAvatar({ size = 56, mood = "happy" }: { size?: number; mood?: Mood }) {
  return (
    <svg className={`terra-avatar mood-${mood}`} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <radialGradient id="terra-ocean" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#8fe0ff" />
          <stop offset="45%" stopColor="#3a8cf0" />
          <stop offset="100%" stopColor="#1d4fb8" />
        </radialGradient>
        <clipPath id="terra-clip"><circle cx="50" cy="54" r="38" /></clipPath>
      </defs>
      <g className="terra-orbit"><circle cx="50" cy="7" r="5" fill="#ffd36e" stroke="#fff" strokeWidth="1.5" /></g>
      <circle cx="50" cy="54" r="38" fill="url(#terra-ocean)" stroke="#fff" strokeWidth="3" />
      <g clipPath="url(#terra-clip)" fill="#52d68f">
        <path d="M14 40c8-10 20-12 26-6 4 4-2 10 2 14 5 5-4 12-12 10-9-2-20-8-16-18z" />
        <path d="M60 18c10 0 22 6 26 16 2 6-6 6-10 4-5-2-9 3-14 0-6-4-8-20-2-20z" />
        <path d="M58 74c6-6 18-6 22 0 3 5-4 12-12 13-8 1-14-7-10-13z" />
        <path d="M20 76c4-3 10-1 10 4s-6 8-10 6-3-8 0-10z" />
      </g>
      <ellipse cx="38" cy="38" rx="14" ry="8" fill="#fff" opacity="0.28" transform="rotate(-25 38 38)" />
      <g className="terra-eyes">
        <ellipse cx="38" cy="51" rx="8.5" ry="9.5" fill="#fff" />
        <ellipse cx="62" cy="51" rx="8.5" ry="9.5" fill="#fff" />
        <circle className="terra-pupil" cx="39.5" cy="53" r="4.6" fill="#1d2340" />
        <circle className="terra-pupil" cx="63.5" cy="53" r="4.6" fill="#1d2340" />
        <circle cx="41" cy="51" r="1.6" fill="#fff" />
        <circle cx="65" cy="51" r="1.6" fill="#fff" />
      </g>
      <ellipse cx="27" cy="64" rx="5" ry="3" fill="#ff8fb1" opacity="0.75" />
      <ellipse cx="73" cy="64" rx="5" ry="3" fill="#ff8fb1" opacity="0.75" />
      {mood === "happy" && <path d="M41 66q9 9 18 0" fill="none" stroke="#1d2340" strokeWidth="3.4" strokeLinecap="round" />}
      {mood === "talk" && <ellipse className="terra-mouth-talk" cx="50" cy="68" rx="6" ry="4.5" fill="#1d2340" />}
      {mood === "think" && <path d="M44 68h12" stroke="#1d2340" strokeWidth="3.4" strokeLinecap="round" />}
      {mood === "wow" && <circle cx="50" cy="68" r="4.5" fill="#1d2340" />}
    </svg>
  );
}
