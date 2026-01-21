/**
 * Base types for document sync integrations
 */

/**
 * Custom field types supported for document metadata
 */
export type CustomFieldType = "string" | "number"

/**
 * Definition of a single custom field
 */
export interface CustomFieldDefinition {
	key: string
	label: string
	type: CustomFieldType
	required?: boolean
	defaultValue?: string | number
	description?: string
	placeholder?: string
}

/**
 * Schema defining a set of custom fields for an integration
 */
export interface CustomFieldSchema {
	fields: CustomFieldDefinition[]
}

/**
 * The document structure that integrations will work with
 */
export interface SyncDocument {
	id: string
	title: string
	slug: string
	content: any // TipTap JSON structure
	published: boolean
	updatedAt: Date
	organizationId: string
	/**
	 * Path/ID in external system - used for matching during pull operations
	 * For push operations, the path should be computed from parent hierarchy
	 * This field may be stale if the document was moved - always compute path from hierarchy when pushing
	 */
	externalId?: string | null
	/**
	 * Whether the document is locked (read-only in UI)
	 * Used for integration-managed documents like folder pages
	 */
	isLocked?: boolean
	/**
	 * Parent document ID for pages-in-pages structure
	 * Used to compute the file path in external systems
	 */
	parentId?: string | null
	/**
	 * Computed path segments from parent hierarchy (root to immediate parent)
	 * If provided, integrations should use this instead of computing from parentId
	 * This ensures the path reflects the current document location even if externalId is stale
	 */
	parentPathSegments?: string[]
	customFields?: Record<string, string | number>
}

/**
 * Configuration for connecting to an external platform
 * Matches the integrationConnectionsTable schema
 */
export interface IntegrationConnection {
	id: string
	integrationType: string
	organizationId: string
	config: Record<string, any> // Platform-specific config (API keys, repo info, etc.)
	createdAt: Date
	updatedAt: Date
}

/**
 * Represents the result of a sync operation
 */
export interface SyncResult {
	success: boolean
	documentId: string
	/**
	 * Path/ID in external system:
	 * - For GitHub files: file path (e.g., "docs/guide.md")
	 * - For GitHub folders: "__folder__<path>" format (e.g., "__folder__docs")
	 * - For other integrations: platform-specific identifier
	 * Used to track documents across syncs and determine parent relationships
	 */
	externalId?: string
	message?: string
	error?: string
	conflictDetected?: boolean
	conflictDetails?: ConflictDetails
	/**
	 * Additional data for pull operations, typically includes:
	 * - title: Document title
	 * - slug: URL-friendly slug
	 * - content: TipTap JSON content
	 * - isLocked: Whether document is locked (e.g., folder pages)
	 * - customFields: Integration-specific metadata
	 */
	metadata?: any
}

/**
 * Details about a conflict that needs resolution
 */
export interface ConflictDetails {
	localVersion: {
		content: any
		updatedAt: Date
	}
	remoteVersion: {
		content: any
		updatedAt: Date
	}
	conflictType: "content" | "deleted" | "renamed"
}

/**
 * Options for push sync operation
 */
export interface PushOptions {
	document: SyncDocument
	connection: IntegrationConnection
	resolveConflicts?: boolean
	commitMessage?: string
}

/**
 * Options for pull sync operation
 */
export interface PullOptions {
	connection: IntegrationConnection
	organizationId: string
	userId: string
}

/**
 * Options for delete sync operation
 */
export interface DeleteOptions {
	documentId: string // Document ID in Lydie
	externalId: string // ID/path in external system (e.g., GitHub file path)
	connection: IntegrationConnection
	commitMessage?: string
}

/**
 * Pulled document from external platform
 */
export interface PulledDocument {
	externalId: string // ID/path in external system
	title: string
	content: any // TipTap JSON
	slug: string
}

/**
 * Metadata about synced documents
 * Matches the syncMetadataTable schema
 */
export interface SyncMetadata {
	id: string
	documentId: string
	connectionId: string
	externalId: string
	lastSyncedAt: Date | null
	lastSyncedHash: string | null // Content hash for change detection
	syncStatus: "synced" | "pending" | "conflict" | "error"
	syncError: string | null
	createdAt: Date
	updatedAt: Date
}

/**
 * Generic resource (repository, collection, folder, etc.)
 */
export interface ExternalResource {
	id: string
	name: string
	fullName: string
	metadata?: Record<string, any>
}

/**
 * Default link configuration for auto-creation on connection
 */
export interface DefaultLink {
	name: string
	config: Record<string, any>
}

/**
 * Integration interface that all integrations must implement
 * Provides sync functionality between Lydie and external platforms
 */
export interface Integration {
	/**
	 * Validate that a connection is properly configured and working
	 */
	validateConnection(connection: IntegrationConnection): Promise<{
		valid: boolean
		error?: string
	}>

	/**
	 * Push a document to the external platform
	 */
	push(options: PushOptions): Promise<SyncResult>

	/**
	 * Pull documents from the external platform
	 */
	pull(options: PullOptions): Promise<SyncResult[]>

	/**
	 * Delete a document from the external platform
	 */
	delete(options: DeleteOptions): Promise<SyncResult>

	/**
	 * Fetch available resources for the authenticated user/connection
	 * Examples: GitHub repositories, Shopify collections, WordPress sites
	 */
	fetchResources(connection: IntegrationConnection): Promise<ExternalResource[]>

	/**
	 * Called when a connection is disconnected
	 * Optional - integrations can override this to perform cleanup
	 */
	onDisconnect?(connection: IntegrationConnection): Promise<void>

	/**
	 * Called after a connection is successfully established
	 * Can return default links to auto-create for this integration
	 * Optional - integrations can override this method
	 */
	onConnect?(): { links?: DefaultLink[] }

	/**
	 * Define custom fields that documents should have for this integration
	 * Optional - if not defined, no custom fields are required
	 */
	getCustomFieldSchema?(): CustomFieldSchema
}

/**
 * Helper function to create an error result
 */
export function createErrorResult(
	documentId: string,
	error: string,
	conflictDetails?: SyncResult["conflictDetails"],
): SyncResult {
	return {
		success: false,
		documentId,
		error,
		conflictDetected: !!conflictDetails,
		conflictDetails,
	}
}
