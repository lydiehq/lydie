/**
 * Text utility functions for word counting, character counting, and text processing
 */

/**
 * Counts words in plain text or HTML content
 * @param text - The text content to count words in
 * @param options - Configuration options
 * @returns Number of words
 */
export function countWords(
  text: string,
  options: {
    stripHtml?: boolean;
    countEmptyAsZero?: boolean;
  } = {}
): number {
  const { stripHtml = true, countEmptyAsZero = true } = options;

  if (!text) return 0;

  let processedText = text;

  // Strip HTML tags if requested
  if (stripHtml) {
    processedText = text.replace(/<[^>]*>/g, "");
  }

  // Trim whitespace
  processedText = processedText.trim();

  if (!processedText) {
    return countEmptyAsZero ? 0 : 0;
  }

  // Split on whitespace and filter out empty strings
  const words = processedText.split(/\s+/).filter((word) => word.length > 0);
  return words.length;
}

/**
 * Counts characters in text (excluding HTML tags by default)
 * @param text - The text content to count characters in
 * @param options - Configuration options
 * @returns Number of characters
 */
export function countCharacters(
  text: string,
  options: {
    stripHtml?: boolean;
    includeSpaces?: boolean;
  } = {}
): number {
  const { stripHtml = true, includeSpaces = true } = options;

  if (!text) return 0;

  let processedText = text;

  // Strip HTML tags if requested
  if (stripHtml) {
    processedText = text.replace(/<[^>]*>/g, "");
  }

  if (!includeSpaces) {
    processedText = processedText.replace(/\s/g, "");
  }

  return processedText.length;
}

/**
 * Strips HTML tags from text content
 * @param html - HTML content to strip tags from
 * @returns Plain text content
 */
export function stripHtmlTags(html: string): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, "");
}

/**
 * Gets basic text statistics for content
 * @param text - The text to analyze
 * @param options - Configuration options
 * @returns Object with word count, character count, etc.
 */
export function getTextStats(
  text: string,
  options: {
    stripHtml?: boolean;
  } = {}
) {
  const { stripHtml = true } = options;

  const words = countWords(text, { stripHtml });
  const characters = countCharacters(text, { stripHtml, includeSpaces: true });
  const charactersNoSpaces = countCharacters(text, {
    stripHtml,
    includeSpaces: false,
  });

  return {
    words,
    characters,
    charactersNoSpaces,
    lines: text.split("\n").length,
  };
}
