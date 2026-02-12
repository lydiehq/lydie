import { CastShadow } from "@/components/generic/CastShadow";
import { GradientOutline } from "@/components/generic/GradientOutline";

const codeLines = [
  { lineNum: 1, width: "60%", color: "bg-gray-100" },
  { lineNum: 2, width: "40%", color: "bg-gray-200" },
  { lineNum: 3, width: "80%", color: "bg-gray-100" },
  { lineNum: 4, width: "45%", color: "bg-gray-100" },
  { lineNum: 5, width: "70%", color: "bg-gray-200" },
  { lineNum: 6, width: "30%", color: "bg-gray-200" },
  { lineNum: 7, width: "55%", color: "bg-gray-100" },
  { lineNum: 8, width: "65%", color: "bg-gray-300" },
  { lineNum: 9, width: "35%", color: "bg-gray-200" },
  { lineNum: 10, width: "75%", color: "bg-gray-100" },
  { lineNum: 11, width: "50%", color: "bg-gray-100" },
  { lineNum: 12, width: "40%", color: "bg-gray-200" },
];

export function FeatureSpotOpenSource() {
  return (
    <div
      role="img"
      aria-label="Open source code illustration showing lines of code with syntax highlighting in gray tones"
      className="w-full"
    >
      <CastShadow className="w-full relative">
        <GradientOutline />
        <div className="rounded-2xl shadow-surface flex flex-col p-2 relative bg-white select-none w-full">
          <div className="flex items-center gap-x-1.5 mb-1.5">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="rounded-full size-3 ring ring-black/6 shrink-0" />
            ))}
          </div>
          <div className="w-full rounded-lg border border-outline-subtle overflow-hidden p-1">
            <div className="border-b border-gray-100 flex justify-between">
              <div className="h-3 rounded-full w-12 bg-black/5" />
              <div className="h-3 rounded-full w-12 bg-green-500" />
            </div>
            <div className="p-4">
              <div className="flex flex-col gap-y-2">
                {codeLines.map((line) => (
                  <div key={line.lineNum} className="flex items-center gap-x-3">
                    <div
                      className={`h-3 rounded-full ${line.color}`}
                      style={{ width: line.width }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </CastShadow>
    </div>
  );
}
