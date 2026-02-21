import React from "react";
import { codeToHtml } from "shiki";

type CustomBlockProps = {
  properties: Record<string, unknown>;
};

interface CodeBlockProps extends CustomBlockProps {
  properties: {
    language?: string | null;
    code?: string;
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function CodeBlock({ properties }: CodeBlockProps) {
  const { code } = properties;
  const codeContent = code || "";

  const language = "typescript";

  // Use Shiki to highlight the code with light theme
  const [highlightedCode, setHighlightedCode] = React.useState<string>("");
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    async function highlight() {
      try {
        // Use light theme only
        const html = await codeToHtml(codeContent, {
          lang: "ts",
          theme: "github-light",
        });
        setHighlightedCode(html);
      } catch (error) {
        console.warn("[CodeBlock] Error highlighting code:", error);
        // Fallback to plain code
        setHighlightedCode(`<pre><code>${escapeHtml(codeContent)}</code></pre>`);
      } finally {
        setIsLoading(false);
      }
    }

    if (codeContent) {
      highlight();
    } else {
      setIsLoading(false);
    }
  }, [codeContent, language]);

  if (isLoading) {
    return (
      <pre className="rounded-lg bg-gray-50 border border-gray-200 p-3 my-0 overflow-x-auto">
        <code>{codeContent}</code>
      </pre>
    );
  }

  return (
    <div
      className="rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-3 my-0 overflow-x-auto [&_pre]:bg-transparent! [&_pre]:p-0! [&_pre]:m-0! [&_pre]:border-0! [&_pre]:overflow-x-auto!"
      dangerouslySetInnerHTML={{ __html: highlightedCode }}
    />
  );
}
