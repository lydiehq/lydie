import { ChevronRightRegular } from "@fluentui/react-icons";
import { useEffect, useState } from "react";

import { Button } from "../generic/Button";
import { CastShadow } from "../generic/CastShadow";
import { GradientOutline } from "../generic/GradientOutline";

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin text-gray-500 ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

export function SpeedSection() {
  const [activeDoc, setActiveDoc] = useState(0);
  const docs = ["Project Brief", "Meeting Notes", "Requirements"];

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveDoc((prev) => (prev + 1) % docs.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative max-w-4xl mx-auto">
      <GradientOutline />
      <div className="grid grid-cols-2 z-0 gap-8">
        <CastShadow className="w-full" strength={0.2}>
          <div className="flex flex-col h-[400px] rounded-xl shadow-legit bg-white overflow-hidden relative border border-black/5">
            {/* Browser chrome */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-black/5 bg-gray-50/80">
              <div className="flex gap-1.5">
                <div className="size-2 rounded-full bg-red-400/80" />
                <div className="size-2 rounded-full bg-yellow-400/80" />
                <div className="size-2 rounded-full bg-green-400/80" />
              </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
              {/* Sidebar */}
              <div className="w-40 border-r border-black/5 bg-gray-50/50 p-3 space-y-2">
                <div className="text-xs font-medium text-gray-400 mb-3">Documents</div>
                {docs.map((doc, i) => (
                  <div
                    key={doc}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${
                      i === activeDoc ? "bg-blue-100/50 text-blue-700" : "text-gray-600"
                    }`}
                  >
                    {i === activeDoc && <Spinner className="size-3 shrink-0" />}
                    <span className="truncate">{doc}</span>
                  </div>
                ))}
              </div>

              {/* Content area */}
              <div className="flex-1 p-6 flex flex-col items-center justify-center gap-4">
                <Spinner className="size-10" />
                <p className="text-sm text-gray-500 animate-pulse">Loading document...</p>
                {/* Document skeleton */}
                <div className="w-full space-y-3 mt-6">
                  <div className="h-2.5 bg-gray-200/80 rounded animate-pulse w-3/4" />
                  <div className="h-2.5 bg-gray-200/80 rounded animate-pulse w-full" />
                  <div className="h-2.5 bg-gray-200/80 rounded animate-pulse w-5/6" />
                  <div className="h-2.5 bg-gray-200/80 rounded animate-pulse w-4/5" />
                </div>
              </div>
            </div>
          </div>
        </CastShadow>
        <div className="flex flex-col gap-y-4 col-span-1 justify-center pr-4">
          <h2 className="text-3xl tracking-tight font-medium text-black/85">
            Say goodbye to
            <span className="inline-flex items-center gap-1.5 ml-3">
              <Spinner className="size-5 inline" />
            </span>
          </h2>
          <p className="text-base/relaxed text-black/60 text-balance">
            While other tools leave you waiting, Lydie's local-first sync engine keeps navigation
            and actions near-instant. No loading screens. No waiting. Just flow.
          </p>
          <div className="flex items-center gap-1 mt-4">
            <Button href="https://app.lydie.co/auth" size="md" intent="primary">
              <span>Try it yourself</span>
              <ChevronRightRegular className="size-3.5 translate-y-px group-hover:translate-x-0.5 transition-transform duration-200" />
            </Button>
            <Button href="/features" size="md" intent="ghost">
              Learn more
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
