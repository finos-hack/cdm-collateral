# Grants

Append-only log of accept rights (`spec/architecture/AUTHORITY.md`). Each row
grants or revokes one principal's right to accept atoms in one scope. `scope`
is `*` for the entire graph or `type:id` for one entity and its subgraph.

Backfill note: the first row records the accept authority this instance has had
since its seed on 2026-10-14 — one human holding the grantor role and the accept
right for the entire graph. It has no `source`, predating this table.

| scope | acceptor | action | grantor | timestamp | source |
|-------|----------|--------|---------|-----------|--------|
| * | denisurusov | grant | denisurusov | 2026-10-14T23:04:53Z |  |
