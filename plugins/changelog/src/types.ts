// An entry is plain data, not JSX or Markdown, so the app and lydie.co render the same words.
// Text may hold `code` spans (`segments`), nothing else.
export type ChangelogSection = {
  heading?: string;
  paragraphs: string[];
};

export type ChangelogEntry = {
  // Stable slug: the anchor on the changelog page.
  id: string;
  // ISO date it reached people.
  date: string;
  title: string;
  // One or two sentences that stand alone: what the popover shows.
  summary: string;
  sections?: ChangelogSection[];
  // Full URLs: the app has no site to resolve a path against.
  links?: { label: string; href: string }[];
};
