# Principals

Identities declared by this instance (`spec/architecture/AUTHORITY.md`).
`kind` is `human` or `agent`. `roles` lists `grantor` for a principal that may
issue and revoke grants. `key` is reserved for a signing key and is empty.

Fleet proposer handles are declared here as grantless agent principals: they
hold no grant, so they propose and never accept, and the committer records the
proposing handle in the transition `by` column at fold.

| id | kind | roles | key |
|----|------|-------|-----|
| denisurusov | human | grantor |  |
| spec-writer | agent |  |  |
