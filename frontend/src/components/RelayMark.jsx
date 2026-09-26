/** Two endpoints, one hop through the middle. The mark is the product diagram. */
export default function RelayMark({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M2 15.5 L8 8.5 L12 12.5 L16 5.5 L22 12.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.5"
      />
      <circle cx="12" cy="12.5" r="3" fill="#FF7A3D" />
      <circle cx="2.5" cy="15.5" r="1.4" fill="currentColor" opacity="0.7" />
      <circle cx="21.5" cy="12.5" r="1.4" fill="currentColor" opacity="0.7" />
    </svg>
  )
}
