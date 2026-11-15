```yaml
id: nw-defer-message-standard-mapping
kind: decision
review: accepted
provenance:
  conversationId: gap-coverage-audit
  sourceRef: ni:///sha-256;FkjvKBvP6SZzmpt8FBl9zYlssQ5n13JYCvOHevZs5go
  timestamp: 2026-11-10T23:00:33Z
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 6bd8ae81e8599cbf2270352d4fa49372faa1f22a
    contentHash: 6bd8ae81e8599cbf2270352d4fa49372faa1f22a
createdAt: 2026-11-10T23:00:33Z
updatedAt: 2026-11-10T23:00:33Z
```
# Decision: defer the mapping from message standards to CDM (G26) and business case criterion S8

Decided by the project owner on 2026-11-10.

**What is deferred**

- Gap G26 (gap register): a mapping between CDM and the ISO 20022 `colr` collateral messages (colr.003 to colr.010)
  and the FpML collateral process messages (`requestMargin`, `marginCallStatus`, `requestCollateralAcceptance`,
  `collateralProposalStatus`, `requestSubstitution`, `substitutionStatus`); finding S1. No task, no task-map row and no
  `cdm-ext` work is planned for it.
- Business case criterion S8, which runs the margin-call exchange once with CDM objects and once with `colr` messages
  mapped through G26. S8 waits for G26, so value claim V2 stays supported by the qualitative check S2 only.

**Why**

The first goal is a proof of concept of CDM over Besu: collateral workflows expressed in CDM and the extension, with
their state on a Besu chain. Mapping from any message standard to CDM is important, even critical, but trivial (the
project owner's words).

**Simplification stated under [[nw-mimic-real-flows]]**

The prototype's parties exchange CDM documents (payload store, `wp-adr-cdm-payload-carrier`), not `colr` or FpML
messages. The steps, parties and approvals of each flow still follow practice; only the message format differs.

