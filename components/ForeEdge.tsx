/** Progress drawn as the edge of a book's pages, with a ribbon at the reader's place. */
export function ForeEdge({
  percent,
  large = false,
  finished = false,
}: {
  percent: number | null;
  large?: boolean;
  finished?: boolean;
}) {
  const p = finished ? 100 : Math.max(0, Math.min(100, percent ?? 0));
  const classes = ["fore-edge", large && "fore-edge-lg", finished && "fore-edge-gilt"].filter(Boolean).join(" ");

  return (
    <div
      className={classes}
      role="progressbar"
      aria-label="Progress through the book"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent == null && !finished ? undefined : p}
      aria-valuetext={percent == null && !finished ? "Length unknown" : `${p}%`}
    >
      <div className="fore-edge-read" style={{ width: `${p}%` }} />
      {!finished && p > 0 && p < 100 && <span className="fore-edge-ribbon" style={{ left: `${p}%` }} />}
    </div>
  );
}
