/** Version vectorielle de l'icône de l'app (bulle + étincelles), nette à toute taille. */
export default function LogoMark({ size = 20 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="lis-bg" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#9d8aff" />
          <stop offset="1" stopColor="#5533dd" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="92" height="92" rx="24" fill="url(#lis-bg)" />
      <path d="M26 30a8 8 0 0 1 8-8h32a8 8 0 0 1 8 8v26a8 8 0 0 1-8 8H44l-14 12 2-12a8 8 0 0 1-6-8z" fill="#fff" />
      <path d="M50 29l3.5 10L63 43l-9.5 3.5L50 57l-3.5-10.5L37 43l9.5-4z" fill="#6a45f0" />
    </svg>
  )
}
