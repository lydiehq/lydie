import { clsx } from "clsx";
import { useEffect, useState } from "react";

import { CastShadow } from "../generic/CastShadow";
import { GradientOutline } from "../generic/GradientOutline";
import { CommandMenuIllustration, type CommandMenuSection } from "./CommandMenuIllustration";
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
    "relative h-[60px] ring-black/5 ring rounded-xl shadow-legit flex items-center justify-center text-[12px] font-semibold select-none transition-all duration-200 flex-shrink-0 shadow-sm",
    widthClasses[width] || widthClasses.normal,
    showHighlighted
      ? "bg-gradient-to-b from-[#3b82f6] to-[#2563eb] text-white border-[#1d4ed8] border-t-blue-400"
      : "text-black/60 bg-linear-to-t from-gray-200 to-gray-100",
    isPressed && "scale-[0.95] shadow-inner brightness-110",
  );

  return (
    <div
      data-key={dataKey}
      className="transition-transform duration-200 ease-out"
      style={{
        transform: rotate !== 0 ? `rotate(${rotate}deg)` : undefined,
      }}
    >
      <CastShadow className="w-full" height={10} strength={1} lightAngle={145 + rotate}>
        <div className={baseClasses}>
          <div
            className={clsx(
              "absolute inset-1.5 rounded-lg ring ring-black/3 transition-colors duration-200",
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

// Convert old menu sections format to new format
const commandMenuSections: CommandMenuSection[] = [
  {
    id: "favorites",
    heading: "Favorites",
    items: [
      { id: "create-doc", label: "Create new document…", icon: "add" },
      { id: "publish", label: "Publish document", icon: "publish" },
    ],
  },
  {
    id: "navigation",
    heading: "Navigation",
    items: [
      { id: "search", label: "Search documents", icon: "search", selected: true },
      { id: "home", label: "Go home", icon: "home" },
      { id: "assistant", label: "Go to assistant", icon: "assistant" },
      { id: "settings", label: "Go to settings", icon: "settings" },
      { id: "integrations", label: "Go to integrations", icon: "integrations" },
    ],
  },
];

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
              <div className="relative w-full md:w-[440px]">
                <CommandMenuIllustration
                  sections={commandMenuSections}
                  className="h-[320px]"
                  maxHeight="260px"
                />
              </div>
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
