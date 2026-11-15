```yaml
id: wp-adr-java-cdm-stack
kind: decision
subtype: adr
timestamp: 2026-10-18T01:27:28Z
review: accepted
provenance:
  conversationId: cdm-development
  sourceRef: ni:///sha-256;uTVpTsHhFM2-VfYVE0yYk9BbFLNr0MptY43fSW9jufU
  timestamp: 2026-10-18T01:27:28Z
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 6634e3f08a3a21e5cc0574f7ca2bfaf3cdd61630
    contentHash: 6634e3f08a3a21e5cc0574f7ca2bfaf3cdd61630
createdAt: 2026-10-18T01:27:28Z
updatedAt: 2026-10-18T01:27:28Z
```
# ADR: Java for CDM and the workflow services; Javalin; Python build retired

CDM 7.7.0 and the local extension run on CDM's Java distribution (`org.finos.cdm:cdm-java`), the extension generated
to Java with CDM's own toolchain (`rune-maven-plugin`, `cdm-ext/pom.xml`). The collateral workflow service and the
oracle service are written in Java 21 with Javalin. The project's own code is Java. Python remains only for
documentation tooling (the architecture page and diagram scripts). The Python build of the extension is retired;
it is kept at commit `e1a2e6f` as a reproduction of defects D14–D16 for the CDM Python maintainers.

**Context.** The Python stack needed a runtime workaround layer and Rune written around eleven generator defects,
and CDM's full validation of collateral positions failed (D14, D15). The Java spike of 2026-10-18 passed the same 23
tests with no workarounds and with CDM's full validation. Python and Java write CDM choice types differently in
Rune JSON, and Python reads the documented form as empty (D16), so a Python stack would not exchange CDM's
documented format with counterparties. No service existed yet, so the switch changed only the extension build,
its tests and planning documents.

**Consequences.** Supersedes `nw-cdm-stay-on-python` and `nw-cdm-python-workarounds`. Development hosts need a JDK
21; Maven comes through the wrapper `cdm-ext/mvnw`. The Rune keeps the forms chosen for the Python generator; they
work in Java. Unverified: CDM functions outside the margin call lifecycle (valuation, G7–G10) in Java; Javalin
service structure (to be set when the first service is built).
