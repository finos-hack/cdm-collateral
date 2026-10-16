# Changed code (engineer layer)

Append-only log binding each committed code change to the entity it was about,
one row per (entity, commit, file) in commit order (top to bottom is the
timeline). `timestamp` is the ISO 8601 time the row was written. `commit` is an
opaque revision token (the git commit SHA in a git repo); `file` is a
repo-relative path that commit touched for that entity. The diff itself is not
stored here — it lives in version control, recoverable by `commit`.

Rows are written at commit time, so a row points at the commit made just before
it. Bookkeeping commits — those touching only `.konspekt/instance/**` — are
excluded.

| entity | commit | file | timestamp |
|--------|--------|------|-----------|
| task-repo-setup-iteration | 2bd570ec6bd32ebcff5a6168fd01260b87fed17f | .claude/hooks/load-mandatory-skills.sh | 2026-10-15T02:15:43Z |
| task-repo-setup-iteration | 2bd570ec6bd32ebcff5a6168fd01260b87fed17f | .claude/hooks/require-binding.sh | 2026-10-15T02:15:43Z |
| task-repo-setup-iteration | 2bd570ec6bd32ebcff5a6168fd01260b87fed17f | .github/workflows/konspekt-binding-audit.yml | 2026-10-15T02:15:43Z |
| task-repo-setup-iteration | 2bd570ec6bd32ebcff5a6168fd01260b87fed17f | .konspekt/OPERATING.md | 2026-10-15T02:15:43Z |
| task-repo-setup-iteration | 2bd570ec6bd32ebcff5a6168fd01260b87fed17f | .konspekt/binding-audit.json | 2026-10-15T02:15:43Z |
| task-repo-setup-iteration | 2bd570ec6bd32ebcff5a6168fd01260b87fed17f | .konspekt/instance/changes/changed.md | 2026-10-15T02:15:43Z |
| task-repo-setup-iteration | 2bd570ec6bd32ebcff5a6168fd01260b87fed17f | .konspekt/instance/commands/executed.md | 2026-10-15T02:15:43Z |
| task-repo-setup-iteration | 2bd570ec6bd32ebcff5a6168fd01260b87fed17f | .konspekt/instance/edges/edges.md | 2026-10-15T02:15:43Z |
| task-repo-setup-iteration | 2bd570ec6bd32ebcff5a6168fd01260b87fed17f | .konspekt/instance/nodes/goal/goal-test-konspekt-adoption.md | 2026-10-15T02:15:43Z |
| task-repo-setup-iteration | 2bd570ec6bd32ebcff5a6168fd01260b87fed17f | .konspekt/instance/nodes/task/task-repo-setup-iteration.md | 2026-10-15T02:15:43Z |
| task-repo-setup-iteration | 2bd570ec6bd32ebcff5a6168fd01260b87fed17f | .konspekt/instance/project.md | 2026-10-15T02:15:43Z |
| task-repo-setup-iteration | 2bd570ec6bd32ebcff5a6168fd01260b87fed17f | .konspekt/instance/sources/b625196f2f2fd6cf48bdbf8771dabda407a20f1e.md | 2026-10-15T02:15:43Z |
| task-repo-setup-iteration | 2bd570ec6bd32ebcff5a6168fd01260b87fed17f | .konspekt/instance/transitions/transitions.md | 2026-10-15T02:15:43Z |
| task-repo-setup-iteration | 2bd570ec6bd32ebcff5a6168fd01260b87fed17f | .konspekt/lib/binding-audit.mjs | 2026-10-15T02:15:43Z |
| task-repo-setup-iteration | 2bd570ec6bd32ebcff5a6168fd01260b87fed17f | .konspekt/lib/conformance.mjs | 2026-10-15T02:15:43Z |
| task-repo-setup-iteration | 2bd570ec6bd32ebcff5a6168fd01260b87fed17f | .konspekt/spec/personas/engineer/AGENTS.md | 2026-10-15T02:15:43Z |
| goal-data-cdm-taxonomies-specs | 9c2b9aa13312a3ba058e8c135fe7b254c04e6206 | .gitignore | 2026-10-15T12:22:58Z |
| task-cdm-current-state-analysis | fd3851eb0240bbe8c060a51211f78cb1b831ff2c | docs/analysis/cdm-csa-coverage-matrix.md | 2026-10-15T12:33:08Z |
| task-cdm-current-state-analysis | 40a0f83e827a49331a05c384224f7d0eb5c921ce | docs/analysis/cdm-csa-coverage-matrix.md | 2026-10-15T22:31:52Z |
| task-cdm-current-state-analysis | 9c0a2e66faa60068677c123dbbf53b00aa79f96f | docs/analysis/cdm-csa-coverage-matrix.md | 2026-10-15T22:33:28Z |
| task-cdm-current-state-analysis | 0c325b984260873fc6eac068633a668b69e10bc0 | docs/analysis/cdm-csa-coverage-matrix.md | 2026-10-15T22:41:02Z |
| task-cdm-current-state-analysis | 0b8609b21f09592e5981c63468f190173d6b7555 | docs/analysis/cdm-csa-coverage-matrix.md | 2026-10-15T22:52:39Z |
| task-cdm-current-state-analysis | 0b8609b21f09592e5981c63468f190173d6b7555 | docs/analysis/collateral-conceptual-model.md | 2026-10-15T22:52:39Z |
| task-cdm-current-state-analysis | 0b8609b21f09592e5981c63468f190173d6b7555 | docs/analysis/collateral-conceptual-model.svg | 2026-10-15T22:52:39Z |
| task-cdm-current-state-analysis | 0b8609b21f09592e5981c63468f190173d6b7555 | docs/analysis/diagrams/collateral_model_svg.py | 2026-10-15T22:52:39Z |
| task-cdm-current-state-analysis | b456d4825123a9b06e0fc78ce416a34c8c3d46bb | docs/analysis/collateral-conceptual-model.md | 2026-10-15T22:55:58Z |
| task-cdm-current-state-analysis | b456d4825123a9b06e0fc78ce416a34c8c3d46bb | docs/analysis/collateral-conceptual-model.svg | 2026-10-15T22:55:58Z |
| task-cdm-current-state-analysis | b456d4825123a9b06e0fc78ce416a34c8c3d46bb | docs/analysis/diagrams/collateral_model_svg.py | 2026-10-15T22:55:58Z |
| task-collateral-standards-inventory | 126443d57bbe27cfda54892ad05c5fef1b0cf43f | docs/analysis/collateral-standards-inventory.md | 2026-10-15T23:01:30Z |
| task-cdm-current-state-analysis | 8af66c6a9a6a96c7b601af50c251feb29b0042ea | docs/analysis/findings.md | 2026-10-15T23:04:45Z |
| task-collateral-standards-inventory | 8af66c6a9a6a96c7b601af50c251feb29b0042ea | docs/analysis/findings.md | 2026-10-15T23:04:45Z |
| task-cdm-collateral-other-agreements | abf24679340a1d2a41b83157194d7581164f34c4 | docs/analysis/cdm-other-agreements-coverage-matrix.md | 2026-10-15T23:10:48Z |
| task-cdm-collateral-other-agreements | abf24679340a1d2a41b83157194d7581164f34c4 | docs/analysis/findings.md | 2026-10-15T23:10:48Z |
| task-cdm-collateral-other-agreements | 965054a6bb76e3c509bae77b12857f9022f58081 | docs/analysis/cdm-other-agreements-coverage-matrix.md | 2026-10-15T23:25:52Z |
| task-cdm-collateral-other-agreements | 965054a6bb76e3c509bae77b12857f9022f58081 | docs/analysis/findings.md | 2026-10-15T23:25:52Z |
| task-cdm-collateral-other-agreements | 7d25e532b3a7cd454fb5285d98eb063cd3fc13bf | docs/analysis/collateral-conceptual-model.md | 2026-10-15T23:35:01Z |
| task-cdm-collateral-other-agreements | 7d25e532b3a7cd454fb5285d98eb063cd3fc13bf | docs/analysis/collateral-flows.md | 2026-10-15T23:35:01Z |
| task-cdm-collateral-other-agreements | 7d25e532b3a7cd454fb5285d98eb063cd3fc13bf | docs/analysis/diagrams/collateral-flow-ccp.svg | 2026-10-15T23:35:01Z |
| task-cdm-collateral-other-agreements | 7d25e532b3a7cd454fb5285d98eb063cd3fc13bf | docs/analysis/diagrams/collateral-flow-csa.svg | 2026-10-15T23:35:01Z |
| task-cdm-collateral-other-agreements | 7d25e532b3a7cd454fb5285d98eb063cd3fc13bf | docs/analysis/diagrams/collateral-flow-repo.svg | 2026-10-15T23:35:01Z |
| task-cdm-collateral-other-agreements | 7d25e532b3a7cd454fb5285d98eb063cd3fc13bf | docs/analysis/diagrams/collateral-flow-seclending.svg | 2026-10-15T23:35:01Z |
| task-cdm-collateral-other-agreements | 7d25e532b3a7cd454fb5285d98eb063cd3fc13bf | docs/analysis/diagrams/collateral-flow-triparty.svg | 2026-10-15T23:35:01Z |
| task-cdm-collateral-other-agreements | 7d25e532b3a7cd454fb5285d98eb063cd3fc13bf | docs/analysis/diagrams/collateral_diagrams.py | 2026-10-15T23:35:01Z |
| task-cdm-collateral-other-agreements | 7d25e532b3a7cd454fb5285d98eb063cd3fc13bf | docs/analysis/diagrams/collateral_model_svg.py | 2026-10-15T23:35:01Z |
| task-cdm-current-state-analysis | 02e52a683a7d0eb2dbb0eefe08a68cfcce3c10b3 | docs/analysis/cdm-csa-coverage-matrix.md | 2026-10-15T23:38:19Z |
| task-cdm-collateral-other-agreements | 02e52a683a7d0eb2dbb0eefe08a68cfcce3c10b3 | docs/analysis/cdm-other-agreements-coverage-matrix.md | 2026-10-15T23:38:19Z |
| task-cdm-collateral-other-agreements | 02e52a683a7d0eb2dbb0eefe08a68cfcce3c10b3 | docs/analysis/findings.md | 2026-10-15T23:38:19Z |
| task-cdm-current-state-analysis | 738c6296a86535f717a2522702ce814ceabfeb00 | docs/analysis/cdm-csa-coverage-matrix.md | 2026-10-15T23:43:17Z |
| task-cdm-collateral-other-agreements | 738c6296a86535f717a2522702ce814ceabfeb00 | docs/analysis/cdm-other-agreements-coverage-matrix.md | 2026-10-15T23:43:17Z |
| task-cdm-current-state-analysis | 738c6296a86535f717a2522702ce814ceabfeb00 | docs/analysis/collateral-conceptual-model.md | 2026-10-15T23:43:17Z |
| task-cdm-collateral-other-agreements | 738c6296a86535f717a2522702ce814ceabfeb00 | docs/analysis/collateral-flows.md | 2026-10-15T23:43:17Z |
| task-cdm-collateral-other-agreements | 738c6296a86535f717a2522702ce814ceabfeb00 | docs/analysis/diagrams/collateral-flow-ccp.svg | 2026-10-15T23:43:17Z |
| task-cdm-collateral-other-agreements | 738c6296a86535f717a2522702ce814ceabfeb00 | docs/analysis/diagrams/collateral-flow-csa.svg | 2026-10-15T23:43:17Z |
| task-cdm-collateral-other-agreements | 738c6296a86535f717a2522702ce814ceabfeb00 | docs/analysis/diagrams/collateral-flow-repo.svg | 2026-10-15T23:43:17Z |
| task-cdm-collateral-other-agreements | 738c6296a86535f717a2522702ce814ceabfeb00 | docs/analysis/diagrams/collateral-flow-seclending.svg | 2026-10-15T23:43:17Z |
| task-cdm-collateral-other-agreements | 738c6296a86535f717a2522702ce814ceabfeb00 | docs/analysis/diagrams/collateral-flow-triparty.svg | 2026-10-15T23:43:17Z |
| task-cdm-collateral-other-agreements | 738c6296a86535f717a2522702ce814ceabfeb00 | docs/analysis/diagrams/collateral_diagrams.py | 2026-10-15T23:43:17Z |
| task-cdm-collateral-other-agreements | 738c6296a86535f717a2522702ce814ceabfeb00 | docs/analysis/findings.md | 2026-10-15T23:43:17Z |
| task-collateral-taxonomy-inventory | 618be95ac2eba89ec2868690c2776aa3cdea2756 | docs/analysis/collateral-taxonomy-inventory.md | 2026-10-15T23:48:20Z |
| task-collateral-taxonomy-inventory | 618be95ac2eba89ec2868690c2776aa3cdea2756 | docs/analysis/findings.md | 2026-10-15T23:48:20Z |
| task-collateral-taxonomy-inventory | 9c14ce38c4382c60388ede870e509474455da0d7 | docs/analysis/defects.md | 2026-10-15T23:55:51Z |
| task-collateral-taxonomy-inventory | 9c14ce38c4382c60388ede870e509474455da0d7 | docs/analysis/collateral-asset-taxonomy-mapping.md | 2026-10-15T23:55:51Z |
| task-collateral-taxonomy-inventory | 9c14ce38c4382c60388ede870e509474455da0d7 | docs/analysis/findings.md | 2026-10-15T23:55:51Z |
| task-collateral-taxonomy-inventory | bce788a5e4efe73d461ab22366cabe308ae20a3a | docs/analysis/collateral-asset-taxonomy-mapping.md | 2026-10-16T00:27:53Z |
| task-blockchain-smart-contracts-applicability | 6921b898d52f4dc0919fa2931fbf778009e3e285 | docs/references.md | 2026-10-16T02:47:21Z |
| task-blockchain-smart-contracts-applicability | d64bd5d5ea182f07bde0b5e12d83e121a4943100 | docs/architecture/blockchain-applicability.md | 2026-10-16T02:55:34Z |
| task-blockchain-smart-contracts-applicability | d519ebb68267a0f91e1032a6e80d2d1855c8114a | docs/architecture/blockchain-applicability.md | 2026-10-16T19:30:55Z |
| task-blockchain-smart-contracts-applicability | d519ebb68267a0f91e1032a6e80d2d1855c8114a | docs/references.md | 2026-10-16T19:30:55Z |
