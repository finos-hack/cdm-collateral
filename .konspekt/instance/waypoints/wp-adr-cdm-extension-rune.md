```yaml
id: wp-adr-cdm-extension-rune
kind: decision
subtype: adr
timestamp: 2026-10-17T00:48:29Z
review: accepted
provenance:
  conversationId: cdm-development
  sourceRef: 718789ef3024496c06042f84fc8cf0129ecc58dc
  contentHash: 718789ef3024496c06042f84fc8cf0129ecc58dc
  timestamp: 2026-10-17T00:48:29Z
createdAt: 2026-10-17T00:48:29Z
updatedAt: 2026-10-17T00:48:29Z
```
# ADR: Write CDM extensions in the Rune DSL and generate them like CDM

The local CDM extensions (`wp-adr-cdm-local-extensions`) are written in the Rune DSL (`.rosetta` files) in their
own namespace that imports CDM's, and generated with the same generators CDM uses (Python first; Java, TypeScript and
JSON Schema as needed). Function bodies that Rune cannot express reasonably may be native implementations.

**Context.** Options were Rune with generation (A), Python on top of the `finos-cdm` package (B), or a hybrid (C);
the project owner chose A. Most P1 gaps in `artifact-cdm-gap-register` are new types (G2, G3, G10, G24, G25) that
every consumer needs in the same form.

**Consequences.** The build needs Java and Maven with the Rune DSL and Rune Python generator at versions matching the
CDM release. Unverified and checked first: whether the extension can be generated on top of the published
`finos-cdm` Python package or must be generated together with CDM. The generated Python imports CDM's single bundle
module, about 10–13 s once per process.
