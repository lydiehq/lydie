# AGENTS.md - @lydie/sdk

Generated TypeScript client for the hosted API.

Licence: MIT.

## May depend on

`@lydie/contract`. `client/scripts/check-boundaries.ts` is authoritative and runs in CI.

## Rules

- Generated output is committed; CI fails if it drifts from the contract.
- Every user-visible action is an operation defined with `defineOperation` in `@lydie/contract`.

## Public API

Generated from the hosted API's OpenAPI document (`GET /v1/openapi.json`, snapshot committed as
`openapi.json`):

```ts
// src/generated.ts (generated): one type per schema, ApiOperations { [id]: { input, output } },
// ApiOperationId, apiRoutes { [id]: { method, path, query } }
createApiCaller(transport: (request: { method, path, body? }) => Promise<unknown>)
  .call(id, input)            // path params into the path, GET/DELETE query params, the rest as JSON
requestFor(id, input) → ApiRequest
fetchPublicShare({ baseUrl, token, documentId?, password?, fetch? }) → PublicShareResult
  // ok | password-required | rate-limited | not-found | error (`/v1/public/shares/{token}`)
```

The generator also writes `../plugin-api/src/hosted-operations.ts`: the types of the operations
only the hosted API has (not in `@lydie/contract`), so plugins get typed `app.services.account.call`
(exported from `@lydie/plugin-api/hosted`).

```bash
bun run generate          # from the running API (http://localhost:4100), or --url <url>
bun scripts/generate.ts --snapshot   # from the committed openapi.json
bun run generate:check    # part of `bun run test`: fails if the generated files drifted
```
