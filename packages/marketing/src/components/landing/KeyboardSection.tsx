import { clsx } from "clsx";
import { useEffect, useState } from "react";

import { CastShadow } from "../generic/CastShadow";
import { GradientOutline } from "../generic/GradientOutline";
import { SectionHeader } from "./SectionHeader";

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
    "relative h-[60px] ring-black/5 ring rounded-xl shadow-legit flex items-center justify-center text-[12px] font-semibold select-none transition-all duration-500 flex-shrink-0 shadow-sm",
    widthClasses[width] || widthClasses.normal,
    showHighlighted
      ? "bg-gradient-to-b from-[#3b82f6] to-[#2563eb] text-white border-[#1d4ed8] border-t-blue-400"
      : "text-black/60 bg-linear-to-t from-gray-200 to-gray-100",
    isPressed && "scale-[0.95] shadow-inner brightness-110",
  );

  return (
    <div
      data-key={dataKey}
      className="transition-transform duration-700 ease-out"
      style={{
        transform: rotate !== 0 ? `rotate(${rotate}deg)` : undefined,
      }}
    >
      <CastShadow className="w-full" height={10} strength={1} lightAngle={145 + rotate}>
        <div className={baseClasses}>
          <div
            className={clsx(
              "absolute inset-1.5 rounded-lg ring ring-black/3",
              showHighlighted ? "bg-blue-400" : "bg-white",
            )}
          />
          <span className="relative z-10">{label}</span>
          {showHighlighted && <div className="absolute inset-0 rounded-md bg-blue-400/20" />}
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

function CommandMenu() {
  return (
    <div className="relative w-full md:w-[440px] h-[320px]">
      <div className="absolute inset-0 flex flex-col rounded-xl shadow-legit bg-gray-50">
        <div className="flex items-center border-b border-gray-100 px-3 bg-white rounded-t-xl">
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
                  "px-3 py-1 text-xs font-medium text-gray-500 text-left",
                  sectionIndex > 0 && "mt-2",
                )}
              >
                {section.title}
              </div>
              {section.items.map((item) => (
                <div
                  key={item.label}
                  className={clsx(
                    "relative flex cursor-pointer select-none items-center rounded-lg px-3 py-3 text-sm outline-none text-gray-800 transition-colors duration-150",
                    item.selected ? "bg-gray-100 text-gray-950" : "hover:bg-gray-100",
                  )}
                >
                  <svg
                    className="size-4 text-gray-400 mr-2"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    {(Array.isArray(item.pathD) ? item.pathD : [item.pathD]).map((d, i) => (
                      <path key={i} strokeLinecap="round" strokeLinejoin="round" d={d} />
                    ))}
                  </svg>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2 bg-white text-xs text-gray-500 rounded-b-xl">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600 font-sans">↵</kbd>
              <span>to select</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600 font-sans">↑↓</kbd>
              <span>to navigate</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function KeyboardSection() {
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const normalizedKey = keyMap[e.key.toLowerCase()];
      if (normalizedKey) {
        setPressedKeys((prev) => new Set([...prev, normalizedKey]));
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
    <div className="py-16 flex flex-col items-center gap-y-6">
      <SectionHeader
        eyebrow="Keyboard shortcuts"
        title="Everything at your fingertips"
        description="Press ⌘K to search, navigate, and access any feature instantly."
        centered
      />

      <div className="relative w-full md:w-[1200px] h-[400px] flex flex-col md:block items-center gap-6">
        {/* Command Menu - responsive positioning */}
        <div className="md:absolute md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 px-4 md:px-0 w-full md:w-auto z-0">
          <CastShadow className="w-full" strength={0.2}>
            <div className="size-full relative">
              <GradientOutline />
              <div className="rounded-xl absolute inset-0 bg-black/20" />
              <CommandMenu />
            </div>
          </CastShadow>
        </div>

        <div className="absolute left-1/2 -translate-x-24 -bottom-[40px]">
          <Key
            label="⌘"
            width="cmd"
            isHighlighted={true}
            rotate={-15}
            dataKey="meta"
            isPressed={isKeyPressed("meta")}
          />
        </div>

        <div className="absolute left-1/2 -bottom-[60px]">
          <Key
            label="K"
            isHighlighted={true}
            rotate={9}
            dataKey="k"
            isPressed={isKeyPressed("k")}
          />
        </div>

        {/* L - positioned top-left */}
        <div className="absolute -left-[60px] -top-[150px]">
          <Key label="L" rotate={-15} dataKey="l" isPressed={isKeyPressed("l")} />
        </div>

        {/* Y - positioned top */}
        <div className="absolute left-[320px] -top-[200px] lg:left-[180px] lg:-top-[120px]">
          <Key label="Y" rotate={-8} dataKey="y" isPressed={isKeyPressed("y")} />
        </div>

        {/* N - positioned top-right */}
        <div className="absolute left-[1040px] -top-[100px]">
          <Key label="N" rotate={20} dataKey="n" isPressed={isKeyPressed("n")} />
        </div>

        {/* X - positioned right */}
        <div className="absolute -right-[100px] top-[10px]">
          <Key label="X" rotate={-6} dataKey="x" isPressed={isKeyPressed("x")} />
        </div>

        <div className="absolute left-[220px] top-[30px] hidden md:block">
          <Key label="Tab" width="cmd" rotate={-20} dataKey="tab" isPressed={isKeyPressed("tab")} />
        </div>
        <div className="absolute left-[120px] top-[120px] hidden md:block">
          <Key label="D" rotate={-16} dataKey="d" isPressed={isKeyPressed("d")} />
        </div>
        <div className="absolute left-[280px] top-[130px] hidden md:block">
          <Key label="I" rotate={8} dataKey="i" isPressed={isKeyPressed("i")} />
        </div>

        <div className="absolute right-[260px] top-[110px] hidden md:block">
          <Key label="C" rotate={-14} dataKey="c" isPressed={isKeyPressed("c")} />
        </div>
        <div className="absolute right-[80px] top-[180px] hidden md:block">
          <Key label="O" rotate={-28} dataKey="o" isPressed={isKeyPressed("o")} />
        </div>
        <div className="absolute left-[100px] top-[280px] hidden md:block">
          <Key label="E" rotate={15} dataKey="e" isPressed={isKeyPressed("e")} />
        </div>
        <div className="absolute -right-[100px] top-[160px]">
          <Key
            label="Enter"
            width="wide"
            rotate={6}
            dataKey="enter"
            isPressed={isKeyPressed("enter")}
          />
        </div>

        <div className="absolute left-[270px] top-[360px] hidden md:block">
          <Key
            label="Ctrl"
            width="cmd"
            rotate={-15}
            dataKey="control"
            isPressed={isKeyPressed("control")}
          />
        </div>
        <div className="absolute left-[1020px] top-[360px]">
          <Key label="Alt" width="cmd" rotate={-8} dataKey="alt" isPressed={isKeyPressed("alt")} />
        </div>
        <div className="absolute left-[1120px] top-[260px]">
          <Key label="Fn" width="fn" rotate={18} dataKey="fn" isPressed={isKeyPressed("fn")} />
        </div>
      </div>
    </div>
  );
}
