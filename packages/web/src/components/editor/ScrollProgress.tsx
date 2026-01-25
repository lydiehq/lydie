import { useEffect, useState } from "react";

type Props = {
  containerRef: React.RefObject<HTMLDivElement | null>;
};

export function ScrollProgress({ containerRef }: Props) {
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollHeight = container.scrollHeight - container.clientHeight;
      const progress = scrollHeight > 0 ? container.scrollTop / scrollHeight : 0;
      setScrollProgress(progress);
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [containerRef]);

  return (
    <div className="fixed flex flex-col gap-1 @max-[720px]:gap-0.5">
      {[0, 0.2, 0.4, 0.6, 0.8, 1].map((_, i) => (
        <div
          key={i}
          className={`h-0.5 rounded-lg duration-300 w-5 @max-[720px]:w-1.5 transition-all ${
            i === Math.round(scrollProgress * 5) ? "bg-gray-300" : "bg-gray-100"
          }`}
        />
      ))}
    </div>
  );
}
