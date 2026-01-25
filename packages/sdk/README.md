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
const document = await client.getDocument("getting-started");

// Convert to various formats
const html = document.toHTML(); // Uses serializeToHTML under the hood
const markdown = document.toMarkdown(); // Uses serializeToMarkdown under the hood
const text = document.toPlainText(); // Uses serializeToPlainText under the hood
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
});
// Internal links are automatically transformed to internal-link marks with metadata
```

**`getDocumentByPath(path, options?)`**

```typescript
const doc = await client.getDocumentByPath("/docs/api/authentication", {
  related: true,
  toc: true,
});
// Internal links are automatically transformed to internal-link marks with metadata
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

Lydie documents use internal links to reference other documents. The API automatically transforms these to `internal-link` marks (similar to Sanity/PayloadCMS) with embedded metadata for easy frontend rendering.

### Internal Link Format

Internal links are presented as marks with embedded metadata:

```json
{
  "text": "what knowledge bases are",
  "type": "text",
  "marks": [
    {
      "type": "internal-link",
      "attrs": {
        "document-id": "abc123def",
        "document-slug": "getting-started",
        "document-title": "Getting Started"
      }
    }
  ]
}
```

### Client-Side Link Resolution

Use the `linkResolver` prop to customize how internal links are rendered:

```tsx
<LydieContent
  content={doc.jsonContent}
  linkResolver={(ref) => {
    // ref.type === "internal"
    // ref.id === "abc123def"
    // ref.slug === "getting-started"
    // ref.title === "Getting Started"

    if (ref.type === "internal" && ref.slug) {
      return `/blog/${ref.slug}`;
    }
    return ref.href || "#";
  }}
/>
```

### Link Prefixing

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
<LydieContent content={doc.jsonContent} components={{ CodeBlock: MyCodeBlock }} />;
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
