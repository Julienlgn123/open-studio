/** Version SVG (vectorielle, nette à toute taille) de la marque Open Studio — anneau + point. */
export default function Brandmark({ size = 20 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="os-ring" x1="10" y1="85" x2="85" y2="15" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3d58ec" />
          <stop offset="0.55" stopColor="#9333ea" />
          <stop offset="1" stopColor="#c026a3" />
        </linearGradient>
        <linearGradient id="os-dot" x1="70" y1="10" x2="90" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fbb46a" />
          <stop offset="1" stopColor="#f8756a" />
        </linearGradient>
      </defs>
      <circle
        cx="50"
        cy="54"
        r="32"
        stroke="url(#os-ring)"
        strokeWidth="16"
        strokeLinecap="round"
        strokeDasharray="156 45"
        strokeDashoffset="-18"
        transform="rotate(-8 50 54)"
      />
      <circle cx="76" cy="22" r="8" fill="url(#os-dot)" />
    </svg>
  )
}
