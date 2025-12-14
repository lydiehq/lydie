# @lydie/sdk

Official SDK for Lydie - Fetch and render your Lydie documents with full type safety.

## Installation

```bash
npm install @lydie/sdk
# or
pnpm add @lydie/sdk
# or
bun add @lydie/sdk
```

## Quick Start

### Server-Side (Node.js, Edge Functions)

```typescript
import { LydieClient } from "@lydie/sdk/client";
import { renderContentToHTML } from "@lydie/sdk/html";

const client = new LydieClient({
  apiKey: process.env.LYDIE_API_KEY!,
  organizationId: "your-org",
});

// Fetch a document
const doc = await client.getDocument("getting-started");

// Render to HTML (no React needed)
const html = renderContentToHTML(doc.jsonContent);
```

### React (Client-Side)

```tsx
import { useLydieDocument } from "@lydie/sdk/react";

export default function DocPage({ slug }: { slug: string }) {
  const { document, loading, error } = useLydieDocument(slug, {
    apiKey: import.meta.env.VITE_LYDIE_KEY,
    organizationId: "your-org",
    include: { related: true, toc: true },
  });

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <article>
      <h1>{document.title}</h1>
      {document.content}
    </article>
  );
}
```

### React (Server-Side - Next.js)

```tsx
import { LydieClient } from "@lydie/sdk/client";
import { LydieContent } from "@lydie/sdk/react";

export default async function Page({ params }) {
  const client = new LydieClient({
    apiKey: process.env.LYDIE_API_KEY!,
    organizationId: "your-org",
  });

  const doc = await client.getDocument(params.slug);

  return (
    <article>
      <h1>{doc.title}</h1>
      <LydieContent
        content={doc.jsonContent}
        components={{
          CodeBlock: MyCodeBlock,
          Chart: MyChart,
        }}
      />
    </article>
  );
}
```

## API Reference

### Client

#### `LydieClient`

```typescript
const client = new LydieClient({
  apiKey: string,
  organizationId: string,
  apiUrl: string, // defaults to "https://api.lydie.co/v1"
  debug: boolean,
});
```

#### Methods

**`getDocuments()`**

```typescript
const { documents } = await client.getDocuments();
```

**`getDocument(slug, options?)`**

```typescript
const doc = await client.getDocument("getting-started", {
  related: true, // Include related documents
  toc: true, // Include table of contents
  transformLinks: true, // Transform internal:// links to relative URLs (default: true)
  useIds: false, // Use document IDs instead of slugs in links (default: false)
});
```

**`getDocumentByPath(path, options?)`**

```typescript
const doc = await client.getDocumentByPath("/docs/api/authentication", {
  related: true,
  toc: true,
  transformLinks: true, // Transform internal:// links to relative URLs
  useIds: false, // Use document IDs instead of slugs in links
});
```

**`getFolders()`**

```typescript
const { folders } = await client.getFolders();
```

### Rendering

#### HTML (Universal)

```typescript
import { renderContentToHTML } from "@lydie/sdk/html";

const html = renderContentToHTML(contentNode, {
  linkPrefix: "/docs", // Optional: prefix all relative links
});
```

#### React Hook

```typescript
import { useLydieDocument } from "@lydie/sdk/react";

const {
  document, // Document with pre-rendered content
  loading, // Loading state
  error, // Error object if failed
  refresh, // Function to refetch
} = useLydieDocument(slug, {
  apiKey: "your-key",
  organizationId: "your-org",
  include: { related: true, toc: true },
  links: {
    transform: true, // Transform internal:// links (default: true)
    useIds: false, // Use document IDs instead of slugs (default: false)
  },
});
```

#### React Component

```tsx
import { LydieContent } from "@lydie/sdk/react";

<LydieContent
  content={doc.jsonContent}
  components={{
    // Map custom block names to your components
    CodeBlock: MyCodeBlock,
    Chart: MyChart,
  }}
  linkPrefix="/blog" // Optional: prefix all relative links
/>;
```

### Utilities

```typescript
import { extractTableOfContents, extractText } from "@lydie/sdk/utils";

// Extract TOC
const toc = extractTableOfContents(doc.jsonContent);
// [{ id: "heading-0", level: 1, text: "Introduction" }, ...]

// Extract plain text
const text = extractText(doc.jsonContent);
```

## Internal Link Transformation

Lydie documents use `internal://` protocol for linking between documents. The SDK automatically transforms these to relative URLs for easy rendering.

### Server-Side Transformation

By default, internal links are transformed to SEO-friendly slugs:

```typescript
// internal://abc123def → /getting-started
const doc = await client.getDocument("my-doc", {
  transformLinks: true, // Default: true
  useIds: false, // Default: false (use slugs)
});
```

For faster performance, you can use document IDs instead:

```typescript
// internal://abc123def → /abc123def
const doc = await client.getDocument("my-doc", {
  transformLinks: true,
  useIds: true, // Use IDs instead of slugs
});
```

### Client-Side Link Prefixing

Add environment-specific prefixes to all relative links:

```tsx
// All relative links get prefixed
<LydieContent
  content={doc.jsonContent}
  linkPrefix="/blog" // /getting-started → /blog/getting-started
/>

// Environment-based prefixing
<LydieContent
  content={doc.jsonContent}
  linkPrefix={process.env.NODE_ENV === "production"
    ? "https://docs.mycompany.com"
    : "/dev-docs"}
/>
```

### Combining Both Approaches

```typescript
// Server: Transform internal://abc123 → /getting-started
const doc = await client.getDocument("my-doc", { transformLinks: true });

// Client: Add environment prefix /getting-started → https://myblog.com/getting-started
<LydieContent content={doc.jsonContent} linkPrefix="https://myblog.com" />;
```

## Custom Blocks

Create custom components for your document blocks:

```tsx
// MyCodeBlock.tsx
export function MyCodeBlock({ properties }: CustomBlockProps) {
  return (
    <pre className={`language-${properties.language}`}>
      <code>{properties.code}</code>
    </pre>
  );
}

// Usage
<LydieContent
  content={doc.jsonContent}
  components={{ CodeBlock: MyCodeBlock }}
/>;
```

## Entry Points

The SDK is split into focused, tree-shakable modules:

- `@lydie/sdk` - Types only
- `@lydie/sdk/client` - API client (Node.js/Edge)
- `@lydie/sdk/react` - React renderer + hooks
- `@lydie/sdk/html` - HTML renderer (universal)
- `@lydie/sdk/utils` - Utilities (TOC, text extraction)

**Benefits:**

- ✅ Tree-shakable - only bundle what you use
- ✅ Framework-agnostic core
- ✅ SSR-friendly
- ✅ Full TypeScript support

## Examples

### Astro Static Site

```astro
---
import { LydieClient } from "@lydie/sdk/client";
import { renderContentToHTML } from "@lydie/sdk/html";

const client = new LydieClient({
  apiKey: import.meta.env.LYDIE_API_KEY,
  organizationId: "your-org",
});

const doc = await client.getDocument(Astro.params.slug, {
  transformLinks: true, // Transform internal links
  useIds: false, // Use slugs for SEO
});

const html = renderContentToHTML(doc.jsonContent, {
  linkPrefix: "https://myblog.com", // Add site prefix
});
---

<article set:html={html} />
```

### Email Generation

```typescript
import { renderContentToHTML } from "@lydie/sdk/html";

const html = renderContentToHTML(doc.jsonContent, {
  linkPrefix: "https://mycompany.com", // Make links absolute for email
});

await sendEmail({
  to: user.email,
  html: `<div style="font-family: sans-serif;">${html}</div>`,
});
```

## License

MIT
