// RelayFlow logo (assets generated from the official logo file, in src/web/public).
// `size` is the icon height in px; the full lockup scales from it.
export function Logo({ size = 34, showText = true }: { size?: number; showText?: boolean; byline?: boolean }) {
  if (!showText) {
    return <img src="/logo-mark.png" alt="RelayFlow" width={size} height={size} className="shrink-0 object-contain" style={{ width: size, height: size }} />;
  }
  const height = Math.round(size * 0.94);
  return (
    <img
      src="/logo.png"
      alt="RelayFlow"
      height={height}
      width={Math.round((height * 607) / 128)}
      className="shrink-0 select-none"
      style={{ height, width: "auto" }}
      draggable={false}
    />
  );
}
