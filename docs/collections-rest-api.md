# Collections REST API

Base URL: `/api/v1`

## Documents

### List documents
`GET /api/v1/collections/{collectionId}/documents`

- Root documents only (`parent_id IS NULL`)
- Query params:
  - `filter[{field}]`, `filter[{field}][$eq]`, `[$in]`, `[$gt]`, `[$lt]`, `[$like]`, `[$null]`
  - `sort` (example: `-created_at`, `title`)
  - `limit` (default `20`, max `100`)
  - `cursor`
  - `include` (`related`, `children`)
  - `fields` (sparse fieldsets)

Response envelope:

```json
{
  "data": [{ "id": "doc_1", "fields": { "slug": "hello-world" } }],
  "meta": {
    "total": 1,
    "limit": 20,
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
- `SORT_FIELD_NOT_INDEXED` (200 + warning)

## TODO endpoints

- `TODO`: `POST /api/v1/collections/{collectionId}/documents` (create document)
- `TODO`: `PATCH /api/v1/collections/{collectionId}/documents/{docId}` (update document)
- `TODO`: `DELETE /api/v1/collections/{collectionId}/documents/{docId}` (delete document)
- `TODO`: bulk mutation endpoints (batch create/update/delete)
- `TODO`: full collection CRUD under `/api/v1/collections`
