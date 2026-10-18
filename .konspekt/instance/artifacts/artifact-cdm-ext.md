```yaml
id: artifact-cdm-ext
name: Local CDM extension (cdmx)
kind: code
location: cdm-ext/
review: accepted
provenance:
  conversationId: cdm-development
  sourceRef: 9ab0cbf86284cce4606e93eabb8507c9d009d7b7
  contentHash: 9ab0cbf86284cce4606e93eabb8507c9d009d7b7
  timestamp: 2026-10-17T01:16:19Z
  confidence: 0.8
createdAt: 2026-10-17T01:16:19Z
updatedAt: 2026-10-18T01:27:28Z
```
# Local CDM extension (cdmx)

Rune sources for gap G2 (collateral proposal and its acceptance or rejection: types, conditions, two functions),
tests of the generated Python, and `build.sh` (generator 10.15.1.0, CDM 7.7.0, rune-fpml 3.8.0). Generation check:
the toolchain reproduces the published finos-cdm 7.7.0; the extension generated with CDM works when only its
`finos/cdmx` modules are added to the published package (6 of 6 tests pass; same in a combined build). Findings:
nested `set` on an absent object does not create it in generated Python (use a constructor); extension
serialises with `@version` 0.0.0; CDM Python package defects D14 worked around in the tests.

Revised 2026-10-17T13:40:02Z (source `0f2f88c5496b77b3cef85e94a5ec0236fa765099`): margin call lifecycle `cdmx.collateral.margincall` (G1, G3, G4, G6; 12 more tests,
18 in all); CI workflow `.github/workflows/cdm-ext.yml`; generator behaviour recorded as D15.

Revised 2026-10-18T01:27:28Z (source `6634e3f08a3a21e5cc0574f7ca2bfaf3cdd61630`): the extension is built with Maven in `cdm-ext/` (CDM's `rune-maven-plugin` against `cdm-java` 7.7.0, JUnit tests, wrapper `mvnw`); the Python build, its tests and `build.sh` are retired (kept at commit e1a2e6f), decision `wp-adr-java-cdm-stack`.
