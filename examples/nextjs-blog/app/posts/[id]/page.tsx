import Link from "next/link";
import { notFound } from "next/navigation";
import { getPostById, getAllPosts } from "../../../lib/posts";
import type { ReactElement } from "react";

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export async function generateStaticParams() {
  const posts = getAllPosts();
  return posts.map((post) => ({
    id: post.id,
  }));
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const resolvedParams = await Promise.resolve(params);
  const post = getPostById(resolvedParams.id);

  if (!post) {
    notFound();
  }

  // Simple markdown-like content rendering
  const renderContent = (content: string) => {
    const lines = content.split("\n");
    const elements: ReactElement[] = [];
    let currentParagraph: string[] = [];
    let inCodeBlock = false;
    let codeBlockContent: string[] = [];
    let elementKey = 0;

    const flushParagraph = () => {
      if (currentParagraph.length > 0) {
        const paragraphText = currentParagraph.join(" ");
        // Handle inline code in paragraphs
        const parts: (string | ReactElement)[] = [];
        const codeRegex = /`([^`]+)`/g;
        let lastIndex = 0;
        let match;

        while ((match = codeRegex.exec(paragraphText)) !== null) {
          // Add text before code
          if (match.index > lastIndex) {
            parts.push(paragraphText.slice(lastIndex, match.index));
          }
          // Add code element
          parts.push(
            <code
              key={`inline-code-${elementKey++}`}
              className="rounded bg-zinc-100 dark:bg-zinc-900 px-1.5 py-0.5 text-sm font-mono"
            >
              {match[1]}
            </code>
          );
          lastIndex = match.index + match[0].length;
        }
        // Add remaining text
        if (lastIndex < paragraphText.length) {
          parts.push(paragraphText.slice(lastIndex));
        }

        elements.push(
          <p
            key={`p-${elementKey++}`}
            className="mb-4 text-zinc-700 dark:text-zinc-300 leading-relaxed"
          >
            {parts.length > 0 ? parts : paragraphText}
          </p>
        );
        currentParagraph = [];
      }
    };

    const flushCodeBlock = () => {
      if (codeBlockContent.length > 0) {
        elements.push(
          <pre
            key={`code-${elementKey++}`}
            className="mb-6 overflow-x-auto rounded-lg bg-zinc-100 dark:bg-zinc-900 p-4 text-sm border border-zinc-200 dark:border-zinc-800"
          >
            <code className="font-mono text-zinc-800 dark:text-zinc-200">
              {codeBlockContent.join("\n")}
            </code>
          </pre>
        );
        codeBlockContent = [];
      }
    };

    lines.forEach((line) => {
      if (line.startsWith("```")) {
        if (inCodeBlock) {
          flushCodeBlock();
          inCodeBlock = false;
        } else {
          flushParagraph();
          inCodeBlock = true;
        }
        return;
      }

      if (inCodeBlock) {
        codeBlockContent.push(line);
        return;
      }

      if (line.startsWith("# ")) {
        flushParagraph();
        elements.push(
          <h1
            key={`h1-${elementKey++}`}
            className="mb-4 mt-8 text-3xl font-bold text-zinc-900 dark:text-zinc-100"
          >
            {line.slice(2)}
          </h1>
        );
        return;
      }

      if (line.startsWith("## ")) {
        flushParagraph();
        elements.push(
          <h2
            key={`h2-${elementKey++}`}
            className="mb-3 mt-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-100"
          >
            {line.slice(3)}
          </h2>
        );
        return;
      }

      if (line.startsWith("### ")) {
        flushParagraph();
        elements.push(
          <h3
            key={`h3-${elementKey++}`}
            className="mb-2 mt-4 text-xl font-semibold text-zinc-900 dark:text-zinc-100"
          >
            {line.slice(4)}
          </h3>
        );
        return;
      }

      if (line.trim() === "") {
        flushParagraph();
        return;
      }

      currentParagraph.push(line);
    });

    flushParagraph();
    flushCodeBlock();

    return elements;
  };

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-2xl px-6 py-8">
          <Link
            href="/"
            className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 hover:text-zinc-600 dark:hover:text-zinc-400 transition-colors"
          >
            ← Back to Blog
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-2xl px-6 py-16">
        <header className="mb-12">
          <time
            dateTime={post.date}
            className="text-sm text-zinc-500 dark:text-zinc-500 mb-4 block"
          >
            {formatDate(post.date)}
          </time>
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mb-4">
            {post.title}
          </h1>
          <div className="flex items-center gap-4 text-sm text-zinc-500 dark:text-zinc-500">
            <span>{post.author}</span>
            <span>•</span>
            <span>{post.readTime} min read</span>
          </div>
        </header>

        <div className="prose prose-zinc dark:prose-invert max-w-none">
          {renderContent(post.content)}
        </div>
      </article>

      <footer className="border-t border-zinc-200 dark:border-zinc-800 mt-24">
        <div className="mx-auto max-w-2xl px-6 py-8">
          <Link
            href="/"
            className="text-sm text-zinc-500 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          >
            ← Back to all posts
          </Link>
        </div>
      </footer>
    </div>
  );
}
