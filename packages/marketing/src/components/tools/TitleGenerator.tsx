import {
  ArrowDownloadRegular,
  DocumentRegular,
  ErrorCircleRegular,
  SparkleRegular,
} from "@fluentui/react-icons";
import React, { useState } from "react";

import { Button } from "../generic/Button";
import { ToolHeader } from "./ToolHeader";

interface ExamplePrompt {
  contentType: "blog" | "article" | "video" | "social";
  description: string;
  keywords: string;
  tone: string;
  label: string;
}

const EXAMPLE_PROMPTS: ExamplePrompt[] = [
  {
    contentType: "blog",
    description: "A comprehensive guide on getting started with meditation for beginners",
    keywords: "meditation, mindfulness, stress relief, mental health",
    tone: "friendly",
    label: "Meditation Guide",
  },
  {
    contentType: "article",
    description:
      "Analysis of recent developments in artificial intelligence and their impact on the job market",
    keywords: "AI, employment, automation, future of work",
    tone: "professional",
    label: "AI Impact Analysis",
  },
  {
    contentType: "video",
    description: "Quick tutorial on creating stunning food photography using a smartphone",
    keywords: "food photography, smartphone tips, lighting, composition",
    tone: "engaging",
    label: "Food Photography Tutorial",
  },
  {
    contentType: "social",
    description: "Announcing a new feature launch for our project management software",
    keywords: "product launch, productivity, team collaboration",
    tone: "exciting",
    label: "Product Launch",
  },
  {
    contentType: "blog",
    description: "Tips and strategies for saving money while traveling abroad",
    keywords: "budget travel, money saving tips, travel hacks",
    tone: "helpful",
    label: "Budget Travel Tips",
  },
  {
    contentType: "article",
    description: "The science behind climate change and what individuals can do to help",
    keywords: "climate change, sustainability, environmental action",
    tone: "informative",
    label: "Climate Action",
  },
];

export function TitleGenerator() {
  const [description, setDescription] = useState("");
  const [keywords, setKeywords] = useState("");
  const [contentType, setContentType] = useState<"blog" | "article" | "video" | "social">("blog");
  const [tone, setTone] = useState<
    "professional" | "friendly" | "engaging" | "informative" | "exciting"
  >("friendly");
  const [titles, setTitles] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExampleClick = (example: ExamplePrompt) => {
    setDescription(example.description);
    setKeywords(example.keywords);
    setContentType(example.contentType);
    setTone(example.tone);
    setTitles([]);
    setError(null);

    // Track example usage
    if (typeof window !== "undefined" && (window as any).gtag) {
      (window as any).gtag("event", "example_clicked", {
        event_category: "title_generator",
        event_label: example.label,
      });
    }
  };

  const handleGenerate = async () => {
    if (!description.trim()) {
      setError("Please enter a content description");
      return;
    }

    if (description.length > 1000) {
      setError("Description is too long. Please keep it under 1000 characters.");
      return;
    }

    if (keywords.length > 500) {
      setError("Keywords are too long. Please keep them under 500 characters.");
      return;
    }

    setIsGenerating(true);
    setError(null);
    setTitles([]);

    // Track generation start
    const startTime = Date.now();
    if (typeof window !== "undefined" && (window as any).gtag) {
      (window as any).gtag("event", "title_generation_started", {
        event_category: "title_generator",
        event_label: contentType,
        description_length: description.length,
      });
    }

    try {
      const response = await fetch(
        `${import.meta.env.PUBLIC_API_URL}/public/tools/generate-title`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            description,
            keywords: keywords || undefined,
            contentType,
            tone,
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to generate titles");
      }

      const data = await response.json();
      setTitles(data.titles);

      // Track successful generation
      const generationTime = Date.now() - startTime;
      if (typeof window !== "undefined" && (window as any).gtag) {
        (window as any).gtag("event", "title_generation_completed", {
          event_category: "title_generator",
          event_label: contentType,
          value: generationTime,
          titles_count: data.titles.length,
        });
      }
    } catch (err) {
      console.error("Generation error:", err);
      setError(err instanceof Error ? err.message : "Failed to generate titles. Please try again.");

      // Track generation error
      if (typeof window !== "undefined" && (window as any).gtag) {
        (window as any).gtag("event", "title_generation_error", {
          event_category: "title_generator",
          event_label: contentType,
          error_message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    const content = titles.map((title, idx) => `${idx + 1}. ${title}`).join("\n\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `titles-${description
      .slice(0, 30)
      .replace(/[^a-z0-9]/gi, "-")
      .toLowerCase()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Track download
    if (typeof window !== "undefined" && (window as any).gtag) {
      (window as any).gtag("event", "titles_downloaded", {
        event_category: "title_generator",
        event_label: contentType,
      });
    }
  };

  const handleCopy = async (title: string, index: number) => {
    try {
      await navigator.clipboard.writeText(title);
      if (typeof window !== "undefined" && (window as any).gtag) {
        (window as any).gtag("event", "title_copied", {
          event_category: "title_generator",
          event_label: contentType,
          title_position: index + 1,
        });
      }
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const descriptionCharCount = description.length;
  const descriptionCharLimit = 1000;
  const keywordsCharCount = keywords.length;
  const keywordsCharLimit = 500;

  return (
    <div className="flex flex-col gap-y-4">
      <ToolHeader
        title="AI Title Generator"
        description="Generate compelling titles for your content using AI. Perfect for blog posts, articles, videos, and social media."
      />

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Form */}
        <div className="lg:col-span-2 space-y-4">
          {/* Content Type Selection */}
          <div className="space-y-2">
            <div className="block text-sm font-medium text-gray-900">Content Type</div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setContentType("blog")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  contentType === "blog"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Blog Post
              </button>
              <button
                onClick={() => setContentType("article")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  contentType === "article"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Article
              </button>
              <button
                onClick={() => setContentType("video")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  contentType === "video"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Video
              </button>
              <button
                onClick={() => setContentType("social")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  contentType === "social"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Social Media
              </button>
            </div>
          </div>

          {/* Tone Selection */}
          <div className="space-y-2">
            <div className="block text-sm font-medium text-gray-900">Tone</div>
            <div className="flex gap-2 flex-wrap">
              {["professional", "friendly", "engaging", "informative", "exciting"].map((t) => (
                <button
                  key={t}
                  onClick={() => setTone(t as any)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                    tone === t
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Description Input */}
          <div className="space-y-2">
            <label
              htmlFor="description-textarea"
              className="block text-sm font-medium text-gray-900"
            >
              Content Description *
            </label>
            <textarea
              id="description-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what your content is about. Be specific to get better title suggestions."
              className="w-full min-h-[120px] p-3 ring ring-black/4 rounded-lg text-sm resize-y shadow-surface"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>
                {descriptionCharCount} / {descriptionCharLimit} characters
              </span>
              {descriptionCharCount > descriptionCharLimit * 0.8 && (
                <span className="text-orange-600 font-medium">
                  {Math.round((descriptionCharCount / descriptionCharLimit) * 100)}% of limit
                </span>
              )}
            </div>
          </div>

          {/* Keywords Input */}
          <div className="space-y-2">
            <label htmlFor="keywords-input" className="block text-sm font-medium text-gray-900">
              Keywords (Optional)
            </label>
            <input
              id="keywords-input"
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="e.g., productivity, remote work, time management"
              className="w-full p-3 ring ring-black/4 rounded-lg text-sm shadow-surface"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>
                {keywordsCharCount} / {keywordsCharLimit} characters
              </span>
            </div>
          </div>

          {/* Generate button */}
          <Button
            onPress={handleGenerate}
            intent="primary"
            size="lg"
            className="w-full flex items-center justify-center gap-2"
            isDisabled={!description.trim() || isGenerating}
          >
            {isGenerating ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Generating Titles...
              </>
            ) : (
              <>Generate Titles</>
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
          <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
            <SparkleRegular className="w-4 h-4" />
            Try an Example
          </div>
          <div className="flex flex-col gap-2">
            {EXAMPLE_PROMPTS.map((example) => (
              <button
                key={example.label}
                onClick={() => handleExampleClick(example)}
                className="px-3 py-2.5 text-sm text-left bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <div className="font-medium text-gray-900">{example.label}</div>
                <div className="text-xs text-gray-600 mt-0.5 capitalize">{example.contentType}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Full-width sections below */}
      <div className="space-y-4">
        {/* Output area */}
        {titles.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-900">
                Generated Titles ({titles.length})
              </label>
              <button
                onClick={handleDownload}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <ArrowDownloadRegular className="w-4 h-4" />
                Download All
              </button>
            </div>

            <div className="space-y-2">
              {titles.map((title, index) => (
                <div
                  key={index}
                  className="group p-4 ring ring-black/4 rounded-lg bg-white shadow-surface hover:ring-blue-200 transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">{title}</div>
                    </div>
                    <button
                      onClick={() => handleCopy(title, index)}
                      className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              ))}
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
                Describe your content, select the type and tone, and our AI will generate multiple
                compelling title options. Each title is crafted to capture attention and match your
                content's purpose. Copy your favorite or download all to review later.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
