import { useId } from 'react'

/**
 * Marque Open Studio en SVG, relevée sur resources/icon.png (coordonnées de l'icône 1024 px) :
 * anneau centré (512, 512), rayon 196,5, épaisseur 111, ouvert entre 12 h et ~21° au-dessus
 * de 3 h ; point centré (669, 285), rayon 54. Dégradés échantillonnés sur l'icône.
 */
export default function Brandmark({ size = 20 }: { size?: number }): JSX.Element {
  // Ids uniques : plusieurs marques sur la même page ne doivent pas partager leurs dégradés.
  const id = useId().replace(/:/g, '')
  return (
    <svg width={size} height={size} viewBox="240 226 543 543" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <linearGradient id={`${id}-ring`} x1="300" y1="700" x2="700" y2="300" gradientUnits="userSpaceOnUse">
          <stop offset="0.1" stopColor="#3d58ec" />
          <stop offset="0.4" stopColor="#6545ed" />
          <stop offset="0.65" stopColor="#8d37d8" />
          <stop offset="0.85" stopColor="#ae30b0" />
        </linearGradient>
        <linearGradient id={`${id}-dot`} x1="615" y1="231" x2="723" y2="339" gradientUnits="userSpaceOnUse">
          <stop offset="0.2" stopColor="#fba470" />
          <stop offset="0.5" stopColor="#f97f69" />
          <stop offset="0.8" stopColor="#f65862" />
        </linearGradient>
      </defs>
      <path
        d="M 695.7 442.2 A 196.5 196.5 0 1 1 512 315.5"
        stroke={`url(#${id}-ring)`}
        strokeWidth="111"
        strokeLinecap="round"
      />
      <circle cx="669" cy="285" r="54" fill={`url(#${id}-dot)`} />
    </svg>
  )
}
