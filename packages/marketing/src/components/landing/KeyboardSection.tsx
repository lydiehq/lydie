import { clsx } from "clsx";
import { useEffect, useState } from "react";

import { CastShadow } from "../generic/CastShadow";
import { GradientOutline } from "../generic/GradientOutline";

interface KeyProps {
  label: string;
  width?: "normal" | "wide" | "xwide" | "cmd" | "space" | "fn" | "shift";
  isHighlighted?: boolean;
  rotate?: number;
  dataKey?: string;
  isPressed?: boolean;
}

function Key({
  label,
  width = "normal",
  isHighlighted = false,
  rotate = 0,
  dataKey,
  isPressed = false,
}: KeyProps) {
  const widthClasses: Record<string, string> = {
    normal: "w-[60px]",
    wide: "w-[70px]",
    xwide: "w-[90px]",
    cmd: "w-[70px]",
    space: "w-[340px]",
    fn: "w-[50px]",
    shift: "w-[110px]",
  };

  const showHighlighted = isHighlighted || isPressed;

  const baseClasses = clsx(
    "relative h-[60px] ring-black/5 ring rounded-xl shadow-legit flex items-center justify-center text-[12px] font-semibold select-none transition-all duration-200 flex-shrink-0 shadow-sm relative",
    widthClasses[width] || widthClasses.normal,
    showHighlighted
      ? "bg-gradient-to-b from-[#3b82f6] to-[#2563eb] text-white border-[#1d4ed8] border-t-blue-400"
      : "text-black/60 bg-linear-to-t from-gray-200 to-gray-100",
    isPressed && "scale-[0.95] shadow-inner brightness-110",
  );

  return (
    <div data-key={dataKey}>
      <CastShadow
        className="w-full"
        height={10}
        strength={1}
        lightAngle={145 + rotate}
        style={rotate !== 0 ? { transform: `rotate(${rotate}deg)` } : undefined}
      >
        <div className={baseClasses}>
          <div
            className={clsx(
              "absolute inset-1.5 rounded-lg ring ring-black/3",
              showHighlighted ? "bg-blue-400" : "bg-white",
            )}
          />
          <span className="relative z-10">{label}</span>
          {showHighlighted && (
            <div className="absolute inset-0 rounded-md bg-blue-400/20 animate-pulse" />
          )}
        </div>
      </CastShadow>
    </div>
  );
}

const menuSections = [
  {
    title: "Favorites",
    items: [
      {
        label: "Create new document",
        pathD: "M12 4v16m8-8H4",
      },
      {
        label: "Publish document",
        pathD: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12",
      },
    ],
  },
  {
    title: "Navigation",
    items: [
      {
        label: "Search documents",
        pathD: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
        selected: true,
      },
      {
        label: "Go home",
        pathD:
          "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
      },
      {
        label: "Go to assistant",
        pathD:
          "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
      },
      {
        label: "Go to settings",
        pathD: [
          "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
          "M15 12a3 3 0 11-6 0 3 3 0 016 0z",
        ],
      },
      {
        label: "Go to integrations",
        pathD: "M13 10V3L4 14h7v7l9-11h-7z",
      },
    ],
  },
];

const keyMap: Record<string, string> = {
  meta: "meta",
  command: "meta",
  cmd: "meta",
  k: "k",
  y: "y",
  n: "n",
  x: "x",
  d: "d",
  i: "i",
  c: "c",
  o: "o",
  e: "e",
  tab: "tab",
  l: "l",
  enter: "enter",
  return: "enter",
  control: "control",
  ctrl: "control",
  alt: "alt",
  fn: "fn",
  function: "fn",
};

export function KeyboardSection() {
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());
  const [isFlipped, setIsFlipped] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const normalizedKey = keyMap[e.key.toLowerCase()];
      if (normalizedKey) {
        setPressedKeys((prev) => new Set([...prev, normalizedKey]));
      }

      // Check for ⌘+K combo to flip the card
      if (e.key.toLowerCase() === "k" && e.metaKey) {
        e.preventDefault();
        setIsFlipped((prev) => !prev);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const normalizedKey = keyMap[e.key.toLowerCase()];
      if (normalizedKey) {
        // Clear all keys when meta is released to prevent stuck states after shortcuts
        if (normalizedKey === "meta") {
          setPressedKeys(new Set());
        } else {
          setPressedKeys((prev) => {
            const next = new Set(prev);
            next.delete(normalizedKey);
            return next;
          });
        }
      }
    };

    const handleBlur = () => {
      setPressedKeys(new Set());
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  const isKeyPressed = (key: string) => pressedKeys.has(key);

  return (
    <div className="py-16">
      <div className="flex flex-col items-center gap-y-6">
        {/* Eyebrow and heading */}
        <div className="flex flex-col items-center text-center gap-y-3">
          <span className="text-[0.8125rem] font-medium text-black/50">Keyboard shortcuts</span>
          <h2 className="text-3xl tracking-tight font-medium text-black/85">
            Everything at your fingertips
          </h2>
          <p className="text-base/relaxed text-black/60 max-w-md text-balance">
            Press <span className="font-medium text-black/80">⌘K</span> to search, navigate, and
            access any feature instantly.
          </p>
        </div>

        <div className="relative w-full md:w-[1200px] h-[400px] overflow-visible">
          <div className="relative w-full h-full">
            <div
              className="md:absolute md:left-1/2 md:-translate-x-1/2 md:top-1/2 md:-translate-y-1/2 relative"
              style={{ perspective: "1000px" }}
            >
              <CastShadow className="w-full" strength={0.2}>
                <div className="size-full relative">
                  <GradientOutline />
                  <div className="rounded-xl absolute inset-0 bg-black/20" />
                  <div
                    className="relative w-full md:w-[440px] h-[320px]"
                    style={{
                      transformStyle: "preserve-3d",
                      transform: isFlipped ? "rotateX(180deg)" : "rotateX(0deg)",
                      transition: "transform 1200ms cubic-bezier(0.4, 0, 0.2, 1)",
                    }}
                  >
                    <div
                      className="absolute inset-0 flex flex-col rounded-xl shadow-legit bg-gray-50"
                      style={{ backfaceVisibility: "hidden" }}
                    >
                      <div className="flex items-center border-b border-gray-200 px-3 bg-white rounded-t-xl">
                        <svg
                          className="size-4 text-gray-400 mr-2"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                          />
                        </svg>
                        <input
                          type="text"
                          placeholder="Type a command or search..."
                          className="flex h-11 w-full border-none bg-transparent py-3 text-sm outline-none placeholder:text-gray-400"
                          readOnly
                        />
                      </div>

                      <div className="flex-1 overflow-y-auto p-2">
                        {menuSections.map((section, sectionIndex) => (
                          <div key={section.title}>
                            <div
                              className={clsx(
                                "px-2 py-1.5 text-xs font-medium text-gray-500",
                                sectionIndex > 0 && "mt-2",
                              )}
                            >
                              {section.title}
                            </div>
                            {section.items.map((item) => (
                              <div
                                key={item.label}
                                className={clsx(
                                  "flex items-center rounded-lg px-3 py-2.5 text-sm text-gray-800",
                                  item.selected
                                    ? "bg-gray-100"
                                    : "hover:bg-gray-100 cursor-pointer",
                                )}
                              >
                                <svg
                                  className="size-4 text-gray-400 mr-2"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                >
                                  {(Array.isArray(item.pathD) ? item.pathD : [item.pathD]).map(
                                    (d, i) => (
                                      <path
                                        key={i}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d={d}
                                      />
                                    ),
                                  )}
                                </svg>
                                <span>{item.label}</span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>

                      {/* Keyboard help footer */}
                      <div className="flex items-center justify-between border-t border-gray-200 px-3 py-2 bg-white text-xs text-gray-500 rounded-b-xl">
                        <div className="flex items-center gap-2">
                          <span className="flex items-center gap-1">
                            <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600 font-sans">
                              ↵
                            </kbd>
                            <span>to select</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="flex items-center gap-1">
                            <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600 font-sans">
                              ↑↓
                            </kbd>
                            <span>to navigate</span>
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* Back side - CTA */}
                    <div
                      className="absolute inset-0 flex flex-col items-center justify-center rounded-xl shadow-legit bg-gradient-to-br from-blue-500 to-blue-600 text-white p-8"
                      style={{
                        backfaceVisibility: "hidden",
                        transform: "rotateX(180deg)",
                      }}
                    >
                      <div className="text-center space-y-4">
                        <h3 className="text-2xl font-semibold">Ready to get started?</h3>
                        <p className="text-blue-100">Create your first document in seconds</p>
                        <a
                          href="https://app.lydie.co/auth"
                          className="inline-flex items-center gap-2 px-6 py-3 bg-white text-blue-600 rounded-lg font-medium hover:bg-blue-50 transition-colors"
                        >
                          Get Started Free
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M13 7l5 5m0 0l-5 5m5-5H6"
                            />
                          </svg>
                        </a>
                        <p className="text-sm text-blue-200">Press ⌘K again to flip back</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CastShadow>
            </div>

            {/* CMD+K - highlighted in center */}
            <div className="absolute z-10" style={{ left: "515px", top: "390px" }}>
              <Key
                label="⌘"
                width="cmd"
                isHighlighted={true}
                rotate={-15}
                dataKey="meta"
                isPressed={isKeyPressed("meta")}
              />
            </div>
            <div className="absolute z-10" style={{ right: "520px", top: "405px" }}>
              <Key
                label="K"
                isHighlighted={true}
                rotate={9}
                dataKey="k"
                isPressed={isKeyPressed("k")}
              />
            </div>

            {/* Scattered keys – L Y D I E . C O */}
            <div className="absolute" style={{ left: "-60px", top: "-150px" }}>
              <Key label="L" rotate={-15} dataKey="l" isPressed={isKeyPressed("l")} />
            </div>
            <div className="absolute" style={{ left: "180px", top: "-120px" }}>
              <Key label="Y" rotate={-8} dataKey="y" isPressed={isKeyPressed("y")} />
            </div>
            <div className="absolute" style={{ left: "1040px", top: "-100px" }}>
              <Key label="N" rotate={20} dataKey="n" isPressed={isKeyPressed("n")} />
            </div>

            <div className="absolute" style={{ right: "-100px", top: "10px" }}>
              <Key label="X" rotate={-6} dataKey="x" isPressed={isKeyPressed("x")} />
            </div>

            <div className="absolute" style={{ left: "220px", top: "30px" }}>
              <Key
                label="Tab"
                width="cmd"
                rotate={-20}
                dataKey="tab"
                isPressed={isKeyPressed("tab")}
              />
            </div>
            <div className="absolute" style={{ left: "120px", top: "120px" }}>
              <Key label="D" rotate={-16} dataKey="d" isPressed={isKeyPressed("d")} />
            </div>
            <div className="absolute" style={{ left: "280px", top: "130px" }}>
              <Key label="I" rotate={8} dataKey="i" isPressed={isKeyPressed("i")} />
            </div>

            <div className="absolute" style={{ right: "260px", top: "110px" }}>
              <Key label="C" rotate={-14} dataKey="c" isPressed={isKeyPressed("c")} />
            </div>
            <div className="absolute" style={{ right: "80px", top: "180px" }}>
              <Key label="O" rotate={-28} dataKey="o" isPressed={isKeyPressed("o")} />
            </div>
            <div className="absolute" style={{ left: "100px", top: "280px" }}>
              <Key label="E" rotate={15} dataKey="e" isPressed={isKeyPressed("e")} />
            </div>
            <div className="absolute" style={{ right: "-100px", top: "160px" }}>
              <Key
                label="Enter"
                width="wide"
                rotate={6}
                dataKey="enter"
                isPressed={isKeyPressed("enter")}
              />
            </div>

            <div className="absolute" style={{ left: "270px", top: "360px" }}>
              <Key
                label="Ctrl"
                width="cmd"
                rotate={-15}
                dataKey="control"
                isPressed={isKeyPressed("control")}
              />
            </div>
            <div className="absolute" style={{ left: "1020px", top: "360px" }}>
              <Key
                label="Alt"
                width="cmd"
                rotate={-8}
                dataKey="alt"
                isPressed={isKeyPressed("alt")}
              />
            </div>
            <div className="absolute" style={{ left: "1120px", top: "260px" }}>
              <Key label="Fn" width="fn" rotate={18} dataKey="fn" isPressed={isKeyPressed("fn")} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
