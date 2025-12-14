export interface BlogPost {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  date: string;
  author: string;
  readTime: number;
}

export const posts: BlogPost[] = [
  {
    id: "getting-started",
    title: "Getting Started with Our SDK",
    excerpt: "Learn how to integrate our SDK into your application and start building amazing features.",
    content: `# Getting Started with Our SDK

Welcome to our SDK! This guide will help you get started quickly.

## Installation

First, install the SDK using your preferred package manager:

\`\`\`bash
npm install @your-org/sdk
\`\`\`

## Basic Usage

Once installed, you can start using the SDK in your application:

\`\`\`typescript
import { SDK } from '@your-org/sdk';

const sdk = new SDK({
  apiKey: 'your-api-key',
});

// Start using the SDK
const result = await sdk.doSomething();
\`\`\`

## Next Steps

- Read the full documentation
- Check out our examples
- Join our community

Happy coding!`,
    date: "2024-01-15",
    author: "Jane Doe",
    readTime: 5,
  },
  {
    id: "advanced-features",
    title: "Advanced Features and Best Practices",
    excerpt: "Explore advanced features and learn best practices for building robust applications.",
    content: `# Advanced Features and Best Practices

This post covers advanced features and best practices for using our SDK.

## Error Handling

Always wrap SDK calls in try-catch blocks:

\`\`\`typescript
try {
  const result = await sdk.doSomething();
} catch (error) {
  console.error('SDK error:', error);
}
\`\`\`

## Performance Optimization

- Use connection pooling
- Implement caching strategies
- Batch requests when possible

## Security

- Never expose API keys in client-side code
- Use environment variables
- Rotate keys regularly

These practices will help you build secure and performant applications.`,
    date: "2024-01-10",
    author: "John Smith",
    readTime: 8,
  },
  {
    id: "migration-guide",
    title: "Migration Guide: From v1 to v2",
    excerpt: "Everything you need to know about migrating from version 1 to version 2 of our SDK.",
    content: `# Migration Guide: From v1 to v2

This guide will help you migrate from version 1 to version 2 of our SDK.

## Breaking Changes

### API Changes

The main API has been restructured for better developer experience:

\`\`\`typescript
// v1
sdk.oldMethod();

// v2
sdk.newMethod();
\`\`\`

### Configuration

Configuration options have been updated:

\`\`\`typescript
// v1
const sdk = new SDK({ oldOption: true });

// v2
const sdk = new SDK({ newOption: true });
\`\`\`

## Migration Steps

1. Update your package.json
2. Review breaking changes
3. Update your code
4. Test thoroughly

Need help? Reach out to our support team.`,
    date: "2024-01-05",
    author: "Jane Doe",
    readTime: 6,
  },
];

export function getPostById(id: string): BlogPost | undefined {
  return posts.find((post) => post.id === id);
}

export function getAllPosts(): BlogPost[] {
  return posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

