```yaml
provenance:
  conversationId: setup
  timestamp: 2026-10-14T23:04:53Z
review: accepted
```
# Edges

Single typed edge table (konspekt serialization v1). `from` / `to` are
`type:id`. `provenance` and `review` are the file-level defaults above.
`weight` is meaningful only for `relates` and `links`. Edge kinds:
`decomposes`, `mentions`, `relates`, `links`, `produces`, `notes`, `marks`,
`supersedes`.

| id | kind | from | to | weight |
|----|------|------|----|--------|
| e-dec-adoption-setupiter | decomposes | node:goal-test-konspekt-adoption | node:task-repo-setup-iteration |  |
