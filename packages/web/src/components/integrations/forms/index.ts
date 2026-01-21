export { GitHubForm } from "./github-form"
export type { GitHubFormProps, GitHubLinkConfig } from "./github-form"

export { ShopifyForm } from "./shopify-form"
export type { ShopifyFormProps, ShopifyLinkConfig } from "./shopify-form"

export { WordPressForm } from "./wordpress-form"
export type { WordPressFormProps, WordPressLinkConfig } from "./wordpress-form"

export { WordPressConnectionForm } from "./wordpress-connection-form"
export type { WordPressConnectionFormProps, WordPressConnectionConfig } from "./wordpress-connection-form"

// Union type for all possible link configs
export type IntegrationLinkConfig =
	| import("./github-form").GitHubLinkConfig
	| import("./shopify-form").ShopifyLinkConfig
	| import("./wordpress-form").WordPressLinkConfig
