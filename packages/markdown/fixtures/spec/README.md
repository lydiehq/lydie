# Spec example fixtures

`commonmark.json`: the examples of the CommonMark Spec 0.31.2 (https://spec.commonmark.org/0.31.2/),
by John MacFarlane, licensed CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/).

`gfm.json`: the examples of the GitHub Flavored Markdown Spec
(https://github.com/github/cmark-gfm/blob/master/test/spec.txt), by GitHub, Inc. and John
MacFarlane, licensed CC BY-SA 4.0.

Only the Markdown input of each example is kept (the expected HTML is dropped). These two files are
therefore adaptations distributed under CC BY-SA 4.0. Regenerate with
`bun scripts/fetch-corpus.ts --specs`.
