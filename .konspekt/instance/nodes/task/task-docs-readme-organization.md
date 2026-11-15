```yaml
id: task-docs-readme-organization
type: task
title: Organise the docs behind a clean README
status: open
review: accepted
provenance:
  conversationId: clean-up-and-prep
  sourceRef: ni:///sha-256;nn4stfwVQo46WAFykK398kbcXhl8GdicyuyhSYh-eKY
  timestamp: 2026-11-13T14:59:13Z
  confidence: 0.8
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 602ba7a2f8332392c61bb001b2499f349c64a96f
    contentHash: 602ba7a2f8332392c61bb001b2499f349c64a96f
createdAt: 2026-11-13T14:59:13Z
updatedAt: 2026-11-13T15:22:33Z
```
# Task: organise the docs behind a clean README

Under [[goal-adoption]]. The project owner asked for a README with clean sections that link to the detailed files:

1. where the analysis is (the documents under `docs/analysis/` and what each holds);
2. the CDM defects found, split into fixed (worked around in `cdm-ext` or avoided by the prototype) and not fixed
   (still affecting the prototype, or only documented); CDM itself is not edited;
3. the CDM gaps, split into closed in `cdm-ext` and deferred to SMEs (`docs/analysis/sme-question-ledger.md`);
4. the flows built (workflow map rows and their live specs).

Decisions of the project owner (source `602ba7a2f8332392c61bb001b2499f349c64a96f`): bring the source tables up to date first (the gap register's closure
status, a status column in `defects.md`), then the README links to them and states the counts.

**Done 2026-11-13** on branch `clean-up-and-prep`:

- `README.md`: sections for the analysis documents, the CDM defects (16 fixed, 11 not fixed of which 3 have no effect,
  3 not applicable), the CDM gaps (21 closed, 7 partial, 1 deferred, 8 open, 2 out of scope; 15 with questions
  deferred to SMEs), the 47 flows built, running the prototype and the repository layout.
- `defects.md`: an "In this repository" column in the summary and a section with the definitions and how each defect
  was handled; the missing D25 row added; D28 and D29 in order.
- `gap-register.md`: the closure table updated for workflow map rows 7 to 30 (G8, G15, G16, G17, G34, G35) and given
  rows for every gap that sat under "others"; status counts; a table of the SME ledger sections per gap.
- `sme-question-ledger.md`: a CCP heading; `cdm-workflow-task-map.md`: the status line as of PR #66.
- The per-defect and per-gap statuses were researched against `cdm-ext`, the collateral service, the task map and the
  SME ledger, and their cited functions checked to exist.

**Accepted 2026-11-13** by the project owner (source `c0fb0a22cd9996db76fe587875f9fc95c90d4203`), with these decisions:
G22 and G23 are closed for the scope their ADRs set; G33 stays partial; `cdm-ext/README.md` gets the missing files and
the 15 built tasks still marked open are resolved; no `docs/INDEX.md`; push and PR later.

- `cdm-ext/README.md`: rows for the 14 GMRA, repo, GMSLA and triparty Rune files or pairs and the 20 test classes it
  lacked, with the gaps and defects each closes.
- Resolved: the six `task-ccp-*` tasks, the seven `task-triparty-*` tasks, `task-gmsla-default-close-out` and the
  GMSLA parent `task-securities-lending-gmsla-workflows`.
