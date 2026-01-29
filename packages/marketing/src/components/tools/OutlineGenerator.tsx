import {
  ArrowDownloadRegular,
  DocumentRegular,
  ErrorCircleRegular,
  SparkleRegular,
} from "@fluentui/react-icons";
import React, { useState } from "react";

import { Button } from "../generic/Button";
import { ToolHeader } from "./ToolHeader";

interface ExampleTopic {
  type: "article" | "essay" | "report";
  topic: string;
  context: string;
  label: string;
}

const EXAMPLE_TOPICS: ExampleTopic[] = [
  {
    type: "article",
    topic: "The Future of Remote Work in 2026",
    context:
      "Target audience: professionals and business leaders. Focus on technology trends, work-life balance, and productivity tools.",
    label: "Remote Work Article",
  },
  {
    type: "essay",
    topic: "The Impact of Social Media on Mental Health",
    context:
      "Academic essay for college level. Include research perspectives, counterarguments, and evidence-based conclusions.",
    label: "Social Media Essay",
  },
  {
    type: "report",
    topic: "Quarterly Sales Performance Analysis",
    context:
      "Business report for executive team. Include key metrics, regional breakdowns, challenges, and recommendations for Q2 2026.",
    label: "Sales Report",
  },
  {
    type: "article",
    topic: "Beginner's Guide to Sustainable Living",
    context:
      "Practical tips for everyday people. Focus on budget-friendly solutions, easy wins, and common misconceptions.",
    label: "Sustainability Guide",
  },
  {
    type: "essay",
    topic: "The Role of AI in Education",
    context:
      "Argumentative essay examining benefits and risks. Consider student learning, teacher roles, and ethical implications.",
    label: "AI Education Essay",
  },
  {
    type: "report",
    topic: "Market Research: Plant-Based Food Industry",
    context:
      "Market analysis report covering trends, consumer demographics, competitive landscape, and growth projections.",
    label: "Market Research",
  },
];

export function OutlineGenerator() {
  const [topic, setTopic] = useState("");
  const [context, setContext] = useState("");
  const [outlineType, setOutlineType] = useState<"article" | "essay" | "report">("article");
  const [outline, setOutline] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExampleClick = (example: ExampleTopic) => {
    setTopic(example.topic);
    setContext(example.context);
    setOutlineType(example.type);
    setOutline("");
    setError(null);

    // Track example usage
    if (typeof window !== "undefined" && (window as any).gtag) {
      (window as any).gtag("event", "example_clicked", {
        event_category: "outline_generator",
        event_label: example.label,
      });
    }
  };

  const handleGenerate = async () => {
    if (!topic.trim()) {
      setError("Please enter a topic");
      return;
    }

    if (topic.length > 500) {
      setError("Topic is too long. Please keep it under 500 characters.");
      return;
    }

    if (context.length > 2000) {
      setError("Context is too long. Please keep it under 2000 characters.");
      return;
    }

    setIsGenerating(true);
    setError(null);
    setOutline("");

    // Track generation start
    const startTime = Date.now();
    if (typeof window !== "undefined" && (window as any).gtag) {
      (window as any).gtag("event", "outline_generation_started", {
        event_category: "outline_generator",
        event_label: outlineType,
        topic_length: topic.length,
      });
    }

    try {
      const response = await fetch(
        `${import.meta.env.PUBLIC_API_URL}/public/tools/generate-outline`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            topic,
            context: context || undefined,
            type: outlineType,
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to generate outline");
      }

      const data = await response.json();
      setOutline(data.outline);

      // Track successful generation
      const generationTime = Date.now() - startTime;
      if (typeof window !== "undefined" && (window as any).gtag) {
        (window as any).gtag("event", "outline_generation_completed", {
          event_category: "outline_generator",
          event_label: outlineType,
          value: generationTime,
          outline_length: data.outline.length,
        });
      }
    } catch (err) {
      console.error("Generation error:", err);
      setError(
        err instanceof Error ? err.message : "Failed to generate outline. Please try again.",
      );

      // Track generation error
      if (typeof window !== "undefined" && (window as any).gtag) {
        (window as any).gtag("event", "outline_generation_error", {
          event_category: "outline_generator",
          event_label: outlineType,
          error_message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([outline], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `outline-${topic
      .slice(0, 30)
      .replace(/[^a-z0-9]/gi, "-")
      .toLowerCase()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Track download
    if (typeof window !== "undefined" && (window as any).gtag) {
      (window as any).gtag("event", "outline_downloaded", {
        event_category: "outline_generator",
        event_label: outlineType,
      });
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(outline);
      // You could add a toast notification here
      if (typeof window !== "undefined" && (window as any).gtag) {
        (window as any).gtag("event", "outline_copied", {
          event_category: "outline_generator",
          event_label: outlineType,
        });
      }
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const topicCharCount = topic.length;
  const topicCharLimit = 500;
  const contextCharCount = context.length;
  const contextCharLimit = 2000;

  return (
    <div className="flex flex-col gap-y-4">
      <ToolHeader
        title="AI Outline Generator"
        description="Generate structured outlines for your content using AI. Perfect for articles, essays, and reports."
      />

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Form */}
        <div className="lg:col-span-2 space-y-4">
          {/* Outline Type Selection */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-900">Outline Type</label>
            <div className="flex gap-2">
              <button
                onClick={() => setOutlineType("article")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  outlineType === "article"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Article
              </button>
              <button
                onClick={() => setOutlineType("essay")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  outlineType === "essay"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Essay
              </button>
              <button
                onClick={() => setOutlineType("report")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  outlineType === "report"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Report
              </button>
            </div>
          </div>

          {/* Topic Input */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-900">Topic *</label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g., The Impact of AI on Modern Education"
              className="w-full p-3 ring ring-black/4 rounded-lg text-sm shadow-surface"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>
                {topicCharCount} / {topicCharLimit} characters
              </span>
            </div>
          </div>

          {/* Context Input */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-900">
              Additional Context (Optional)
            </label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Add any specific requirements, target audience, key points to include, or other details..."
              className="w-full min-h-[120px] p-3 ring ring-black/4 rounded-lg text-sm resize-y shadow-surface"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>
                {contextCharCount} / {contextCharLimit} characters
              </span>
              {contextCharCount > contextCharLimit * 0.8 && (
                <span className="text-orange-600 font-medium">
                  {Math.round((contextCharCount / contextCharLimit) * 100)}% of limit
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
            isDisabled={!topic.trim() || isGenerating}
          >
            {isGenerating ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Generating Outline...
              </>
            ) : (
              <>Generate Outline</>
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
            {EXAMPLE_TOPICS.map((example) => (
              <button
                key={example.label}
                onClick={() => handleExampleClick(example)}
                className="px-3 py-2.5 text-sm text-left bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <div className="font-medium text-gray-900">{example.label}</div>
                <div className="text-xs text-gray-600 mt-0.5 capitalize">{example.type}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Full-width sections below */}
      <div className="space-y-4">
        {/* Output area */}
        {outline && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-900">Generated Outline</label>
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

            <div className="w-full p-4 ring ring-black/4 rounded-lg text-sm bg-white shadow-surface whitespace-pre-wrap font-mono text-gray-800">
              {outline}
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
                Enter your topic and any additional context to generate a structured outline. Our AI
                will create a comprehensive outline tailored to your chosen format. You can then
                download or copy the outline to use in your writing process.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
