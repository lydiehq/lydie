import {
  ArrowDownloadRegular,
  DocumentRegular,
  ErrorCircleRegular,
  SparkleRegular,
} from "@fluentui/react-icons";
import React, { useState } from "react";

import { Button } from "../generic/Button";
import { ToolHeader } from "./ToolHeader";

interface ExampleDocument {
  content: string;
  format: "markdown" | "html" | "plain";
  style: "professional" | "academic" | "casual" | "structured";
  label: string;
}

const EXAMPLE_DOCUMENTS: ExampleDocument[] = [
  {
    label: "Messy Notes to Report",
    content: `project update meeting notes: john said we need to finish the api by friday. sarah mentioned the design system needs updating. budget is looking tight for q3. we discussed the new feature for user profiles. marketing team wants to launch next month. action items: fix auth bug, update docs, schedule user testing.`,
    format: "markdown",
    style: "professional",
  },
  {
    label: "Brain Dump to Essay",
    content: `climate change is bad and getting worse. we see more hurricanes and floods now. scientists say we need to reduce emissions. some countries are doing better than others. renewable energy is becoming cheaper. electric cars are popular. but there are still challenges with storage and infrastructure. people need to change their habits too. less flying, more local food. its a complex problem that requires everyone to work together. governments, companies, and individuals all have a role. the future depends on what we do now.`,
    format: "markdown",
    style: "academic",
  },
  {
    label: "Scattered Ideas to Blog",
    content: `tips for remote work. first, have a dedicated workspace. dont work from bed. second, take breaks. walk around. third, communicate with your team. use slack or zoom. fourth, set boundaries. dont work all hours. fifth, get dressed. pajamas are comfortable but not professional. sixth, use productivity tools. like todo lists. seventh, stay connected socially. virtual coffee chats help. eighth, exercise. sitting all day is bad.`,
    format: "markdown",
    style: "casual",
  },
  {
    label: "Raw Data to Structured",
    content: `Product: Widget Pro, Price: $99, Q1 Sales: 1200 units, Q2 Sales: 1500 units, Growth: 25%, Customer Rating: 4.5/5, Top Feature: Ease of use, Common Complaint: Battery life. Product: Widget Lite, Price: $49, Q1 Sales: 3000 units, Q2 Sales: 2800 units, Growth: -7%, Customer Rating: 4.2/5, Top Feature: Affordability, Common Complaint: Limited features. Product: Widget Max, Price: $199, Q1 Sales: 800 units, Q2 Sales: 1100 units, Growth: 38%, Customer Rating: 4.8/5, Top Feature: Premium build, Common Complaint: Price point.`,
    format: "markdown",
    style: "structured",
  },
  {
    label: "Email Draft to HTML",
    content: `hi team, quick update on the project. we finished phase 1 yesterday and phase 2 is starting monday. please review the attached docs and send feedback by wednesday. also remember the all-hands meeting on friday at 2pm. thanks, alex`,
    format: "html",
    style: "professional",
  },
  {
    label: "Jumbled List to Plain Text",
    content: `groceries: milk eggs bread cheese apples bananas yogurt chicken rice pasta tomatoes lettuce onions garlic olive oil salt pepper coffee tea`,
    format: "plain",
    style: "structured",
  },
];

export function DocumentFormatter() {
  const [content, setContent] = useState("");
  const [format, setFormat] = useState<"markdown" | "html" | "plain">("markdown");
  const [style, setStyle] = useState<"professional" | "academic" | "casual" | "structured">(
    "professional",
  );
  const [formattedContent, setFormattedContent] = useState("");
  const [isFormatting, setIsFormatting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExampleClick = (example: ExampleDocument) => {
    setContent(example.content);
    setFormat(example.format);
    setStyle(example.style);
    setFormattedContent("");
    setError(null);

    if (typeof window !== "undefined" && (window as any).gtag) {
      (window as any).gtag("event", "example_clicked", {
        event_category: "document_formatter",
        event_label: example.label,
      });
    }
  };

  const handleFormat = async () => {
    if (!content.trim()) {
      setError("Please enter some content to format");
      return;
    }

    if (content.length > 50000) {
      setError("Content is too long. Please keep it under 50,000 characters.");
      return;
    }

    setIsFormatting(true);
    setError(null);
    setFormattedContent("");

    const startTime = Date.now();
    if (typeof window !== "undefined" && (window as any).gtag) {
      (window as any).gtag("event", "formatting_started", {
        event_category: "document_formatter",
        event_label: style,
        content_length: content.length,
      });
    }

    try {
      const response = await fetch(
        `${import.meta.env.PUBLIC_API_URL}/public/tools/format-document`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content,
            format,
            style,
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to format document");
      }

      const data = await response.json();
      setFormattedContent(data.formattedContent);

      const formattingTime = Date.now() - startTime;
      if (typeof window !== "undefined" && (window as any).gtag) {
        (window as any).gtag("event", "formatting_completed", {
          event_category: "document_formatter",
          event_label: style,
          value: formattingTime,
          result_length: data.formattedContent.length,
        });
      }
    } catch (err) {
      console.error("Formatting error:", err);
      setError(err instanceof Error ? err.message : "Failed to format document. Please try again.");

      if (typeof window !== "undefined" && (window as any).gtag) {
        (window as any).gtag("event", "formatting_error", {
          event_category: "document_formatter",
          event_label: style,
          error_message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    } finally {
      setIsFormatting(false);
    }
  };

  const handleDownload = () => {
    const extensionMap = {
      markdown: "md",
      html: "html",
      plain: "txt",
    };

    const mimeMap = {
      markdown: "text/markdown",
      html: "text/html",
      plain: "text/plain",
    };

    const blob = new Blob([formattedContent], { type: mimeMap[format] });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `formatted-document.${extensionMap[format]}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (typeof window !== "undefined" && (window as any).gtag) {
      (window as any).gtag("event", "document_downloaded", {
        event_category: "document_formatter",
        event_label: format,
      });
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formattedContent);
      if (typeof window !== "undefined" && (window as any).gtag) {
        (window as any).gtag("event", "document_copied", {
          event_category: "document_formatter",
          event_label: format,
        });
      }
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const contentCharCount = content.length;
  const contentCharLimit = 50000;

  return (
    <div className="flex flex-col gap-y-4">
      <ToolHeader
        title="AI Document Formatter"
        description="Transform messy text into beautifully formatted documents. Choose your format style and output format."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="output-format" className="block text-sm font-medium text-gray-900">
                Output Format
              </label>
              <div id="output-format" className="flex flex-wrap gap-2">
                {(["markdown", "html", "plain"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFormat(f)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                      format === f
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="style-select" className="block text-sm font-medium text-gray-900">
                Style
              </label>
              <select
                id="style-select"
                value={style}
                onChange={(e) => setStyle(e.target.value as typeof style)}
                className="w-full p-3 ring ring-black/4 rounded-lg text-sm shadow-surface bg-white"
              >
                <option value="professional">Professional</option>
                <option value="academic">Academic</option>
                <option value="casual">Casual/Blog</option>
                <option value="structured">Highly Structured</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="content-textarea" className="block text-sm font-medium text-gray-900">
              Content to Format *
            </label>
            <textarea
              id="content-textarea"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste your messy notes, rough draft, or unformatted content here..."
              className="w-full min-h-[200px] p-3 ring ring-black/4 rounded-lg text-sm resize-y shadow-surface"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>
                {contentCharCount} / {contentCharLimit.toLocaleString()} characters
              </span>
              {contentCharCount > contentCharLimit * 0.8 && (
                <span className="text-orange-600 font-medium">
                  {Math.round((contentCharCount / contentCharLimit) * 100)}% of limit
                </span>
              )}
            </div>
          </div>

          <Button
            onPress={handleFormat}
            intent="primary"
            size="lg"
            className="w-full flex items-center justify-center gap-2"
            isDisabled={!content.trim() || isFormatting}
          >
            {isFormatting ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Formatting Document...
              </>
            ) : (
              <>Format Document</>
            )}
          </Button>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <ErrorCircleRegular className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
            <SparkleRegular className="w-4 h-4" />
            Try an Example
          </div>
          <div className="flex flex-col gap-2">
            {EXAMPLE_DOCUMENTS.map((example) => (
              <button
                key={example.label}
                onClick={() => handleExampleClick(example)}
                className="px-3 py-2.5 text-sm text-left bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <div className="font-medium text-gray-900">{example.label}</div>
                <div className="text-xs text-gray-600 mt-0.5 capitalize">
                  {example.style} → {example.format}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {formattedContent && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="block text-sm font-medium text-gray-900">Formatted Result</span>
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

            <div
              className={`w-full p-4 ring ring-black/4 rounded-lg text-sm bg-white shadow-surface whitespace-pre-wrap font-mono text-gray-800 overflow-auto max-h-[500px] ${
                format === "html" ? "text-xs" : ""
              }`}
            >
              {formattedContent}
            </div>
          </div>
        )}

        <div className="p-6 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-start gap-3">
            <DocumentRegular className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-blue-900">How it works</h3>
              <p className="text-sm text-blue-800">
                Paste your unformatted or messy content, choose your desired output format and
                style, and let AI transform it into a beautifully structured document. The formatter
                preserves your original meaning while improving readability and organization.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
