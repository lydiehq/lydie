import { useEffect } from "react";

const DEFAULT_TITLE = "Lydie";

/**
 * Hook to set the document title.
 * Automatically resets to the default title when the component unmounts.
 *
 * @param title - The title to set (without the app name suffix)
 * @param options - Optional configuration
 * @param options.suffix - Suffix to append to the title (default: " - Lydie")
 * @param options.restoreOnUnmount - Whether to restore the default title on unmount (default: true)
 */
export function useDocumentTitle(
  title: string | null | undefined,
  options?: {
    suffix?: string;
    restoreOnUnmount?: boolean;
  },
) {
  const { suffix = " - Lydie", restoreOnUnmount = true } = options ?? {};

  useEffect(() => {
    const previousTitle = document.title;

    if (title) {
      document.title = `${title}${suffix}`;
    }

    return () => {
      if (restoreOnUnmount) {
        document.title = DEFAULT_TITLE;
      } else {
        document.title = previousTitle;
      }
    };
  }, [title, suffix, restoreOnUnmount]);
}
