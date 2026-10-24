```yaml
id: wp-adr-cdm-local-extensions
kind: decision
subtype: adr
timestamp: 2026-10-17T00:25:47Z
review: accepted
provenance:
  conversationId: cdm-development
  sourceRef: 593386d553b3e9523c084f9ad874eb2a715f4235
  contentHash: 593386d553b3e9523c084f9ad874eb2a715f4235
  timestamp: 2026-10-17T00:25:47Z
createdAt: 2026-10-17T00:25:47Z
updatedAt: 2026-10-24T14:48:11Z
```
# ADR: Close CDM gaps with local extensions only

CDM gaps found for collateral management are closed by extensions kept in this repository, built against CDM 7.6.0.
Nothing is proposed or reported to FINOS (consistent with the earlier instruction not to report defects). Defects in
CDM functions are handled by corrected replacement functions under new names, since CDM's own cannot be edited in
place without a fork. The gap analysis consolidates the existing analysis (findings, defects, coverage matrices,
blockchain consequences) rather than a fresh pass over the CDM source.

**Consequences.** The extension depends on a pinned CDM release; moving to a later release means re-checking each
extension against it. The Rosetta toolchain and the extension's package layout are decided in `task-cdm-gap-closure`.
Naming defects (D9–D12) stay as they are.

**Amendment (2026-10-24, binding `goal-business-case`).** The clause "Nothing is proposed or reported to FINOS" above
is superseded. The project owner states the project is carried out in collaboration with FINOS
(`nw-finos-collaboration`): findings and defects **will reach FINOS CDM** through that collaboration — the CDM Python
stack maintainers are FINOS members (`nw-repo-shared-with-cdm-maintainers`). The project works with FINOS but formally
sits outside FINOS governance for now: it is not yet a FINOS project, the `cdm-ext` extensions remain maintained in
this repository, and no extension is contributed into the FINOS governance process yet. What changes is the reporting
of findings and defects to FINOS, not where the extensions are maintained; the local-extension decision above stands.
