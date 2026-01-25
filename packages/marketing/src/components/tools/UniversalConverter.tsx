import { AlertCircle, Download, FileText, Upload } from "lucide-react";
import React, { useState } from "react";

import type { ConversionConfig } from "../../data/conversions";

import { Button } from "../generic/Button";
import { ToolHeader } from "./ToolHeader";

interface Props {
  config: ConversionConfig;
}

export function UniversalConverter({ config }: Props) {
  const [input, setInput] = useState("");
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1_000_000) {
      setError("File size must be less than 1MB");
      return;
    }

    const text = await file.text();
    setInput(text);
    setError(null);

    // Track file upload
    if (typeof window !== "undefined" && (window as any).gtag) {
      (window as any).gtag("event", "file_uploaded", {
        event_category: "converter",
        event_label: `${config.pandocFrom}_to_${config.pandocTo}`,
        file_size: file.size,
      });
    }
  };

  const handleConvert = async () => {
    if (!input.trim()) {
      setError("Please enter or upload content to convert");
      return;
    }

    if (input.length > 1_000_000) {
      setError("Content is too large. Please use a smaller file (max 1MB).");
      return;
    }

    setIsConverting(true);
    setError(null);

    // Track conversion start
    const startTime = Date.now();
    if (typeof window !== "undefined" && (window as any).gtag) {
      (window as any).gtag("event", "conversion_started", {
        event_category: "converter",
        event_label: `${config.pandocFrom}_to_${config.pandocTo}`,
        value: input.length,
      });
    }

    try {
      const response = await fetch(`${import.meta.env.PUBLIC_API_URL}/public/convert`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: input,
          from: config.pandocFrom,
          to: config.pandocTo,
          options: {
            standalone: true,
            toc: false,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Conversion failed");
      }

      // Download the converted file
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `document.${config.pandocTo}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Track successful conversion
      const conversionTime = Date.now() - startTime;
      if (typeof window !== "undefined" && (window as any).gtag) {
        (window as any).gtag("event", "conversion_completed", {
          event_category: "converter",
          event_label: `${config.pandocFrom}_to_${config.pandocTo}`,
          value: conversionTime,
          conversion_size: input.length,
        });
      }
    } catch (err) {
      console.error("Conversion error:", err);
      setError(err instanceof Error ? err.message : "Failed to convert file. Please try again.");

      // Track conversion error
      if (typeof window !== "undefined" && (window as any).gtag) {
        (window as any).gtag("event", "conversion_error", {
          event_category: "converter",
          event_label: `${config.pandocFrom}_to_${config.pandocTo}`,
          error_message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    } finally {
      setIsConverting(false);
    }
  };

  const charCount = input.length;
  const charLimit = 1_000_000;
  const charPercentage = (charCount / charLimit) * 100;

  return (
    <div className="flex flex-col gap-y-4">
      <ToolHeader title={config.h1} description={config.introText} />

      <div className="space-y-4">
        {/* Input area */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-900">
              Input ({config.fromFormat})
            </label>
            <label className="cursor-pointer">
              <input
                type="file"
                onChange={handleFileUpload}
                accept={`.${config.pandocFrom},.txt`}
                className="hidden"
              />
              <span className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                <Upload className="w-4 h-4" />
                Upload File
              </span>
            </label>
          </div>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Paste your ${config.fromFormat} content here...`}
            className="w-full min-h-[320px] p-4 ring ring-black/4 rounded-lg text-sm resize-y shadow-surface"
          />

          {/* Character count */}
          <div className="flex justify-between text-xs text-gray-500">
            <span>
              {charCount.toLocaleString()} / {charLimit.toLocaleString()} characters
            </span>
            {charPercentage > 80 && (
              <span className="text-orange-600 font-medium">
                {Math.round(charPercentage)}% of limit
              </span>
            )}
          </div>
        </div>

        {/* Convert button */}
        <Button
          onPress={handleConvert}
          intent="primary"
          size="lg"
          className="w-full flex items-center justify-center gap-2"
          isDisabled={!input.trim() || isConverting}
        >
          {isConverting ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Converting...
            </>
          ) : (
            <>
              <Download className="w-5 h-5" />
              Convert to {config.toFormat}
            </>
          )}
        </Button>

        {/* Error message */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Info box */}
        <div className="p-6 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-start gap-3">
            <FileText className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-blue-900">How it works</h3>
              <p className="text-sm text-blue-800">
                Paste or upload your {config.fromFormat} content above. Click the convert button to
                generate your {config.toFormat} file, which will download automatically. All
                conversions are processed securely and your files are never stored.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
