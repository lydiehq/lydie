import { useState } from "react";

import { Container } from "../Container";
import { CastShadow } from "../generic/CastShadow";

export function DarkModeSection() {
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Light mode: angle 45°, height 50, strength 0.2, black shadows
  // Dark mode: angle 225° (opposite), height 80, strength 0.35, black shadows (but longer)
  const lightAngle = isDarkMode ? 100 : 135;
  const height = isDarkMode ? 20 : 90;
  const strength = isDarkMode ? 0.5 : undefined;

  return (
    <div
      className={`transition-colors h-screen duration-[4.5s] ${isDarkMode ? "bg-black/20" : "bg-white"}`}
    >
      <Container className="py-16">
        <div className="flex flex-col items-center gap-y-8">
          {/* Header */}
          <div className="flex flex-col items-center text-center gap-y-3">
            <span
              className={`text-[0.8125rem] font-medium transition-colors duration-500 ${
                isDarkMode ? "text-gray-400" : "text-black/50"
              }`}
            >
              Dark Mode Demo
            </span>
            <h2
              className={`text-3xl tracking-tight font-medium transition-colors duration-500 ${
                isDarkMode ? "text-white" : "text-black/85"
              }`}
            >
              As the shadows grow long
            </h2>
            <p
              className={`text-base/relaxed max-w-md text-balance transition-colors duration-500 ${
                isDarkMode ? "text-gray-400" : "text-black/60"
              }`}
            >
              Toggle between light and dark mode to see how shadows adapt.
            </p>
          </div>

          {/* Toggle Button */}
          <div className="flex items-center gap-x-3">
            <span
              className={`text-sm transition-colors duration-500 ${
                isDarkMode ? "text-gray-400" : "text-black/50"
              }`}
            >
              {isDarkMode ? "Dark mode" : "Light mode"}
            </span>
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={`
                relative inline-flex h-8 w-16 items-center rounded-full
                transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2
                ${
                  isDarkMode ? "bg-gray-700 focus:ring-gray-500" : "bg-gray-200 focus:ring-gray-300"
                }
              `}
              aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              <span
                className={`
                  inline-block h-6 w-6 transform rounded-full
                  transition-transform duration-300 shadow-md
                  ${isDarkMode ? "translate-x-9 bg-gray-800" : "translate-x-1 bg-white"}
                `}
              >
                {isDarkMode ? (
                  // Moon icon
                  <svg
                    className="h-4 w-4 text-gray-400 absolute top-1 left-1"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                  </svg>
                ) : (
                  // Sun icon
                  <svg
                    className="h-4 w-4 text-yellow-500 absolute top-1 left-1"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 100 2h1z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </span>
            </button>
          </div>

          {/* Demo Cards showing dark mode UI */}
          <div className="relative w-full max-w-lg">
            <CastShadow
              className="w-full"
              lightAngle={lightAngle}
              height={height}
              strength={strength}
              borderRadius={3}
              animate={true}
            >
              <div
                className={`
                  flex flex-col w-full ring rounded-xl shadow-legit overflow-hidden relative
                  transition-colors duration-[4.5s]
                  ${isDarkMode ? "bg-gray-200 ring-white/10" : "bg-white ring-black/6"}
                `}
              >
                <div className="h-[300px]"></div>
              </div>
            </CastShadow>
          </div>
        </div>
      </Container>
    </div>
  );
}
