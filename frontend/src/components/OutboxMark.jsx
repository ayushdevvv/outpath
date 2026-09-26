/**
 * The OB mark: a rounded white "O" ring paired with a solid green "B",
 * built as geometry rather than set type so it stays crisp from a 16px
 * sidebar icon up to the metre-wide hero cube. Same white/green split as
 * the "Out" / "box" wordmark, so the mark and the wordmark read as one
 * lockup wherever they sit side by side.
 */
export default function OutboxMark({ className }) {
  return (
    <svg viewBox="0 0 96 64" fill="none" className={className} aria-hidden="true">
      {/* O — a thick rounded-square ring, not a circle: reads as a glyph,
          not a status dot. */}
      <rect x="3" y="5" width="42" height="54" rx="17" stroke="#F5F8F7" strokeWidth="11" />

      {/* B — stem plus two rounded lobes, same fill throughout so the
          overlaps read as one solid letterform. */}
      <rect x="50" y="5" width="15" height="54" rx="5.5" fill="#22C55E" />
      <rect x="50" y="5" width="38" height="25" rx="12.5" fill="#22C55E" />
      <rect x="50" y="34" width="40" height="25" rx="12.5" fill="#22C55E" />
    </svg>
  )
}
