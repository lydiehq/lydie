type Props = {
  className?: string;
  active?: boolean;
  showFoldDecoration?: boolean;
};

const bars = [40, 80, 70, 90, 60];

export function DocumentThumbnailIcon({
  className,
  active = false,
  showFoldDecoration = false,
}: Props) {
  const barClass = active ? "bg-black/40" : "bg-black/20";

  return (
    <div className={`relative ${className ?? ""}`}>
      <div className="h-4 w-3.5 rounded-[3px] shadow-surface bg-white p-0.5 flex flex-col gap-px z-1 relative">
        {bars.map((bar) => (
          <div
            key={bar}
            className={`h-0.5 transition-all duration-200 ${barClass} rounded-xs`}
            style={{ width: `${bar}%` }}
          />
        ))}
      </div>
      {showFoldDecoration && (
        <div className="h-4 w-3.5 rounded-[3px] shadow-surface bg-white p-0.5 flex flex-col gap-px z-0 absolute inset-0 -rotate-30" />
      )}
    </div>
  );
}
