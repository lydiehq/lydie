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
}

function ClipPathDebugOverlay({ lightAngle }: ClipPathDebugOverlayProps) {
  // Parse the polygon string to get points for SVG
  const polygonPoints = useMemo(() => {
    const clipPath = calculateClipPath(lightAngle);
    // Extract points from polygon(...) string
    const match = clipPath.match(/polygon\((.*)\)/);
    if (!match) return "";

    const pointsStr = match[1];
    // Convert percentage points to SVG coordinates (256x256 viewBox for w-64 = 256px)
    return pointsStr
      .split(",")
      .map((point) => {
        const [x, y] = point.trim().split(" ");
        const xNum = parseFloat(x);
        const yNum = parseFloat(y);
        // Convert percentages to coordinates (256 = 100%)
        return `${(xNum / 100) * 256},${(yNum / 100) * 256}`;
      })
      .join(" ");
  }, [lightAngle]);

  // Get the box corners for the outline
  const boxPoints = useMemo(() => {
    return DEBUG_BOX_CORNERS.map((c) => `${(c.x / 100) * 256},${(c.y / 100) * 256}`).join(" ");
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }}>
      <svg
        className="w-full h-full overflow-visible"
        viewBox="0 0 256 256"
        preserveAspectRatio="none"
      >
        {/* Box outline */}
        <polygon
          points={boxPoints}
          fill="none"
          stroke="#3B82F6"
          strokeWidth="2"
          strokeDasharray="4 2"
        />
        {/* Clip path polygon filled */}
        <polygon
          points={polygonPoints}
          fill="rgba(59, 130, 246, 0.3)"
          stroke="#2563EB"
          strokeWidth="2"
        />
      </svg>
    </div>
  );
}

export function CastShadowPlayground() {
  const [height, setHeight] = useState(50);
  const [lightAngle, setLightAngle] = useState(45);
  const [strength, setStrength] = useState(0.3);
  const [showClipPathDebug, setShowClipPathDebug] = useState(false);

  // Calculate light source position for visualization
  // 0° = right, 90° = top, 180° = left, 270° = bottom
  const lightRadians = (lightAngle * Math.PI) / 180;
  const lightX = 50 + Math.cos(lightRadians) * 35;
  const lightY = 50 - Math.sin(lightRadians) * 35; // Negate for CSS Y-down

  return (
    <div className="flex flex-col gap-y-8">
      {/* Controls */}
      <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
        <h2 className="text-sm font-medium text-gray-900 mb-4">3D Shadow Controls</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* 3D Height Control */}
          <div className="flex flex-col gap-y-2">
            <label htmlFor="box-height" className="text-sm text-gray-700">
              Box 3D Height (px)
            </label>
            <input
              id="box-height"
              type="range"
              min="0"
              max="150"
              value={height}
              onChange={(e) => setHeight(Number(e.target.value))}
              className="w-full accent-black"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>Flat (0)</span>
              <span className="font-medium text-gray-900">{height}px</span>
              <span>Tall (150)</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">Higher boxes cast longer, stronger shadows</p>
          </div>

          {/* Light Angle Control */}
          <div className="flex flex-col gap-y-2">
            <label htmlFor="light-angle" className="text-sm text-gray-700">
              Light Source Angle (degrees)
            </label>
            <input
              id="light-angle"
              type="range"
              min="0"
              max="360"
              value={lightAngle}
              onChange={(e) => setLightAngle(Number(e.target.value))}
              className="w-full accent-black"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>0° (Right)</span>
              <span className="font-medium text-gray-900">{lightAngle}°</span>
              <span>360°</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">Shadow extends opposite to light direction</p>
          </div>

          {/* Shadow Strength Control */}
          <div className="flex flex-col gap-y-2">
            <label htmlFor="shadow-strength" className="text-sm text-gray-700">
              Base Shadow Strength
            </label>
            <input
              id="shadow-strength"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={strength}
              onChange={(e) => setStrength(Number(e.target.value))}
              className="w-full accent-black"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>None (0)</span>
              <span className="font-medium text-gray-900">{strength.toFixed(2)}</span>
              <span>Max (1)</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">Multiplied by height factor</p>
          </div>
        </div>

        {/* Debug Toggle */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showClipPathDebug}
              onChange={(e) => setShowClipPathDebug(e.target.checked)}
              className="accent-blue-600"
            />
            <span className="text-sm text-gray-700">Show clip-path polygon (debug)</span>
          </label>
        </div>
      </div>

      {/* Preview Area */}
      <div className="relative bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl p-16 min-h-[500px] flex items-center justify-center overflow-hidden">
        {/* Light source visualization */}
        <div
          className="absolute w-12 h-12 flex items-center justify-center transition-all duration-300 ease-out"
          style={{
            left: `${lightX}%`,
            top: `${lightY}%`,
            transform: "translate(-50%, -50%)",
          }}
        >
          {/* Sun icon */}
          <div className="relative">
            <div className="w-8 h-8 rounded-full bg-yellow-400 shadow-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            {/* Light rays */}
            <div className="absolute inset-0 animate-pulse">
              <div className="absolute -inset-4 rounded-full bg-yellow-300/30" />
            </div>
          </div>
          <div className="absolute top-full mt-1 text-xs text-gray-500 font-medium whitespace-nowrap">
            Light {lightAngle}°
          </div>
        </div>

        {/* Shadow direction indicator */}
        <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#9CA3AF" />
            </marker>
          </defs>
          <line
            x1={`${lightX}%`}
            y1={`${lightY}%`}
            x2="50%"
            y2="50%"
            stroke="#E5E7EB"
            strokeWidth="2"
            strokeDasharray="4 4"
          />
        </svg>

        {/* Box with cast shadow */}
        <div className="relative" style={{ zIndex: 2 }}>
          <CastShadow height={height} lightAngle={lightAngle} strength={strength}>
            <div className="w-64 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <div className="space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                  <div className="h-3 bg-gray-200 rounded w-5/6" />
                  <div className="h-3 bg-gray-200 rounded w-2/3" />
                </div>
              </div>
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  Height: {height}px | Angle: {lightAngle}°
                </p>
              </div>
            </div>
          </CastShadow>

          {/* Debug overlay showing clip-path polygon */}
          {showClipPathDebug && <ClipPathDebugOverlay lightAngle={lightAngle} />}
        </div>

        {/* Ground plane indication */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-xs text-gray-400">
          Ground plane
        </div>
      </div>

      {/* Code reference */}
      <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
        <pre className="text-sm text-gray-300">
          <code>{`<CastShadow
  height={${height}}
  lightAngle={${lightAngle}}
  strength={${strength}}
>
  <Box />
</CastShadow>`}</code>
        </pre>
      </div>

      {/* Documentation */}
      <div className="prose max-w-none text-sm">
        <h3 className="text-base font-medium text-gray-900">How it works</h3>
        <ul className="text-gray-600 space-y-1">
          <li>
            <strong>Height:</strong> Represents the 3D extrusion of the box. A taller box (higher{" "}
            <code>height</code> value) casts a longer shadow because more light is blocked.
          </li>
          <li>
            <strong>Light Angle:</strong> The direction the light is coming from, in degrees. 0° is
            from the right, 90° is from above, 180° is from the left. The shadow always extends in
            the opposite direction.
          </li>
          <li>
            <strong>Clip Path:</strong> The CSS clip-path polygon is calculated dynamically based on
            the light angle to create the shadow direction.
          </li>
          <li>
            <strong>Shadow Layers:</strong> Multiple box-shadow layers are calculated with
            decreasing opacity to create a realistic long shadow effect.
          </li>
        </ul>
      </div>
    </div>
  );
}
