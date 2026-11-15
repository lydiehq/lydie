# Changesets

Versions of the npm libraries only: `@lydie/contract`, `@lydie/sdk`, `@lydie/markdown` and
`@lydie/editor`. Every other package is ignored (`config.json`); the apps carry the release
version and are cut with a tag (see `RELEASING.md`).

```bash
bunx @changesets/cli          # describe a change to one of the libraries
bunx @changesets/cli status   # what the next `changeset version` would bump
bunx @changesets/cli version  # apply the bumps and write CHANGELOG.md files
```

Nothing is published yet: the libraries export TypeScript source and are still `private`.
