import {
  ArrowDownloadRegular,
  DocumentRegular,
  ErrorCircleRegular,
  SparkleRegular,
} from "@fluentui/react-icons";
import React, { useState } from "react";

import { Button } from "../generic/Button";
import { ToolHeader } from "./ToolHeader";

interface ExampleText {
  type: "short" | "medium" | "detailed";
  text: string;
  label: string;
}

const EXAMPLE_TEXTS: ExampleText[] = [
  {
    type: "medium",
    text: `Artificial intelligence is rapidly transforming the workplace in ways we're only beginning to understand. From automating routine tasks to providing data-driven insights, AI tools are reshaping how we work across industries. Companies that embrace AI are seeing significant productivity gains, with some reporting up to 40% efficiency improvements in specific workflows. However, this transformation isn't without challenges. Workers express concerns about job displacement, while managers grapple with integrating AI tools into existing processes. The key to successful AI adoption lies in viewing it as a collaborative tool that augments human capabilities rather than replaces them. Organizations that invest in training their workforce to work alongside AI are seeing the best results, creating hybrid workflows that leverage both human creativity and machine efficiency.`,
    label: "AI in the Workplace",
  },
  {
    type: "short",
    text: `Climate change continues to accelerate, with 2025 marking one of the warmest years on record. Scientists warn that without immediate action to reduce greenhouse gas emissions, we'll face increasingly severe weather events, rising sea levels, and disrupted ecosystems. The transition to renewable energy is critical, but it must happen faster than current projections suggest.`,
    label: "Climate Change Update",
  },
  {
    type: "detailed",
    text: `The rise of remote work has fundamentally altered our relationship with the workplace. What began as a necessity during the pandemic has evolved into a permanent shift in how we think about work-life balance, productivity, and collaboration. Studies show that remote workers report higher job satisfaction and better work-life balance, while companies benefit from access to global talent pools and reduced overhead costs. However, the transition hasn't been without growing pains. Many organizations struggle with maintaining company culture, ensuring effective communication, and preventing employee burnout when work and home life blur together. The most successful remote-first companies have invested heavily in digital infrastructure, established clear communication protocols, and created intentional opportunities for team bonding. Looking ahead, the future of work likely isn't fully remote or fully in-office, but rather a flexible hybrid model that allows employees to choose the environment where they work best. This flexibility represents a fundamental shift in workplace philosophy, prioritizing outcomes over presence and trusting employees to manage their own productivity.`,
    label: "Future of Remote Work",
  },
  {
    type: "short",
    text: `Regular exercise provides numerous health benefits beyond physical fitness. It improves cardiovascular health, strengthens bones, enhances mental well-being, and can help prevent chronic diseases like diabetes and heart disease. Health experts recommend at least 150 minutes of moderate aerobic activity per week.`,
    label: "Exercise Benefits",
  },
];

export function TextSummarizer() {
  const [text, setText] = useState("");
  const [summaryLength, setSummaryLength] = useState<"short" | "medium" | "detailed">("medium");
  const [summary, setSummary] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExampleClick = (example: ExampleText) => {
    setText(example.text);
    setSummaryLength(example.type);
    setSummary("");
    setError(null);

    // Track example usage
    if (typeof window !== "undefined" && (window as any).gtag) {
      (window as any).gtag("event", "example_clicked", {
        event_category: "text_summarizer",
        event_label: example.label,
      });
    }
  };

  const handleGenerate = async () => {
    if (!text.trim()) {
      setError("Please enter text to summarize");
      return;
    }

    if (text.length < 100) {
      setError("Text is too short to summarize. Please enter at least 100 characters.");
      return;
    }

    if (text.length > 50000) {
      setError("Text is too long. Please keep it under 50,000 characters.");
      return;
    }

    setIsGenerating(true);
    setError(null);
    setSummary("");

    // Track generation start
    const startTime = Date.now();
    if (typeof window !== "undefined" && (window as any).gtag) {
      (window as any).gtag("event", "summary_generation_started", {
        event_category: "text_summarizer",
        event_label: summaryLength,
        text_length: text.length,
      });
    }

    try {
      const response = await fetch(
        `${import.meta.env.PUBLIC_API_URL}/public/tools/generate-summary`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text,
            length: summaryLength,
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to generate summary");
      }

      const data = await response.json();
      setSummary(data.summary);

      // Track successful generation
      const generationTime = Date.now() - startTime;
      if (typeof window !== "undefined" && (window as any).gtag) {
        (window as any).gtag("event", "summary_generation_completed", {
          event_category: "text_summarizer",
          event_label: summaryLength,
          value: generationTime,
          summary_length: data.summary.length,
        });
      }
    } catch (err) {
      console.error("Generation error:", err);
      setError(
        err instanceof Error ? err.message : "Failed to generate summary. Please try again.",
      );

      // Track generation error
      if (typeof window !== "undefined" && (window as any).gtag) {
        (window as any).gtag("event", "summary_generation_error", {
          event_category: "text_summarizer",
          event_label: summaryLength,
          error_message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    const content = `# AI Text Summary\n\n## Original Text\n${text}\n\n## Summary\n${summary}`;
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `summary-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Track download
    if (typeof window !== "undefined" && (window as any).gtag) {
      (window as any).gtag("event", "summary_downloaded", {
        event_category: "text_summarizer",
        event_label: summaryLength,
      });
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      // You could add a toast notification here
      if (typeof window !== "undefined" && (window as any).gtag) {
        (window as any).gtag("event", "summary_copied", {
          event_category: "text_summarizer",
          event_label: summaryLength,
        });
      }
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const textCharCount = text.length;
  const textCharLimit = 50000;
  const wordCount = text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0).length;

  return (
    <div className="flex flex-col gap-y-4">
      <ToolHeader
        title="AI Text Summarizer"
        description="Generate concise summaries of any text using AI. Perfect for articles, reports, research papers, and documents."
      />

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Form */}
        <div className="lg:col-span-2 space-y-4">
          {/* Summary Length Selection */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-900">Summary Length</label>
            <div className="flex gap-2">
              <button
                onClick={() => setSummaryLength("short")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  summaryLength === "short"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Short
              </button>
              <button
                onClick={() => setSummaryLength("medium")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  summaryLength === "medium"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Medium
              </button>
              <button
                onClick={() => setSummaryLength("detailed")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  summaryLength === "detailed"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Detailed
              </button>
            </div>
            <p className="text-xs text-gray-500">
              {summaryLength === "short" && "1-2 sentences capturing the main point"}
              {summaryLength === "medium" && "A paragraph with key points and context"}
              {summaryLength === "detailed" && "Multiple paragraphs with comprehensive coverage"}
            </p>
          </div>

          {/* Text Input */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-900">Text to Summarize *</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste the text you want to summarize here..."
              className="w-full min-h-[300px] p-3 ring ring-black/4 rounded-lg text-sm resize-y shadow-surface"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>
                {textCharCount.toLocaleString()} characters · {wordCount} words
              </span>
              {textCharCount > textCharLimit * 0.8 && (
                <span className="text-orange-600 font-medium">
                  {Math.round((textCharCount / textCharLimit) * 100)}% of limit
                </span>
              )}
            </div>
          </div>

          {/* Generate button */}
          <Button
            onPress={handleGenerate}
            intent="primary"
            size="lg"
            className="w-full flex items-center justify-center gap-2"
            isDisabled={!text.trim() || isGenerating}
          >
            {isGenerating ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Generating Summary...
              </>
            ) : (
              <>Generate Summary</>
            )}
          </Button>

          {/* Error message */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <ErrorCircleRegular className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Right column: Examples */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-900">
            <SparkleRegular className="w-4 h-4" />
            Try an Example
          </label>
          <div className="flex flex-col gap-2">
            {EXAMPLE_TEXTS.map((example) => (
              <button
                key={example.label}
                onClick={() => handleExampleClick(example)}
                className="px-3 py-2.5 text-sm text-left bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <div className="font-medium text-gray-900">{example.label}</div>
                <div className="text-xs text-gray-600 mt-0.5 capitalize">{example.type} length</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Full-width sections below */}
      <div className="space-y-4">
        {/* Output area */}
        {summary && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-900">Generated Summary</label>
              <div className="flex gap-2">
                <button
                  onClick={handleCopy}
                  className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Copy
                </button>
                <button
                  onClick={handleDownload}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <ArrowDownloadRegular className="w-4 h-4" />
                  Download
                </button>
              </div>
            </div>

            <div className="w-full p-4 ring ring-black/4 rounded-lg text-sm bg-white shadow-surface whitespace-pre-wrap text-gray-800">
              {summary}
            </div>
          </div>
        )}

        {/* Info box */}
        <div className="p-6 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-start gap-3">
            <DocumentRegular className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-blue-900">How it works</h3>
              <p className="text-sm text-blue-800">
                Paste your text and choose your preferred summary length. Our AI will analyze the
                content and generate a concise summary that captures the key points and main ideas.
                Perfect for quickly understanding long articles, research papers, or reports.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
