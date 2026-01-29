import {
  ArrowDownloadRegular,
  DocumentRegular,
  TextClearFormattingRegular,
} from "@fluentui/react-icons";
import React, { useEffect, useMemo, useState } from "react";

import { Button } from "../generic/Button";
import { ToolHeader } from "./ToolHeader";

interface WordCountStats {
  words: number;
  characters: number;
  charactersNoSpaces: number;
  sentences: number;
  paragraphs: number;
  readingTime: number;
  speakingTime: number;
  averageWordLength: number;
}

const EXAMPLE_TEXTS = [
  {
    label: "Blog Post",
    text: `The Evolution of Remote Work

Remote work has transformed from a rare perk to a mainstream reality. As technology continues to advance, the boundaries between office and home have blurred significantly.

Companies worldwide are embracing flexible work arrangements, recognizing that productivity isn't tied to physical location. This shift has opened up opportunities for talent acquisition beyond geographical constraints.

However, challenges remain. Communication, team cohesion, and work-life balance require intentional effort in remote settings. Organizations must adapt their culture and tools to support distributed teams effectively.

Looking ahead, hybrid models are likely to dominate. The future of work isn't just remote or in-office—it's about giving people the flexibility to work where they're most productive.`,
  },
  {
    label: "Academic Essay",
    text: `The Impact of Social Media on Society

Social media platforms have fundamentally altered how we communicate, share information, and form communities. While these technologies offer unprecedented connectivity, they also present complex challenges for individuals and society at large.

One significant benefit is the democratization of information. Anyone with internet access can share their voice, breaking down traditional barriers to public discourse. This has empowered marginalized communities and facilitated social movements worldwide.

Conversely, the spread of misinformation poses serious risks. False information can propagate rapidly, influencing public opinion and even election outcomes. The algorithmic curation of content often creates echo chambers, reinforcing existing beliefs rather than exposing users to diverse perspectives.

Mental health concerns have also emerged. Studies link excessive social media use to anxiety, depression, and decreased self-esteem, particularly among young people. The constant comparison to curated online personas creates unrealistic expectations and social pressure.

In conclusion, social media is neither inherently good nor bad—it's a tool whose impact depends on how we use it. Critical digital literacy, thoughtful platform design, and mindful usage are essential for maximizing benefits while minimizing harms.`,
  },
  {
    label: "Short Story",
    text: `She found the letter tucked between the pages of an old book, yellowed with age and folded precisely into thirds. The handwriting was familiar, yet impossible—her grandmother had passed away twenty years ago.

"My dearest," it began, "if you're reading this, then the bookshop has found you."

Sarah looked up from the letter to the dusty shelves surrounding her. She'd wandered into this place on a whim, seeking shelter from the rain. Now, as thunder rumbled outside, she felt the weight of something larger at play.

The letter continued with specific instructions: turn to page 247 of the book that held it. With trembling hands, she did.

What she found there would change everything.`,
  },
];

export function WordCounter() {
  const [text, setText] = useState("");
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Calculate all stats
  const stats = useMemo<WordCountStats>(() => {
    if (!text.trim()) {
      return {
        words: 0,
        characters: 0,
        charactersNoSpaces: 0,
        sentences: 0,
        paragraphs: 0,
        readingTime: 0,
        speakingTime: 0,
        averageWordLength: 0,
      };
    }

    // Count words (split by whitespace and filter empty strings)
    const words = text
      .trim()
      .split(/\s+/)
      .filter((word) => word.length > 0);
    const wordCount = words.length;

    // Count characters
    const characters = text.length;
    const charactersNoSpaces = text.replace(/\s/g, "").length;

    // Count sentences (basic: split by . ! ?)
    const sentences = text.split(/[.!?]+/).filter((sentence) => sentence.trim().length > 0).length;

    // Count paragraphs (split by double newline or more)
    const paragraphs = text.split(/\n\s*\n/).filter((para) => para.trim().length > 0).length;

    // Calculate reading time (average reading speed: 200-250 words per minute)
    const readingTime = Math.ceil(wordCount / 225);

    // Calculate speaking time (average speaking speed: 130-150 words per minute)
    const speakingTime = Math.ceil(wordCount / 140);

    // Calculate average word length
    const totalWordLength = words.reduce((sum, word) => sum + word.length, 0);
    const averageWordLength = wordCount > 0 ? totalWordLength / wordCount : 0;

    return {
      words: wordCount,
      characters,
      charactersNoSpaces,
      sentences,
      paragraphs,
      readingTime,
      speakingTime,
      averageWordLength,
    };
  }, [text]);

  const handleExampleClick = (example: { label: string; text: string }) => {
    setText(example.text);
    setShowClearConfirm(false);

    // Track example usage
    if (typeof window !== "undefined" && (window as any).gtag) {
      (window as any).gtag("event", "example_clicked", {
        event_category: "word_counter",
        event_label: example.label,
      });
    }
  };

  const handleClear = () => {
    if (text.trim()) {
      setShowClearConfirm(true);
    }
  };

  const confirmClear = () => {
    setText("");
    setShowClearConfirm(false);

    // Track clear action
    if (typeof window !== "undefined" && (window as any).gtag) {
      (window as any).gtag("event", "text_cleared", {
        event_category: "word_counter",
      });
    }
  };

  const handleDownload = () => {
    const statsText = `Word Count Statistics
====================

Words: ${stats.words}
Characters (with spaces): ${stats.characters}
Characters (without spaces): ${stats.charactersNoSpaces}
Sentences: ${stats.sentences}
Paragraphs: ${stats.paragraphs}
Reading Time: ${stats.readingTime} min
Speaking Time: ${stats.speakingTime} min
Average Word Length: ${stats.averageWordLength.toFixed(1)} characters

Original Text:
${text}`;

    const blob = new Blob([statsText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `word-count-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Track download
    if (typeof window !== "undefined" && (window as any).gtag) {
      (window as any).gtag("event", "stats_downloaded", {
        event_category: "word_counter",
        word_count: stats.words,
      });
    }
  };

  const handleCopy = async () => {
    const statsText = `Words: ${stats.words} | Characters: ${stats.characters} (${stats.charactersNoSpaces} without spaces) | Sentences: ${stats.sentences} | Paragraphs: ${stats.paragraphs}`;

    try {
      await navigator.clipboard.writeText(statsText);

      // Track copy action
      if (typeof window !== "undefined" && (window as any).gtag) {
        (window as any).gtag("event", "stats_copied", {
          event_category: "word_counter",
          word_count: stats.words,
        });
      }
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className="flex flex-col gap-y-4">
      <ToolHeader
        title="Word Counter"
        description="Count words, characters, sentences, and paragraphs in your text. Get reading time estimates and detailed statistics instantly."
      />

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Text input */}
        <div className="lg:col-span-2 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-900">
                Enter or paste your text
              </label>
              {text.trim() && (
                <button
                  onClick={handleClear}
                  className="inline-flex items-center gap-1.5 px-2 py-1 text-xs text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <TextClearFormattingRegular className="w-3.5 h-3.5" />
                  Clear
                </button>
              )}
            </div>
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setShowClearConfirm(false);
              }}
              placeholder="Start typing or paste your text here..."
              className="w-full min-h-[400px] p-4 ring ring-black/4 rounded-lg text-sm resize-y shadow-surface font-sans leading-relaxed"
              autoFocus
            />
          </div>

          {/* Clear confirmation */}
          {showClearConfirm && (
            <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg flex items-center justify-between">
              <p className="text-sm text-orange-800">Clear all text?</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmClear}
                  className="px-3 py-1.5 text-sm text-white bg-orange-600 rounded-lg hover:bg-orange-700 transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          {text.trim() && (
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Copy Stats
              </button>
              <button
                onClick={handleDownload}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <ArrowDownloadRegular className="w-4 h-4" />
                Download Report
              </button>
            </div>
          )}
        </div>

        {/* Right column: Examples */}
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-900">Try an Example</label>
            <div className="flex flex-col gap-2">
              {EXAMPLE_TEXTS.map((example) => (
                <button
                  key={example.label}
                  onClick={() => handleExampleClick(example)}
                  className="px-3 py-2.5 text-sm text-left bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all"
                >
                  <div className="font-medium text-gray-900">{example.label}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Statistics display */}
      {text.trim() ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Words"
            value={stats.words.toLocaleString()}
            icon="📝"
            description="Total word count"
          />
          <StatCard
            label="Characters"
            value={stats.characters.toLocaleString()}
            icon="🔤"
            description={`${stats.charactersNoSpaces.toLocaleString()} without spaces`}
          />
          <StatCard
            label="Sentences"
            value={stats.sentences.toLocaleString()}
            icon="📄"
            description={`${stats.paragraphs} paragraph${stats.paragraphs !== 1 ? "s" : ""}`}
          />
          <StatCard
            label="Reading Time"
            value={`${stats.readingTime} min`}
            icon="📖"
            description={`${stats.speakingTime} min speaking`}
          />
        </div>
      ) : (
        <div className="p-8 bg-gray-50 rounded-lg border border-gray-200 text-center">
          <DocumentRegular className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-sm text-gray-600">
            Start typing or paste your text to see live statistics
          </p>
        </div>
      )}

      {/* Additional stats */}
      {text.trim() && stats.words > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-white ring ring-black/4 rounded-lg shadow-surface">
            <div className="text-xs text-gray-600 mb-1">Average Word Length</div>
            <div className="text-2xl font-semibold text-gray-900">
              {stats.averageWordLength.toFixed(1)}
            </div>
            <div className="text-xs text-gray-500 mt-1">characters</div>
          </div>
          <div className="p-4 bg-white ring ring-black/4 rounded-lg shadow-surface">
            <div className="text-xs text-gray-600 mb-1">Words per Sentence</div>
            <div className="text-2xl font-semibold text-gray-900">
              {(stats.words / Math.max(stats.sentences, 1)).toFixed(1)}
            </div>
            <div className="text-xs text-gray-500 mt-1">average</div>
          </div>
          <div className="p-4 bg-white ring ring-black/4 rounded-lg shadow-surface">
            <div className="text-xs text-gray-600 mb-1">Words per Paragraph</div>
            <div className="text-2xl font-semibold text-gray-900">
              {(stats.words / Math.max(stats.paragraphs, 1)).toFixed(1)}
            </div>
            <div className="text-xs text-gray-500 mt-1">average</div>
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
              This word counter works entirely in your browser—no data is sent to any server. Simply
              type or paste your text to see real-time statistics including word count, character
              count, reading time estimates, and more. Perfect for writers, students, and anyone who
              needs accurate text analysis.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  description,
}: {
  label: string;
  value: string;
  icon: string;
  description: string;
}) {
  return (
    <div className="p-4 bg-white ring ring-black/4 rounded-lg shadow-surface">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">{icon}</span>
        <div className="text-xs text-gray-600">{label}</div>
      </div>
      <div className="text-3xl font-bold text-gray-900 mb-1">{value}</div>
      <div className="text-xs text-gray-500">{description}</div>
    </div>
  );
}
