export type ApiEndpointDefinition = {
  method: "get" | "post" | "patch" | "delete";
  path: string;
  summary: string;
  description: string;
};

export const externalApiEndpoints: ApiEndpointDefinition[] = [
  {
    method: "post",
    path: "/collections",
    summary: "Create collection",
    description: "Creates a collection with optional initial properties.",
  },
  {
    method: "post",
    path: "/collections/{collectionId}/properties",
    summary: "Create collection properties",
    description: "Appends one or more properties to an existing collection.",
  },
  {
    method: "get",
    path: "/collections/{collectionId}/documents",
    summary: "List collection documents",
    description:
      "Returns root documents in a collection with filtering, sorting, pagination, and include support.",
  },
  {
    method: "get",
    path: "/collections/{collectionId}/documents/{value}",
    summary: "Get one collection document",
    description: "Fetches a document by id (default) or by the configured lookup key via ?by=field.",
  },
  {
    method: "post",
    path: "/collections/{collectionId}/documents",
    summary: "Create collection document",
    description: "Creates a document in a collection with optional parent and field values.",
  },
  {
    method: "patch",
    path: "/collections/{collectionId}/documents/{docId}",
    summary: "Update collection document",
    description: "Updates document metadata and/or collection field values.",
  },
  {
    method: "delete",
    path: "/collections/{collectionId}/documents/{docId}",
    summary: "Delete collection document",
    description: "Soft-deletes a document from a collection.",
  },
  {
    method: "get",
    path: "/collections/{collectionId}/documents/{docId}/children",
    summary: "List document children",
    description: "Returns children for a document with optional recursive depth.",
  },
  {
    method: "get",
    path: "/collections/{collectionId}/documents/{docId}/related",
    summary: "List related documents",
    description: "Returns related documents for a collection document.",
  },
  {
    method: "patch",
    path: "/collections/{collectionId}",
    summary: "Update collection API settings",
    description: "Updates lookup key and indexed fields used by external API querying.",
  },
  {
    method: "get",
    path: "/openapi.json",
    summary: "OpenAPI schema",
    description: "Returns the OpenAPI 3.1 document for this external API.",
  },
];

export const externalApiOpenApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "Lydie External Collections API",
    version: "v1",
    description:
      "REST API for collection documents, lookup settings, and related/children traversal.",
  },
  servers: [{ url: "/api/v1" }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "API Key",
      },
    },
  },
  security: [{ bearerAuth: [] }],
  tags: [{ name: "Collections" }, { name: "OpenAPI" }],
  paths: Object.fromEntries(
    externalApiEndpoints.map((endpoint) => [
      endpoint.path,
      {
        [endpoint.method]: {
          tags: [endpoint.path === "/openapi.json" ? "OpenAPI" : "Collections"],
          summary: endpoint.summary,
          description: endpoint.description,
          responses: {
            "200": { description: "OK" },
            "201": { description: "Created" },
            "400": { description: "Bad Request" },
            "401": { description: "Unauthorized" },
            "404": { description: "Not Found" },
          },
        },
      },
    ]),
  ),
} as const;
