import { defineRelations } from "drizzle-orm";
import * as schema from "./schema";

export const relations = defineRelations(schema, (r) => ({
	accounts: {
		user: r.one.users({
			from: r.accounts.userId,
			to: r.users.id
		}),
	},
	users: {
		accounts: r.many.accounts(),
		organizationsViaAssets: r.many.organizations({
			alias: "organizations_id_users_id_via_assets"
		}),
		organizationsViaAssistantAgents: r.many.organizations({
			alias: "organizations_id_users_id_via_assistantAgents"
		}),
		assistantConversations: r.many.assistantConversations(),
		organizationsViaCreditUsageLog: r.many.organizations({
			alias: "organizations_id_users_id_via_creditUsageLog"
		}),
		documentsViaDocumentVersions: r.many.documents({
			alias: "documents_id_users_id_via_documentVersions"
		}),
		documentsUserId: r.many.documents({
			alias: "documents_userId_users_id"
		}),
		organizationsViaFeedbackSubmissions: r.many.organizations({
			alias: "organizations_id_users_id_via_feedbackSubmissions"
		}),
		organizationsViaInvitations: r.many.organizations({
			from: r.users.id.through(r.invitations.inviterId),
			to: r.organizations.id.through(r.invitations.organizationId),
			alias: "users_id_organizations_id_via_invitations"
		}),
		organizationsViaMembers: r.many.organizations({
			alias: "organizations_id_users_id_via_members"
		}),
		sessions: r.many.sessions(),
		stripeCustomers: r.many.stripeCustomers(),
		templateInstallations: r.many.templateInstallations(),
		userSettings: r.many.userSettings(),
		organizationsViaUserWorkspaceCredits: r.many.organizations({
			alias: "organizations_id_users_id_via_userWorkspaceCredits"
		}),
		organizationsViaWorkspaceBilling: r.many.organizations({
			from: r.users.id.through(r.workspaceBilling.billingOwnerUserId),
			to: r.organizations.id.through(r.workspaceBilling.organizationId),
			alias: "users_id_organizations_id_via_workspaceBilling"
		}),
	},
	apiKeys: {
		organization: r.one.organizations({
			from: r.apiKeys.organizationId,
			to: r.organizations.id
		}),
	},
	organizations: {
		apiKeys: r.many.apiKeys(),
		usersViaAssets: r.many.users({
			from: r.organizations.id.through(r.assets.organizationId),
			to: r.users.id.through(r.assets.userId),
			alias: "organizations_id_users_id_via_assets"
		}),
		usersViaAssistantAgents: r.many.users({
			from: r.organizations.id.through(r.assistantAgents.organizationId),
			to: r.users.id.through(r.assistantAgents.userId),
			alias: "organizations_id_users_id_via_assistantAgents"
		}),
		assistantConversations: r.many.assistantConversations(),
		documentsViaCollectionSchemas: r.many.documents({
			alias: "documents_id_organizations_id_via_collectionSchemas"
		}),
		usersViaCreditUsageLog: r.many.users({
			from: r.organizations.id.through(r.creditUsageLog.organizationId),
			to: r.users.id.through(r.creditUsageLog.userId),
			alias: "organizations_id_users_id_via_creditUsageLog"
		}),
		documentComponents: r.many.documentComponents(),
		documentsViaDocumentPublications: r.many.documents({
			alias: "documents_id_organizations_id_via_documentPublications"
		}),
		documentsOrganizationId: r.many.documents({
			alias: "documents_organizationId_organizations_id"
		}),
		usersViaFeedbackSubmissions: r.many.users({
			from: r.organizations.id.through(r.feedbackSubmissions.organizationId),
			to: r.users.id.through(r.feedbackSubmissions.userId),
			alias: "organizations_id_users_id_via_feedbackSubmissions"
		}),
		integrationConnectionsOrganizationId: r.many.integrationConnections({
			alias: "integrationConnections_organizationId_organizations_id"
		}),
		integrationConnectionsViaIntegrationLinks: r.many.integrationConnections({
			alias: "integrationConnections_id_organizations_id_via_integrationLinks"
		}),
		usersViaInvitations: r.many.users({
			alias: "users_id_organizations_id_via_invitations"
		}),
		llmUsages: r.many.llmUsage(),
		usersViaMembers: r.many.users({
			from: r.organizations.id.through(r.members.organizationId),
			to: r.users.id.through(r.members.userId),
			alias: "organizations_id_users_id_via_members"
		}),
		organizationSettings: r.many.organizationSettings(),
		templateInstallations: r.many.templateInstallations(),
		usersViaUserWorkspaceCredits: r.many.users({
			from: r.organizations.id.through(r.userWorkspaceCredits.organizationId),
			to: r.users.id.through(r.userWorkspaceCredits.userId),
			alias: "organizations_id_users_id_via_userWorkspaceCredits"
		}),
		usersViaWorkspaceBilling: r.many.users({
			alias: "users_id_organizations_id_via_workspaceBilling"
		}),
	},
	assistantConversations: {
		assistantAgent: r.one.assistantAgents({
			from: r.assistantConversations.agentId,
			to: r.assistantAgents.id
		}),
		organization: r.one.organizations({
			from: r.assistantConversations.organizationId,
			to: r.organizations.id
		}),
		user: r.one.users({
			from: r.assistantConversations.userId,
			to: r.users.id
		}),
		assistantMessages: r.many.assistantMessages(),
	},
	assistantAgents: {
		assistantConversations: r.many.assistantConversations(),
	},
	assistantMessages: {
		assistantConversation: r.one.assistantConversations({
			from: r.assistantMessages.conversationId,
			to: r.assistantConversations.id
		}),
	},
	documents: {
		organizationsViaCollectionSchemas: r.many.organizations({
			from: r.documents.id.through(r.collectionSchemas.documentId),
			to: r.organizations.id.through(r.collectionSchemas.organizationId),
			alias: "documents_id_organizations_id_via_collectionSchemas"
		}),
		documentEmbeddings: r.many.documentEmbeddings(),
		collectionSchemas: r.many.collectionSchemas({
			from: r.documents.id.through(r.documentFieldValues.documentId),
			to: r.collectionSchemas.id.through(r.documentFieldValues.collectionSchemaId)
		}),
		organizationsViaDocumentPublications: r.many.organizations({
			from: r.documents.id.through(r.documentPublications.documentId),
			to: r.organizations.id.through(r.documentPublications.organizationId),
			alias: "documents_id_organizations_id_via_documentPublications"
		}),
		documentTitleEmbeddings: r.many.documentTitleEmbeddings(),
		users: r.many.users({
			from: r.documents.id.through(r.documentVersions.documentId),
			to: r.users.id.through(r.documentVersions.userId),
			alias: "documents_id_users_id_via_documentVersions"
		}),
		integrationLink: r.one.integrationLinks({
			from: r.documents.integrationLinkId,
			to: r.integrationLinks.id
		}),
		documentNearestCollectionId: r.one.documents({
			from: r.documents.nearestCollectionId,
			to: r.documents.id,
			alias: "documents_nearestCollectionId_documents_id"
		}),
		documentsNearestCollectionId: r.many.documents({
			alias: "documents_nearestCollectionId_documents_id"
		}),
		organization: r.one.organizations({
			from: r.documents.organizationId,
			to: r.organizations.id,
			alias: "documents_organizationId_organizations_id"
		}),
		documentParentId: r.one.documents({
			from: r.documents.parentId,
			to: r.documents.id,
			alias: "documents_parentId_documents_id"
		}),
		documentsParentId: r.many.documents({
			alias: "documents_parentId_documents_id"
		}),
		user: r.one.users({
			from: r.documents.userId,
			to: r.users.id,
			alias: "documents_userId_users_id"
		}),
		integrationConnections: r.many.integrationConnections(),
		templateInstallations: r.many.templateInstallations(),
	},
	documentComponents: {
		organization: r.one.organizations({
			from: r.documentComponents.organizationId,
			to: r.organizations.id
		}),
	},
	documentEmbeddings: {
		document: r.one.documents({
			from: r.documentEmbeddings.documentId,
			to: r.documents.id
		}),
	},
	collectionSchemas: {
		documents: r.many.documents(),
	},
	documentTitleEmbeddings: {
		document: r.one.documents({
			from: r.documentTitleEmbeddings.documentId,
			to: r.documents.id
		}),
	},
	integrationLinks: {
		documents: r.many.documents(),
	},
	integrationActivityLogs: {
		integrationConnection: r.one.integrationConnections({
			from: r.integrationActivityLogs.connectionId,
			to: r.integrationConnections.id
		}),
	},
	integrationConnections: {
		integrationActivityLogs: r.many.integrationActivityLogs(),
		organization: r.one.organizations({
			from: r.integrationConnections.organizationId,
			to: r.organizations.id,
			alias: "integrationConnections_organizationId_organizations_id"
		}),
		organizations: r.many.organizations({
			from: r.integrationConnections.id.through(r.integrationLinks.connectionId),
			to: r.organizations.id.through(r.integrationLinks.organizationId),
			alias: "integrationConnections_id_organizations_id_via_integrationLinks"
		}),
		documents: r.many.documents({
			from: r.integrationConnections.id.through(r.syncMetadata.connectionId),
			to: r.documents.id.through(r.syncMetadata.documentId)
		}),
	},
	llmUsage: {
		organization: r.one.organizations({
			from: r.llmUsage.organizationId,
			to: r.organizations.id
		}),
	},
	organizationSettings: {
		organization: r.one.organizations({
			from: r.organizationSettings.organizationId,
			to: r.organizations.id
		}),
	},
	sessions: {
		user: r.one.users({
			from: r.sessions.userId,
			to: r.users.id
		}),
	},
	stripeCustomers: {
		user: r.one.users({
			from: r.stripeCustomers.userId,
			to: r.users.id
		}),
	},
	templateCategories: {
		templateCategory: r.one.templateCategories({
			from: r.templateCategories.parentId,
			to: r.templateCategories.id,
			alias: "templateCategories_parentId_templateCategories_id"
		}),
		templateCategories: r.many.templateCategories({
			alias: "templateCategories_parentId_templateCategories_id"
		}),
		templates: r.many.templates({
			from: r.templateCategories.id.through(r.templateCategoryAssignments.categoryId),
			to: r.templates.id.through(r.templateCategoryAssignments.templateId)
		}),
	},
	templates: {
		templateCategories: r.many.templateCategories(),
		templateDocuments: r.many.templateDocuments(),
		templateFaqs: r.many.templateFaqs(),
		templateInstallations: r.many.templateInstallations(),
	},
	templateDocuments: {
		templates: r.many.templates({
			from: r.templateDocuments.id.through(r.templateDocuments.parentId),
			to: r.templates.id.through(r.templateDocuments.templateId)
		}),
	},
	templateFaqs: {
		template: r.one.templates({
			from: r.templateFaqs.templateId,
			to: r.templates.id
		}),
	},
	templateInstallations: {
		user: r.one.users({
			from: r.templateInstallations.installedByUserId,
			to: r.users.id
		}),
		organization: r.one.organizations({
			from: r.templateInstallations.organizationId,
			to: r.organizations.id
		}),
		document: r.one.documents({
			from: r.templateInstallations.rootDocumentId,
			to: r.documents.id
		}),
		template: r.one.templates({
			from: r.templateInstallations.templateId,
			to: r.templates.id
		}),
	},
	userSettings: {
		user: r.one.users({
			from: r.userSettings.userId,
			to: r.users.id
		}),
	},
}))