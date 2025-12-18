export { GitHubForm } from "./github-form";
export type { GitHubFormProps, GitHubLinkConfig } from "./github-form";

export { ShopifyForm } from "./shopify-form";
export type { ShopifyFormProps, ShopifyLinkConfig } from "./shopify-form";

export { WordPressForm } from "./wordpress-form";
export type { WordPressFormProps, WordPressLinkConfig } from "./wordpress-form";

// Union type for all possible link configs
export type IntegrationLinkConfig =
  | import("./github-form").GitHubLinkConfig
  | import("./shopify-form").ShopifyLinkConfig
  | import("./wordpress-form").WordPressLinkConfig;

