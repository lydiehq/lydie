export interface Integration {
  id: string;
  name: string;
  description: string;
  icon?: string;
}

export const integrations: Integration[] = [
  {
    id: "github",
    name: "GitHub",
    description:
      "Sync your Lydie documents to GitHub repositories. Keep your documentation in sync with your codebase.",
  },
  {
    id: "wordpress",
    name: "WordPress",
    description:
      "Publish your Lydie documents directly to your WordPress blog. Seamless content management.",
  },
  {
    id: "shopify",
    name: "Shopify",
    description:
      "Sync product descriptions and blog posts from Lydie to your Shopify store. Streamline your e-commerce content.",
  },
  {
    id: "blogger",
    name: "Blogger",
    description:
      "Publish your Lydie documents to your Blogger blog. Keep your content in sync across platforms.",
  },
];

export function getIntegration(id: string): Integration | undefined {
  return integrations.find((integration) => integration.id === id);
}
