// A flat sunset scene in the Sunset Night palette: striped sun, sea, two
// palm silhouettes and a little plate. Original artwork, no photos.
export function SunsetArt() {
  return (
    <svg class="hero-art" viewBox="0 0 360 150" role="img" aria-label="Sunset over the sea with palm trees">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#2A1650" />
          <stop offset="1" stop-color="#4A1F5E" />
        </linearGradient>
        <linearGradient id="sun" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#FF4FA3" />
          <stop offset="1" stop-color="#FF9A3C" />
        </linearGradient>
        <clipPath id="sunClip">
          <circle cx="180" cy="100" r="58" />
        </clipPath>
      </defs>
      <rect width="360" height="150" fill="url(#sky)" />
      <circle cx="60" cy="30" r="1.5" fill="#FFF1F7" opacity="0.7" />
      <circle cx="300" cy="22" r="1.2" fill="#FFF1F7" opacity="0.6" />
      <circle cx="250" cy="45" r="1" fill="#FFF1F7" opacity="0.5" />
      <circle cx="110" cy="18" r="1" fill="#FFF1F7" opacity="0.5" />
      <g clip-path="url(#sunClip)">
        <rect x="110" y="40" width="140" height="70" fill="url(#sun)" />
        <rect x="110" y="78" width="140" height="4" fill="#2A1650" />
        <rect x="110" y="88" width="140" height="5" fill="#2A1650" />
        <rect x="110" y="99" width="140" height="7" fill="#2A1650" />
      </g>
      <rect y="108" width="360" height="42" fill="#1F1433" />
      <rect x="120" y="114" width="120" height="2" rx="1" fill="#FF4FA3" opacity="0.6" />
      <rect x="140" y="122" width="80" height="2" rx="1" fill="#FF9A3C" opacity="0.5" />
      <rect x="160" y="130" width="40" height="2" rx="1" fill="#3DE3D0" opacity="0.5" />
      {/* left palm */}
      <g fill="#140B24">
        <path d="M44 150 C46 120 50 95 58 72 L62 73 C55 96 52 121 52 150 Z" />
        <path d="M60 72 C46 60 30 62 18 72 C32 66 46 68 60 75 Z" />
        <path d="M60 72 C52 54 38 48 26 50 C40 56 50 64 58 76 Z" />
        <path d="M60 72 C70 56 86 52 98 56 C84 58 72 66 62 77 Z" />
        <path d="M60 72 C76 66 92 70 102 82 C90 76 76 74 62 76 Z" />
      </g>
      {/* right palm */}
      <g fill="#140B24">
        <path d="M318 150 C316 126 312 106 304 88 L300 89 C307 107 310 127 310 150 Z" />
        <path d="M302 88 C314 76 330 76 342 84 C328 80 316 82 304 91 Z" />
        <path d="M302 88 C296 74 284 70 272 72 C286 76 294 82 300 92 Z" />
        <path d="M302 88 C308 72 322 66 334 68 C320 72 310 80 304 92 Z" />
      </g>
      {/* plate */}
      <ellipse cx="180" cy="140" rx="34" ry="6" fill="#33224D" />
      <ellipse cx="180" cy="138" rx="24" ry="4" fill="#3DE3D0" opacity="0.8" />
    </svg>
  );
}
