# Collections Architecture (High-Level)

## What Collections Are

Collections are a first-class, independent data primitive for structured content.

- A collection defines a schema (properties/fields) and identity (`name`, `handle`).
- A document can belong to a collection as an entry.
- Entry field values are stored separately from the document body content.
- Collections are surfaced independently in the UI (not as special documents).

This is intentionally closer to Notion-style databases than to the old "collection-as-page" model.

## Core Primitives

- **Documents**: rich content pages (title, body, parent relationship, publishing flags, etc.).
- **Collections**: schema + handle + organization scoping.
- **Collection fields**: per-document values for collection properties.

Design intent:

- Documents remain the content primitive.
- Collections remain the structured metadata/query primitive.
- UI can combine both without coupling their storage model.

## Current Product Behavior

- Collections are managed from collection pages and sidebar collection links.
- Collection entries are hidden from the main document sidebar tree.
- Collection entries can still be edited from document context (field editing remains available).
- External API collection access is handle-based.

## What Collections Are Not

- Collections are **not** hierarchical trees of entries.
- Collection membership alone should not be treated as a routing/tree system.
- Collection block embeds in documents are a presentation feature, not system-of-record module config.

## Modules Direction (High-Level)

Modules (e.g. Blog, Knowledge Base) are product features built on documents + collections.

- Collections provide schema and querying.
- Documents provide page content.
- Modules provide behavior: publishing, domain exposure, navigation/routing rules, and UX.

## TODO: Routing for Modules

We need a module-level routing model that supports both flat and deeply nested URLs while keeping collections non-hierarchical.

### Goals

- Support routes like `/knowledge-bases/internal-vs-external` and deep paths like `/tutorial1/step1/info-page`.
- Keep collection entries flat (Notion-like), but still support route trees where needed.
- Allow modules where routing is optional/disabled (e.g. productivity/task use cases).
- Enable route tree UX (including drag-and-drop) when routing is enabled.

### Proposed Direction

- Add an explicit routing layer at the module level (not inferred from collection hierarchy).
- Optionally expose a computed/managed `route` concept for entries in routing-enabled modules.
- Keep routing constraints module-scoped (uniqueness, normalization, tree moves).

### Open Design Questions

- Where is canonical route state stored (module routing table vs. managed property model)?
- How do we represent shared content published to multiple modules with different routes?
- Which fields are module-specific overrides vs. shared canonical metadata?

### Guiding Principle

Use explicit, durable data relationships for module routing/publishing. Keep collection/table/editor views as projections of that model, not the source of truth.

## External API Related-Document Scoping

The external collections API supports explicit related-document scoping for module consumers.

- `include_related=true` enables related documents.
- `related_scope=same_collection` limits related results to the current document collection.
- `related_scope=collection_handle` limits related results to `related_collection_handle=<handle>`.
- `related_scope=any` keeps global related matching behavior.
- `related_limit=<n>` controls related result count (default is 5).

Related payloads do not assume first-party slugs. Any route-specific property (for example `slug`) is consumer-defined collection data under `fields`.
