# Executed commands (engineer layer)

Append-only log binding each LLM-executed command to the entity it was about, one
row per execution in execution order (top to bottom is the timeline; there is no
stored timestamp). `command` is the content hash of `commands/<command>.md`,
which holds the verbatim command text (the git blob SHA in a git repo). Written
at execution time.

| entity | command |
|--------|---------|
| task-local-environment-setup | ee93d57abe02878740a8920ec1d1468c3d2fb0be |
| task-local-environment-setup | 794a6ed3939e5f3cf235c761c77fa36607ea8a68 |
