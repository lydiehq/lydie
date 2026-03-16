# Collections REST API

Base URL: `/api/v1`

## Collections

### Create collection
`POST /api/v1/collections`

```json
{
  "name": "Blog",
  "handle": "blog",
  "properties": [
    { "name": "slug", "type": "text", "required": false, "unique": true },
    { "name": "excerpt", "type": "text", "required": false, "unique": false }
  ]
}
```

Notes:
- `handle` is optional; if omitted, one is generated from `name`
- Reserved handles are normalized (for example `api` -> `api-collection`)

### Create properties
`POST /api/v1/collections/{collectionId}/properties`

```json
{
  "properties": [
    { "name": "published_at", "type": "date", "required": false, "unique": false },
    { "name": "draft", "type": "boolean", "required": false, "unique": false }
  ]
}
```

Notes:
- Property names must be unique per collection
- Existing properties are preserved; this endpoint appends

## Documents

### List documents
`GET /api/v1/collections/{collectionId}/documents`

- Query params:
  - `filter[{field}]`, `filter[{field}][$eq]`, `[$in]`, `[$gt]`, `[$lt]`, `[$like]`, `[$null]`
  - `sort` (example: `-created_at`, `title`)
  - `limit` (default `100`, max `100`)
  - `cursor`
  - `include` (`related`, `children`)
  - `fields` (sparse fieldsets)

Response envelope:

```json
{
  "data": [{ "id": "doc_1", "fields": { "slug": "hello-world" } }],
  "meta": {
    "total": 1,
    "limit": 100,
    "nextCursor": null,
    "warnings": []
  }
}
```

### Get a single document
`GET /api/v1/collections/{collectionId}/documents/{value}?by={field}`

- `by=id` is default
- `by` must be `id` or the configured collection lookup key

### Get children
`GET /api/v1/collections/{collectionId}/documents/{docId}/children?depth=1`

- Default depth `1`
- Max depth `5`

### Get related
`GET /api/v1/collections/{collectionId}/documents/{docId}/related?limit=5`

### Create document
`POST /api/v1/collections/{collectionId}/documents`

```json
{
  "title": "4 Drone-Focused Companies That Are Hiring Right Now",
  "published": true,
  "fields": {
    "slug": "drone-companies-hiring-now",
    "excerpt": "Discover four drone trailblazers..."
  },
  "jsonContent": {
    "type": "doc",
    "content": []
  }
}
```

Notes:
- `jsonContent` is optional; when provided, it is converted and stored as Yjs state
- `coverImage` can be set via `coverImage: string | null`

### Update document
`PATCH /api/v1/collections/{collectionId}/documents/{docId}`

Uses the same body shape as create. Provided fields are patched.

### Delete document
`DELETE /api/v1/collections/{collectionId}/documents/{docId}`

## Collection settings

### Update lookup + indexed fields
`PATCH /api/v1/collections/{collectionId}`

```json
{
  "lookupKey": "slug",
  "indexedFields": ["status", "published_at"]
}
```

Validation:
- Field names must match `^[a-z_][a-z0-9_]*$`
- Max 3 indexed fields

## Error envelope

```json
{
  "error": {
    "code": "FIELD_NOT_INDEXED",
    "message": "Human-readable description.",
    "hint": "Optional actionable suggestion."
  }
}
```

## Error codes

- `COLLECTION_NOT_FOUND` (404)
- `DOCUMENT_NOT_FOUND` (404)
- `FIELD_NOT_INDEXED` (400)
- `INVALID_FILTER_OPERATOR` (400)
- `DEPTH_LIMIT_EXCEEDED` (400)
- `INVALID_CURSOR` (400)
- `INVALID_COLLECTION` (400)
- `INVALID_PROPERTY` (400)
- `PROPERTY_ALREADY_EXISTS` (409)
- `INVALID_CONTENT` (400)
- `SORT_FIELD_NOT_INDEXED` (200 + warning)
