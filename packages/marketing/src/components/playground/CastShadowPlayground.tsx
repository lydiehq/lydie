import { useMemo, useState } from "react";

import { calculateClipPath, CastShadow } from "../generic/CastShadow";

// Box corners for debug overlay (clockwise: top-left, top-right, bottom-right, bottom-left)
const DEBUG_BOX_CORNERS = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
] as const;

interface ClipPathDebugOverlayProps {
  lightAngle: number;
  boxSize: number;
}

function ClipPathDebugOverlay({ lightAngle, boxSize }: ClipPathDebugOverlayProps) {
  const polygonPoints = useMemo(() => {
    const clipPath = calculateClipPath(lightAngle);
    const match = clipPath.match(/polygon\((.*)\)/);
    if (!match) return "";

    const pointsStr = match[1];
    return pointsStr
      .split(",")
      .map((point) => {
        const [x, y] = point.trim().split(" ");
        const xNum = parseFloat(x);
        const yNum = parseFloat(y);
        return `${(xNum / 100) * boxSize},${(yNum / 100) * boxSize}`;
      })
      .join(" ");
  }, [lightAngle, boxSize]);

  const boxPoints = useMemo(() => {
    return DEBUG_BOX_CORNERS.map((c) => `${(c.x / 100) * boxSize},${(c.y / 100) * boxSize}`).join(
      " ",
    );
  }, [boxSize]);

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }}>
      <svg
        className="w-full h-full overflow-visible"
        viewBox={`0 0 ${boxSize} ${boxSize}`}
        preserveAspectRatio="none"
      >
        <polygon
          points={boxPoints}
          fill="none"
          stroke="#6366f1"
          strokeWidth="2"
          strokeDasharray="4 2"
        />
        <polygon
          points={polygonPoints}
          fill="rgba(99, 102, 241, 0.2)"
          stroke="#4f46e5"
          strokeWidth="2"
        />
      </svg>
    </div>
  );
}

function Control({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
  description,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
  description?: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-700">{label}</label>
        <span className="text-sm font-semibold text-indigo-600 tabular-nums">
          {value.toFixed(step < 1 ? 2 : 0)}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 hover:accent-indigo-500 transition-all"
      />
      {description && <p className="text-xs text-slate-400">{description}</p>}
    </div>
  );
}

export function CastShadowPlayground() {
  const [boxSize, setBoxSize] = useState(280);
  const [height, setHeight] = useState(60);
  const [lightAngle, setLightAngle] = useState(135);
  const [strength, setStrength] = useState(0.35);
  const [showClipPathDebug, setShowClipPathDebug] = useState(false);

  const lightRadians = (lightAngle * Math.PI) / 180;
  const lightX = 50 + Math.cos(lightRadians) * 40;
  const lightY = 50 - Math.sin(lightRadians) * 40;

  return (
    <div className="min-h-[calc(100vh-12rem)] flex flex-col lg:flex-row gap-8 items-start">
      {/* Preview Area */}
      <div className="flex-1 w-full">
        <div
          className="relative bg-gradient-to-br from-slate-50 via-white to-slate-100 rounded-2xl border border-slate-200/60 shadow-sm"
          style={{ minHeight: Math.max(500, boxSize + 120) }}
        >
          {/* Light source */}
          <div
            className="absolute w-10 h-10 flex items-center justify-center transition-all duration-500 ease-out"
            style={{
              left: `${lightX}%`,
              top: `${lightY}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            <div className="relative">
              <div className="w-6 h-6 rounded-full bg-amber-300 shadow-lg shadow-amber-200 flex items-center justify-center">
                <svg className="w-4 h-4 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="absolute -inset-3 rounded-full bg-amber-200/40 animate-pulse" />
            </div>
          </div>

          {/* Light ray line */}
          <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
            <line
              x1={`${lightX}%`}
              y1={`${lightY}%`}
              x2="50%"
              y2="50%"
              stroke="#e2e8f0"
              strokeWidth="1.5"
              strokeDasharray="6 4"
            />
          </svg>

          {/* Center box */}
          <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 2 }}>
            <div className="relative">
              <CastShadow height={height} lightAngle={lightAngle} strength={strength}>
                <div
                  className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-300"
                  style={{ width: boxSize, height: boxSize }}
                >
                  {/* Box content */}
                  <div className="h-full flex flex-col">
                    <div className="p-5 flex items-center gap-2 border-b border-slate-100">
                      <div className="w-3 h-3 rounded-full bg-rose-400" />
                      <div className="w-3 h-3 rounded-full bg-amber-400" />
                      <div className="w-3 h-3 rounded-full bg-emerald-400" />
                    </div>
                    <div className="flex-1 p-5 space-y-3">
                      <div className="h-2.5 bg-slate-100 rounded-full w-3/4" />
                      <div className="h-2.5 bg-slate-100 rounded-full w-1/2" />
                      <div className="h-2.5 bg-slate-100 rounded-full w-5/6" />
                      <div className="h-2.5 bg-slate-100 rounded-full w-2/3" />
                      <div className="h-2.5 bg-slate-100 rounded-full w-4/5" />
                    </div>
                    <div className="px-5 py-3 bg-slate-50/80 border-t border-slate-100">
                      <p className="text-xs text-slate-400 font-medium">
                        {boxSize}px × {boxSize}px
                      </p>
                    </div>
                  </div>
                </div>
              </CastShadow>

              {/* Debug overlay */}
              {showClipPathDebug && (
                <div className="absolute inset-0">
                  <ClipPathDebugOverlay lightAngle={lightAngle} boxSize={boxSize} />
                </div>
              )}
            </div>
          </div>

          {/* Angle indicator */}
          <div className="absolute bottom-6 left-6 flex items-center gap-2">
            <div className="px-3 py-1.5 bg-white/80 backdrop-blur-sm rounded-lg border border-slate-200 shadow-sm">
              <span className="text-xs font-medium text-slate-600">{lightAngle}°</span>
            </div>
          </div>
        </div>
      </div>

      {/* Controls Panel */}
      <div className="w-full lg:w-80 flex-shrink-0">
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6 space-y-6 sticky top-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Shadow Controls</h2>
            <p className="text-sm text-slate-500 mt-1">Customize the 3D shadow effect</p>
          </div>

          <div className="space-y-6">
            <Control
              label="Box Size"
              value={boxSize}
              min={120}
              max={400}
              unit="px"
              onChange={setBoxSize}
              description="Controls both width and height"
            />

            <Control
              label="3D Height"
              value={height}
              min={0}
              max={150}
              unit="px"
              onChange={setHeight}
              description="Higher boxes cast longer shadows"
            />

            <Control
              label="Light Angle"
              value={lightAngle}
              min={0}
              max={360}
              unit="°"
              onChange={setLightAngle}
              description="Direction of light source"
            />

            <Control
              label="Shadow Strength"
              value={strength}
              min={0}
              max={1}
              step={0.05}
              onChange={setStrength}
              description="Intensity of the shadow effect"
            />
          </div>

          <div className="pt-4 border-t border-slate-100">
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={showClipPathDebug}
                  onChange={(e) => setShowClipPathDebug(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
              </div>
              <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors">
                Show clip-path debug
              </span>
            </label>
          </div>

          {/* Code snippet */}
          <div className="pt-4 border-t border-slate-100">
            <p className="text-xs font-medium text-slate-500 mb-2">Usage</p>
            <pre className="text-xs bg-slate-900 text-slate-300 p-3 rounded-lg overflow-x-auto">
              <code>{`<CastShadow
  height={${height}}
  lightAngle={${lightAngle}}
  strength={${strength.toFixed(2)}}
>
  <Box />
</CastShadow>`}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
