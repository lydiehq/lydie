import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center">
      <div className="text-center px-6">
        <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-100 mb-4">
          404
        </h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400 mb-8">
          Post not found.
        </p>
        <Link
          href="/"
          className="inline-block text-zinc-900 dark:text-zinc-100 hover:text-zinc-600 dark:hover:text-zinc-400 transition-colors underline"
        >
          Back to Blog
        </Link>
      </div>
    </div>
  );
}

