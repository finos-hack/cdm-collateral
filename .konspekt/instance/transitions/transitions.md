# Transitions

Append-only log of every `review` and `status` assignment in this instance, for
entities and edges, one row per assignment in the order written
(`spec/architecture/SERIALIZATION.md` § Transitions). `ref` is `type:id` or
`edge:<id>`. An empty `from` marks a birth row. `source`, when present, is the
`sources/` excerpt holding the human acceptance or authority verb. `by`, when
present, is the principal that wrote the value; it is required on a row that
writes `accepted` once the instance declares principals
(`spec/architecture/AUTHORITY.md`).

A new instance starts with no rows: it has no atoms yet, so the first write of
each atom appends that atom's birth row. The file's presence opts the instance
into state history — an instance without it is v1-conformant and records none.

| ref | field | from | to | timestamp | source | by |
|-----|-------|------|----|-----------|--------|----|
| node:node-app-setup | review |  | accepted | 2026-10-15T00:18:11Z | ni:///sha-256;iGM77_gCwbAiHXoq7F82NfWGTvYHgcYwSyx3YY5Fu10 | denisurusov |
| node:node-app-setup | status |  | active | 2026-10-15T00:18:11Z |  |  |
| node:goal-test-konspekt-adoption | review |  | accepted | 2026-10-15T02:15:25Z | ni:///sha-256;cjKI0Aq_d0b5KnkKztWgZgYHR29Xm-u2zziAJ9rsTbI | denisurusov |
| node:goal-test-konspekt-adoption | status |  | active | 2026-10-15T02:15:25Z | ni:///sha-256;cjKI0Aq_d0b5KnkKztWgZgYHR29Xm-u2zziAJ9rsTbI | denisurusov |
| node:task-repo-setup-iteration | review |  | accepted | 2026-10-15T02:15:25Z | ni:///sha-256;cjKI0Aq_d0b5KnkKztWgZgYHR29Xm-u2zziAJ9rsTbI | denisurusov |
| node:task-repo-setup-iteration | status |  | active | 2026-10-15T02:15:25Z | ni:///sha-256;cjKI0Aq_d0b5KnkKztWgZgYHR29Xm-u2zziAJ9rsTbI | denisurusov |
| edge:e-dec-adoption-setupiter | review |  | accepted | 2026-10-15T02:15:25Z | ni:///sha-256;cjKI0Aq_d0b5KnkKztWgZgYHR29Xm-u2zziAJ9rsTbI | denisurusov |
| node:goal-architecture-design | review |  | accepted | 2026-10-15T02:46:38Z | ni:///sha-256;LJXIKhMJnvegqasJA4T0N92nP-sMwWGJGYOHeeejZ4E | denisurusov |
| node:goal-architecture-design | status |  | open | 2026-10-15T02:46:38Z | ni:///sha-256;LJXIKhMJnvegqasJA4T0N92nP-sMwWGJGYOHeeejZ4E | denisurusov |
| node:goal-business-case | review |  | accepted | 2026-10-15T02:46:38Z | ni:///sha-256;LJXIKhMJnvegqasJA4T0N92nP-sMwWGJGYOHeeejZ4E | denisurusov |
| node:goal-business-case | status |  | open | 2026-10-15T02:46:38Z | ni:///sha-256;LJXIKhMJnvegqasJA4T0N92nP-sMwWGJGYOHeeejZ4E | denisurusov |
| node:goal-end-to-end-flow | review |  | accepted | 2026-10-15T02:46:38Z | ni:///sha-256;LJXIKhMJnvegqasJA4T0N92nP-sMwWGJGYOHeeejZ4E | denisurusov |
| node:goal-end-to-end-flow | status |  | open | 2026-10-15T02:46:38Z | ni:///sha-256;LJXIKhMJnvegqasJA4T0N92nP-sMwWGJGYOHeeejZ4E | denisurusov |
| node:goal-data-cdm-taxonomies-specs | review |  | accepted | 2026-10-15T02:46:38Z | ni:///sha-256;LJXIKhMJnvegqasJA4T0N92nP-sMwWGJGYOHeeejZ4E | denisurusov |
| node:goal-data-cdm-taxonomies-specs | status |  | open | 2026-10-15T02:46:38Z | ni:///sha-256;LJXIKhMJnvegqasJA4T0N92nP-sMwWGJGYOHeeejZ4E | denisurusov |
| node:task-cdm-current-state-analysis | review |  | accepted | 2026-10-15T12:24:36Z | ni:///sha-256;IK4gaMTs7JwEwzhEwg5g332Y1rorxNwaBs4p4GFgRhw | denisurusov |
| node:task-cdm-current-state-analysis | status |  | open | 2026-10-15T12:24:36Z | ni:///sha-256;IK4gaMTs7JwEwzhEwg5g332Y1rorxNwaBs4p4GFgRhw | denisurusov |
| edge:e-dec-cdmdata-cdmanalysis | review |  | accepted | 2026-10-15T12:24:36Z | ni:///sha-256;IK4gaMTs7JwEwzhEwg5g332Y1rorxNwaBs4p4GFgRhw | denisurusov |
| node:task-cdm-collateral-other-agreements | review |  | accepted | 2026-10-15T12:32:58Z | ni:///sha-256;9n5_Y0RnLiMfSOKq5YEGrnniEqtG1_wfUPeYYxxBNKU | denisurusov |
| node:task-cdm-collateral-other-agreements | status |  | open | 2026-10-15T12:32:58Z | ni:///sha-256;9n5_Y0RnLiMfSOKq5YEGrnniEqtG1_wfUPeYYxxBNKU | denisurusov |
| edge:e-dec-cdmdata-otheragreements | review |  | accepted | 2026-10-15T12:32:58Z | ni:///sha-256;9n5_Y0RnLiMfSOKq5YEGrnniEqtG1_wfUPeYYxxBNKU | denisurusov |
| artifact:artifact-cdm-csa-coverage-matrix | review |  | proposed | 2026-10-15T12:32:58Z |  |  |
| edge:e-prod-cdmanalysis-csamatrix | review |  | proposed | 2026-10-15T12:32:58Z |  |  |
| artifact:artifact-cdm-csa-coverage-matrix | review | proposed | accepted | 2026-10-15T22:33:21Z | ni:///sha-256;7ud6DC8hV53tUYAGQv_JZBR9Q4xFC6vjpv3xJxV_6jc | denisurusov |
| edge:e-prod-cdmanalysis-csamatrix | review | proposed | accepted | 2026-10-15T22:33:21Z | ni:///sha-256;7ud6DC8hV53tUYAGQv_JZBR9Q4xFC6vjpv3xJxV_6jc | denisurusov |
| artifact:artifact-collateral-conceptual-model | review |  | proposed | 2026-10-15T22:52:16Z |  |  |
| edge:e-prod-cdmanalysis-conceptmodel | review |  | proposed | 2026-10-15T22:52:16Z |  |  |
| artifact:artifact-collateral-conceptual-model | review | proposed | accepted | 2026-10-15T22:55:58Z | ni:///sha-256;nTUfZr_NZLV6Y0aPoidEhi4KB2-xgnXmNNLE0NRNEuw | denisurusov |
| edge:e-prod-cdmanalysis-conceptmodel | review | proposed | accepted | 2026-10-15T22:55:58Z | ni:///sha-256;nTUfZr_NZLV6Y0aPoidEhi4KB2-xgnXmNNLE0NRNEuw | denisurusov |
| node:task-cdm-current-state-analysis | status | open | resolved | 2026-10-15T22:55:58Z | ni:///sha-256;nTUfZr_NZLV6Y0aPoidEhi4KB2-xgnXmNNLE0NRNEuw | denisurusov |
| node:task-cdm-collateral-other-agreements | status | open | active | 2026-10-15T22:58:45Z | ni:///sha-256;tWP7oIiQoaIEvQZjUpahAW4hDQ6_sIm504a6EJutHbQ | denisurusov |
| node:task-collateral-standards-inventory | review |  | accepted | 2026-10-15T22:58:45Z | ni:///sha-256;tWP7oIiQoaIEvQZjUpahAW4hDQ6_sIm504a6EJutHbQ | denisurusov |
| node:task-collateral-standards-inventory | status |  | active | 2026-10-15T22:58:45Z | ni:///sha-256;tWP7oIiQoaIEvQZjUpahAW4hDQ6_sIm504a6EJutHbQ | denisurusov |
| edge:e-dec-cdmdata-standards | review |  | accepted | 2026-10-15T22:58:45Z | ni:///sha-256;tWP7oIiQoaIEvQZjUpahAW4hDQ6_sIm504a6EJutHbQ | denisurusov |
| artifact:artifact-collateral-standards-inventory | review |  | proposed | 2026-10-15T23:01:30Z |  |  |
| edge:e-prod-standards-inventory | review |  | proposed | 2026-10-15T23:01:30Z |  |  |
| artifact:artifact-collateral-standards-inventory | review | proposed | accepted | 2026-10-15T23:04:45Z | ni:///sha-256;VsqOt2z5asfX7aUtxSyNG_DEyviWDGbzf7E5F_LpODs | denisurusov |
| edge:e-prod-standards-inventory | review | proposed | accepted | 2026-10-15T23:04:45Z | ni:///sha-256;VsqOt2z5asfX7aUtxSyNG_DEyviWDGbzf7E5F_LpODs | denisurusov |
| artifact:artifact-collateral-findings | review |  | proposed | 2026-10-15T23:04:45Z |  |  |
| edge:e-prod-cdmanalysis-findings | review |  | proposed | 2026-10-15T23:04:45Z |  |  |
| edge:e-prod-standards-findings | review |  | proposed | 2026-10-15T23:04:45Z |  |  |
| artifact:artifact-collateral-findings | review | proposed | accepted | 2026-10-15T23:07:41Z | ni:///sha-256;DMGZBm74Xs0mY9zNME89OltdTaH2Iyim8D6K2X09zf4 | denisurusov |
| edge:e-prod-cdmanalysis-findings | review | proposed | accepted | 2026-10-15T23:07:41Z | ni:///sha-256;DMGZBm74Xs0mY9zNME89OltdTaH2Iyim8D6K2X09zf4 | denisurusov |
| edge:e-prod-standards-findings | review | proposed | accepted | 2026-10-15T23:07:41Z | ni:///sha-256;DMGZBm74Xs0mY9zNME89OltdTaH2Iyim8D6K2X09zf4 | denisurusov |
| artifact:artifact-cdm-other-agreements-matrix | review |  | proposed | 2026-10-15T23:10:47Z |  |  |
| edge:e-prod-otheragreements-matrix | review |  | proposed | 2026-10-15T23:10:47Z |  |  |
| artifact:artifact-cdm-other-agreements-matrix | review | proposed | accepted | 2026-10-15T23:25:52Z | ni:///sha-256;yJN7r4_E2V0yGSNzReku2jtlb_EYwOR5KZB6CiW1lrA | denisurusov |
| edge:e-prod-otheragreements-matrix | review | proposed | accepted | 2026-10-15T23:25:52Z | ni:///sha-256;yJN7r4_E2V0yGSNzReku2jtlb_EYwOR5KZB6CiW1lrA | denisurusov |
| artifact:artifact-collateral-flow-diagrams | review |  | proposed | 2026-10-15T23:35:01Z |  |  |
| edge:e-prod-otheragreements-flows | review |  | proposed | 2026-10-15T23:35:01Z |  |  |
| artifact:artifact-collateral-flow-diagrams | review | proposed | accepted | 2026-10-15T23:38:18Z | ni:///sha-256;cxTTlfZhcrunANNpMuc-ry77UYMrmO3-WOk28CKvhHE | denisurusov |
| edge:e-prod-otheragreements-flows | review | proposed | accepted | 2026-10-15T23:38:18Z | ni:///sha-256;cxTTlfZhcrunANNpMuc-ry77UYMrmO3-WOk28CKvhHE | denisurusov |
| node:task-cdm-collateral-other-agreements | status | active | resolved | 2026-10-15T23:43:16Z | ni:///sha-256;hNTKjvn6fOKkhrG6oTshlDcYXjmjIwOQ147-XfdNu-4 | denisurusov |
| node:task-collateral-standards-inventory | status | active | resolved | 2026-10-15T23:43:16Z | ni:///sha-256;hNTKjvn6fOKkhrG6oTshlDcYXjmjIwOQ147-XfdNu-4 | denisurusov |
| node:task-collateral-taxonomy-inventory | review |  | accepted | 2026-10-15T23:45:47Z | ni:///sha-256;vBOckLSISZJvKIvy1HX69dAveNvpP31f4nxrLCX1zsY | denisurusov |
| node:task-collateral-taxonomy-inventory | status |  | active | 2026-10-15T23:45:47Z | ni:///sha-256;vBOckLSISZJvKIvy1HX69dAveNvpP31f4nxrLCX1zsY | denisurusov |
| edge:e-dec-cdmdata-taxonomy | review |  | accepted | 2026-10-15T23:45:47Z | ni:///sha-256;vBOckLSISZJvKIvy1HX69dAveNvpP31f4nxrLCX1zsY | denisurusov |
| artifact:artifact-collateral-taxonomy-inventory | review |  | proposed | 2026-10-15T23:48:20Z |  |  |
| edge:e-prod-taxonomy-inventory | review |  | proposed | 2026-10-15T23:48:20Z |  |  |
| edge:e-prod-taxonomy-findings | review |  | proposed | 2026-10-15T23:48:20Z |  |  |
| artifact:artifact-collateral-taxonomy-inventory | review | proposed | accepted | 2026-10-15T23:55:50Z | ni:///sha-256;xr-tzMxBAA0pmldc0WBwr3dKYiEJoLMMfrBw_OQOzwA | denisurusov |
| edge:e-prod-taxonomy-inventory | review | proposed | accepted | 2026-10-15T23:55:50Z | ni:///sha-256;xr-tzMxBAA0pmldc0WBwr3dKYiEJoLMMfrBw_OQOzwA | denisurusov |
| edge:e-prod-taxonomy-findings | review | proposed | accepted | 2026-10-15T23:55:50Z | ni:///sha-256;xr-tzMxBAA0pmldc0WBwr3dKYiEJoLMMfrBw_OQOzwA | denisurusov |
| artifact:artifact-cdm-defects | review |  | proposed | 2026-10-15T23:55:50Z |  |  |
| edge:e-prod-taxonomy-defects | review |  | proposed | 2026-10-15T23:55:50Z |  |  |
| artifact:artifact-collateral-asset-taxonomy-mapping | review |  | proposed | 2026-10-15T23:55:50Z |  |  |
| edge:e-prod-taxonomy-mapping | review |  | proposed | 2026-10-15T23:55:50Z |  |  |
| artifact:artifact-cdm-defects | review | proposed | accepted | 2026-10-16T00:27:52Z | ni:///sha-256;US9W6Gkft0EpkjvQ0JAnEwjkT4xdXwXhkEZ6BdYuJzw | denisurusov |
| edge:e-prod-taxonomy-defects | review | proposed | accepted | 2026-10-16T00:27:52Z | ni:///sha-256;US9W6Gkft0EpkjvQ0JAnEwjkT4xdXwXhkEZ6BdYuJzw | denisurusov |
| artifact:artifact-collateral-asset-taxonomy-mapping | review | proposed | accepted | 2026-10-16T00:27:52Z | ni:///sha-256;US9W6Gkft0EpkjvQ0JAnEwjkT4xdXwXhkEZ6BdYuJzw | denisurusov |
| edge:e-prod-taxonomy-mapping | review | proposed | accepted | 2026-10-16T00:27:52Z | ni:///sha-256;US9W6Gkft0EpkjvQ0JAnEwjkT4xdXwXhkEZ6BdYuJzw | denisurusov |
| node:task-collateral-taxonomy-inventory | status | active | resolved | 2026-10-16T00:27:52Z | ni:///sha-256;US9W6Gkft0EpkjvQ0JAnEwjkT4xdXwXhkEZ6BdYuJzw | denisurusov |
| node:goal-data-cdm-taxonomies-specs | status | open | resolved | 2026-10-16T00:35:35Z | ni:///sha-256;kNADr3kryboSLRopUb-ZVQyl2Ofwd4I52FEpE5VvTag | denisurusov |
| node:task-blockchain-smart-contracts-applicability | review |  | accepted | 2026-10-16T00:38:00Z | ni:///sha-256;gLcBxNNJbdG--M75QfFWmr9ILlFfqItnaNrMHzhSRMQ | denisurusov |
| node:task-blockchain-smart-contracts-applicability | status |  | open | 2026-10-16T00:38:00Z | ni:///sha-256;gLcBxNNJbdG--M75QfFWmr9ILlFfqItnaNrMHzhSRMQ | denisurusov |
| edge:e-dec-arch-blockchain | review |  | accepted | 2026-10-16T00:38:00Z | ni:///sha-256;gLcBxNNJbdG--M75QfFWmr9ILlFfqItnaNrMHzhSRMQ | denisurusov |
| node:task-local-environment-setup | review |  | accepted | 2026-10-16T00:38:00Z | ni:///sha-256;gLcBxNNJbdG--M75QfFWmr9ILlFfqItnaNrMHzhSRMQ | denisurusov |
| node:task-local-environment-setup | status |  | open | 2026-10-16T00:38:00Z | ni:///sha-256;gLcBxNNJbdG--M75QfFWmr9ILlFfqItnaNrMHzhSRMQ | denisurusov |
| edge:e-dec-arch-localenv | review |  | accepted | 2026-10-16T00:38:00Z | ni:///sha-256;gLcBxNNJbdG--M75QfFWmr9ILlFfqItnaNrMHzhSRMQ | denisurusov |
| node:task-blockchain-smart-contracts-applicability | status | open | active | 2026-10-16T02:47:21Z | ni:///sha-256;WP6JsG3_uZkYZHImTWLIxQm0syjWpr_pohTin1p4vow | denisurusov |
| concept:concept-asr-ledger-neutrality | review |  | proposed | 2026-10-16T02:55:34Z |  |  |
| edge:e-men-blockchain-ledger-neutrality | review |  | proposed | 2026-10-16T02:55:34Z |  |  |
| concept:concept-asr-cdm-data-layer | review |  | proposed | 2026-10-16T02:55:34Z |  |  |
| edge:e-men-blockchain-cdm-data-layer | review |  | proposed | 2026-10-16T02:55:34Z |  |  |
| concept:concept-asr-onchain-asset-identity | review |  | proposed | 2026-10-16T02:55:34Z |  |  |
| edge:e-men-blockchain-onchain-asset-identity | review |  | proposed | 2026-10-16T02:55:34Z |  |  |
| concept:concept-asr-settlement-finality | review |  | proposed | 2026-10-16T02:55:34Z |  |  |
| edge:e-men-blockchain-settlement-finality | review |  | proposed | 2026-10-16T02:55:34Z |  |  |
| concept:concept-asr-offchain-dispute | review |  | proposed | 2026-10-16T02:55:34Z |  |  |
| edge:e-men-blockchain-offchain-dispute | review |  | proposed | 2026-10-16T02:55:34Z |  |  |
| artifact:artifact-blockchain-applicability | review |  | proposed | 2026-10-16T02:55:34Z |  |  |
| edge:e-prod-blockchain-applicability | review |  | proposed | 2026-10-16T02:55:34Z |  |  |
| waypoint:wp-adr-prototype-ledgers | review |  | accepted | 2026-10-16T19:30:54Z | ni:///sha-256;W_6Ev0j1zn7b0l8-TydnvRDwVNHRRr6IWwyfjnmfRv4 | denisurusov |
| edge:e-drv-ledgerneutrality-ledgers | review |  | proposed | 2026-10-16T19:30:54Z |  |  |
| edge:e-drv-finality-ledgers | review |  | proposed | 2026-10-16T19:30:54Z |  |  |
| edge:e-mrk-ledgers-blockchain | review |  | accepted | 2026-10-16T19:30:54Z | ni:///sha-256;W_6Ev0j1zn7b0l8-TydnvRDwVNHRRr6IWwyfjnmfRv4 | denisurusov |
| concept:concept-asr-ledger-neutrality | review | proposed | accepted | 2026-10-16T19:43:54Z | ni:///sha-256;WtQXsb4VQVijQxZC4s-onjyB01gXNy7poWhQUJWJfTo | denisurusov |
| concept:concept-asr-offchain-dispute | review | proposed | accepted | 2026-10-16T19:43:54Z | ni:///sha-256;WtQXsb4VQVijQxZC4s-onjyB01gXNy7poWhQUJWJfTo | denisurusov |
| concept:concept-asr-cdm-data-layer | review | proposed | accepted | 2026-10-16T19:43:54Z | ni:///sha-256;WtQXsb4VQVijQxZC4s-onjyB01gXNy7poWhQUJWJfTo | denisurusov |
| concept:concept-asr-onchain-asset-identity | review | proposed | accepted | 2026-10-16T19:43:54Z | ni:///sha-256;WtQXsb4VQVijQxZC4s-onjyB01gXNy7poWhQUJWJfTo | denisurusov |
| concept:concept-asr-settlement-finality | review | proposed | accepted | 2026-10-16T19:43:54Z | ni:///sha-256;WtQXsb4VQVijQxZC4s-onjyB01gXNy7poWhQUJWJfTo | denisurusov |
| edge:e-men-blockchain-ledger-neutrality | review | proposed | accepted | 2026-10-16T19:43:54Z | ni:///sha-256;WtQXsb4VQVijQxZC4s-onjyB01gXNy7poWhQUJWJfTo | denisurusov |
| edge:e-men-blockchain-cdm-data-layer | review | proposed | accepted | 2026-10-16T19:43:54Z | ni:///sha-256;WtQXsb4VQVijQxZC4s-onjyB01gXNy7poWhQUJWJfTo | denisurusov |
| edge:e-men-blockchain-onchain-asset-identity | review | proposed | accepted | 2026-10-16T19:43:54Z | ni:///sha-256;WtQXsb4VQVijQxZC4s-onjyB01gXNy7poWhQUJWJfTo | denisurusov |
| edge:e-men-blockchain-settlement-finality | review | proposed | accepted | 2026-10-16T19:43:54Z | ni:///sha-256;WtQXsb4VQVijQxZC4s-onjyB01gXNy7poWhQUJWJfTo | denisurusov |
| edge:e-men-blockchain-offchain-dispute | review | proposed | accepted | 2026-10-16T19:43:54Z | ni:///sha-256;WtQXsb4VQVijQxZC4s-onjyB01gXNy7poWhQUJWJfTo | denisurusov |
| edge:e-drv-ledgerneutrality-ledgers | review | proposed | accepted | 2026-10-16T19:43:54Z | ni:///sha-256;WtQXsb4VQVijQxZC4s-onjyB01gXNy7poWhQUJWJfTo | denisurusov |
| edge:e-drv-finality-ledgers | review | proposed | accepted | 2026-10-16T19:43:54Z | ni:///sha-256;WtQXsb4VQVijQxZC4s-onjyB01gXNy7poWhQUJWJfTo | denisurusov |
| noteworthy:nw-prototype-scope | review |  | accepted | 2026-10-16T19:43:54Z | ni:///sha-256;WtQXsb4VQVijQxZC4s-onjyB01gXNy7poWhQUJWJfTo | denisurusov |
| noteworthy:nw-prototype-scope | status |  | active | 2026-10-16T19:43:54Z | ni:///sha-256;WtQXsb4VQVijQxZC4s-onjyB01gXNy7poWhQUJWJfTo | denisurusov |
| edge:e-note-arch-prototypescope | review |  | accepted | 2026-10-16T19:43:54Z | ni:///sha-256;WtQXsb4VQVijQxZC4s-onjyB01gXNy7poWhQUJWJfTo | denisurusov |
| artifact:artifact-blockchain-applicability | review | proposed | accepted | 2026-10-16T19:47:11Z | ni:///sha-256;uOZDmWtWUMMSB0imhy3J2ell7oTD_4nPzEeiu1y4yC4 | denisurusov |
| edge:e-prod-blockchain-applicability | review | proposed | accepted | 2026-10-16T19:47:11Z | ni:///sha-256;uOZDmWtWUMMSB0imhy3J2ell7oTD_4nPzEeiu1y4yC4 | denisurusov |
| waypoint:wp-adr-im-segregation | review |  | accepted | 2026-10-16T19:49:05Z | ni:///sha-256;t9f5p5BDJ8edCrAksunxZU5uH2d0S4nMMRSMp8v97z8 | denisurusov |
| edge:e-mrk-imseg-blockchain | review |  | accepted | 2026-10-16T19:49:05Z | ni:///sha-256;t9f5p5BDJ8edCrAksunxZU5uH2d0S4nMMRSMp8v97z8 | denisurusov |
| noteworthy:nw-assumption-contract-control | review |  | accepted | 2026-10-16T19:49:05Z | ni:///sha-256;t9f5p5BDJ8edCrAksunxZU5uH2d0S4nMMRSMp8v97z8 | denisurusov |
| noteworthy:nw-assumption-contract-control | status |  | unvalidated | 2026-10-16T19:49:05Z | ni:///sha-256;t9f5p5BDJ8edCrAksunxZU5uH2d0S4nMMRSMp8v97z8 | denisurusov |
| edge:e-note-arch-contractcontrol | review |  | accepted | 2026-10-16T19:49:05Z | ni:///sha-256;t9f5p5BDJ8edCrAksunxZU5uH2d0S4nMMRSMp8v97z8 | denisurusov |
| node:task-blockchain-smart-contracts-applicability | status | active | resolved | 2026-10-16T19:49:05Z | ni:///sha-256;t9f5p5BDJ8edCrAksunxZU5uH2d0S4nMMRSMp8v97z8 | denisurusov |
| node:task-local-environment-setup | status | open | active | 2026-10-16T20:08:49Z | ni:///sha-256;NhbLlV5fc2u1gteGpkfyjtrp1fQ-vBN1J9uK0yT_OBY | denisurusov |
| artifact:artifact-prototype-architecture | review |  | proposed | 2026-10-16T20:08:49Z |  |  |
| edge:e-prod-localenv-architecture | review |  | proposed | 2026-10-16T20:08:49Z |  |  |
| artifact:artifact-test-framework-plan | review |  | proposed | 2026-10-16T20:21:13Z |  |  |
| edge:e-prod-localenv-testplan | review |  | proposed | 2026-10-16T20:21:13Z |  |  |
| artifact:artifact-setup-windows | review |  | proposed | 2026-10-16T20:21:13Z |  |  |
| edge:e-prod-localenv-setup | review |  | proposed | 2026-10-16T20:21:13Z |  |  |
| artifact:artifact-prototype-architecture | review | proposed | accepted | 2026-10-16T20:43:52Z | ni:///sha-256;ApOnayVBl4dYxAoHxIsGVC-bkB5lPnFbKvjU-Zw91So | denisurusov |
| edge:e-prod-localenv-architecture | review | proposed | accepted | 2026-10-16T20:43:52Z | ni:///sha-256;ApOnayVBl4dYxAoHxIsGVC-bkB5lPnFbKvjU-Zw91So | denisurusov |
| artifact:artifact-test-framework-plan | review | proposed | accepted | 2026-10-16T20:43:52Z | ni:///sha-256;ApOnayVBl4dYxAoHxIsGVC-bkB5lPnFbKvjU-Zw91So | denisurusov |
| edge:e-prod-localenv-testplan | review | proposed | accepted | 2026-10-16T20:43:52Z | ni:///sha-256;ApOnayVBl4dYxAoHxIsGVC-bkB5lPnFbKvjU-Zw91So | denisurusov |
| artifact:artifact-setup-windows | review | proposed | accepted | 2026-10-16T20:43:52Z | ni:///sha-256;ApOnayVBl4dYxAoHxIsGVC-bkB5lPnFbKvjU-Zw91So | denisurusov |
| edge:e-prod-localenv-setup | review | proposed | accepted | 2026-10-16T20:43:52Z | ni:///sha-256;ApOnayVBl4dYxAoHxIsGVC-bkB5lPnFbKvjU-Zw91So | denisurusov |
| waypoint:wp-adr-per-participant-services | review |  | accepted | 2026-10-16T20:43:52Z | ni:///sha-256;ApOnayVBl4dYxAoHxIsGVC-bkB5lPnFbKvjU-Zw91So | denisurusov |
| edge:e-mrk-perparticipant-localenv | review |  | accepted | 2026-10-16T20:43:52Z | ni:///sha-256;ApOnayVBl4dYxAoHxIsGVC-bkB5lPnFbKvjU-Zw91So | denisurusov |
| concept:concept-asr-onchain-call-state | review |  | accepted | 2026-10-16T21:34:51Z | ni:///sha-256;vBHcKiKCvGIBEzCq8N0ACqYrcr58Ejd-DWldPn8z-Bc | denisurusov |
| waypoint:wp-adr-margin-call-state-onchain | review |  | accepted | 2026-10-16T21:34:51Z | ni:///sha-256;vBHcKiKCvGIBEzCq8N0ACqYrcr58Ejd-DWldPn8z-Bc | denisurusov |
| noteworthy:nw-assumption-besu-visibility | review |  | accepted | 2026-10-16T21:34:51Z | ni:///sha-256;vBHcKiKCvGIBEzCq8N0ACqYrcr58Ejd-DWldPn8z-Bc | denisurusov |
| node:task-onchain-privacy | review |  | accepted | 2026-10-16T21:34:51Z | ni:///sha-256;vBHcKiKCvGIBEzCq8N0ACqYrcr58Ejd-DWldPn8z-Bc | denisurusov |
| edge:e-sup-callstate-offchaindispute | review |  | accepted | 2026-10-16T21:34:51Z | ni:///sha-256;vBHcKiKCvGIBEzCq8N0ACqYrcr58Ejd-DWldPn8z-Bc | denisurusov |
| edge:e-drv-callstate-callcontract | review |  | accepted | 2026-10-16T21:34:51Z | ni:///sha-256;vBHcKiKCvGIBEzCq8N0ACqYrcr58Ejd-DWldPn8z-Bc | denisurusov |
| edge:e-mrk-callcontract-localenv | review |  | accepted | 2026-10-16T21:34:51Z | ni:///sha-256;vBHcKiKCvGIBEzCq8N0ACqYrcr58Ejd-DWldPn8z-Bc | denisurusov |
| edge:e-note-arch-besuvisibility | review |  | accepted | 2026-10-16T21:34:51Z | ni:///sha-256;vBHcKiKCvGIBEzCq8N0ACqYrcr58Ejd-DWldPn8z-Bc | denisurusov |
| edge:e-dec-arch-privacy | review |  | accepted | 2026-10-16T21:34:51Z | ni:///sha-256;vBHcKiKCvGIBEzCq8N0ACqYrcr58Ejd-DWldPn8z-Bc | denisurusov |
| edge:e-note-privacy-besuvisibility | review |  | accepted | 2026-10-16T21:34:51Z | ni:///sha-256;vBHcKiKCvGIBEzCq8N0ACqYrcr58Ejd-DWldPn8z-Bc | denisurusov |
| noteworthy:nw-assumption-besu-visibility | status |  | unvalidated | 2026-10-16T21:34:51Z | ni:///sha-256;vBHcKiKCvGIBEzCq8N0ACqYrcr58Ejd-DWldPn8z-Bc | denisurusov |
| node:task-onchain-privacy | status |  | open | 2026-10-16T21:34:51Z | ni:///sha-256;vBHcKiKCvGIBEzCq8N0ACqYrcr58Ejd-DWldPn8z-Bc | denisurusov |
| noteworthy:nw-mimic-real-flows | review |  | accepted | 2026-10-16T22:15:03Z | ni:///sha-256;fe2l8Jg-JfDV_qiXtoFHRgFJ5m2dgrWSHZFVQ3UxrLI | denisurusov |
| node:task-two-way-initial-margin | review |  | accepted | 2026-10-16T22:15:03Z | ni:///sha-256;fe2l8Jg-JfDV_qiXtoFHRgFJ5m2dgrWSHZFVQ3UxrLI | denisurusov |
| edge:e-note-arch-mimicrealflows | review |  | accepted | 2026-10-16T22:15:03Z | ni:///sha-256;fe2l8Jg-JfDV_qiXtoFHRgFJ5m2dgrWSHZFVQ3UxrLI | denisurusov |
| edge:e-dec-arch-twowayim | review |  | accepted | 2026-10-16T22:15:03Z | ni:///sha-256;fe2l8Jg-JfDV_qiXtoFHRgFJ5m2dgrWSHZFVQ3UxrLI | denisurusov |
| noteworthy:nw-mimic-real-flows | status |  | active | 2026-10-16T22:15:03Z | ni:///sha-256;fe2l8Jg-JfDV_qiXtoFHRgFJ5m2dgrWSHZFVQ3UxrLI | denisurusov |
| node:task-two-way-initial-margin | status |  | open | 2026-10-16T22:15:03Z | ni:///sha-256;fe2l8Jg-JfDV_qiXtoFHRgFJ5m2dgrWSHZFVQ3UxrLI | denisurusov |
| waypoint:wp-adr-cloud-dev-environment | review |  | accepted | 2026-10-16T22:20:33Z | ni:///sha-256;8Jx7J_a279LKNQEQrz3bE8rHZAx04LFMDhKmmkKuzu4 | denisurusov |
| node:task-windows-install | review |  | accepted | 2026-10-16T22:20:33Z | ni:///sha-256;8Jx7J_a279LKNQEQrz3bE8rHZAx04LFMDhKmmkKuzu4 | denisurusov |
| edge:e-mrk-cloudenv-localenv | review |  | accepted | 2026-10-16T22:20:33Z | ni:///sha-256;8Jx7J_a279LKNQEQrz3bE8rHZAx04LFMDhKmmkKuzu4 | denisurusov |
| edge:e-dec-localenv-windows | review |  | accepted | 2026-10-16T22:20:33Z | ni:///sha-256;8Jx7J_a279LKNQEQrz3bE8rHZAx04LFMDhKmmkKuzu4 | denisurusov |
| node:task-windows-install | status |  | open | 2026-10-16T22:20:33Z | ni:///sha-256;8Jx7J_a279LKNQEQrz3bE8rHZAx04LFMDhKmmkKuzu4 | denisurusov |
| artifact:artifact-setup-codespaces | review |  | proposed | 2026-10-16T22:20:33Z |  |  |
| edge:e-prod-localenv-codespaces | review |  | proposed | 2026-10-16T22:20:33Z |  |  |
| artifact:artifact-setup-codespaces | review | proposed | accepted | 2026-10-16T22:43:35Z | ni:///sha-256;rx2zgXo-J_DPjuyXcZsItg3FAqN6Pljky_YbVHyOOdk | denisurusov |
| edge:e-prod-localenv-codespaces | review | proposed | accepted | 2026-10-16T22:43:35Z | ni:///sha-256;rx2zgXo-J_DPjuyXcZsItg3FAqN6Pljky_YbVHyOOdk | denisurusov |
| node:task-local-environment-setup | status | active | resolved | 2026-10-16T22:43:35Z | ni:///sha-256;rx2zgXo-J_DPjuyXcZsItg3FAqN6Pljky_YbVHyOOdk | denisurusov |
| node:task-clickable-ui | review |  | accepted | 2026-10-16T22:43:35Z | ni:///sha-256;rx2zgXo-J_DPjuyXcZsItg3FAqN6Pljky_YbVHyOOdk | denisurusov |
| node:task-clickable-ui | status |  | open | 2026-10-16T22:43:35Z | ni:///sha-256;rx2zgXo-J_DPjuyXcZsItg3FAqN6Pljky_YbVHyOOdk | denisurusov |
| edge:e-dec-e2e-clickableui | review |  | accepted | 2026-10-16T22:43:35Z | ni:///sha-256;rx2zgXo-J_DPjuyXcZsItg3FAqN6Pljky_YbVHyOOdk | denisurusov |
| waypoint:wp-adr-ux-scenario-grid | review |  | accepted | 2026-10-16T22:48:10Z | ni:///sha-256;Xnpw1EXZMVaaO1GEG1ZgA-BsIOYAxF3STyOFsoa9OhQ | denisurusov |
| edge:e-mrk-uxgrid-clickableui | review |  | accepted | 2026-10-16T22:48:10Z | ni:///sha-256;Xnpw1EXZMVaaO1GEG1ZgA-BsIOYAxF3STyOFsoa9OhQ | denisurusov |
| node:task-clickable-ui | status | open | active | 2026-10-16T22:48:10Z | ni:///sha-256;Xnpw1EXZMVaaO1GEG1ZgA-BsIOYAxF3STyOFsoa9OhQ | denisurusov |
| artifact:artifact-clickable-ui-html | review |  | proposed | 2026-10-16T22:52:27Z |  |  |
| edge:e-prod-clickableui-html | review |  | proposed | 2026-10-16T22:52:27Z |  |  |
| artifact:artifact-clickable-ui-html | review | proposed | accepted | 2026-10-16T23:07:09Z | ni:///sha-256;JiIT71CcaxnNUuNlwgA53P_U9JxGEG_ugoFDaPAZPzM | denisurusov |
| edge:e-prod-clickableui-html | review | proposed | accepted | 2026-10-16T23:07:09Z | ni:///sha-256;JiIT71CcaxnNUuNlwgA53P_U9JxGEG_ugoFDaPAZPzM | denisurusov |
| node:task-clickable-ui | status | active | resolved | 2026-10-16T23:07:09Z | ni:///sha-256;JiIT71CcaxnNUuNlwgA53P_U9JxGEG_ugoFDaPAZPzM | denisurusov |
| node:task-react-console | review |  | accepted | 2026-10-16T23:07:09Z | ni:///sha-256;JiIT71CcaxnNUuNlwgA53P_U9JxGEG_ugoFDaPAZPzM | denisurusov |
| node:task-react-console | status |  | active | 2026-10-16T23:07:09Z | ni:///sha-256;JiIT71CcaxnNUuNlwgA53P_U9JxGEG_ugoFDaPAZPzM | denisurusov |
| edge:e-dec-e2e-reactconsole | review |  | accepted | 2026-10-16T23:07:09Z | ni:///sha-256;JiIT71CcaxnNUuNlwgA53P_U9JxGEG_ugoFDaPAZPzM | denisurusov |
| artifact:artifact-react-console | review |  | proposed | 2026-10-16T23:17:11Z |  |  |
| edge:e-prod-reactconsole-app | review |  | proposed | 2026-10-16T23:17:11Z |  |  |
| node:task-react-console | status | active | open | 2026-10-17T00:22:35Z | ni:///sha-256;bSPfwI8IRqJV_3J_A4R_wl0sIASqYpCcUtz-i8PE44A | denisurusov |
| node:goal-cdm-development | review |  | accepted | 2026-10-17T00:22:35Z | ni:///sha-256;bSPfwI8IRqJV_3J_A4R_wl0sIASqYpCcUtz-i8PE44A | denisurusov |
| node:goal-cdm-development | status |  | active | 2026-10-17T00:22:35Z | ni:///sha-256;bSPfwI8IRqJV_3J_A4R_wl0sIASqYpCcUtz-i8PE44A | denisurusov |
| node:task-cdm-gap-analysis | review |  | accepted | 2026-10-17T00:22:35Z | ni:///sha-256;bSPfwI8IRqJV_3J_A4R_wl0sIASqYpCcUtz-i8PE44A | denisurusov |
| node:task-cdm-gap-analysis | status |  | open | 2026-10-17T00:22:35Z | ni:///sha-256;bSPfwI8IRqJV_3J_A4R_wl0sIASqYpCcUtz-i8PE44A | denisurusov |
| node:task-cdm-gap-closure | review |  | accepted | 2026-10-17T00:22:35Z | ni:///sha-256;bSPfwI8IRqJV_3J_A4R_wl0sIASqYpCcUtz-i8PE44A | denisurusov |
| node:task-cdm-gap-closure | status |  | open | 2026-10-17T00:22:35Z | ni:///sha-256;bSPfwI8IRqJV_3J_A4R_wl0sIASqYpCcUtz-i8PE44A | denisurusov |
| edge:e-dec-cdmdev-gapanalysis | review |  | accepted | 2026-10-17T00:22:35Z | ni:///sha-256;bSPfwI8IRqJV_3J_A4R_wl0sIASqYpCcUtz-i8PE44A | denisurusov |
| edge:e-dec-cdmdev-gapclosure | review |  | accepted | 2026-10-17T00:22:35Z | ni:///sha-256;bSPfwI8IRqJV_3J_A4R_wl0sIASqYpCcUtz-i8PE44A | denisurusov |
| waypoint:wp-adr-cdm-local-extensions | review |  | accepted | 2026-10-17T00:25:47Z | ni:///sha-256;c2Gu8g49j8f9Y-kbYTWwJL0WUGQtLg2uYUjIMTkI4mU | denisurusov |
| edge:e-mrk-localext-gapclosure | review |  | accepted | 2026-10-17T00:25:47Z | ni:///sha-256;c2Gu8g49j8f9Y-kbYTWwJL0WUGQtLg2uYUjIMTkI4mU | denisurusov |
| node:task-cdm-gap-analysis | status | open | active | 2026-10-17T00:25:47Z | ni:///sha-256;c2Gu8g49j8f9Y-kbYTWwJL0WUGQtLg2uYUjIMTkI4mU | denisurusov |
| artifact:artifact-cdm-gap-register | review |  | proposed | 2026-10-17T00:25:47Z |  |  |
| edge:e-prod-gapanalysis-register | review |  | proposed | 2026-10-17T00:25:47Z |  |  |
| artifact:artifact-cdm-gap-register | review | proposed | accepted | 2026-10-17T00:29:31Z | ni:///sha-256;5kj8C3RZym5Y33uTgcdSquU4WFVRcfF2petr9KGx51U | denisurusov |
| edge:e-prod-gapanalysis-register | review | proposed | accepted | 2026-10-17T00:29:31Z | ni:///sha-256;5kj8C3RZym5Y33uTgcdSquU4WFVRcfF2petr9KGx51U | denisurusov |
| node:task-cdm-gap-analysis | status | active | resolved | 2026-10-17T00:29:31Z | ni:///sha-256;5kj8C3RZym5Y33uTgcdSquU4WFVRcfF2petr9KGx51U | denisurusov |
| waypoint:wp-adr-cdm-extension-rune | review |  | accepted | 2026-10-17T00:48:29Z | ni:///sha-256;-T2xchAVDPCwaxZulVT_ISvaRx13XVeYc5tSZ71vdAk | denisurusov |
| waypoint:wp-adr-console-on-extension-rules | review |  | accepted | 2026-10-17T00:48:29Z | ni:///sha-256;-T2xchAVDPCwaxZulVT_ISvaRx13XVeYc5tSZ71vdAk | denisurusov |
| edge:e-mrk-extrune-gapclosure | review |  | accepted | 2026-10-17T00:48:29Z | ni:///sha-256;-T2xchAVDPCwaxZulVT_ISvaRx13XVeYc5tSZ71vdAk | denisurusov |
| edge:e-mrk-consolerules-gapclosure | review |  | accepted | 2026-10-17T00:48:29Z | ni:///sha-256;-T2xchAVDPCwaxZulVT_ISvaRx13XVeYc5tSZ71vdAk | denisurusov |
| node:task-cdm-gap-closure | status | open | active | 2026-10-17T00:48:29Z | ni:///sha-256;-T2xchAVDPCwaxZulVT_ISvaRx13XVeYc5tSZ71vdAk | denisurusov |
| noteworthy:nw-cdm-base-release-7-7-0 | review |  | accepted | 2026-10-17T01:16:19Z | ni:///sha-256;nf7BcFV4Q1Ziopu-BU0WXFAK508ZmwQk32KpcUcuzJQ | denisurusov |
| edge:e-note-cdmdev-baserelease | review |  | accepted | 2026-10-17T01:16:19Z | ni:///sha-256;nf7BcFV4Q1Ziopu-BU0WXFAK508ZmwQk32KpcUcuzJQ | denisurusov |
| artifact:artifact-cdm-ext | review |  | proposed | 2026-10-17T01:16:19Z |  |  |
| edge:e-prod-gapclosure-cdmext | review |  | proposed | 2026-10-17T01:16:19Z |  |  |
| artifact:artifact-cdm-ext | review | proposed | accepted | 2026-10-17T13:40:02Z | ni:///sha-256;IstbiN2JrzNS8pxp9CyD665c6eJ4aBiQ8c1uV8TokoU | denisurusov |
| edge:e-prod-gapclosure-cdmext | review | proposed | accepted | 2026-10-17T13:40:02Z | ni:///sha-256;IstbiN2JrzNS8pxp9CyD665c6eJ4aBiQ8c1uV8TokoU | denisurusov |
| noteworthy:nw-cdm-python-workarounds | review |  | accepted | 2026-10-17T13:40:02Z | ni:///sha-256;IstbiN2JrzNS8pxp9CyD665c6eJ4aBiQ8c1uV8TokoU | denisurusov |
| edge:e-note-cdmdev-pythonworkarounds | review |  | accepted | 2026-10-17T13:40:02Z | ni:///sha-256;IstbiN2JrzNS8pxp9CyD665c6eJ4aBiQ8c1uV8TokoU | denisurusov |
| waypoint:wp-adr-cdm-collateral-events | review |  | proposed | 2026-10-17T16:03:44Z |  |  |
| edge:e-mrk-collevents-gapclosure | review |  | proposed | 2026-10-17T16:03:44Z |  |  |
| noteworthy:nw-cdm-stay-on-python | review |  | accepted | 2026-10-17T16:59:27Z | ni:///sha-256;jT44joD6YDnnKJ7VgXv47ZC9AGcZhCHLbXHlAM00M24 | denisurusov |
| edge:e-note-cdmdev-stayonpython | review |  | accepted | 2026-10-17T16:59:27Z | ni:///sha-256;jT44joD6YDnnKJ7VgXv47ZC9AGcZhCHLbXHlAM00M24 | denisurusov |
| waypoint:wp-adr-cdm-collateral-events | review | proposed | accepted | 2026-10-17T17:00:55Z | ni:///sha-256;u5Qnuvu9SM7HQ5mfjc6gZ--BmeLl5-5Oikjki0q3Xm8 | denisurusov |
| edge:e-mrk-collevents-gapclosure | review | proposed | accepted | 2026-10-17T17:00:55Z | ni:///sha-256;u5Qnuvu9SM7HQ5mfjc6gZ--BmeLl5-5Oikjki0q3Xm8 | denisurusov |
| noteworthy:nw-repo-shared-with-cdm-maintainers | review |  | accepted | 2026-10-17T17:07:57Z | ni:///sha-256;rEWviG1MQtrLwSW7xJTSd1Za2xTwNfR5EM6zI6X-HHc | denisurusov |
| edge:e-note-cdmdev-sharedmaintainers | review |  | accepted | 2026-10-17T17:07:57Z | ni:///sha-256;rEWviG1MQtrLwSW7xJTSd1Za2xTwNfR5EM6zI6X-HHc | denisurusov |
| node:task-windows-install | status | open | resolved | 2026-10-17T18:32:09Z | ni:///sha-256;tlevq0KZ4xiAZEAwftLSiW283RHDNDfNRCS30ea0Qhc | denisurusov |
| node:task-e2e-wiring | review |  | proposed | 2026-10-17T20:56:54Z |  |  |
| node:task-e2e-wiring | status |  | open | 2026-10-17T20:56:54Z |  |  |
| edge:e-dec-e2e-wiring | review |  | proposed | 2026-10-17T20:56:54Z |  |  |
| waypoint:wp-adr-java-cdm-stack | review |  | accepted | 2026-10-18T01:27:28Z | ni:///sha-256;uTVpTsHhFM2-VfYVE0yYk9BbFLNr0MptY43fSW9jufU | denisurusov |
| edge:e-sup-javastack-stayonpython | review |  | accepted | 2026-10-18T01:27:28Z | ni:///sha-256;uTVpTsHhFM2-VfYVE0yYk9BbFLNr0MptY43fSW9jufU | denisurusov |
| edge:e-sup-javastack-pythonworkarounds | review |  | accepted | 2026-10-18T01:27:28Z | ni:///sha-256;uTVpTsHhFM2-VfYVE0yYk9BbFLNr0MptY43fSW9jufU | denisurusov |
| edge:e-mrk-javastack-gapclosure | review |  | accepted | 2026-10-18T01:27:28Z | ni:///sha-256;uTVpTsHhFM2-VfYVE0yYk9BbFLNr0MptY43fSW9jufU | denisurusov |
| edge:e-mrk-javastack-e2ewiring | review |  | proposed | 2026-10-18T15:05:37Z |  |  |
| node:task-repo-setup-iteration | status | active | resolved | 2026-10-19T03:55:28Z |  |
| node:task-e2e-wiring | review | proposed | accepted | 2026-10-19T03:55:54Z |  | denisurusov |
| edge:e-dec-e2e-wiring | review | proposed | accepted | 2026-10-19T03:55:54Z |  | denisurusov |
| edge:e-mrk-javastack-e2ewiring | review | proposed | accepted | 2026-10-19T03:55:54Z |  | denisurusov |
| node:task-adopt-agent-fleet | review |  | accepted | 2026-10-22T23:29:00Z | ni:///sha-256;MxlOJMhcBEVK94FyyYCSFzQwmpvqsRRi48q9IEaZNLg | denisurusov |
| node:task-adopt-agent-fleet | status |  | open | 2026-10-22T23:29:00Z | ni:///sha-256;MxlOJMhcBEVK94FyyYCSFzQwmpvqsRRi48q9IEaZNLg | denisurusov |
| edge:e-dec-adoption-fleet | review |  | accepted | 2026-10-22T23:29:00Z | ni:///sha-256;MxlOJMhcBEVK94FyyYCSFzQwmpvqsRRi48q9IEaZNLg | denisurusov |
| artifact:artifact-two-way-im-design | review |  | proposed | 2026-10-23T15:39:17.930Z |  | spec-writer |
| edge:e-prod-twowayim-design | review |  | proposed | 2026-10-23T15:39:17.930Z |  | spec-writer |
| artifact:artifact-two-way-im-design | review | proposed | accepted | 2026-10-23T15:52:41Z |  | denisurusov |
| edge:e-prod-twowayim-design | review | proposed | accepted | 2026-10-23T15:52:41Z |  | denisurusov |
| node:task-adopt-agent-fleet | status | open | resolved | 2026-10-23T16:11:35Z |  | denisurusov |
| artifact:artifact-onchain-privacy-design | review |  | proposed | 2026-10-23T16:22:32.687Z |  | spec-writer |
| edge:e-onchain-privacy-produces-design | review |  | proposed | 2026-10-23T16:22:32.687Z |  | spec-writer |
| artifact:artifact-onchain-privacy-design | review | proposed | accepted | 2026-10-23T16:25:21Z |  | denisurusov |
| edge:e-onchain-privacy-produces-design | review | proposed | accepted | 2026-10-23T16:25:21Z |  | denisurusov |
| node:task-e2e-wiring | status | open | active | 2026-10-23T21:54:35Z | ni:///sha-256;lF45oaZWxhekK7vBE-2LR7S1Sr3QMao7RNYRqikFpL8 | denisurusov |
| artifact:artifact-business-case | review |  | proposed | 2026-10-24T13:56:51.384Z |  | spec-writer |
| edge:e-business-case-produces-doc | review |  | proposed | 2026-10-24T13:56:51.384Z |  | spec-writer |
| artifact:artifact-business-case | review | proposed | accepted | 2026-10-24T14:11:28.731Z |  | denisurusov |
| edge:e-business-case-produces-doc | review | proposed | accepted | 2026-10-24T14:11:28.731Z |  | denisurusov |
| noteworthy:nw-finos-collaboration | review |  | proposed | 2026-10-24T14:28:19.786Z |  | spec-writer |
| edge:e-note-bizcase-finoscollab | review |  | proposed | 2026-10-24T14:28:19.786Z |  | spec-writer |
| noteworthy:nw-finos-collaboration | review | proposed | accepted | 2026-10-24T14:49:40.776Z |  | denisurusov |
| edge:e-note-bizcase-finoscollab | review | proposed | accepted | 2026-10-24T14:49:40.776Z |  | denisurusov |
| artifact:artifact-ledger-gateway | review |  | proposed | 2026-10-24T20:12:31Z |  | denisurusov |
| artifact:artifact-collateral-service | review |  | proposed | 2026-10-24T20:12:31Z |  | denisurusov |
| artifact:artifact-live-console-wiring | review |  | proposed | 2026-10-24T20:12:31Z |  | denisurusov |
| artifact:artifact-e2e-live-harness | review |  | proposed | 2026-10-24T20:12:31Z |  | denisurusov |
| waypoint:wp-first-e2e-cycle | review |  | proposed | 2026-10-24T20:12:31Z |  | denisurusov |
| noteworthy:nw-e2e-first-cycle-scope | review |  | proposed | 2026-10-24T20:12:31Z |  | denisurusov |
| edge:e-prod-e2ewiring-gateway | review |  | proposed | 2026-10-24T20:12:31Z |  | denisurusov |
| edge:e-prod-e2ewiring-service | review |  | proposed | 2026-10-24T20:12:31Z |  | denisurusov |
| edge:e-prod-e2ewiring-harness | review |  | proposed | 2026-10-24T20:12:31Z |  | denisurusov |
| edge:e-prod-reactconsole-livewiring | review |  | proposed | 2026-10-24T20:12:31Z |  | denisurusov |
| edge:e-mrk-firstcycle-e2ewiring | review |  | proposed | 2026-10-24T20:12:31Z |  | denisurusov |
| edge:e-note-e2ewiring-scope | review |  | proposed | 2026-10-24T20:12:31Z |  | denisurusov |
| artifact:artifact-ledger-gateway | review | proposed | accepted | 2026-10-24T21:10:54Z |  | denisurusov |
| artifact:artifact-collateral-service | review | proposed | accepted | 2026-10-24T21:10:54Z |  | denisurusov |
| artifact:artifact-live-console-wiring | review | proposed | accepted | 2026-10-24T21:10:54Z |  | denisurusov |
| artifact:artifact-e2e-live-harness | review | proposed | accepted | 2026-10-24T21:10:54Z |  | denisurusov |
| waypoint:wp-first-e2e-cycle | review | proposed | accepted | 2026-10-24T21:10:54Z |  | denisurusov |
| noteworthy:nw-e2e-first-cycle-scope | review | proposed | accepted | 2026-10-24T21:10:54Z |  | denisurusov |
| edge:e-prod-e2ewiring-gateway | review | proposed | accepted | 2026-10-24T21:10:54Z |  | denisurusov |
| edge:e-prod-e2ewiring-service | review | proposed | accepted | 2026-10-24T21:10:54Z |  | denisurusov |
| edge:e-prod-e2ewiring-harness | review | proposed | accepted | 2026-10-24T21:10:54Z |  | denisurusov |
| edge:e-prod-reactconsole-livewiring | review | proposed | accepted | 2026-10-24T21:10:54Z |  | denisurusov |
| edge:e-mrk-firstcycle-e2ewiring | review | proposed | accepted | 2026-10-24T21:10:54Z |  | denisurusov |
| edge:e-note-e2ewiring-scope | review | proposed | accepted | 2026-10-24T21:10:54Z |  | denisurusov |
| noteworthy:nw-e2e-first-cycle-scope | review | accepted | proposed | 2026-10-24T22:08:40Z |  | denisurusov |
| waypoint:wp-adr-cdm-payload-carrier | review |  | proposed | 2026-10-24T22:39:50Z |  | denisurusov |
| edge:e-drv-ledgerneutrality-carrier | review |  | proposed | 2026-10-24T22:39:50Z |  | denisurusov |
| edge:e-drv-cdmdatalayer-carrier | review |  | proposed | 2026-10-24T22:39:50Z |  | denisurusov |
| edge:e-mrk-carrier-e2ewiring | review |  | proposed | 2026-10-24T22:39:50Z |  | denisurusov |
| node:task-ci-live-e2e-stack | review |  | proposed | 2026-10-25T01:56:01Z |  | denisurusov |
| node:task-ci-live-e2e-stack | status |  | open | 2026-10-25T01:56:01Z |  |  |
| edge:e-dec-e2ewiring-cilivestack | review |  | proposed | 2026-10-25T01:56:01Z |  | denisurusov |
| node:task-ci-live-e2e-stack | review | proposed | accepted | 2026-10-25T13:05:29Z |  | denisurusov |
| edge:e-dec-e2ewiring-cilivestack | review | proposed | accepted | 2026-10-25T13:05:29Z |  | denisurusov |
| noteworthy:nw-ci-live-stack-steps | review |  | proposed | 2026-10-25T13:12:45Z |  | denisurusov |
| edge:e-note-cilivestack-steps | review |  | proposed | 2026-10-25T13:12:45Z |  | denisurusov |
| artifact:artifact-architecture-payload-carrier-revision | review |  | proposed | 2026-10-25T15:10:03.154Z |  | spec-writer |
| edge:e-architecture-payload-carrier-revision-produces | review |  | proposed | 2026-10-25T15:10:03.154Z |  | spec-writer |
| artifact:artifact-payload-carrier-component-docs | review |  | proposed | 2026-10-25T15:10:09.382Z |  | spec-writer |
| edge:e-payload-carrier-component-docs-produces | review |  | proposed | 2026-10-25T15:10:09.382Z |  | spec-writer |
| artifact:artifact-gap-register-g26-carrier | review |  | proposed | 2026-10-25T15:10:09.711Z |  | spec-writer |
| edge:e-gap-register-g26-carrier-produces | review |  | proposed | 2026-10-25T15:10:09.711Z |  | spec-writer |
| artifact:artifact-architecture-payload-carrier-revision | review | proposed | accepted | 2026-10-25T15:17:17.140Z |  | denisurusov |
| edge:e-architecture-payload-carrier-revision-produces | review | proposed | accepted | 2026-10-25T15:17:17.140Z |  | denisurusov |
| artifact:artifact-payload-carrier-component-docs | review | proposed | accepted | 2026-10-25T15:17:17.360Z |  | denisurusov |
| edge:e-payload-carrier-component-docs-produces | review | proposed | accepted | 2026-10-25T15:17:17.360Z |  | denisurusov |
| artifact:artifact-gap-register-g26-carrier | review | proposed | accepted | 2026-10-25T15:17:17.506Z |  | denisurusov |
| edge:e-gap-register-g26-carrier-produces | review | proposed | accepted | 2026-10-25T15:17:17.506Z |  | denisurusov |
| artifact:artifact-e2e-runbook | review |  | proposed | 2026-10-26T11:56:19Z |  | denisurusov |
| edge:e-prod-e2ewiring-runbook | review |  | proposed | 2026-10-26T11:56:19Z |  | denisurusov |
| node:task-devcontainer-live-stack | review |  | proposed | 2026-10-30T01:30:09Z |  |  |
| node:task-devcontainer-live-stack | status |  | open | 2026-10-30T01:30:09Z |  |  |
| edge:e-dec-e2ewiring-devcontainerstack | review |  | proposed | 2026-10-30T01:30:09Z |  |  |
| edge:e-lnk-cilivestack-devcontainerstack | review |  | proposed | 2026-10-30T01:30:09Z |  |  |
| waypoint:wp-adr-live-stack-local-ui-driven | review |  | proposed | 2026-10-30T02:12:11Z |  |  |
| edge:e-mrk-livestacklocal-cilivestack | review |  | proposed | 2026-10-30T02:12:11Z |  |  |
| edge:e-mrk-livestacklocal-devcontainerstack | review |  | proposed | 2026-10-30T02:12:11Z |  |  |
| noteworthy:nw-ci-live-e2e-stack-status | review |  | proposed | 2026-10-30T02:12:11Z |  |  |
| edge:e-note-cilivestack-status | review |  | proposed | 2026-10-30T02:12:11Z |  |  |
| waypoint:wp-adr-live-stack-local-ui-driven | review | proposed | accepted | 2026-10-30T02:19:00Z | ni:///sha-256;AQ08kSErOHRd7B2Zpiz56_koQ-jKd-OQ9fj89vYshwo | denisurusov |
| node:task-devcontainer-live-stack | review | proposed | accepted | 2026-10-30T02:19:00Z | ni:///sha-256;AQ08kSErOHRd7B2Zpiz56_koQ-jKd-OQ9fj89vYshwo | denisurusov |
| noteworthy:nw-ci-live-e2e-stack-status | review | proposed | accepted | 2026-10-30T02:19:00Z | ni:///sha-256;AQ08kSErOHRd7B2Zpiz56_koQ-jKd-OQ9fj89vYshwo | denisurusov |
| edge:e-dec-e2ewiring-devcontainerstack | review | proposed | accepted | 2026-10-30T02:19:00Z | ni:///sha-256;AQ08kSErOHRd7B2Zpiz56_koQ-jKd-OQ9fj89vYshwo | denisurusov |
| edge:e-lnk-cilivestack-devcontainerstack | review | proposed | accepted | 2026-10-30T02:19:00Z | ni:///sha-256;AQ08kSErOHRd7B2Zpiz56_koQ-jKd-OQ9fj89vYshwo | denisurusov |
| edge:e-mrk-livestacklocal-cilivestack | review | proposed | accepted | 2026-10-30T02:19:00Z | ni:///sha-256;AQ08kSErOHRd7B2Zpiz56_koQ-jKd-OQ9fj89vYshwo | denisurusov |
| edge:e-mrk-livestacklocal-devcontainerstack | review | proposed | accepted | 2026-10-30T02:19:00Z | ni:///sha-256;AQ08kSErOHRd7B2Zpiz56_koQ-jKd-OQ9fj89vYshwo | denisurusov |
| edge:e-note-cilivestack-status | review | proposed | accepted | 2026-10-30T02:19:00Z | ni:///sha-256;AQ08kSErOHRd7B2Zpiz56_koQ-jKd-OQ9fj89vYshwo | denisurusov |
| node:task-ci-live-e2e-stack | status | open | resolved | 2026-10-30T02:19:00Z | ni:///sha-256;AQ08kSErOHRd7B2Zpiz56_koQ-jKd-OQ9fj89vYshwo | denisurusov |
| noteworthy:nw-ci-live-stack-first-run | review |  | proposed | 2026-10-31T23:50:39Z |  |  |
| edge:e-note-cilivestack-first-run | review |  | proposed | 2026-10-31T23:50:39Z |  |  |
| noteworthy:nw-ci-live-stack-first-run | review | proposed | accepted | 2026-11-01T00:10:00Z | ni:///sha-256;KhiFFxYPVKw1m8LGQBM_5p4F8b_gIFTspxerGn7NKzQ | denisurusov |
| edge:e-note-cilivestack-first-run | review | proposed | accepted | 2026-11-01T00:10:00Z | ni:///sha-256;KhiFFxYPVKw1m8LGQBM_5p4F8b_gIFTspxerGn7NKzQ | denisurusov |
| noteworthy:nw-ci-live-stack-steps | review | proposed | rejected | 2026-11-01T00:10:00Z | ni:///sha-256;KhiFFxYPVKw1m8LGQBM_5p4F8b_gIFTspxerGn7NKzQ | denisurusov |
| edge:e-note-cilivestack-steps | review | proposed | rejected | 2026-11-01T00:10:00Z | ni:///sha-256;KhiFFxYPVKw1m8LGQBM_5p4F8b_gIFTspxerGn7NKzQ | denisurusov |
| edge:e-sup-livestacklocal-cilivestacksteps | review |  | accepted | 2026-11-01T00:10:00Z | ni:///sha-256;KhiFFxYPVKw1m8LGQBM_5p4F8b_gIFTspxerGn7NKzQ | denisurusov |
| node:task-devcontainer-live-stack | status | open | resolved | 2026-11-01T00:40:00Z | ni:///sha-256;8l41fecWgOFo8xb3ZzgUhevYyqWqyjbnR08svhYu2_8 | denisurusov |
| node:task-devcontainer-stack-startup | review |  | proposed | 2026-11-01T01:00:00Z |  |  |
| node:task-devcontainer-stack-startup | status |  | open | 2026-11-01T01:00:00Z |  |  |
| node:task-codespaces-live-stack | review |  | proposed | 2026-11-01T01:00:00Z |  |  |
| node:task-codespaces-live-stack | status |  | open | 2026-11-01T01:00:00Z |  |  |
| edge:e-dec-e2ewiring-devcontainerstartup | review |  | proposed | 2026-11-01T01:00:00Z |  |  |
| edge:e-lnk-devcontainerstack-devcontainerstartup | review |  | proposed | 2026-11-01T01:00:00Z |  |  |
| edge:e-dec-e2ewiring-codespacesstack | review |  | proposed | 2026-11-01T01:00:00Z |  |  |
| edge:e-lnk-devcontainerstartup-codespacesstack | review |  | proposed | 2026-11-01T01:00:00Z |  |  |
| node:task-e2e-remaining-flows | review |  | proposed | 2026-11-01T15:57:23Z |  |  |
| node:task-e2e-remaining-flows | status |  | open | 2026-11-01T15:57:23Z |  |  |
| node:task-revaluation-top-up-modelling | review |  | proposed | 2026-11-01T15:57:23Z |  |  |
| node:task-revaluation-top-up-modelling | status |  | open | 2026-11-01T15:57:23Z |  |  |
| edge:e-dec-e2ewiring-remainingflows | review |  | proposed | 2026-11-01T15:57:23Z |  |  |
| edge:e-dec-bizcase-topupmodelling | review |  | proposed | 2026-11-01T15:57:23Z |  |  |
| edge:e-lnk-remainingflows-topupmodelling | review |  | proposed | 2026-11-01T15:57:23Z |  |  |
| node:task-live-flow-checkout-script | review |  | proposed | 2026-11-01T16:22:08Z |  |  |
| node:task-live-flow-checkout-script | status |  | open | 2026-11-01T16:22:08Z |  |  |
| edge:e-dec-e2ewiring-livecheckout | review |  | proposed | 2026-11-01T16:22:08Z |  |  |
| edge:e-lnk-remainingflows-livecheckout | review |  | proposed | 2026-11-01T16:22:08Z |  |  |
| edge:e-lnk-cilivestack-livecheckout | review |  | proposed | 2026-11-01T16:22:08Z |  |  |
| node:task-devcontainer-stack-startup | status | open | resolved | 2026-11-01T21:07:28Z | ni:///sha-256;DcJKMSenaFlobjVBzwckfO2R7aWUWi0gljZjJfyS5CE | denisurusov |
| node:task-live-flow-checkout-script | review | proposed | accepted | 2026-11-01T21:58:21Z |  | denisurusov |
| edge:e-dec-e2ewiring-livecheckout | review | proposed | accepted | 2026-11-01T21:58:21Z |  | denisurusov |
| edge:e-lnk-cilivestack-livecheckout | review | proposed | accepted | 2026-11-01T21:58:21Z |  | denisurusov |
| node:task-live-flow-checkout-script | status | open | resolved | 2026-11-01T21:58:22Z |  | denisurusov |
| node:task-live-spec-balance-aware-amounts | review |  | proposed | 2026-11-01T22:01:07Z |  |  |
| node:task-live-spec-balance-aware-amounts | status |  | open | 2026-11-01T22:01:07Z |  |  |
| edge:e-dec-e2ewiring-balanceaware | review |  | proposed | 2026-11-01T22:01:07Z |  |  |
| edge:e-lnk-livecheckout-balanceaware | review |  | proposed | 2026-11-01T22:01:07Z |  |  |
| edge:e-lnk-remainingflows-balanceaware | review |  | proposed | 2026-11-01T22:01:07Z |  |  |
| waypoint:wp-adr-console-same-origin-proxy | review |  | proposed | 2026-11-02T23:15:24Z |  |  |
| edge:e-mrk-sameoriginproxy-codespacesstack | review |  | proposed | 2026-11-02T23:15:24Z |  |  |
| waypoint:wp-adr-console-same-origin-proxy | review | proposed | accepted | 2026-11-03T03:05:59Z | ni:///sha-256;TNqAU7z7Nndy2y2cREbOb7SrxRracwYPExksV7RCKHc | denisurusov |
| node:task-codespaces-live-stack | review | proposed | accepted | 2026-11-03T03:05:59Z | ni:///sha-256;TNqAU7z7Nndy2y2cREbOb7SrxRracwYPExksV7RCKHc | denisurusov |
| node:task-codespaces-live-stack | status | open | resolved | 2026-11-03T03:05:59Z | ni:///sha-256;TNqAU7z7Nndy2y2cREbOb7SrxRracwYPExksV7RCKHc | denisurusov |
| edge:e-mrk-sameoriginproxy-codespacesstack | review | proposed | accepted | 2026-11-03T03:11:11Z | ni:///sha-256;5Q8nClGVgchu69k4e1o4I7htTRambbZm7vs1byqz8Rg | denisurusov |
| waypoint:wp-adr-cdm-payload-carrier | review | proposed | accepted | 2026-11-03T03:24:07Z |  | denisurusov |
| edge:e-drv-ledgerneutrality-carrier | review | proposed | accepted | 2026-11-03T03:24:07Z |  | denisurusov |
| edge:e-drv-cdmdatalayer-carrier | review | proposed | accepted | 2026-11-03T03:24:07Z |  | denisurusov |
| edge:e-mrk-carrier-e2ewiring | review | proposed | accepted | 2026-11-03T03:24:07Z |  | denisurusov |
| edge:e-dec-e2ewiring-remainingflows | review | proposed | rejected | 2026-11-03T03:25:20Z | ni:///sha-256;FmLvYUG8GpOYCzGnsqLFy8jspTsEUGSiXn6zm4GofdA | denisurusov |
| edge:e-dec-e2ewiring-balanceaware | review | proposed | rejected | 2026-11-03T03:25:20Z | ni:///sha-256;FmLvYUG8GpOYCzGnsqLFy8jspTsEUGSiXn6zm4GofdA | denisurusov |
| edge:e-dec-e2eflow-remainingflows | review |  | accepted | 2026-11-03T03:25:20Z | ni:///sha-256;FmLvYUG8GpOYCzGnsqLFy8jspTsEUGSiXn6zm4GofdA | denisurusov |
| edge:e-dec-e2eflow-balanceaware | review |  | accepted | 2026-11-03T03:25:20Z | ni:///sha-256;FmLvYUG8GpOYCzGnsqLFy8jspTsEUGSiXn6zm4GofdA | denisurusov |
| node:task-e2e-wiring | status | active | resolved | 2026-11-03T03:25:20Z | ni:///sha-256;FmLvYUG8GpOYCzGnsqLFy8jspTsEUGSiXn6zm4GofdA | denisurusov |
| edge:e-dec-e2ewiring-codespacesstack | review | proposed | accepted | 2026-11-03T03:31:02Z | ni:///sha-256;TNqAU7z7Nndy2y2cREbOb7SrxRracwYPExksV7RCKHc | denisurusov |
| edge:e-lnk-devcontainerstartup-codespacesstack | review | proposed | accepted | 2026-11-03T03:31:02Z | ni:///sha-256;TNqAU7z7Nndy2y2cREbOb7SrxRracwYPExksV7RCKHc | denisurusov |
| edge:e-lnk-remainingflows-livecheckout | review | proposed | accepted | 2026-11-03T03:31:02Z |  | denisurusov |
| node:task-devcontainer-stack-startup | review | proposed | accepted | 2026-11-03T03:32:33Z |  | denisurusov |
| edge:e-dec-e2ewiring-devcontainerstartup | review | proposed | accepted | 2026-11-03T03:32:33Z |  | denisurusov |
| edge:e-lnk-devcontainerstack-devcontainerstartup | review | proposed | accepted | 2026-11-03T03:32:33Z |  | denisurusov |
| node:task-react-console | status | open | resolved | 2026-11-03T03:33:39Z |  | denisurusov |
| node:goal-test-konspekt-adoption | status | active | resolved | 2026-11-03T03:36:56Z |  | denisurusov |
| noteworthy:nw-return-default-flows-wired | review |  | proposed | 2026-11-01T16:45:36Z |  |  |
| noteworthy:nw-live-spec-balance-depletion | review |  | proposed | 2026-11-01T16:45:36Z |  |  |
| edge:e-note-remainingflows-returndefault | review |  | proposed | 2026-11-01T16:45:36Z |  |  |
| edge:e-note-remainingflows-depletion | review |  | proposed | 2026-11-01T16:45:36Z |  |  |
| edge:e-note-livecheckout-depletion | review |  | proposed | 2026-11-01T16:45:36Z |  |  |
| node:task-e2e-remaining-flows | review | proposed | accepted | 2026-11-03T12:47:43Z |  | denisurusov |
| artifact:artifact-react-console | review | proposed | accepted | 2026-11-03T12:48:28Z |  | denisurusov |
| edge:e-prod-reactconsole-app | review | proposed | accepted | 2026-11-03T12:48:28Z |  | denisurusov |
| artifact:artifact-e2e-runbook | review | proposed | accepted | 2026-11-03T12:48:40Z |  | denisurusov |
| edge:e-prod-e2ewiring-runbook | review | proposed | accepted | 2026-11-03T12:48:40Z |  | denisurusov |
| node:task-revaluation-top-up-modelling | review | proposed | accepted | 2026-11-03T12:49:03Z |  | denisurusov |
| edge:e-dec-bizcase-topupmodelling | review | proposed | accepted | 2026-11-03T12:49:03Z |  | denisurusov |
| edge:e-lnk-remainingflows-topupmodelling | review | proposed | accepted | 2026-11-03T12:49:03Z |  | denisurusov |
| node:task-live-spec-balance-aware-amounts | review | proposed | accepted | 2026-11-03T12:49:19Z |  | denisurusov |
| edge:e-lnk-livecheckout-balanceaware | review | proposed | accepted | 2026-11-03T12:49:19Z |  | denisurusov |
| edge:e-lnk-remainingflows-balanceaware | review | proposed | accepted | 2026-11-03T12:49:19Z |  | denisurusov |
| edge:e-note-balanceaware-depletion | review |  | proposed | 2026-11-03T12:50:15Z |  |  |
| noteworthy:nw-return-default-flows-wired | review | proposed | accepted | 2026-11-03T12:50:48Z | ni:///sha-256;FZF3cQ1v_bOFjSiCJWBK803Zu4RssGLZV7HrmkxtATc | denisurusov |
| noteworthy:nw-live-spec-balance-depletion | review | proposed | accepted | 2026-11-03T12:50:48Z | ni:///sha-256;FZF3cQ1v_bOFjSiCJWBK803Zu4RssGLZV7HrmkxtATc | denisurusov |
| edge:e-note-remainingflows-returndefault | review | proposed | accepted | 2026-11-03T12:50:48Z | ni:///sha-256;FZF3cQ1v_bOFjSiCJWBK803Zu4RssGLZV7HrmkxtATc | denisurusov |
| edge:e-note-remainingflows-depletion | review | proposed | accepted | 2026-11-03T12:50:48Z | ni:///sha-256;FZF3cQ1v_bOFjSiCJWBK803Zu4RssGLZV7HrmkxtATc | denisurusov |
| edge:e-note-livecheckout-depletion | review | proposed | accepted | 2026-11-03T12:50:48Z | ni:///sha-256;FZF3cQ1v_bOFjSiCJWBK803Zu4RssGLZV7HrmkxtATc | denisurusov |
| edge:e-note-balanceaware-depletion | review | proposed | accepted | 2026-11-03T12:50:48Z | ni:///sha-256;FZF3cQ1v_bOFjSiCJWBK803Zu4RssGLZV7HrmkxtATc | denisurusov |
| node:task-e2e-remaining-flows | status | open | active | 2026-11-03T12:50:48Z | ni:///sha-256;FZF3cQ1v_bOFjSiCJWBK803Zu4RssGLZV7HrmkxtATc | denisurusov |
| node:task-collateral-service-unit-tests | review |  | proposed | 2026-11-03T14:01:12Z |  |  |
| node:task-collateral-service-unit-tests | status |  | open | 2026-11-03T14:01:12Z |  |  |
| edge:e-dec-e2eflow-collateralunittests | review |  | proposed | 2026-11-03T14:01:12Z |  |  |
| node:investigation-cdm-workflow-task-map | review |  | proposed | 2026-11-03T14:18:57Z |  |  |
| node:investigation-cdm-workflow-task-map | status |  | active | 2026-11-03T14:18:57Z |  |  |
| edge:e-dec-e2eflow-workflowtaskmap | review |  | proposed | 2026-11-03T14:18:57Z |  |  |
| artifact:artifact-cdm-workflow-task-map | review |  | proposed | 2026-11-03T14:29:20Z |  |  |
| node:task-csa-workflow-extensions | review |  | proposed | 2026-11-03T14:29:20Z |  |  |
| node:task-csa-workflow-extensions | status |  | open | 2026-11-03T14:29:20Z |  |  |
| node:task-repo-gmra-workflows | review |  | proposed | 2026-11-03T14:29:20Z |  |  |
| node:task-repo-gmra-workflows | status |  | open | 2026-11-03T14:29:20Z |  |  |
| node:task-securities-lending-gmsla-workflows | review |  | proposed | 2026-11-03T14:29:20Z |  |  |
| node:task-securities-lending-gmsla-workflows | status |  | open | 2026-11-03T14:29:20Z |  |  |
| node:task-triparty-workflows | review |  | proposed | 2026-11-03T14:29:20Z |  |  |
| node:task-triparty-workflows | status |  | open | 2026-11-03T14:29:20Z |  |  |
| node:task-ccp-workflows | review |  | proposed | 2026-11-03T14:29:20Z |  |  |
| node:task-ccp-workflows | status |  | open | 2026-11-03T14:29:20Z |  |  |
| edge:e-prod-workflowtaskmap-map | review |  | proposed | 2026-11-03T14:29:20Z |  |  |
| edge:e-dec-e2eflow-csaextensions | review |  | proposed | 2026-11-03T14:29:20Z |  |  |
| edge:e-dec-e2eflow-repogmra | review |  | proposed | 2026-11-03T14:29:20Z |  |  |
| edge:e-dec-e2eflow-seclendinggmsla | review |  | proposed | 2026-11-03T14:29:20Z |  |  |
| edge:e-dec-e2eflow-triparty | review |  | proposed | 2026-11-03T14:29:20Z |  |  |
| edge:e-dec-e2eflow-ccp | review |  | proposed | 2026-11-03T14:29:20Z |  |  |
| edge:e-lnk-csaextensions-gapclosure | review |  | proposed | 2026-11-03T14:29:20Z |  |  |
| node:investigation-cdm-workflow-task-map | review | proposed | accepted | 2026-11-03T14:47:29Z | ni:///sha-256;kSctsKHEX0SEE2eVX2AJpgnNtDtIno9vWm44SthSsuw | denisurusov |
| artifact:artifact-cdm-workflow-task-map | review | proposed | accepted | 2026-11-03T14:47:29Z | ni:///sha-256;kSctsKHEX0SEE2eVX2AJpgnNtDtIno9vWm44SthSsuw | denisurusov |
| node:task-csa-workflow-extensions | review | proposed | accepted | 2026-11-03T14:47:29Z | ni:///sha-256;kSctsKHEX0SEE2eVX2AJpgnNtDtIno9vWm44SthSsuw | denisurusov |
| node:task-repo-gmra-workflows | review | proposed | accepted | 2026-11-03T14:47:29Z | ni:///sha-256;kSctsKHEX0SEE2eVX2AJpgnNtDtIno9vWm44SthSsuw | denisurusov |
| node:task-securities-lending-gmsla-workflows | review | proposed | accepted | 2026-11-03T14:47:29Z | ni:///sha-256;kSctsKHEX0SEE2eVX2AJpgnNtDtIno9vWm44SthSsuw | denisurusov |
| node:task-triparty-workflows | review | proposed | accepted | 2026-11-03T14:47:29Z | ni:///sha-256;kSctsKHEX0SEE2eVX2AJpgnNtDtIno9vWm44SthSsuw | denisurusov |
| node:task-ccp-workflows | review | proposed | accepted | 2026-11-03T14:47:29Z | ni:///sha-256;kSctsKHEX0SEE2eVX2AJpgnNtDtIno9vWm44SthSsuw | denisurusov |
| edge:e-dec-e2eflow-workflowtaskmap | review | proposed | accepted | 2026-11-03T14:47:29Z | ni:///sha-256;kSctsKHEX0SEE2eVX2AJpgnNtDtIno9vWm44SthSsuw | denisurusov |
| edge:e-prod-workflowtaskmap-map | review | proposed | accepted | 2026-11-03T14:47:29Z | ni:///sha-256;kSctsKHEX0SEE2eVX2AJpgnNtDtIno9vWm44SthSsuw | denisurusov |
| edge:e-dec-e2eflow-csaextensions | review | proposed | accepted | 2026-11-03T14:47:29Z | ni:///sha-256;kSctsKHEX0SEE2eVX2AJpgnNtDtIno9vWm44SthSsuw | denisurusov |
| edge:e-dec-e2eflow-repogmra | review | proposed | accepted | 2026-11-03T14:47:29Z | ni:///sha-256;kSctsKHEX0SEE2eVX2AJpgnNtDtIno9vWm44SthSsuw | denisurusov |
| edge:e-dec-e2eflow-seclendinggmsla | review | proposed | accepted | 2026-11-03T14:47:29Z | ni:///sha-256;kSctsKHEX0SEE2eVX2AJpgnNtDtIno9vWm44SthSsuw | denisurusov |
| edge:e-dec-e2eflow-triparty | review | proposed | accepted | 2026-11-03T14:47:29Z | ni:///sha-256;kSctsKHEX0SEE2eVX2AJpgnNtDtIno9vWm44SthSsuw | denisurusov |
| edge:e-dec-e2eflow-ccp | review | proposed | accepted | 2026-11-03T14:47:29Z | ni:///sha-256;kSctsKHEX0SEE2eVX2AJpgnNtDtIno9vWm44SthSsuw | denisurusov |
| edge:e-lnk-csaextensions-gapclosure | review | proposed | accepted | 2026-11-03T14:47:29Z | ni:///sha-256;kSctsKHEX0SEE2eVX2AJpgnNtDtIno9vWm44SthSsuw | denisurusov |
| noteworthy:nw-core-cycle-first | review |  | accepted | 2026-11-03T14:47:29Z | ni:///sha-256;kSctsKHEX0SEE2eVX2AJpgnNtDtIno9vWm44SthSsuw | denisurusov |
| edge:e-note-workflowtaskmap-corefirst | review |  | accepted | 2026-11-03T14:47:29Z | ni:///sha-256;kSctsKHEX0SEE2eVX2AJpgnNtDtIno9vWm44SthSsuw | denisurusov |
| noteworthy:nw-csa-extension-order | review |  | proposed | 2026-11-03T14:47:29Z |  |  |
| noteworthy:nw-agreement-family-order | review |  | proposed | 2026-11-03T14:47:29Z |  |  |
| edge:e-note-workflowtaskmap-csaorder | review |  | proposed | 2026-11-03T14:47:29Z |  |  |
| edge:e-note-csaextensions-csaorder | review |  | proposed | 2026-11-03T14:47:29Z |  |  |
| edge:e-note-workflowtaskmap-familyorder | review |  | proposed | 2026-11-03T14:47:29Z |  |  |
| noteworthy:nw-csa-extension-order | review | proposed | accepted | 2026-11-03T15:18:20Z | ni:///sha-256;9kYAFSUAZH-lUMWz84xMpUIxk4H2w-HclEsoUA5I99Y | denisurusov |
| noteworthy:nw-agreement-family-order | review | proposed | accepted | 2026-11-03T15:18:20Z | ni:///sha-256;9kYAFSUAZH-lUMWz84xMpUIxk4H2w-HclEsoUA5I99Y | denisurusov |
| edge:e-note-workflowtaskmap-csaorder | review | proposed | accepted | 2026-11-03T15:18:20Z | ni:///sha-256;9kYAFSUAZH-lUMWz84xMpUIxk4H2w-HclEsoUA5I99Y | denisurusov |
| edge:e-note-csaextensions-csaorder | review | proposed | accepted | 2026-11-03T15:18:20Z | ni:///sha-256;9kYAFSUAZH-lUMWz84xMpUIxk4H2w-HclEsoUA5I99Y | denisurusov |
| edge:e-note-workflowtaskmap-familyorder | review | proposed | accepted | 2026-11-03T15:18:20Z | ni:///sha-256;9kYAFSUAZH-lUMWz84xMpUIxk4H2w-HclEsoUA5I99Y | denisurusov |
| waypoint:wp-adr-oracle-prices-on-request-ratings-offchain | review |  | accepted | 2026-11-03T15:31:39Z | ni:///sha-256;8w4tiyTqKyL6OHv367h9lKvnyNaOH9t35rb1ZkEE83s | denisurusov |
| edge:e-mrk-oracleadr-remainingflows | review |  | accepted | 2026-11-03T15:31:39Z | ni:///sha-256;8w4tiyTqKyL6OHv367h9lKvnyNaOH9t35rb1ZkEE83s | denisurusov |
| waypoint:wp-adr-revaluation-outstanding-im-from-calls | review |  | accepted | 2026-11-03T16:24:46Z | ni:///sha-256;sF-wwnWFGGjDxoAR76G55kMb5Og6lcFf1389CE2X9Gg | denisurusov |
| edge:e-mrk-revaladr-remainingflows | review |  | accepted | 2026-11-03T16:24:46Z | ni:///sha-256;sF-wwnWFGGjDxoAR76G55kMb5Og6lcFf1389CE2X9Gg | denisurusov |
| noteworthy:nw-revaluation-top-up-excluded | review |  | proposed | 2026-11-03T16:24:46Z |  |  |
| edge:e-note-remainingflows-topupexcluded | review |  | proposed | 2026-11-03T16:24:46Z |  |  |
| edge:e-note-topupmodelling-topupexcluded | review |  | proposed | 2026-11-03T16:24:46Z |  |  |
| noteworthy:nw-revaluation-top-up-excluded | review | proposed | accepted | 2026-11-03T16:35:57Z |  | denisurusov |
| edge:e-note-remainingflows-topupexcluded | review | proposed | accepted | 2026-11-03T16:35:57Z |  | denisurusov |
| edge:e-note-topupmodelling-topupexcluded | review | proposed | accepted | 2026-11-03T16:35:57Z |  | denisurusov |
| waypoint:wp-adr-ci-runs-live-specs | review |  | accepted | 2026-11-03T17:05:51Z | ni:///sha-256;IJciepOEqgHnadLWMJv48SpKG10HaQI_3vV5NFKK0xc | denisurusov |
| edge:e-mrk-cispecsadr-remainingflows | review |  | accepted | 2026-11-03T17:05:51Z | ni:///sha-256;IJciepOEqgHnadLWMJv48SpKG10HaQI_3vV5NFKK0xc | denisurusov |
| edge:e-sup-cispecs-livestacklocal | review |  | accepted | 2026-11-03T17:05:51Z | ni:///sha-256;IJciepOEqgHnadLWMJv48SpKG10HaQI_3vV5NFKK0xc | denisurusov |
| node:task-e2e-remaining-flows | status | active | resolved | 2026-11-03T17:51:55Z |  | denisurusov |
| noteworthy:nw-portfolio-per-pair-post-haircut | review |  | proposed | 2026-11-03T18:04:30Z |  |  |
| noteworthy:nw-cdm-valuation-percentage-as-haircut | review |  | proposed | 2026-11-03T18:04:30Z |  |  |
| edge:e-note-gapclosure-portfoliopair | review |  | proposed | 2026-11-03T18:04:30Z |  |  |
| edge:e-note-gapclosure-valuationpct | review |  | proposed | 2026-11-03T18:04:30Z |  |  |
| noteworthy:nw-portfolio-per-pair-post-haircut | review | proposed | accepted | 2026-11-03T20:41:24Z |  | denisurusov |
| noteworthy:nw-cdm-valuation-percentage-as-haircut | review | proposed | accepted | 2026-11-03T20:41:24Z |  | denisurusov |
| edge:e-note-gapclosure-portfoliopair | review | proposed | accepted | 2026-11-03T20:41:24Z |  | denisurusov |
| edge:e-note-gapclosure-valuationpct | review | proposed | accepted | 2026-11-03T20:41:24Z |  | denisurusov |
| noteworthy:nw-concentration-held-and-proposed-after-haircuts | review |  | proposed | 2026-11-03T20:54:04Z |  |  |
| noteworthy:nw-vm-exposure-from-netting-set | review |  | proposed | 2026-11-03T20:54:04Z |  |  |
| edge:e-note-gapclosure-concentration | review |  | proposed | 2026-11-03T20:54:04Z |  |  |
| edge:e-note-gapclosure-vmexposure | review |  | proposed | 2026-11-03T20:54:04Z |  |  |
| noteworthy:nw-concentration-held-and-proposed-after-haircuts | review | proposed | accepted | 2026-11-03T21:48:03Z |  | denisurusov |
| edge:e-note-gapclosure-concentration | review | proposed | accepted | 2026-11-03T21:48:03Z |  | denisurusov |
| noteworthy:nw-vm-exposure-from-netting-set | review | proposed | accepted | 2026-11-03T21:48:03Z |  | denisurusov |
| edge:e-note-gapclosure-vmexposure | review | proposed | accepted | 2026-11-03T21:48:03Z |  | denisurusov |
| noteworthy:nw-closeout-collateral-by-arrangement | review |  | proposed | 2026-11-03T21:52:19Z |  |  |
| edge:e-note-gapclosure-closeout | review |  | proposed | 2026-11-03T21:52:19Z |  |  |
| noteworthy:nw-closeout-collateral-by-arrangement | review | proposed | accepted | 2026-11-03T23:07:44Z |  | denisurusov |
| edge:e-note-gapclosure-closeout | review | proposed | accepted | 2026-11-03T23:07:44Z |  | denisurusov |
| noteworthy:nw-enforcement-event-by-election | review |  | proposed | 2026-11-03T23:08:40Z |  |  |
| edge:e-note-gapclosure-enforcement | review |  | proposed | 2026-11-03T23:08:40Z |  |  |
| noteworthy:nw-enforcement-event-by-election | review | proposed | accepted | 2026-11-03T23:55:33Z |  | denisurusov |
| edge:e-note-gapclosure-enforcement | review | proposed | accepted | 2026-11-03T23:55:33Z |  | denisurusov |
| node:task-sme-enforcement-event-definition | review |  | proposed | 2026-11-03T23:55:33Z |  |  |
| node:task-sme-enforcement-event-definition | status |  | open | 2026-11-03T23:55:33Z |  |  |
| edge:e-dec-cdmdev-smeenforcement | review |  | proposed | 2026-11-03T23:55:33Z |  |  |
| edge:e-lnk-gapclosure-smeenforcement | review |  | proposed | 2026-11-03T23:55:33Z |  |  |
| noteworthy:nw-substitution-csa-lifecycle | review |  | proposed | 2026-11-03T23:59:58Z |  |  |
| edge:e-note-gapclosure-substitution | review |  | proposed | 2026-11-03T23:59:58Z |  |  |
| noteworthy:nw-substitution-csa-lifecycle | review | proposed | accepted | 2026-11-04T00:10:23Z |  | denisurusov |
| node:task-sme-enforcement-event-definition | review | proposed | accepted | 2026-11-04T00:10:23Z |  | denisurusov |
| edge:e-note-gapclosure-substitution | review | proposed | accepted | 2026-11-04T00:10:23Z |  | denisurusov |
| edge:e-dec-cdmdev-smeenforcement | review | proposed | accepted | 2026-11-04T00:10:23Z |  | denisurusov |
| edge:e-lnk-gapclosure-smeenforcement | review | proposed | accepted | 2026-11-04T00:10:23Z |  | denisurusov |
| noteworthy:nw-dispute-record-beside-call | review |  | proposed | 2026-11-04T00:15:20Z |  |  |
| edge:e-note-gapclosure-dispute | review |  | proposed | 2026-11-04T00:15:20Z |  |  |
| noteworthy:nw-ledger-reference-and-token-identity | review |  | proposed | 2026-11-04T00:15:20Z |  |  |
| edge:e-note-gapclosure-ledger | review |  | proposed | 2026-11-04T00:15:20Z |  |  |
| noteworthy:nw-dispute-record-beside-call | review | proposed | accepted | 2026-11-04T02:15:33Z |  | denisurusov |
| edge:e-note-gapclosure-dispute | review | proposed | accepted | 2026-11-04T02:15:33Z |  | denisurusov |
| noteworthy:nw-ledger-reference-and-token-identity | review | proposed | rejected | 2026-11-04T02:21:16Z | ni:///sha-256;-RZvrfQ3NLZ_uyRcmtqFD8H9XlfaTBAi3_792ucIxRc | denisurusov |
| edge:e-note-gapclosure-ledger | review | proposed | rejected | 2026-11-04T02:21:16Z | ni:///sha-256;-RZvrfQ3NLZ_uyRcmtqFD8H9XlfaTBAi3_792ucIxRc | denisurusov |
| noteworthy:nw-ledger-anchor-redesign | review |  | proposed | 2026-11-04T02:21:16Z |  |  |
| node:task-g25-ledger-anchor-redesign | review |  | proposed | 2026-11-04T02:21:16Z |  |  |
| node:task-g25-ledger-anchor-redesign | status |  | open | 2026-11-04T02:21:16Z |  |  |
| node:task-sme-registered-asset-completion | review |  | proposed | 2026-11-04T02:21:16Z |  |  |
| node:task-sme-registered-asset-completion | status |  | open | 2026-11-04T02:21:16Z |  |  |
| edge:e-sup-ledgeranchor-ledgerref | review |  | proposed | 2026-11-04T02:21:16Z |  |  |
| edge:e-note-gapclosure-ledgeranchor | review |  | proposed | 2026-11-04T02:21:16Z |  |  |
| edge:e-dec-gapclosure-g25redesign | review |  | proposed | 2026-11-04T02:21:16Z |  |  |
| edge:e-note-g25redesign-ledgeranchor | review |  | proposed | 2026-11-04T02:21:16Z |  |  |
| edge:e-dec-cdmdev-smeregistered | review |  | proposed | 2026-11-04T02:21:16Z |  |  |
| edge:e-lnk-gapclosure-smeregistered | review |  | proposed | 2026-11-04T02:21:16Z |  |  |
| noteworthy:nw-ledger-anchor-redesign | review | proposed | accepted | 2026-11-04T02:27:08Z |  | denisurusov |
| edge:e-note-gapclosure-ledgeranchor | review | proposed | accepted | 2026-11-04T02:27:08Z |  | denisurusov |
| node:task-g25-ledger-anchor-redesign | review | proposed | accepted | 2026-11-04T02:27:22Z |  | denisurusov |
| edge:e-dec-gapclosure-g25redesign | review | proposed | accepted | 2026-11-04T02:27:22Z |  | denisurusov |
| edge:e-note-g25redesign-ledgeranchor | review | proposed | accepted | 2026-11-04T02:27:22Z |  | denisurusov |
| node:task-sme-registered-asset-completion | review | proposed | accepted | 2026-11-04T02:27:36Z |  | denisurusov |
| edge:e-dec-cdmdev-smeregistered | review | proposed | accepted | 2026-11-04T02:27:36Z |  | denisurusov |
| edge:e-lnk-gapclosure-smeregistered | review | proposed | accepted | 2026-11-04T02:27:36Z |  | denisurusov |
| edge:e-sup-ledgeranchor-ledgerref | review | proposed | accepted | 2026-11-04T02:27:08Z |  | denisurusov |
| noteworthy:nw-ledger-anchor-implementation | review |  | proposed | 2026-11-04T02:39:30Z |  |  |
| edge:e-note-g25redesign-implementation | review |  | proposed | 2026-11-04T02:39:30Z |  |  |
| noteworthy:nw-ledger-anchor-implementation | review | proposed | accepted | 2026-11-04T02:46:59Z |  | denisurusov |
| edge:e-note-g25redesign-implementation | review | proposed | accepted | 2026-11-04T02:46:59Z |  | denisurusov |
| node:task-g25-ledger-anchor-redesign | status | open | resolved | 2026-11-04T03:11:51Z | ni:///sha-256;Dkskm4jLbHYyUngdTz2icuo7wHtciBDYmQMC78Jz-Cs | denisurusov |
| node:task-csa-close-out-netting | review |  | proposed | 2026-11-06T13:19:22Z |  |  |
| node:task-csa-close-out-netting | status |  | open | 2026-11-06T13:19:22Z |  |  |
| edge:e-dec-csaext-closeout | review |  | proposed | 2026-11-06T13:19:22Z |  |  |
| node:task-csa-substitution | review |  | proposed | 2026-11-06T13:19:22Z |  |  |
| node:task-csa-substitution | status |  | open | 2026-11-06T13:19:22Z |  |  |
| edge:e-dec-csaext-substitution | review |  | proposed | 2026-11-06T13:19:22Z |  |  |
| node:task-csa-interest-on-cash | review |  | proposed | 2026-11-06T13:19:22Z |  |  |
| node:task-csa-interest-on-cash | status |  | open | 2026-11-06T13:19:22Z |  |  |
| edge:e-dec-csaext-interest | review |  | proposed | 2026-11-06T13:19:22Z |  |  |
| node:task-csa-amendment | review |  | proposed | 2026-11-06T13:19:22Z |  |  |
| node:task-csa-amendment | status |  | open | 2026-11-06T13:19:22Z |  |  |
| edge:e-dec-csaext-amendment | review |  | proposed | 2026-11-06T13:19:22Z |  |  |
| node:task-csa-call-cancellation | review |  | proposed | 2026-11-06T13:19:22Z |  |  |
| node:task-csa-call-cancellation | status |  | open | 2026-11-06T13:19:22Z |  |  |
| edge:e-dec-csaext-cancellation | review |  | proposed | 2026-11-06T13:19:22Z |  |  |
| node:task-csa-settlement-netting | review |  | proposed | 2026-11-06T13:19:22Z |  |  |
| node:task-csa-settlement-netting | status |  | open | 2026-11-06T13:19:22Z |  |  |
| edge:e-dec-csaext-settlementnetting | review |  | proposed | 2026-11-06T13:19:22Z |  |  |
| node:task-csa-allocation | review |  | proposed | 2026-11-06T13:19:22Z |  |  |
| node:task-csa-allocation | status |  | open | 2026-11-06T13:19:22Z |  |  |
| edge:e-dec-csaext-allocation | review |  | proposed | 2026-11-06T13:19:22Z |  |  |
| node:task-csa-reconciliation | review |  | proposed | 2026-11-06T13:19:22Z |  |  |
| node:task-csa-reconciliation | status |  | open | 2026-11-06T13:19:22Z |  |  |
| edge:e-dec-csaext-reconciliation | review |  | proposed | 2026-11-06T13:19:22Z |  |  |
| waypoint:wp-adr-closeout-contract-applies-collateral | review |  | proposed | 2026-11-06T14:41:19Z |  |  |
| waypoint:wp-adr-substitution-fold-portfolio | review |  | proposed | 2026-11-06T14:41:19Z |  |  |
| edge:e-mrk-closeoutadr-closeout | review |  | proposed | 2026-11-06T14:41:19Z |  |  |
| edge:e-mrk-subfoldadr-substitution | review |  | proposed | 2026-11-06T14:41:19Z |  |  |
| waypoint:wp-adr-closeout-contract-applies-collateral | review | proposed | accepted | 2026-11-06T15:14:18Z | ni:///sha-256;7NrBVkknXxtv65MxIC5KWB3I90LlegK9ja-kaePXfGs | denisurusov |
| waypoint:wp-adr-substitution-fold-portfolio | review | proposed | accepted | 2026-11-06T15:14:18Z | ni:///sha-256;7NrBVkknXxtv65MxIC5KWB3I90LlegK9ja-kaePXfGs | denisurusov |
| node:task-csa-close-out-netting | review | proposed | accepted | 2026-11-06T15:14:18Z | ni:///sha-256;7NrBVkknXxtv65MxIC5KWB3I90LlegK9ja-kaePXfGs | denisurusov |
| node:task-csa-substitution | review | proposed | accepted | 2026-11-06T15:14:18Z | ni:///sha-256;7NrBVkknXxtv65MxIC5KWB3I90LlegK9ja-kaePXfGs | denisurusov |
| node:task-csa-interest-on-cash | review | proposed | accepted | 2026-11-06T15:14:18Z | ni:///sha-256;7NrBVkknXxtv65MxIC5KWB3I90LlegK9ja-kaePXfGs | denisurusov |
| node:task-csa-amendment | review | proposed | accepted | 2026-11-06T15:14:18Z | ni:///sha-256;7NrBVkknXxtv65MxIC5KWB3I90LlegK9ja-kaePXfGs | denisurusov |
| node:task-csa-call-cancellation | review | proposed | accepted | 2026-11-06T15:14:18Z | ni:///sha-256;7NrBVkknXxtv65MxIC5KWB3I90LlegK9ja-kaePXfGs | denisurusov |
| node:task-csa-settlement-netting | review | proposed | accepted | 2026-11-06T15:14:18Z | ni:///sha-256;7NrBVkknXxtv65MxIC5KWB3I90LlegK9ja-kaePXfGs | denisurusov |
| node:task-csa-allocation | review | proposed | accepted | 2026-11-06T15:14:18Z | ni:///sha-256;7NrBVkknXxtv65MxIC5KWB3I90LlegK9ja-kaePXfGs | denisurusov |
| node:task-csa-reconciliation | review | proposed | accepted | 2026-11-06T15:14:18Z | ni:///sha-256;7NrBVkknXxtv65MxIC5KWB3I90LlegK9ja-kaePXfGs | denisurusov |
| edge:e-dec-csaext-closeout | review | proposed | accepted | 2026-11-06T15:14:18Z | ni:///sha-256;7NrBVkknXxtv65MxIC5KWB3I90LlegK9ja-kaePXfGs | denisurusov |
| edge:e-dec-csaext-substitution | review | proposed | accepted | 2026-11-06T15:14:18Z | ni:///sha-256;7NrBVkknXxtv65MxIC5KWB3I90LlegK9ja-kaePXfGs | denisurusov |
| edge:e-dec-csaext-interest | review | proposed | accepted | 2026-11-06T15:14:18Z | ni:///sha-256;7NrBVkknXxtv65MxIC5KWB3I90LlegK9ja-kaePXfGs | denisurusov |
| edge:e-dec-csaext-amendment | review | proposed | accepted | 2026-11-06T15:14:18Z | ni:///sha-256;7NrBVkknXxtv65MxIC5KWB3I90LlegK9ja-kaePXfGs | denisurusov |
| edge:e-dec-csaext-cancellation | review | proposed | accepted | 2026-11-06T15:14:18Z | ni:///sha-256;7NrBVkknXxtv65MxIC5KWB3I90LlegK9ja-kaePXfGs | denisurusov |
| edge:e-dec-csaext-settlementnetting | review | proposed | accepted | 2026-11-06T15:14:18Z | ni:///sha-256;7NrBVkknXxtv65MxIC5KWB3I90LlegK9ja-kaePXfGs | denisurusov |
| edge:e-dec-csaext-allocation | review | proposed | accepted | 2026-11-06T15:14:18Z | ni:///sha-256;7NrBVkknXxtv65MxIC5KWB3I90LlegK9ja-kaePXfGs | denisurusov |
| edge:e-dec-csaext-reconciliation | review | proposed | accepted | 2026-11-06T15:14:18Z | ni:///sha-256;7NrBVkknXxtv65MxIC5KWB3I90LlegK9ja-kaePXfGs | denisurusov |
| edge:e-mrk-closeoutadr-closeout | review | proposed | accepted | 2026-11-06T15:14:18Z | ni:///sha-256;7NrBVkknXxtv65MxIC5KWB3I90LlegK9ja-kaePXfGs | denisurusov |
| edge:e-mrk-subfoldadr-substitution | review | proposed | accepted | 2026-11-06T15:14:18Z | ni:///sha-256;7NrBVkknXxtv65MxIC5KWB3I90LlegK9ja-kaePXfGs | denisurusov |
| node:task-csa-close-out-netting | status | open | resolved | 2026-11-06T15:14:18Z | ni:///sha-256;7NrBVkknXxtv65MxIC5KWB3I90LlegK9ja-kaePXfGs | denisurusov |
| node:task-csa-substitution | status | open | resolved | 2026-11-06T15:14:18Z | ni:///sha-256;7NrBVkknXxtv65MxIC5KWB3I90LlegK9ja-kaePXfGs | denisurusov |
| waypoint:wp-adr-interest-rate-rules-and-withholding | review |  | proposed | 2026-11-06T15:26:06Z |  |  |
| edge:e-mrk-interestadr-interest | review |  | proposed | 2026-11-06T15:26:06Z |  |  |
| waypoint:wp-adr-interest-rate-rules-and-withholding | review | proposed | accepted | 2026-11-06T15:35:07Z | ni:///sha-256;ykrq4pPBDS2eLjEFB1dOXGBJbTH45C7F9YkutihIlE4 | denisurusov |
| edge:e-mrk-interestadr-interest | review | proposed | accepted | 2026-11-06T15:35:07Z | ni:///sha-256;ykrq4pPBDS2eLjEFB1dOXGBJbTH45C7F9YkutihIlE4 | denisurusov |
| node:task-sme-interest-daily-balances | review |  | proposed | 2026-11-06T15:35:07Z |  |  |
| node:task-sme-interest-daily-balances | status |  | open | 2026-11-06T15:35:07Z |  |  |
| edge:e-dec-cdmdev-smeinterest | review |  | proposed | 2026-11-06T15:35:07Z |  |  |
| edge:e-lnk-interest-smeinterest | review |  | proposed | 2026-11-06T15:35:07Z |  |  |
| waypoint:wp-adr-interest-onchain-settlement | review |  | proposed | 2026-11-06T15:51:39Z |  |  |
| edge:e-mrk-interestsettle-interest | review |  | proposed | 2026-11-06T15:51:39Z |  |  |
| waypoint:wp-adr-interest-onchain-settlement | review | proposed | accepted | 2026-11-06T15:52:55Z | ni:///sha-256;1dtVHHRpFR-iSuGZpUkyfAPSH-wLVqArSbUqlOwFm4E | denisurusov |
| node:task-sme-interest-daily-balances | review | proposed | accepted | 2026-11-06T15:52:55Z | ni:///sha-256;1dtVHHRpFR-iSuGZpUkyfAPSH-wLVqArSbUqlOwFm4E | denisurusov |
| edge:e-mrk-interestsettle-interest | review | proposed | accepted | 2026-11-06T15:52:55Z | ni:///sha-256;1dtVHHRpFR-iSuGZpUkyfAPSH-wLVqArSbUqlOwFm4E | denisurusov |
| edge:e-dec-cdmdev-smeinterest | review | proposed | accepted | 2026-11-06T15:52:55Z | ni:///sha-256;1dtVHHRpFR-iSuGZpUkyfAPSH-wLVqArSbUqlOwFm4E | denisurusov |
| edge:e-lnk-interest-smeinterest | review | proposed | accepted | 2026-11-06T15:52:55Z | ni:///sha-256;1dtVHHRpFR-iSuGZpUkyfAPSH-wLVqArSbUqlOwFm4E | denisurusov |
| node:task-csa-interest-on-cash | status | open | resolved | 2026-11-06T15:52:55Z | ni:///sha-256;1dtVHHRpFR-iSuGZpUkyfAPSH-wLVqArSbUqlOwFm4E | denisurusov |
| waypoint:wp-adr-amendment-per-pair-terms | review |  | proposed | 2026-11-06T17:04:10Z |  |  |
| edge:e-mrk-amendterms-amendment | review |  | proposed | 2026-11-06T17:04:10Z |  |  |
| waypoint:wp-adr-amendment-per-pair-terms | review | proposed | accepted | 2026-11-06T19:18:15Z | ni:///sha-256;fs6wksjb_oAlVW4ZRgEl5IY8TH-PEJ8ehqM1heMeXKY | denisurusov |
| edge:e-mrk-amendterms-amendment | review | proposed | accepted | 2026-11-06T19:18:15Z | ni:///sha-256;fs6wksjb_oAlVW4ZRgEl5IY8TH-PEJ8ehqM1heMeXKY | denisurusov |
| node:task-csa-amendment | status | open | resolved | 2026-11-06T19:18:15Z | ni:///sha-256;fs6wksjb_oAlVW4ZRgEl5IY8TH-PEJ8ehqM1heMeXKY | denisurusov |
| node:task-sme-call-cancellation-rules | review |  | proposed | 2026-11-06T20:16:20Z |  |  |
| node:task-sme-call-cancellation-rules | status |  | open | 2026-11-06T20:16:20Z |  |  |
| edge:e-dec-cdmdev-smecancel | review |  | proposed | 2026-11-06T20:16:20Z |  |  |
| edge:e-lnk-cancel-smecancel | review |  | proposed | 2026-11-06T20:16:20Z |  |  |
| waypoint:wp-adr-cancellation-blocks-call | review |  | proposed | 2026-11-06T20:38:13Z |  |  |
| edge:e-mrk-cancelblocks-cancel | review |  | proposed | 2026-11-06T20:38:13Z |  |  |
| waypoint:wp-adr-cancellation-blocks-call | review | proposed | accepted | 2026-11-06T20:45:24Z | ni:///sha-256;LJM9bzM53BmhXs3TMRgXfadtGNoKY_MVzTlTSPgps7E | denisurusov |
| node:task-sme-call-cancellation-rules | review | proposed | accepted | 2026-11-06T20:45:24Z | ni:///sha-256;LJM9bzM53BmhXs3TMRgXfadtGNoKY_MVzTlTSPgps7E | denisurusov |
| edge:e-mrk-cancelblocks-cancel | review | proposed | accepted | 2026-11-06T20:45:24Z | ni:///sha-256;LJM9bzM53BmhXs3TMRgXfadtGNoKY_MVzTlTSPgps7E | denisurusov |
| edge:e-dec-cdmdev-smecancel | review | proposed | accepted | 2026-11-06T20:45:24Z | ni:///sha-256;LJM9bzM53BmhXs3TMRgXfadtGNoKY_MVzTlTSPgps7E | denisurusov |
| edge:e-lnk-cancel-smecancel | review | proposed | accepted | 2026-11-06T20:45:24Z | ni:///sha-256;LJM9bzM53BmhXs3TMRgXfadtGNoKY_MVzTlTSPgps7E | denisurusov |
| node:task-csa-call-cancellation | status | open | resolved | 2026-11-06T20:45:24Z | ni:///sha-256;LJM9bzM53BmhXs3TMRgXfadtGNoKY_MVzTlTSPgps7E | denisurusov |
| node:task-ci-deploy-dropped-tx | review |  | proposed | 2026-11-06T21:19:41Z |  |  |
| node:task-ci-deploy-dropped-tx | status |  | open | 2026-11-06T21:19:41Z |  |  |
| edge:e-lnk-cilivestack-deploydroppedtx | review |  | proposed | 2026-11-06T21:19:41Z |  |  |
| node:task-ci-deploy-dropped-tx | review | proposed | accepted | 2026-11-06T21:21:30Z | ni:///sha-256;LNG4zLgNGa-S7tpnkBRAUWaqaZXZU1BryTPqtWk6p94 | denisurusov |
| edge:e-lnk-cilivestack-deploydroppedtx | review | proposed | accepted | 2026-11-06T21:21:30Z | ni:///sha-256;LNG4zLgNGa-S7tpnkBRAUWaqaZXZU1BryTPqtWk6p94 | denisurusov |
| node:investigation-adr-asr-traceability | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| node:investigation-adr-asr-traceability | status |  | active | 2026-11-06T21:34:07Z |  |  |
| edge:e-dec-archdesign-adrtrace | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| edge:e-drv-cdmdata-amendterms | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| edge:e-drv-callstate-cancelblocks | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| edge:e-drv-cdmdata-cancelblocks | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| edge:e-drv-cdmdata-cdmevents | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| edge:e-drv-cdmdata-extrune | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| edge:e-drv-cdmdata-localext | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| edge:e-drv-cdmdata-closeout | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| edge:e-drv-finality-closeout | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| edge:e-drv-cdmdata-consolerules | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| edge:e-drv-callstate-imseg | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| edge:e-drv-finality-imseg | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| edge:e-drv-cdmdata-interestsettle | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| edge:e-drv-finality-interestsettle | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| edge:e-drv-cdmdata-interestrules | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| edge:e-drv-cdmdata-javastack | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| edge:e-drv-callstate-perparty | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| edge:e-drv-callstate-reval | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| edge:e-drv-callstate-subst | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| edge:e-drv-cdmdata-subst | review |  | proposed | 2026-11-06T21:34:07Z |  |  |
| noteworthy:nw-architecture-json-is-source | review |  | proposed | 2026-11-06T21:49:38Z |  |  |
| edge:e-note-adrtrace-jsonsource | review |  | proposed | 2026-11-06T21:49:38Z |  |  |
| concept:concept-asr-onchain-feed-scope | review |  | proposed | 2026-11-06T21:52:57Z |  |  |
| concept:concept-asr-agreement-type-fidelity | review |  | proposed | 2026-11-06T21:52:57Z |  |  |
| edge:e-drv-feedscope-oracleprices | review |  | proposed | 2026-11-06T21:52:57Z |  |  |
| edge:e-drv-agreementfidelity-scenariogrid | review |  | proposed | 2026-11-06T21:52:57Z |  |  |
| edge:e-dec-archdesign-adrtrace | review | proposed | accepted | 2026-11-06T21:53:08Z | ni:///sha-256;CX7Yp0rOWie0v6wc0130XWLZyhAUPeci0y4_wdx18J4 | denisurusov |
| edge:e-drv-cdmdata-amendterms | review | proposed | accepted | 2026-11-06T21:53:08Z | ni:///sha-256;CX7Yp0rOWie0v6wc0130XWLZyhAUPeci0y4_wdx18J4 | denisurusov |
| edge:e-drv-callstate-cancelblocks | review | proposed | accepted | 2026-11-06T21:53:08Z | ni:///sha-256;CX7Yp0rOWie0v6wc0130XWLZyhAUPeci0y4_wdx18J4 | denisurusov |
| edge:e-drv-cdmdata-cancelblocks | review | proposed | accepted | 2026-11-06T21:53:08Z | ni:///sha-256;CX7Yp0rOWie0v6wc0130XWLZyhAUPeci0y4_wdx18J4 | denisurusov |
| edge:e-drv-cdmdata-cdmevents | review | proposed | accepted | 2026-11-06T21:53:08Z | ni:///sha-256;CX7Yp0rOWie0v6wc0130XWLZyhAUPeci0y4_wdx18J4 | denisurusov |
| edge:e-drv-cdmdata-extrune | review | proposed | accepted | 2026-11-06T21:53:08Z | ni:///sha-256;CX7Yp0rOWie0v6wc0130XWLZyhAUPeci0y4_wdx18J4 | denisurusov |
| edge:e-drv-cdmdata-localext | review | proposed | accepted | 2026-11-06T21:53:08Z | ni:///sha-256;CX7Yp0rOWie0v6wc0130XWLZyhAUPeci0y4_wdx18J4 | denisurusov |
| edge:e-drv-cdmdata-closeout | review | proposed | accepted | 2026-11-06T21:53:08Z | ni:///sha-256;CX7Yp0rOWie0v6wc0130XWLZyhAUPeci0y4_wdx18J4 | denisurusov |
| edge:e-drv-finality-closeout | review | proposed | accepted | 2026-11-06T21:53:08Z | ni:///sha-256;CX7Yp0rOWie0v6wc0130XWLZyhAUPeci0y4_wdx18J4 | denisurusov |
| edge:e-drv-cdmdata-consolerules | review | proposed | accepted | 2026-11-06T21:53:08Z | ni:///sha-256;CX7Yp0rOWie0v6wc0130XWLZyhAUPeci0y4_wdx18J4 | denisurusov |
| edge:e-drv-callstate-imseg | review | proposed | accepted | 2026-11-06T21:53:08Z | ni:///sha-256;CX7Yp0rOWie0v6wc0130XWLZyhAUPeci0y4_wdx18J4 | denisurusov |
| edge:e-drv-finality-imseg | review | proposed | accepted | 2026-11-06T21:53:08Z | ni:///sha-256;CX7Yp0rOWie0v6wc0130XWLZyhAUPeci0y4_wdx18J4 | denisurusov |
| edge:e-drv-cdmdata-interestsettle | review | proposed | accepted | 2026-11-06T21:53:08Z | ni:///sha-256;CX7Yp0rOWie0v6wc0130XWLZyhAUPeci0y4_wdx18J4 | denisurusov |
| edge:e-drv-finality-interestsettle | review | proposed | accepted | 2026-11-06T21:53:08Z | ni:///sha-256;CX7Yp0rOWie0v6wc0130XWLZyhAUPeci0y4_wdx18J4 | denisurusov |
| edge:e-drv-cdmdata-interestrules | review | proposed | accepted | 2026-11-06T21:53:08Z | ni:///sha-256;CX7Yp0rOWie0v6wc0130XWLZyhAUPeci0y4_wdx18J4 | denisurusov |
| edge:e-drv-cdmdata-javastack | review | proposed | accepted | 2026-11-06T21:53:08Z | ni:///sha-256;CX7Yp0rOWie0v6wc0130XWLZyhAUPeci0y4_wdx18J4 | denisurusov |
| edge:e-drv-callstate-perparty | review | proposed | accepted | 2026-11-06T21:53:08Z | ni:///sha-256;CX7Yp0rOWie0v6wc0130XWLZyhAUPeci0y4_wdx18J4 | denisurusov |
| edge:e-drv-callstate-reval | review | proposed | accepted | 2026-11-06T21:53:08Z | ni:///sha-256;CX7Yp0rOWie0v6wc0130XWLZyhAUPeci0y4_wdx18J4 | denisurusov |
| edge:e-drv-callstate-subst | review | proposed | accepted | 2026-11-06T21:53:08Z | ni:///sha-256;CX7Yp0rOWie0v6wc0130XWLZyhAUPeci0y4_wdx18J4 | denisurusov |
| edge:e-drv-cdmdata-subst | review | proposed | accepted | 2026-11-06T21:53:08Z | ni:///sha-256;CX7Yp0rOWie0v6wc0130XWLZyhAUPeci0y4_wdx18J4 | denisurusov |
| edge:e-note-adrtrace-jsonsource | review | proposed | accepted | 2026-11-06T21:53:08Z | ni:///sha-256;CX7Yp0rOWie0v6wc0130XWLZyhAUPeci0y4_wdx18J4 | denisurusov |
| node:investigation-adr-asr-traceability | review | proposed | accepted | 2026-11-06T21:53:08Z | ni:///sha-256;CX7Yp0rOWie0v6wc0130XWLZyhAUPeci0y4_wdx18J4 | denisurusov |
| noteworthy:nw-architecture-json-is-source | review | proposed | accepted | 2026-11-06T21:53:08Z | ni:///sha-256;CX7Yp0rOWie0v6wc0130XWLZyhAUPeci0y4_wdx18J4 | denisurusov |
| concept:concept-asr-onchain-feed-scope | review | proposed | accepted | 2026-11-06T22:27:21Z | ni:///sha-256;IwYR6lidfMGSd24IvSEgdTWMkBxXlK-sv69-Rbegj_Q | denisurusov |
| concept:concept-asr-agreement-type-fidelity | review | proposed | accepted | 2026-11-06T22:27:21Z | ni:///sha-256;IwYR6lidfMGSd24IvSEgdTWMkBxXlK-sv69-Rbegj_Q | denisurusov |
| edge:e-drv-feedscope-oracleprices | review | proposed | accepted | 2026-11-06T22:27:21Z | ni:///sha-256;IwYR6lidfMGSd24IvSEgdTWMkBxXlK-sv69-Rbegj_Q | denisurusov |
| edge:e-drv-agreementfidelity-scenariogrid | review | proposed | accepted | 2026-11-06T22:27:21Z | ni:///sha-256;IwYR6lidfMGSd24IvSEgdTWMkBxXlK-sv69-Rbegj_Q | denisurusov |
| node:investigation-adr-asr-traceability | status | active | resolved | 2026-11-06T22:40:11Z | ni:///sha-256;SESoEqm0d_NULN3MMuqEAOOQqc1YOsveFsLK3Kq9Zyg | denisurusov |
| node:task-csa-call-replacement | review |  | proposed | 2026-11-06T21:44:40Z |  |  |
| node:task-csa-call-replacement | status |  | open | 2026-11-06T21:44:40Z |  |  |
| waypoint:wp-adr-replacement-call-link | review |  | proposed | 2026-11-06T21:44:40Z |  |  |
| edge:e-dec-csaext-replacement | review |  | proposed | 2026-11-06T21:44:40Z |  |  |
| edge:e-lnk-cancel-replacement | review |  | proposed | 2026-11-06T21:44:40Z |  |  |
| edge:e-lnk-replacement-smecancel | review |  | proposed | 2026-11-06T21:44:40Z |  |  |
| edge:e-mrk-replacementlink-replacement | review |  | proposed | 2026-11-06T21:44:40Z |  |  |
| node:task-csa-call-replacement | review | proposed | accepted | 2026-11-06T21:53:01Z | ni:///sha-256;frLuD4YY5eeFycI-cY9DgrUdql1QgrPOGk1aBflbLMQ | denisurusov |
| waypoint:wp-adr-replacement-call-link | review | proposed | accepted | 2026-11-06T21:53:01Z | ni:///sha-256;frLuD4YY5eeFycI-cY9DgrUdql1QgrPOGk1aBflbLMQ | denisurusov |
| edge:e-dec-csaext-replacement | review | proposed | accepted | 2026-11-06T21:53:01Z | ni:///sha-256;frLuD4YY5eeFycI-cY9DgrUdql1QgrPOGk1aBflbLMQ | denisurusov |
| edge:e-lnk-cancel-replacement | review | proposed | accepted | 2026-11-06T21:53:01Z | ni:///sha-256;frLuD4YY5eeFycI-cY9DgrUdql1QgrPOGk1aBflbLMQ | denisurusov |
| edge:e-lnk-replacement-smecancel | review | proposed | accepted | 2026-11-06T21:53:01Z | ni:///sha-256;frLuD4YY5eeFycI-cY9DgrUdql1QgrPOGk1aBflbLMQ | denisurusov |
| edge:e-mrk-replacementlink-replacement | review | proposed | accepted | 2026-11-06T21:53:01Z | ni:///sha-256;frLuD4YY5eeFycI-cY9DgrUdql1QgrPOGk1aBflbLMQ | denisurusov |
| node:task-csa-call-replacement | status | open | resolved | 2026-11-06T21:53:01Z | ni:///sha-256;frLuD4YY5eeFycI-cY9DgrUdql1QgrPOGk1aBflbLMQ | denisurusov |
| edge:e-drv-callstate-replacelink | review |  | proposed | 2026-11-06T22:58:01Z |  |  |
| edge:e-drv-cdmdata-replacelink | review |  | proposed | 2026-11-06T22:58:01Z |  |  |
| edge:e-drv-callstate-replacelink | review | proposed | accepted | 2026-11-06T23:02:51Z | ni:///sha-256;ZLijPO_Kb9XsyR6leEA_WCfwGwzXvc-rdIfcSbKIheU | denisurusov |
| edge:e-drv-cdmdata-replacelink | review | proposed | accepted | 2026-11-06T23:02:51Z | ni:///sha-256;ZLijPO_Kb9XsyR6leEA_WCfwGwzXvc-rdIfcSbKIheU | denisurusov |
| waypoint:wp-adr-settlement-netting-scope | review |  | proposed | 2026-11-07T04:24:56Z |  |  |
| node:task-sme-settlement-netting-rules | review |  | proposed | 2026-11-07T04:24:56Z |  |  |
| node:task-sme-settlement-netting-rules | status |  | open | 2026-11-07T04:24:56Z |  |  |
| edge:e-mrk-nettingscope-netting | review |  | proposed | 2026-11-07T04:24:56Z |  |  |
| edge:e-dec-cdmdev-smenetting | review |  | proposed | 2026-11-07T04:24:56Z |  |  |
| edge:e-lnk-netting-smenetting | review |  | proposed | 2026-11-07T04:24:56Z |  |  |
| edge:e-drv-finality-nettingscope | review |  | proposed | 2026-11-07T04:24:56Z |  |  |
| edge:e-drv-callstate-nettingscope | review |  | proposed | 2026-11-07T04:24:56Z |  |  |
| edge:e-drv-cdmdata-nettingscope | review |  | proposed | 2026-11-07T04:24:56Z |  |  |
| waypoint:wp-adr-settlement-netting-scope | review | proposed | accepted | 2026-11-07T04:38:11Z | ni:///sha-256;mv4B4Dkq_68A5HcvKmHBzRZuE5h-odOTDcs4uhA43zM | denisurusov |
| node:task-sme-settlement-netting-rules | review | proposed | accepted | 2026-11-07T04:38:11Z | ni:///sha-256;mv4B4Dkq_68A5HcvKmHBzRZuE5h-odOTDcs4uhA43zM | denisurusov |
| edge:e-mrk-nettingscope-netting | review | proposed | accepted | 2026-11-07T04:38:11Z | ni:///sha-256;mv4B4Dkq_68A5HcvKmHBzRZuE5h-odOTDcs4uhA43zM | denisurusov |
| edge:e-drv-finality-nettingscope | review | proposed | accepted | 2026-11-07T04:38:11Z | ni:///sha-256;mv4B4Dkq_68A5HcvKmHBzRZuE5h-odOTDcs4uhA43zM | denisurusov |
| edge:e-drv-callstate-nettingscope | review | proposed | accepted | 2026-11-07T04:38:11Z | ni:///sha-256;mv4B4Dkq_68A5HcvKmHBzRZuE5h-odOTDcs4uhA43zM | denisurusov |
| edge:e-drv-cdmdata-nettingscope | review | proposed | accepted | 2026-11-07T04:38:11Z | ni:///sha-256;mv4B4Dkq_68A5HcvKmHBzRZuE5h-odOTDcs4uhA43zM | denisurusov |
| edge:e-dec-cdmdev-smenetting | review | proposed | accepted | 2026-11-07T04:38:11Z | ni:///sha-256;mv4B4Dkq_68A5HcvKmHBzRZuE5h-odOTDcs4uhA43zM | denisurusov |
| edge:e-lnk-netting-smenetting | review | proposed | accepted | 2026-11-07T04:38:11Z | ni:///sha-256;mv4B4Dkq_68A5HcvKmHBzRZuE5h-odOTDcs4uhA43zM | denisurusov |
| waypoint:wp-adr-allocation-scope | review |  | proposed | 2026-11-07T13:52:51Z |  |  |
| node:task-sme-allocation-ranking | review |  | proposed | 2026-11-07T13:52:51Z |  |  |
| node:task-sme-allocation-ranking | status |  | open | 2026-11-07T13:52:51Z |  |  |
| edge:e-mrk-allocscope-alloc | review |  | proposed | 2026-11-07T13:52:51Z |  |  |
| edge:e-dec-cdmdev-smealloc | review |  | proposed | 2026-11-07T13:52:51Z |  |  |
| edge:e-lnk-alloc-smealloc | review |  | proposed | 2026-11-07T13:52:51Z |  |  |
| edge:e-drv-cdmdata-allocscope | review |  | proposed | 2026-11-07T13:52:51Z |  |  |
| edge:e-drv-callstate-allocscope | review |  | proposed | 2026-11-07T13:52:51Z |  |  |
| waypoint:wp-adr-allocation-scope | review | proposed | accepted | 2026-11-07T15:58:37Z | ni:///sha-256;WRYqAfJw6337a-JIZ9rjy01H9Pin8v9vppq2pBaycLc | denisurusov |
| edge:e-mrk-allocscope-alloc | review | proposed | accepted | 2026-11-07T15:58:37Z | ni:///sha-256;WRYqAfJw6337a-JIZ9rjy01H9Pin8v9vppq2pBaycLc | denisurusov |
| edge:e-drv-cdmdata-allocscope | review | proposed | accepted | 2026-11-07T15:58:37Z | ni:///sha-256;WRYqAfJw6337a-JIZ9rjy01H9Pin8v9vppq2pBaycLc | denisurusov |
| edge:e-drv-callstate-allocscope | review | proposed | accepted | 2026-11-07T15:58:37Z | ni:///sha-256;WRYqAfJw6337a-JIZ9rjy01H9Pin8v9vppq2pBaycLc | denisurusov |
| node:task-sme-allocation-ranking | review | proposed | accepted | 2026-11-07T15:58:48Z | ni:///sha-256;WRYqAfJw6337a-JIZ9rjy01H9Pin8v9vppq2pBaycLc | denisurusov |
| edge:e-dec-cdmdev-smealloc | review | proposed | accepted | 2026-11-07T15:58:48Z | ni:///sha-256;WRYqAfJw6337a-JIZ9rjy01H9Pin8v9vppq2pBaycLc | denisurusov |
| edge:e-lnk-alloc-smealloc | review | proposed | accepted | 2026-11-07T15:58:48Z | ni:///sha-256;WRYqAfJw6337a-JIZ9rjy01H9Pin8v9vppq2pBaycLc | denisurusov |
| node:task-csa-allocation | status | open | resolved | 2026-11-07T18:15:45Z | ni:///sha-256;Oa0dMHG1Hg3O2O3axwEBMJk0_uAHOLaCAJPS7qA2CIU | denisurusov |
| node:task-sme-allocation-concentration | review |  | proposed | 2026-11-07T18:27:28Z |  |  |
| node:task-sme-allocation-concentration | status |  | open | 2026-11-07T18:27:28Z |  |  |
| node:task-csa-allocation-optimisation | review |  | proposed | 2026-11-07T18:27:28Z |  |  |
| node:task-csa-allocation-optimisation | status |  | open | 2026-11-07T18:27:28Z |  |  |
| node:task-live-spec-duration | review |  | proposed | 2026-11-07T18:27:28Z |  |  |
| node:task-live-spec-duration | status |  | open | 2026-11-07T18:27:28Z |  |  |
| edge:e-dec-cdmdev-smeallocconc | review |  | proposed | 2026-11-07T18:27:28Z |  |  |
| edge:e-lnk-alloc-smeallocconc | review |  | proposed | 2026-11-07T18:27:28Z |  |  |
| edge:e-dec-csaext-allocopt | review |  | proposed | 2026-11-07T18:27:28Z |  |  |
| edge:e-lnk-alloc-allocopt | review |  | proposed | 2026-11-07T18:27:28Z |  |  |
| edge:e-dec-e2eflow-specduration | review |  | proposed | 2026-11-07T18:27:28Z |  |  |
| edge:e-lnk-cilivestack-specduration | review |  | proposed | 2026-11-07T18:27:28Z |  |  |
| node:task-sme-allocation-concentration | review | proposed | accepted | 2026-11-07T18:32:00Z | ni:///sha-256;SzrvQxVbQABBvGK9yUvg0VNYdk16uH43Zu3xJVKytmg | denisurusov |
| node:task-csa-allocation-optimisation | review | proposed | accepted | 2026-11-07T18:32:00Z | ni:///sha-256;SzrvQxVbQABBvGK9yUvg0VNYdk16uH43Zu3xJVKytmg | denisurusov |
| node:task-live-spec-duration | review | proposed | accepted | 2026-11-07T18:32:00Z | ni:///sha-256;SzrvQxVbQABBvGK9yUvg0VNYdk16uH43Zu3xJVKytmg | denisurusov |
| edge:e-dec-cdmdev-smeallocconc | review | proposed | accepted | 2026-11-07T18:32:00Z | ni:///sha-256;SzrvQxVbQABBvGK9yUvg0VNYdk16uH43Zu3xJVKytmg | denisurusov |
| edge:e-lnk-alloc-smeallocconc | review | proposed | accepted | 2026-11-07T18:32:00Z | ni:///sha-256;SzrvQxVbQABBvGK9yUvg0VNYdk16uH43Zu3xJVKytmg | denisurusov |
| edge:e-dec-csaext-allocopt | review | proposed | accepted | 2026-11-07T18:32:00Z | ni:///sha-256;SzrvQxVbQABBvGK9yUvg0VNYdk16uH43Zu3xJVKytmg | denisurusov |
| edge:e-lnk-alloc-allocopt | review | proposed | accepted | 2026-11-07T18:32:00Z | ni:///sha-256;SzrvQxVbQABBvGK9yUvg0VNYdk16uH43Zu3xJVKytmg | denisurusov |
| edge:e-dec-e2eflow-specduration | review | proposed | accepted | 2026-11-07T18:32:00Z | ni:///sha-256;SzrvQxVbQABBvGK9yUvg0VNYdk16uH43Zu3xJVKytmg | denisurusov |
| edge:e-lnk-cilivestack-specduration | review | proposed | accepted | 2026-11-07T18:32:00Z | ni:///sha-256;SzrvQxVbQABBvGK9yUvg0VNYdk16uH43Zu3xJVKytmg | denisurusov |
| waypoint:wp-adr-reconciliation-scope | review |  | proposed | 2026-11-07T18:37:24Z |  |  |
| node:task-sme-reconciliation-rules | review |  | proposed | 2026-11-07T18:37:24Z |  |  |
| node:task-sme-reconciliation-rules | status |  | open | 2026-11-07T18:37:24Z |  |  |
| edge:e-mrk-reconscope-recon | review |  | proposed | 2026-11-07T18:37:24Z |  |  |
| edge:e-dec-cdmdev-smerecon | review |  | proposed | 2026-11-07T18:37:24Z |  |  |
| edge:e-lnk-recon-smerecon | review |  | proposed | 2026-11-07T18:37:24Z |  |  |
| edge:e-drv-cdmdata-reconscope | review |  | proposed | 2026-11-07T18:37:24Z |  |  |
| edge:e-drv-callstate-reconscope | review |  | proposed | 2026-11-07T18:37:24Z |  |  |
| edge:e-drv-offchaindispute-reconscope | review |  | proposed | 2026-11-07T18:37:24Z |  |  |
| waypoint:wp-adr-reconciliation-scope | review | proposed | accepted | 2026-11-07T18:41:40Z | ni:///sha-256;M0G1-14smIN9vh9ljGOZG4gADgm4w-IadRLFAwNypxc | denisurusov |
| node:task-sme-reconciliation-rules | review | proposed | accepted | 2026-11-07T18:41:40Z | ni:///sha-256;M0G1-14smIN9vh9ljGOZG4gADgm4w-IadRLFAwNypxc | denisurusov |
| edge:e-mrk-reconscope-recon | review | proposed | accepted | 2026-11-07T18:41:40Z | ni:///sha-256;M0G1-14smIN9vh9ljGOZG4gADgm4w-IadRLFAwNypxc | denisurusov |
| edge:e-dec-cdmdev-smerecon | review | proposed | accepted | 2026-11-07T18:41:40Z | ni:///sha-256;M0G1-14smIN9vh9ljGOZG4gADgm4w-IadRLFAwNypxc | denisurusov |
| edge:e-lnk-recon-smerecon | review | proposed | accepted | 2026-11-07T18:41:40Z | ni:///sha-256;M0G1-14smIN9vh9ljGOZG4gADgm4w-IadRLFAwNypxc | denisurusov |
| edge:e-drv-cdmdata-reconscope | review | proposed | accepted | 2026-11-07T18:41:40Z | ni:///sha-256;M0G1-14smIN9vh9ljGOZG4gADgm4w-IadRLFAwNypxc | denisurusov |
| edge:e-drv-callstate-reconscope | review | proposed | accepted | 2026-11-07T18:41:40Z | ni:///sha-256;M0G1-14smIN9vh9ljGOZG4gADgm4w-IadRLFAwNypxc | denisurusov |
| edge:e-drv-offchaindispute-reconscope | review | proposed | accepted | 2026-11-07T18:41:40Z | ni:///sha-256;M0G1-14smIN9vh9ljGOZG4gADgm4w-IadRLFAwNypxc | denisurusov |
| node:task-gateway-receipt-poll | review |  | proposed | 2026-11-07T18:54:12Z |  |  |
| node:task-gateway-receipt-poll | status |  | open | 2026-11-07T18:54:12Z |  |  |
| node:task-live-read-latency | review |  | proposed | 2026-11-07T18:54:12Z |  |  |
| node:task-live-read-latency | status |  | open | 2026-11-07T18:54:12Z |  |  |
| node:task-test-chain-block-period | review |  | proposed | 2026-11-07T18:54:12Z |  |  |
| node:task-test-chain-block-period | status |  | open | 2026-11-07T18:54:12Z |  |  |
| edge:e-dec-specduration-receiptpoll | review |  | proposed | 2026-11-07T18:54:12Z |  |  |
| edge:e-dec-specduration-readlatency | review |  | proposed | 2026-11-07T18:54:12Z |  |  |
| edge:e-dec-specduration-blockperiod | review |  | proposed | 2026-11-07T18:54:12Z |  |  |
| node:task-gateway-receipt-poll | review | proposed | accepted | 2026-11-07T19:57:56Z | ni:///sha-256;XjwbwOWVc2LofUyVTnQSRxi5nSgtPg6iRuIx47eH98U | denisurusov |
| node:task-live-read-latency | review | proposed | accepted | 2026-11-07T19:57:56Z | ni:///sha-256;XjwbwOWVc2LofUyVTnQSRxi5nSgtPg6iRuIx47eH98U | denisurusov |
| node:task-test-chain-block-period | review | proposed | accepted | 2026-11-07T19:57:56Z | ni:///sha-256;XjwbwOWVc2LofUyVTnQSRxi5nSgtPg6iRuIx47eH98U | denisurusov |
| edge:e-dec-specduration-receiptpoll | review | proposed | accepted | 2026-11-07T19:57:56Z | ni:///sha-256;XjwbwOWVc2LofUyVTnQSRxi5nSgtPg6iRuIx47eH98U | denisurusov |
| edge:e-dec-specduration-readlatency | review | proposed | accepted | 2026-11-07T19:57:56Z | ni:///sha-256;XjwbwOWVc2LofUyVTnQSRxi5nSgtPg6iRuIx47eH98U | denisurusov |
| edge:e-dec-specduration-blockperiod | review | proposed | accepted | 2026-11-07T19:57:56Z | ni:///sha-256;XjwbwOWVc2LofUyVTnQSRxi5nSgtPg6iRuIx47eH98U | denisurusov |
| node:task-csa-reconciliation | status | open | resolved | 2026-11-07T20:11:29Z | ni:///sha-256;XjwbwOWVc2LofUyVTnQSRxi5nSgtPg6iRuIx47eH98U | denisurusov |
| node:task-live-test-balances | review |  | proposed | 2026-11-07T20:46:35Z |  |  |
| node:task-live-test-balances | status |  | open | 2026-11-07T20:46:35Z |  |  |
| edge:e-lnk-receiptpoll-testbalances | review |  | proposed | 2026-11-07T20:46:35Z |  |  |
| node:task-gateway-receipt-poll | status | open | resolved | 2026-11-07T20:52:50Z | ni:///sha-256;tKFJ_4yIk2aogFHn4ZLuuJ-bSGdBuSOv0e3d8hwKxag | denisurusov |
| node:task-live-test-balances | review | proposed | accepted | 2026-11-07T20:52:50Z | ni:///sha-256;tKFJ_4yIk2aogFHn4ZLuuJ-bSGdBuSOv0e3d8hwKxag | denisurusov |
| edge:e-lnk-receiptpoll-testbalances | review | proposed | accepted | 2026-11-07T20:52:50Z | ni:///sha-256;tKFJ_4yIk2aogFHn4ZLuuJ-bSGdBuSOv0e3d8hwKxag | denisurusov |
| node:task-live-read-latency | status | open | resolved | 2026-11-07T21:14:36Z | ni:///sha-256;WbwOL4zlZ5_ooWTkkzkHQKDCrh9EPVlWuWR48OaLwHI | denisurusov |
| node:task-live-test-balances | status | open | resolved | 2026-11-07T21:14:36Z | ni:///sha-256;WbwOL4zlZ5_ooWTkkzkHQKDCrh9EPVlWuWR48OaLwHI | denisurusov |
| node:task-csa-settlement-netting | status | open | resolved | 2026-11-07T21:16:04Z |  | denisurusov |
| node:task-csa-workflow-extensions | status | open | resolved | 2026-11-07T21:18:31Z | ni:///sha-256;-rHL6YMiFYpb2sOAVi6xX3pAjLv0AlE6hSqEy143w9k | denisurusov |
| waypoint:wp-adr-two-way-im | review |  | proposed | 2026-11-07T21:24:29Z |  |  |
| node:task-sme-two-way-im-rules | review |  | proposed | 2026-11-07T21:24:29Z |  |  |
| edge:e-mrk-twowayimadr-twowayim | review |  | proposed | 2026-11-07T21:24:29Z |  |  |
| edge:e-drv-callstate-twowayimadr | review |  | proposed | 2026-11-07T21:24:29Z |  |  |
| edge:e-drv-finality-twowayimadr | review |  | proposed | 2026-11-07T21:24:29Z |  |  |
| edge:e-dec-cdmdev-smetwowayim | review |  | proposed | 2026-11-07T21:24:29Z |  |  |
| edge:e-lnk-twowayim-smetwowayim | review |  | proposed | 2026-11-07T21:24:29Z |  |  |
| node:task-sme-two-way-im-rules | status |  | open | 2026-11-07T21:24:29Z |  |  |
| waypoint:wp-adr-two-way-im | review | proposed | accepted | 2026-11-07T21:58:01Z | ni:///sha-256;cpnFE5lngiBHV0oPoeTHKWyHow4Rs9GP_59u678yC6Y | denisurusov |
| node:task-sme-two-way-im-rules | review | proposed | accepted | 2026-11-07T21:58:01Z | ni:///sha-256;cpnFE5lngiBHV0oPoeTHKWyHow4Rs9GP_59u678yC6Y | denisurusov |
| edge:e-mrk-twowayimadr-twowayim | review | proposed | accepted | 2026-11-07T21:58:01Z | ni:///sha-256;cpnFE5lngiBHV0oPoeTHKWyHow4Rs9GP_59u678yC6Y | denisurusov |
| edge:e-drv-callstate-twowayimadr | review | proposed | accepted | 2026-11-07T21:58:01Z | ni:///sha-256;cpnFE5lngiBHV0oPoeTHKWyHow4Rs9GP_59u678yC6Y | denisurusov |
| edge:e-drv-finality-twowayimadr | review | proposed | accepted | 2026-11-07T21:58:01Z | ni:///sha-256;cpnFE5lngiBHV0oPoeTHKWyHow4Rs9GP_59u678yC6Y | denisurusov |
| edge:e-dec-cdmdev-smetwowayim | review | proposed | accepted | 2026-11-07T21:58:01Z | ni:///sha-256;cpnFE5lngiBHV0oPoeTHKWyHow4Rs9GP_59u678yC6Y | denisurusov |
| edge:e-lnk-twowayim-smetwowayim | review | proposed | accepted | 2026-11-07T21:58:01Z | ni:///sha-256;cpnFE5lngiBHV0oPoeTHKWyHow4Rs9GP_59u678yC6Y | denisurusov |
| node:task-two-way-initial-margin | status | open | resolved | 2026-11-07T21:58:01Z | ni:///sha-256;cpnFE5lngiBHV0oPoeTHKWyHow4Rs9GP_59u678yC6Y | denisurusov |
| node:task-konspekt-checkpoint-adoption | review |  | proposed | 2026-11-07T22:13:30Z |  |  |
| node:task-konspekt-checkpoint-adoption | status |  | open | 2026-11-07T22:13:30Z |  |  |
| edge:e-dec-konspektadopt-checkpoint | review |  | proposed | 2026-11-07T22:13:30Z |  |  |
| node:task-konspekt-checkpoint-adoption | review | proposed | accepted | 2026-11-07T22:31:16Z | ni:///sha-256;pOvpiwfW75w13-BKS9N4TLl31R8zISoEgocsZhcRFEk | denisurusov |
| edge:e-dec-konspektadopt-checkpoint | review | proposed | accepted | 2026-11-07T22:31:16Z | ni:///sha-256;pOvpiwfW75w13-BKS9N4TLl31R8zISoEgocsZhcRFEk | denisurusov |
| waypoint:wp-adr-repo-gmra-scope | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| node:task-repo-gmra-terms | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| node:task-repo-gmra-terms | status |  | open | 2026-11-07T22:35:17Z |  |  |
| node:task-repo-purchase-repurchase | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| node:task-repo-purchase-repurchase | status |  | open | 2026-11-07T22:35:17Z |  |  |
| node:task-repo-margin-maintenance | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| node:task-repo-margin-maintenance | status |  | open | 2026-11-07T22:35:17Z |  |  |
| node:task-repo-reprice | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| node:task-repo-reprice | status |  | open | 2026-11-07T22:35:17Z |  |  |
| node:task-repo-adjustment | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| node:task-repo-adjustment | status |  | open | 2026-11-07T22:35:17Z |  |  |
| node:task-repo-substitution | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| node:task-repo-substitution | status |  | open | 2026-11-07T22:35:17Z |  |  |
| node:task-repo-income | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| node:task-repo-income | status |  | open | 2026-11-07T22:35:17Z |  |  |
| node:task-repo-roll | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| node:task-repo-roll | status |  | open | 2026-11-07T22:35:17Z |  |  |
| node:task-repo-pair-off | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| node:task-repo-pair-off | status |  | open | 2026-11-07T22:35:17Z |  |  |
| node:task-repo-buy-sell-back | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| node:task-repo-buy-sell-back | status |  | open | 2026-11-07T22:35:17Z |  |  |
| edge:e-mrk-repogmrascope-repogmra | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| edge:e-drv-cdmdata-repogmrascope | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| edge:e-drv-finality-repogmrascope | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| edge:e-dec-repogmra-gmraterms | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| edge:e-dec-repogmra-purchaserepurchase | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| edge:e-dec-repogmra-marginmaintenance | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| edge:e-dec-repogmra-reprice | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| edge:e-dec-repogmra-adjustment | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| edge:e-dec-repogmra-substitution | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| edge:e-dec-repogmra-income | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| edge:e-dec-repogmra-roll | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| edge:e-dec-repogmra-pairoff | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| edge:e-dec-repogmra-buysellback | review |  | proposed | 2026-11-07T22:35:17Z |  |  |
| waypoint:wp-adr-repo-gmra-scope | review | proposed | accepted | 2026-11-07T23:09:48Z |  | denisurusov |
| edge:e-mrk-repogmrascope-repogmra | review | proposed | accepted | 2026-11-07T23:09:48Z |  | denisurusov |
| edge:e-drv-cdmdata-repogmrascope | review | proposed | accepted | 2026-11-07T23:09:48Z |  | denisurusov |
| edge:e-drv-finality-repogmrascope | review | proposed | accepted | 2026-11-07T23:09:48Z |  | denisurusov |
| node:task-repo-gmra-terms | review | proposed | accepted | 2026-11-07T23:10:06Z |  | denisurusov |
| edge:e-dec-repogmra-gmraterms | review | proposed | accepted | 2026-11-07T23:10:06Z |  | denisurusov |
| node:task-repo-purchase-repurchase | review | proposed | accepted | 2026-11-07T23:11:58Z | ni:///sha-256;BIF4dmgyCdmUYojMM4HZtXftf2gydNcmW8j09mtyZ8A | denisurusov |
| edge:e-dec-repogmra-purchaserepurchase | review | proposed | accepted | 2026-11-07T23:11:58Z | ni:///sha-256;BIF4dmgyCdmUYojMM4HZtXftf2gydNcmW8j09mtyZ8A | denisurusov |
| node:task-repo-margin-maintenance | review | proposed | accepted | 2026-11-07T23:11:58Z | ni:///sha-256;BIF4dmgyCdmUYojMM4HZtXftf2gydNcmW8j09mtyZ8A | denisurusov |
| edge:e-dec-repogmra-marginmaintenance | review | proposed | accepted | 2026-11-07T23:11:58Z | ni:///sha-256;BIF4dmgyCdmUYojMM4HZtXftf2gydNcmW8j09mtyZ8A | denisurusov |
| node:task-repo-reprice | review | proposed | accepted | 2026-11-07T23:11:58Z | ni:///sha-256;BIF4dmgyCdmUYojMM4HZtXftf2gydNcmW8j09mtyZ8A | denisurusov |
| edge:e-dec-repogmra-reprice | review | proposed | accepted | 2026-11-07T23:11:58Z | ni:///sha-256;BIF4dmgyCdmUYojMM4HZtXftf2gydNcmW8j09mtyZ8A | denisurusov |
| node:task-repo-adjustment | review | proposed | accepted | 2026-11-07T23:11:58Z | ni:///sha-256;BIF4dmgyCdmUYojMM4HZtXftf2gydNcmW8j09mtyZ8A | denisurusov |
| edge:e-dec-repogmra-adjustment | review | proposed | accepted | 2026-11-07T23:11:58Z | ni:///sha-256;BIF4dmgyCdmUYojMM4HZtXftf2gydNcmW8j09mtyZ8A | denisurusov |
| node:task-repo-substitution | review | proposed | accepted | 2026-11-07T23:11:58Z | ni:///sha-256;BIF4dmgyCdmUYojMM4HZtXftf2gydNcmW8j09mtyZ8A | denisurusov |
| edge:e-dec-repogmra-substitution | review | proposed | accepted | 2026-11-07T23:11:58Z | ni:///sha-256;BIF4dmgyCdmUYojMM4HZtXftf2gydNcmW8j09mtyZ8A | denisurusov |
| node:task-repo-income | review | proposed | accepted | 2026-11-07T23:11:58Z | ni:///sha-256;BIF4dmgyCdmUYojMM4HZtXftf2gydNcmW8j09mtyZ8A | denisurusov |
| edge:e-dec-repogmra-income | review | proposed | accepted | 2026-11-07T23:11:58Z | ni:///sha-256;BIF4dmgyCdmUYojMM4HZtXftf2gydNcmW8j09mtyZ8A | denisurusov |
| node:task-repo-roll | review | proposed | accepted | 2026-11-07T23:11:58Z | ni:///sha-256;BIF4dmgyCdmUYojMM4HZtXftf2gydNcmW8j09mtyZ8A | denisurusov |
| edge:e-dec-repogmra-roll | review | proposed | accepted | 2026-11-07T23:11:58Z | ni:///sha-256;BIF4dmgyCdmUYojMM4HZtXftf2gydNcmW8j09mtyZ8A | denisurusov |
| node:task-repo-pair-off | review | proposed | accepted | 2026-11-07T23:11:58Z | ni:///sha-256;BIF4dmgyCdmUYojMM4HZtXftf2gydNcmW8j09mtyZ8A | denisurusov |
| edge:e-dec-repogmra-pairoff | review | proposed | accepted | 2026-11-07T23:11:58Z | ni:///sha-256;BIF4dmgyCdmUYojMM4HZtXftf2gydNcmW8j09mtyZ8A | denisurusov |
| node:task-repo-buy-sell-back | review | proposed | accepted | 2026-11-07T23:11:58Z | ni:///sha-256;BIF4dmgyCdmUYojMM4HZtXftf2gydNcmW8j09mtyZ8A | denisurusov |
| edge:e-dec-repogmra-buysellback | review | proposed | accepted | 2026-11-07T23:11:58Z | ni:///sha-256;BIF4dmgyCdmUYojMM4HZtXftf2gydNcmW8j09mtyZ8A | denisurusov |
| node:task-repo-default-close-out | review |  | proposed | 2026-11-07T23:11:58Z |  |  |
| node:task-repo-default-close-out | status |  | open | 2026-11-07T23:11:58Z |  |  |
| edge:e-dec-repogmra-defaultcloseout | review |  | proposed | 2026-11-07T23:11:58Z |  |  |
| node:task-repo-default-close-out | review | proposed | accepted | 2026-11-07T23:13:00Z |  | denisurusov |
| edge:e-dec-repogmra-defaultcloseout | review | proposed | accepted | 2026-11-07T23:13:00Z |  | denisurusov |
| noteworthy:nw-e2e-first-cycle-scope | review | proposed | accepted | 2026-11-07T23:13:17Z |  | denisurusov |
| waypoint:wp-adr-repo-gmra-terms | review |  | proposed | 2026-11-07T23:26:59Z |  |  |
| edge:e-mrk-gmratermsadr-gmraterms | review |  | proposed | 2026-11-07T23:26:59Z |  |  |
| edge:e-drv-cdmdata-gmratermsadr | review |  | proposed | 2026-11-07T23:26:59Z |  |  |
| edge:e-drv-finality-gmratermsadr | review |  | proposed | 2026-11-07T23:26:59Z |  |  |
| waypoint:wp-adr-repo-gmra-terms | review | proposed | accepted | 2026-11-08T00:01:49Z |  | denisurusov |
| edge:e-mrk-gmratermsadr-gmraterms | review | proposed | accepted | 2026-11-08T00:01:49Z |  | denisurusov |
| edge:e-drv-cdmdata-gmratermsadr | review | proposed | accepted | 2026-11-08T00:01:49Z |  | denisurusov |
| edge:e-drv-finality-gmratermsadr | review | proposed | accepted | 2026-11-08T00:01:49Z |  | denisurusov |
| node:task-repo-gmra-terms | status | open | resolved | 2026-11-08T00:02:30Z |  | denisurusov |
| waypoint:wp-adr-repo-purchase-repurchase | review |  | proposed | 2026-11-08T01:23:33Z |  |  |
| edge:e-mrk-repopradr-purchaserepurchase | review |  | proposed | 2026-11-08T01:23:33Z |  |  |
| edge:e-drv-cdmdata-repopradr | review |  | proposed | 2026-11-08T01:23:33Z |  |  |
| edge:e-drv-finality-repopradr | review |  | proposed | 2026-11-08T01:23:33Z |  |  |
| waypoint:wp-adr-repo-purchase-repurchase | review | proposed | accepted | 2026-11-08T01:55:28Z | ni:///sha-256;6T7pYG_ROggccY5wOMOjf-0hseF-M_fzEHQsicDiSfU | denisurusov |
| edge:e-mrk-repopradr-purchaserepurchase | review | proposed | accepted | 2026-11-08T01:55:28Z | ni:///sha-256;6T7pYG_ROggccY5wOMOjf-0hseF-M_fzEHQsicDiSfU | denisurusov |
| edge:e-drv-cdmdata-repopradr | review | proposed | accepted | 2026-11-08T01:55:28Z | ni:///sha-256;6T7pYG_ROggccY5wOMOjf-0hseF-M_fzEHQsicDiSfU | denisurusov |
| edge:e-drv-finality-repopradr | review | proposed | accepted | 2026-11-08T01:55:28Z | ni:///sha-256;6T7pYG_ROggccY5wOMOjf-0hseF-M_fzEHQsicDiSfU | denisurusov |
| node:task-repo-purchase-repurchase | status | open | resolved | 2026-11-08T01:55:28Z | ni:///sha-256;6T7pYG_ROggccY5wOMOjf-0hseF-M_fzEHQsicDiSfU | denisurusov |
| waypoint:wp-adr-repo-margin-maintenance | review |  | proposed | 2026-11-08T14:35:55Z |  |  |
| edge:e-mrk-repomarginadr-marginmaint | review |  | proposed | 2026-11-08T14:35:55Z |  |  |
| edge:e-drv-cdmdata-repomarginadr | review |  | proposed | 2026-11-08T14:35:55Z |  |  |
| edge:e-drv-finality-repomarginadr | review |  | proposed | 2026-11-08T14:35:55Z |  |  |
| edge:e-drv-callstate-repomarginadr | review |  | proposed | 2026-11-08T14:35:55Z |  |  |
| waypoint:wp-adr-repo-margin-maintenance | review | proposed | accepted | 2026-11-08T14:58:07Z | ni:///sha-256;DVI37LCvFDCXGVR2AhM7BTgkWX1L0cIbDe3tZK4IC00 | denisurusov |
| edge:e-mrk-repomarginadr-marginmaint | review | proposed | accepted | 2026-11-08T14:58:07Z | ni:///sha-256;DVI37LCvFDCXGVR2AhM7BTgkWX1L0cIbDe3tZK4IC00 | denisurusov |
| edge:e-drv-cdmdata-repomarginadr | review | proposed | accepted | 2026-11-08T14:58:07Z | ni:///sha-256;DVI37LCvFDCXGVR2AhM7BTgkWX1L0cIbDe3tZK4IC00 | denisurusov |
| edge:e-drv-finality-repomarginadr | review | proposed | accepted | 2026-11-08T14:58:07Z | ni:///sha-256;DVI37LCvFDCXGVR2AhM7BTgkWX1L0cIbDe3tZK4IC00 | denisurusov |
| edge:e-drv-callstate-repomarginadr | review | proposed | accepted | 2026-11-08T14:58:07Z | ni:///sha-256;DVI37LCvFDCXGVR2AhM7BTgkWX1L0cIbDe3tZK4IC00 | denisurusov |
| node:task-sme-repo-margin-exposure | review |  | proposed | 2026-11-08T14:58:07Z |  |  |
| node:task-sme-repo-margin-exposure | status |  | open | 2026-11-08T14:58:07Z |  |  |
| node:task-sme-repo-live-spec-returns | review |  | proposed | 2026-11-08T14:58:07Z |  |  |
| node:task-sme-repo-live-spec-returns | status |  | open | 2026-11-08T14:58:07Z |  |  |
| edge:e-dec-cdmdev-smerepomargin | review |  | proposed | 2026-11-08T14:58:07Z |  |  |
| edge:e-lnk-repomargin-smerepomargin | review |  | proposed | 2026-11-08T14:58:07Z |  |  |
| edge:e-dec-cdmdev-smerepolivespec | review |  | proposed | 2026-11-08T14:58:07Z |  |  |
| edge:e-lnk-repopr-smerepolivespec | review |  | proposed | 2026-11-08T14:58:07Z |  |  |
| node:task-sme-repo-margin-exposure | review | proposed | accepted | 2026-11-08T15:00:04Z |  | denisurusov |
| edge:e-dec-cdmdev-smerepomargin | review | proposed | accepted | 2026-11-08T15:00:04Z |  | denisurusov |
| edge:e-lnk-repomargin-smerepomargin | review | proposed | accepted | 2026-11-08T15:00:04Z |  | denisurusov |
| node:task-sme-repo-live-spec-returns | review | proposed | accepted | 2026-11-08T15:00:21Z |  | denisurusov |
| edge:e-dec-cdmdev-smerepolivespec | review | proposed | accepted | 2026-11-08T15:00:21Z |  | denisurusov |
| edge:e-lnk-repopr-smerepolivespec | review | proposed | accepted | 2026-11-08T15:00:21Z |  | denisurusov |
| node:task-repo-margin-maintenance | status | open | resolved | 2026-11-08T15:44:59Z | ni:///sha-256;0XwMxIh9xIcBADxSUUXaj1K3R42WT6lvbXv_DyjidyY | denisurusov |
| waypoint:wp-adr-repo-reprice | review |  | proposed | 2026-11-08T15:59:51Z |  |  |
| node:task-sme-repo-reprice-rules | review |  | proposed | 2026-11-08T15:59:51Z |  |  |
| node:task-sme-repo-reprice-rules | status |  | open | 2026-11-08T15:59:51Z |  |  |
| edge:e-mrk-repricadr-reprice | review |  | proposed | 2026-11-08T15:59:51Z |  |  |
| edge:e-drv-cdmdata-repricadr | review |  | proposed | 2026-11-08T15:59:51Z |  |  |
| edge:e-drv-finality-repricadr | review |  | proposed | 2026-11-08T15:59:51Z |  |  |
| edge:e-dec-cdmdev-smereprice | review |  | proposed | 2026-11-08T15:59:51Z |  |  |
| edge:e-lnk-reprice-smereprice | review |  | proposed | 2026-11-08T15:59:51Z |  |  |
| waypoint:wp-adr-repo-reprice | review | proposed | accepted | 2026-11-08T16:33:21Z | ni:///sha-256;bIoiWZfNFjytgtXLxGuz8-lQ71jLtBpJzUdKbq_McBQ | denisurusov |
| node:task-sme-repo-reprice-rules | review | proposed | accepted | 2026-11-08T16:33:21Z | ni:///sha-256;bIoiWZfNFjytgtXLxGuz8-lQ71jLtBpJzUdKbq_McBQ | denisurusov |
| edge:e-mrk-repricadr-reprice | review | proposed | accepted | 2026-11-08T16:33:21Z | ni:///sha-256;bIoiWZfNFjytgtXLxGuz8-lQ71jLtBpJzUdKbq_McBQ | denisurusov |
| edge:e-drv-cdmdata-repricadr | review | proposed | accepted | 2026-11-08T16:33:21Z | ni:///sha-256;bIoiWZfNFjytgtXLxGuz8-lQ71jLtBpJzUdKbq_McBQ | denisurusov |
| edge:e-drv-finality-repricadr | review | proposed | accepted | 2026-11-08T16:33:21Z | ni:///sha-256;bIoiWZfNFjytgtXLxGuz8-lQ71jLtBpJzUdKbq_McBQ | denisurusov |
| edge:e-dec-cdmdev-smereprice | review | proposed | accepted | 2026-11-08T16:33:21Z | ni:///sha-256;bIoiWZfNFjytgtXLxGuz8-lQ71jLtBpJzUdKbq_McBQ | denisurusov |
| edge:e-lnk-reprice-smereprice | review | proposed | accepted | 2026-11-08T16:33:21Z | ni:///sha-256;bIoiWZfNFjytgtXLxGuz8-lQ71jLtBpJzUdKbq_McBQ | denisurusov |
| node:task-repo-reprice | status | open | resolved | 2026-11-08T17:11:10Z | ni:///sha-256;HtJUHt00OZLpYZ75fHIKG_hY5xKpXODbaJk5opjShRs | denisurusov |
| waypoint:wp-adr-repo-adjustment | review |  | proposed | 2026-11-08T17:19:27Z |  |  |
| node:task-sme-repo-adjustment-rules | review |  | proposed | 2026-11-08T17:19:27Z |  |  |
| node:task-sme-repo-adjustment-rules | status |  | open | 2026-11-08T17:19:27Z |  |  |
| edge:e-mrk-adjadr-adjustment | review |  | proposed | 2026-11-08T17:19:27Z |  |  |
| edge:e-drv-cdmdata-adjadr | review |  | proposed | 2026-11-08T17:19:27Z |  |  |
| edge:e-drv-finality-adjadr | review |  | proposed | 2026-11-08T17:19:27Z |  |  |
| edge:e-dec-cdmdev-smeadjust | review |  | proposed | 2026-11-08T17:19:27Z |  |  |
| edge:e-lnk-adjust-smeadjust | review |  | proposed | 2026-11-08T17:19:27Z |  |  |
| waypoint:wp-adr-repo-adjustment | review | proposed | accepted | 2026-11-08T19:12:04Z | ni:///sha-256;dT96sDyq06RKq4dp_3H3GRB9xxfD0DWLtQQkIdBH3vI | denisurusov |
| node:task-sme-repo-adjustment-rules | review | proposed | accepted | 2026-11-08T19:12:04Z | ni:///sha-256;dT96sDyq06RKq4dp_3H3GRB9xxfD0DWLtQQkIdBH3vI | denisurusov |
| edge:e-mrk-adjadr-adjustment | review | proposed | accepted | 2026-11-08T19:12:04Z | ni:///sha-256;dT96sDyq06RKq4dp_3H3GRB9xxfD0DWLtQQkIdBH3vI | denisurusov |
| edge:e-drv-cdmdata-adjadr | review | proposed | accepted | 2026-11-08T19:12:04Z | ni:///sha-256;dT96sDyq06RKq4dp_3H3GRB9xxfD0DWLtQQkIdBH3vI | denisurusov |
| edge:e-drv-finality-adjadr | review | proposed | accepted | 2026-11-08T19:12:04Z | ni:///sha-256;dT96sDyq06RKq4dp_3H3GRB9xxfD0DWLtQQkIdBH3vI | denisurusov |
| edge:e-dec-cdmdev-smeadjust | review | proposed | accepted | 2026-11-08T19:12:04Z | ni:///sha-256;dT96sDyq06RKq4dp_3H3GRB9xxfD0DWLtQQkIdBH3vI | denisurusov |
| edge:e-lnk-adjust-smeadjust | review | proposed | accepted | 2026-11-08T19:12:04Z | ni:///sha-256;dT96sDyq06RKq4dp_3H3GRB9xxfD0DWLtQQkIdBH3vI | denisurusov |
| node:task-repo-adjustment | status | open | resolved | 2026-11-08T19:31:43Z | ni:///sha-256;s8f1JxGmTxZClRLUJL8wOpLwm47ySoEXR7NHcAmvQ30 | denisurusov |
| waypoint:wp-adr-repo-substitution | review |  | proposed | 2026-11-08T19:59:37Z |  |  |
| node:task-sme-repo-substitution-rules | review |  | proposed | 2026-11-08T19:59:37Z |  |  |
| node:task-sme-repo-substitution-rules | status |  | open | 2026-11-08T19:59:37Z |  |  |
| edge:e-mrk-subadr-substitution | review |  | proposed | 2026-11-08T19:59:37Z |  |  |
| edge:e-drv-cdmdata-subadr | review |  | proposed | 2026-11-08T19:59:37Z |  |  |
| edge:e-drv-finality-subadr | review |  | proposed | 2026-11-08T19:59:37Z |  |  |
| edge:e-dec-cdmdev-smesubst | review |  | proposed | 2026-11-08T19:59:37Z |  |  |
| edge:e-lnk-subst-smesubst | review |  | proposed | 2026-11-08T19:59:37Z |  |  |
| waypoint:wp-adr-repo-substitution | review | proposed | accepted | 2026-11-08T20:23:50Z | ni:///sha-256;O4PS3_OvN41UwxhyLpzelQ2Kbk_eekNjw2tUkV6BaD8 | denisurusov |
| node:task-sme-repo-substitution-rules | review | proposed | accepted | 2026-11-08T20:23:50Z | ni:///sha-256;O4PS3_OvN41UwxhyLpzelQ2Kbk_eekNjw2tUkV6BaD8 | denisurusov |
| edge:e-mrk-subadr-substitution | review | proposed | accepted | 2026-11-08T20:23:50Z | ni:///sha-256;O4PS3_OvN41UwxhyLpzelQ2Kbk_eekNjw2tUkV6BaD8 | denisurusov |
| edge:e-drv-cdmdata-subadr | review | proposed | accepted | 2026-11-08T20:23:50Z | ni:///sha-256;O4PS3_OvN41UwxhyLpzelQ2Kbk_eekNjw2tUkV6BaD8 | denisurusov |
| edge:e-drv-finality-subadr | review | proposed | accepted | 2026-11-08T20:23:50Z | ni:///sha-256;O4PS3_OvN41UwxhyLpzelQ2Kbk_eekNjw2tUkV6BaD8 | denisurusov |
| edge:e-dec-cdmdev-smesubst | review | proposed | accepted | 2026-11-08T20:23:50Z | ni:///sha-256;O4PS3_OvN41UwxhyLpzelQ2Kbk_eekNjw2tUkV6BaD8 | denisurusov |
| edge:e-lnk-subst-smesubst | review | proposed | accepted | 2026-11-08T20:23:50Z | ni:///sha-256;O4PS3_OvN41UwxhyLpzelQ2Kbk_eekNjw2tUkV6BaD8 | denisurusov |
| node:task-repo-substitution | status | open | resolved | 2026-11-08T20:45:57Z | ni:///sha-256;zLIAX2Pq9sfWLhTsB0nSHsU5mXlPU3mnn2KT4FcRv0k | denisurusov |
| waypoint:wp-adr-repo-income | review |  | proposed | 2026-11-08T20:48:34Z |  |  |
| node:task-sme-repo-income-rules | review |  | proposed | 2026-11-08T20:48:34Z |  |  |
| node:task-sme-repo-income-rules | status |  | open | 2026-11-08T20:48:34Z |  |  |
| edge:e-mrk-incadr-income | review |  | proposed | 2026-11-08T20:48:34Z |  |  |
| edge:e-drv-cdmdata-incadr | review |  | proposed | 2026-11-08T20:48:34Z |  |  |
| edge:e-drv-finality-incadr | review |  | proposed | 2026-11-08T20:48:34Z |  |  |
| edge:e-dec-cdmdev-smeincome | review |  | proposed | 2026-11-08T20:48:34Z |  |  |
| edge:e-lnk-income-smeincome | review |  | proposed | 2026-11-08T20:48:34Z |  |  |
| waypoint:wp-adr-repo-income | review | proposed | accepted | 2026-11-08T21:19:44Z | ni:///sha-256;PPKEnE3-V45AWtKKCXszLa1VxEPhg28Hml0LB9NnZQ0 | denisurusov |
| node:task-sme-repo-income-rules | review | proposed | accepted | 2026-11-08T21:19:44Z | ni:///sha-256;PPKEnE3-V45AWtKKCXszLa1VxEPhg28Hml0LB9NnZQ0 | denisurusov |
| edge:e-mrk-incadr-income | review | proposed | accepted | 2026-11-08T21:19:44Z | ni:///sha-256;PPKEnE3-V45AWtKKCXszLa1VxEPhg28Hml0LB9NnZQ0 | denisurusov |
| edge:e-drv-cdmdata-incadr | review | proposed | accepted | 2026-11-08T21:19:44Z | ni:///sha-256;PPKEnE3-V45AWtKKCXszLa1VxEPhg28Hml0LB9NnZQ0 | denisurusov |
| edge:e-drv-finality-incadr | review | proposed | accepted | 2026-11-08T21:19:44Z | ni:///sha-256;PPKEnE3-V45AWtKKCXszLa1VxEPhg28Hml0LB9NnZQ0 | denisurusov |
| edge:e-dec-cdmdev-smeincome | review | proposed | accepted | 2026-11-08T21:19:44Z | ni:///sha-256;PPKEnE3-V45AWtKKCXszLa1VxEPhg28Hml0LB9NnZQ0 | denisurusov |
| edge:e-lnk-income-smeincome | review | proposed | accepted | 2026-11-08T21:19:44Z | ni:///sha-256;PPKEnE3-V45AWtKKCXszLa1VxEPhg28Hml0LB9NnZQ0 | denisurusov |
| node:task-gateway-type-check | review |  | proposed | 2026-11-08T21:19:44Z |  |  |
| node:task-gateway-type-check | status |  | open | 2026-11-08T21:19:44Z |  |  |
| edge:e-dec-cdmdev-gatewaytypecheck | review |  | proposed | 2026-11-08T21:19:44Z |  |  |
| node:task-repo-income | status | open | resolved | 2026-11-08T21:55:20Z | ni:///sha-256;0zHvndk48b0GzbGhBFd8-SMqhGEl1BKT7qIxG1LDM04 | denisurusov |
| node:task-gateway-type-check | review | proposed | accepted | 2026-11-08T21:55:20Z | ni:///sha-256;0zHvndk48b0GzbGhBFd8-SMqhGEl1BKT7qIxG1LDM04 | denisurusov |
| edge:e-dec-cdmdev-gatewaytypecheck | review | proposed | accepted | 2026-11-08T21:55:20Z | ni:///sha-256;0zHvndk48b0GzbGhBFd8-SMqhGEl1BKT7qIxG1LDM04 | denisurusov |
| node:task-gateway-type-check | status | open | resolved | 2026-11-08T23:13:16Z | ni:///sha-256;vJ4cMz_0ElAwvyK_qTCfJx5i3ntieOlBA6wZmxhYvqc | denisurusov |
| waypoint:wp-adr-repo-roll | review |  | proposed | 2026-11-08T23:21:41Z |  |  |
| node:task-sme-repo-roll-rules | review |  | proposed | 2026-11-08T23:21:41Z |  |  |
| node:task-sme-repo-roll-rules | status |  | open | 2026-11-08T23:21:41Z |  |  |
| edge:e-mrk-roladr-roll | review |  | proposed | 2026-11-08T23:21:41Z |  |  |
| edge:e-drv-cdmdata-roladr | review |  | proposed | 2026-11-08T23:21:41Z |  |  |
| edge:e-drv-finality-roladr | review |  | proposed | 2026-11-08T23:21:41Z |  |  |
| edge:e-dec-cdmdev-smeroll | review |  | proposed | 2026-11-08T23:21:41Z |  |  |
| edge:e-lnk-roll-smeroll | review |  | proposed | 2026-11-08T23:21:41Z |  |  |
| waypoint:wp-adr-repo-roll | review | proposed | accepted | 2026-11-09T00:03:11Z | ni:///sha-256;jNUFQTL5weekyf0we5mUNfK2aVdkn_yER2KC8OFBwaM | denisurusov |
| node:task-sme-repo-roll-rules | review | proposed | accepted | 2026-11-09T00:03:11Z | ni:///sha-256;jNUFQTL5weekyf0we5mUNfK2aVdkn_yER2KC8OFBwaM | denisurusov |
| edge:e-mrk-roladr-roll | review | proposed | accepted | 2026-11-09T00:03:11Z | ni:///sha-256;jNUFQTL5weekyf0we5mUNfK2aVdkn_yER2KC8OFBwaM | denisurusov |
| edge:e-drv-cdmdata-roladr | review | proposed | accepted | 2026-11-09T00:03:11Z | ni:///sha-256;jNUFQTL5weekyf0we5mUNfK2aVdkn_yER2KC8OFBwaM | denisurusov |
| edge:e-drv-finality-roladr | review | proposed | accepted | 2026-11-09T00:03:11Z | ni:///sha-256;jNUFQTL5weekyf0we5mUNfK2aVdkn_yER2KC8OFBwaM | denisurusov |
| edge:e-dec-cdmdev-smeroll | review | proposed | accepted | 2026-11-09T00:03:11Z | ni:///sha-256;jNUFQTL5weekyf0we5mUNfK2aVdkn_yER2KC8OFBwaM | denisurusov |
| edge:e-lnk-roll-smeroll | review | proposed | accepted | 2026-11-09T00:03:11Z | ni:///sha-256;jNUFQTL5weekyf0we5mUNfK2aVdkn_yER2KC8OFBwaM | denisurusov |
| node:investigation-live-spec-in-claude-web | review |  | proposed | 2026-11-09T00:17:00Z |  |  |
| node:investigation-live-spec-in-claude-web | status |  | active | 2026-11-09T00:17:00Z |  |  |
| node:task-repo-roll | status | open | resolved | 2026-11-09T00:27:02Z | ni:///sha-256;zArb8v33HLJA-t6BcHWKTRb7hpJrKw6TSyjH8k7tHL4 | denisurusov |
| node:task-collateral-service-unit-tests | review | proposed | accepted | 2026-11-09T00:28:03Z | ni:///sha-256;B3Tu2syttuODkUisegP90OMKsEqEBDTC3xGeFCD0rag | denisurusov |
| edge:e-dec-e2eflow-collateralunittests | review | proposed | accepted | 2026-11-09T00:28:03Z | ni:///sha-256;B3Tu2syttuODkUisegP90OMKsEqEBDTC3xGeFCD0rag | denisurusov |
| edge:e-dec-e2eflow-livespecweb | review |  | proposed | 2026-11-09T00:43:47Z |  |  |
| node:goal-adoption | review |  | accepted | 2026-11-09T12:57:26Z | ni:///sha-256;g5Ulss0nnEGnE1sQe2h4o2ZmEaFwvWnhbNm4C4P1mC4 | denisurusov |
| node:goal-adoption | status |  | open | 2026-11-09T12:57:26Z | ni:///sha-256;g5Ulss0nnEGnE1sQe2h4o2ZmEaFwvWnhbNm4C4P1mC4 | denisurusov |
| node:task-presentation | review |  | accepted | 2026-11-09T12:57:26Z | ni:///sha-256;g5Ulss0nnEGnE1sQe2h4o2ZmEaFwvWnhbNm4C4P1mC4 | denisurusov |
| node:task-presentation | status |  | active | 2026-11-09T12:57:26Z | ni:///sha-256;g5Ulss0nnEGnE1sQe2h4o2ZmEaFwvWnhbNm4C4P1mC4 | denisurusov |
| edge:e-dec-adoption-presentation | review |  | proposed | 2026-11-09T12:57:26Z |  |  |
| noteworthy:nw-defer-message-standard-mapping | review |  | accepted | 2026-11-10T23:00:33Z | ni:///sha-256;FkjvKBvP6SZzmpt8FBl9zYlssQ5n13JYCvOHevZs5go | denisurusov |
| edge:e-note-workflowtaskmap-defermapping | review |  | accepted | 2026-11-10T23:00:33Z | ni:///sha-256;FkjvKBvP6SZzmpt8FBl9zYlssQ5n13JYCvOHevZs5go | denisurusov |
| edge:e-note-businesscase-defermapping | review |  | accepted | 2026-11-10T23:00:33Z | ni:///sha-256;FkjvKBvP6SZzmpt8FBl9zYlssQ5n13JYCvOHevZs5go | denisurusov |
| waypoint:wp-adr-repo-pair-off | review |  | proposed | 2026-11-10T23:26:13Z |  |  |
| node:task-sme-repo-pair-off-rules | review |  | proposed | 2026-11-10T23:26:13Z |  |  |
| node:task-sme-repo-pair-off-rules | status |  | open | 2026-11-10T23:26:13Z |  |  |
| edge:e-mrk-pofadr-pairoff | review |  | proposed | 2026-11-10T23:26:13Z |  |  |
| edge:e-drv-cdmdata-pofadr | review |  | proposed | 2026-11-10T23:26:13Z |  |  |
| edge:e-drv-finality-pofadr | review |  | proposed | 2026-11-10T23:26:13Z |  |  |
| edge:e-dec-cdmdev-smepairoff | review |  | proposed | 2026-11-10T23:26:13Z |  |  |
| edge:e-lnk-pairoff-smepairoff | review |  | proposed | 2026-11-10T23:26:13Z |  |  |
| waypoint:wp-adr-repo-pair-off | review | proposed | accepted | 2026-11-11T00:12:48Z | ni:///sha-256;-tq5HrNPIU2snA8rxEVrvKnogzjkGAi6D6Mdq3Uu0Eg | denisurusov |
| node:task-sme-repo-pair-off-rules | review | proposed | accepted | 2026-11-11T00:12:48Z | ni:///sha-256;-tq5HrNPIU2snA8rxEVrvKnogzjkGAi6D6Mdq3Uu0Eg | denisurusov |
| edge:e-mrk-pofadr-pairoff | review | proposed | accepted | 2026-11-11T00:12:48Z | ni:///sha-256;-tq5HrNPIU2snA8rxEVrvKnogzjkGAi6D6Mdq3Uu0Eg | denisurusov |
| edge:e-drv-cdmdata-pofadr | review | proposed | accepted | 2026-11-11T00:12:48Z | ni:///sha-256;-tq5HrNPIU2snA8rxEVrvKnogzjkGAi6D6Mdq3Uu0Eg | denisurusov |
| edge:e-drv-finality-pofadr | review | proposed | accepted | 2026-11-11T00:12:48Z | ni:///sha-256;-tq5HrNPIU2snA8rxEVrvKnogzjkGAi6D6Mdq3Uu0Eg | denisurusov |
| edge:e-dec-cdmdev-smepairoff | review | proposed | accepted | 2026-11-11T00:12:48Z | ni:///sha-256;-tq5HrNPIU2snA8rxEVrvKnogzjkGAi6D6Mdq3Uu0Eg | denisurusov |
| edge:e-lnk-pairoff-smepairoff | review | proposed | accepted | 2026-11-11T00:12:48Z | ni:///sha-256;-tq5HrNPIU2snA8rxEVrvKnogzjkGAi6D6Mdq3Uu0Eg | denisurusov |
| node:task-repo-pair-off | status | open | resolved | 2026-11-11T01:11:49Z | ni:///sha-256;zOhMTOzxbacKyBzyTScQapsVuWnQM1U8yBLDfywW7bc | denisurusov |
| waypoint:wp-adr-repo-buy-sell-back | review |  | proposed | 2026-11-11T01:42:28Z |  |  |
| node:task-sme-repo-buy-sell-back-rules | review |  | proposed | 2026-11-11T01:42:28Z |  |  |
| node:task-sme-repo-buy-sell-back-rules | status |  | open | 2026-11-11T01:42:28Z |  |  |
| edge:e-mrk-bsbadr-buysellback | review |  | proposed | 2026-11-11T01:42:28Z |  |  |
| edge:e-drv-cdmdata-bsbadr | review |  | proposed | 2026-11-11T01:42:28Z |  |  |
| edge:e-drv-finality-bsbadr | review |  | proposed | 2026-11-11T01:42:28Z |  |  |
| edge:e-dec-cdmdev-smebsb | review |  | proposed | 2026-11-11T01:42:28Z |  |  |
| edge:e-lnk-bsb-smebsb | review |  | proposed | 2026-11-11T01:42:28Z |  |  |
| waypoint:wp-adr-repo-buy-sell-back | review | proposed | accepted | 2026-11-11T03:30:38Z | ni:///sha-256;5wBcKDSmaNHqC-RQLmUMRSRYlxKTva-UqEF8FfQR9ds | denisurusov |
| node:task-sme-repo-buy-sell-back-rules | review | proposed | accepted | 2026-11-11T03:30:38Z | ni:///sha-256;5wBcKDSmaNHqC-RQLmUMRSRYlxKTva-UqEF8FfQR9ds | denisurusov |
| edge:e-mrk-bsbadr-buysellback | review | proposed | accepted | 2026-11-11T03:30:38Z | ni:///sha-256;5wBcKDSmaNHqC-RQLmUMRSRYlxKTva-UqEF8FfQR9ds | denisurusov |
| edge:e-drv-cdmdata-bsbadr | review | proposed | accepted | 2026-11-11T03:30:38Z | ni:///sha-256;5wBcKDSmaNHqC-RQLmUMRSRYlxKTva-UqEF8FfQR9ds | denisurusov |
| edge:e-drv-finality-bsbadr | review | proposed | accepted | 2026-11-11T03:30:38Z | ni:///sha-256;5wBcKDSmaNHqC-RQLmUMRSRYlxKTva-UqEF8FfQR9ds | denisurusov |
| edge:e-dec-cdmdev-smebsb | review | proposed | accepted | 2026-11-11T03:30:38Z | ni:///sha-256;5wBcKDSmaNHqC-RQLmUMRSRYlxKTva-UqEF8FfQR9ds | denisurusov |
| edge:e-lnk-bsb-smebsb | review | proposed | accepted | 2026-11-11T03:30:38Z | ni:///sha-256;5wBcKDSmaNHqC-RQLmUMRSRYlxKTva-UqEF8FfQR9ds | denisurusov |
| node:task-repo-buy-sell-back | status | open | resolved | 2026-11-11T12:56:08Z | ni:///sha-256;hsX3ouSFV6pthsF5r3gpGh-KONL_kfXWFUSxrIQOkT8 | denisurusov |
| waypoint:wp-adr-repo-default-close-out | review |  | proposed | 2026-11-11T13:07:05Z |  |  |
| node:task-sme-repo-default-close-out-rules | review |  | proposed | 2026-11-11T13:07:05Z |  |  |
| node:task-sme-repo-default-close-out-rules | status |  | open | 2026-11-11T13:07:05Z |  |  |
| edge:e-mrk-dcoadr-defaultcloseout | review |  | proposed | 2026-11-11T13:07:05Z |  |  |
| edge:e-drv-cdmdata-dcoadr | review |  | proposed | 2026-11-11T13:07:05Z |  |  |
| edge:e-drv-finality-dcoadr | review |  | proposed | 2026-11-11T13:07:05Z |  |  |
| edge:e-dec-cdmdev-smedco | review |  | proposed | 2026-11-11T13:07:05Z |  |  |
| edge:e-lnk-dco-smedco | review |  | proposed | 2026-11-11T13:07:05Z |  |  |
| waypoint:wp-adr-repo-default-close-out | review | proposed | accepted | 2026-11-11T13:09:45Z | ni:///sha-256;sjqBNC7DGASPedmnS4WOWPaFVnjD4S-U8_cT0EcD1iY | denisurusov |
| node:task-sme-repo-default-close-out-rules | review | proposed | accepted | 2026-11-11T13:09:45Z | ni:///sha-256;sjqBNC7DGASPedmnS4WOWPaFVnjD4S-U8_cT0EcD1iY | denisurusov |
| edge:e-mrk-dcoadr-defaultcloseout | review | proposed | accepted | 2026-11-11T13:09:45Z | ni:///sha-256;sjqBNC7DGASPedmnS4WOWPaFVnjD4S-U8_cT0EcD1iY | denisurusov |
| edge:e-drv-cdmdata-dcoadr | review | proposed | accepted | 2026-11-11T13:09:45Z | ni:///sha-256;sjqBNC7DGASPedmnS4WOWPaFVnjD4S-U8_cT0EcD1iY | denisurusov |
| edge:e-drv-finality-dcoadr | review | proposed | accepted | 2026-11-11T13:09:45Z | ni:///sha-256;sjqBNC7DGASPedmnS4WOWPaFVnjD4S-U8_cT0EcD1iY | denisurusov |
| edge:e-dec-cdmdev-smedco | review | proposed | accepted | 2026-11-11T13:09:45Z | ni:///sha-256;sjqBNC7DGASPedmnS4WOWPaFVnjD4S-U8_cT0EcD1iY | denisurusov |
| edge:e-lnk-dco-smedco | review | proposed | accepted | 2026-11-11T13:09:45Z | ni:///sha-256;sjqBNC7DGASPedmnS4WOWPaFVnjD4S-U8_cT0EcD1iY | denisurusov |
| node:task-repo-default-close-out | status | open | resolved | 2026-11-11T14:57:51Z | ni:///sha-256;sjnksyNd6KBvq7NbdDPxCi0I9kL0cOLmdsUB4ZwRGvw | denisurusov |
| waypoint:wp-adr-securities-lending-gmsla-scope | review |  | proposed | 2026-11-11T15:11:27Z | ni:///sha-256;mBNipe_OTzILvGu_nKDYEPI14bTpkrfNnQ3FVFVSwmM |  |
| node:task-gmsla-terms | review |  | proposed | 2026-11-11T15:11:27Z | ni:///sha-256;mBNipe_OTzILvGu_nKDYEPI14bTpkrfNnQ3FVFVSwmM |  |
| node:task-gmsla-terms | status |  | open | 2026-11-11T15:11:27Z | ni:///sha-256;mBNipe_OTzILvGu_nKDYEPI14bTpkrfNnQ3FVFVSwmM |  |
| node:task-gmsla-loan-delivery-return | review |  | proposed | 2026-11-11T15:11:27Z | ni:///sha-256;mBNipe_OTzILvGu_nKDYEPI14bTpkrfNnQ3FVFVSwmM |  |
| node:task-gmsla-loan-delivery-return | status |  | open | 2026-11-11T15:11:27Z | ni:///sha-256;mBNipe_OTzILvGu_nKDYEPI14bTpkrfNnQ3FVFVSwmM |  |
| node:task-gmsla-marking | review |  | proposed | 2026-11-11T15:11:27Z | ni:///sha-256;mBNipe_OTzILvGu_nKDYEPI14bTpkrfNnQ3FVFVSwmM |  |
| node:task-gmsla-marking | status |  | open | 2026-11-11T15:11:27Z | ni:///sha-256;mBNipe_OTzILvGu_nKDYEPI14bTpkrfNnQ3FVFVSwmM |  |
| node:task-gmsla-recall | review |  | proposed | 2026-11-11T15:11:27Z | ni:///sha-256;mBNipe_OTzILvGu_nKDYEPI14bTpkrfNnQ3FVFVSwmM |  |
| node:task-gmsla-recall | status |  | open | 2026-11-11T15:11:27Z | ni:///sha-256;mBNipe_OTzILvGu_nKDYEPI14bTpkrfNnQ3FVFVSwmM |  |
| node:task-gmsla-substitution | review |  | proposed | 2026-11-11T15:11:27Z | ni:///sha-256;mBNipe_OTzILvGu_nKDYEPI14bTpkrfNnQ3FVFVSwmM |  |
| node:task-gmsla-substitution | status |  | open | 2026-11-11T15:11:27Z | ni:///sha-256;mBNipe_OTzILvGu_nKDYEPI14bTpkrfNnQ3FVFVSwmM |  |
| node:task-gmsla-rebate | review |  | proposed | 2026-11-11T15:11:27Z | ni:///sha-256;mBNipe_OTzILvGu_nKDYEPI14bTpkrfNnQ3FVFVSwmM |  |
| node:task-gmsla-rebate | status |  | open | 2026-11-11T15:11:27Z | ni:///sha-256;mBNipe_OTzILvGu_nKDYEPI14bTpkrfNnQ3FVFVSwmM |  |
| node:task-gmsla-lending-fee | review |  | proposed | 2026-11-11T15:11:27Z | ni:///sha-256;mBNipe_OTzILvGu_nKDYEPI14bTpkrfNnQ3FVFVSwmM |  |
| node:task-gmsla-lending-fee | status |  | open | 2026-11-11T15:11:27Z | ni:///sha-256;mBNipe_OTzILvGu_nKDYEPI14bTpkrfNnQ3FVFVSwmM |  |
| node:task-gmsla-default-close-out | review |  | proposed | 2026-11-11T15:11:27Z | ni:///sha-256;mBNipe_OTzILvGu_nKDYEPI14bTpkrfNnQ3FVFVSwmM |  |
| node:task-gmsla-default-close-out | status |  | open | 2026-11-11T15:11:27Z | ni:///sha-256;mBNipe_OTzILvGu_nKDYEPI14bTpkrfNnQ3FVFVSwmM |  |
| edge:e-mrk-slscope-slgmsla | review |  | proposed | 2026-11-11T15:11:27Z | ni:///sha-256;mBNipe_OTzILvGu_nKDYEPI14bTpkrfNnQ3FVFVSwmM |  |
| edge:e-drv-cdmdata-slscope | review |  | proposed | 2026-11-11T15:11:27Z | ni:///sha-256;mBNipe_OTzILvGu_nKDYEPI14bTpkrfNnQ3FVFVSwmM |  |
| edge:e-drv-finality-slscope | review |  | proposed | 2026-11-11T15:11:27Z | ni:///sha-256;mBNipe_OTzILvGu_nKDYEPI14bTpkrfNnQ3FVFVSwmM |  |
| edge:e-dec-slgmsla-terms | review |  | proposed | 2026-11-11T15:11:27Z | ni:///sha-256;mBNipe_OTzILvGu_nKDYEPI14bTpkrfNnQ3FVFVSwmM |  |
| edge:e-dec-slgmsla-loandeliveryreturn | review |  | proposed | 2026-11-11T15:11:27Z | ni:///sha-256;mBNipe_OTzILvGu_nKDYEPI14bTpkrfNnQ3FVFVSwmM |  |
| edge:e-dec-slgmsla-marking | review |  | proposed | 2026-11-11T15:11:27Z | ni:///sha-256;mBNipe_OTzILvGu_nKDYEPI14bTpkrfNnQ3FVFVSwmM |  |
| edge:e-dec-slgmsla-recall | review |  | proposed | 2026-11-11T15:11:27Z | ni:///sha-256;mBNipe_OTzILvGu_nKDYEPI14bTpkrfNnQ3FVFVSwmM |  |
| edge:e-dec-slgmsla-substitution | review |  | proposed | 2026-11-11T15:11:27Z | ni:///sha-256;mBNipe_OTzILvGu_nKDYEPI14bTpkrfNnQ3FVFVSwmM |  |
| edge:e-dec-slgmsla-rebate | review |  | proposed | 2026-11-11T15:11:27Z | ni:///sha-256;mBNipe_OTzILvGu_nKDYEPI14bTpkrfNnQ3FVFVSwmM |  |
| edge:e-dec-slgmsla-lendingfee | review |  | proposed | 2026-11-11T15:11:27Z | ni:///sha-256;mBNipe_OTzILvGu_nKDYEPI14bTpkrfNnQ3FVFVSwmM |  |
| edge:e-dec-slgmsla-defaultcloseout | review |  | proposed | 2026-11-11T15:11:27Z | ni:///sha-256;mBNipe_OTzILvGu_nKDYEPI14bTpkrfNnQ3FVFVSwmM |  |
| waypoint:wp-adr-securities-lending-gmsla-scope | review | proposed | accepted | 2026-11-11T15:16:16Z | ni:///sha-256;mwVaCw_eIieXN29lKjmEb5svQii9Ik-DG1gqGy4JbXs | denisurusov |
| node:task-gmsla-terms | review | proposed | accepted | 2026-11-11T15:16:16Z | ni:///sha-256;mwVaCw_eIieXN29lKjmEb5svQii9Ik-DG1gqGy4JbXs | denisurusov |
| node:task-gmsla-loan-delivery-return | review | proposed | accepted | 2026-11-11T15:16:16Z | ni:///sha-256;mwVaCw_eIieXN29lKjmEb5svQii9Ik-DG1gqGy4JbXs | denisurusov |
| node:task-gmsla-marking | review | proposed | accepted | 2026-11-11T15:16:16Z | ni:///sha-256;mwVaCw_eIieXN29lKjmEb5svQii9Ik-DG1gqGy4JbXs | denisurusov |
| node:task-gmsla-recall | review | proposed | accepted | 2026-11-11T15:16:16Z | ni:///sha-256;mwVaCw_eIieXN29lKjmEb5svQii9Ik-DG1gqGy4JbXs | denisurusov |
| node:task-gmsla-substitution | review | proposed | accepted | 2026-11-11T15:16:16Z | ni:///sha-256;mwVaCw_eIieXN29lKjmEb5svQii9Ik-DG1gqGy4JbXs | denisurusov |
| node:task-gmsla-rebate | review | proposed | accepted | 2026-11-11T15:16:16Z | ni:///sha-256;mwVaCw_eIieXN29lKjmEb5svQii9Ik-DG1gqGy4JbXs | denisurusov |
| node:task-gmsla-lending-fee | review | proposed | accepted | 2026-11-11T15:16:16Z | ni:///sha-256;mwVaCw_eIieXN29lKjmEb5svQii9Ik-DG1gqGy4JbXs | denisurusov |
| node:task-gmsla-default-close-out | review | proposed | accepted | 2026-11-11T15:16:16Z | ni:///sha-256;mwVaCw_eIieXN29lKjmEb5svQii9Ik-DG1gqGy4JbXs | denisurusov |
| edge:e-mrk-slscope-slgmsla | review | proposed | accepted | 2026-11-11T15:16:16Z | ni:///sha-256;mwVaCw_eIieXN29lKjmEb5svQii9Ik-DG1gqGy4JbXs | denisurusov |
| edge:e-drv-cdmdata-slscope | review | proposed | accepted | 2026-11-11T15:16:16Z | ni:///sha-256;mwVaCw_eIieXN29lKjmEb5svQii9Ik-DG1gqGy4JbXs | denisurusov |
| edge:e-drv-finality-slscope | review | proposed | accepted | 2026-11-11T15:16:16Z | ni:///sha-256;mwVaCw_eIieXN29lKjmEb5svQii9Ik-DG1gqGy4JbXs | denisurusov |
| edge:e-dec-slgmsla-terms | review | proposed | accepted | 2026-11-11T15:16:16Z | ni:///sha-256;mwVaCw_eIieXN29lKjmEb5svQii9Ik-DG1gqGy4JbXs | denisurusov |
| edge:e-dec-slgmsla-loandeliveryreturn | review | proposed | accepted | 2026-11-11T15:16:16Z | ni:///sha-256;mwVaCw_eIieXN29lKjmEb5svQii9Ik-DG1gqGy4JbXs | denisurusov |
| edge:e-dec-slgmsla-marking | review | proposed | accepted | 2026-11-11T15:16:16Z | ni:///sha-256;mwVaCw_eIieXN29lKjmEb5svQii9Ik-DG1gqGy4JbXs | denisurusov |
| edge:e-dec-slgmsla-recall | review | proposed | accepted | 2026-11-11T15:16:16Z | ni:///sha-256;mwVaCw_eIieXN29lKjmEb5svQii9Ik-DG1gqGy4JbXs | denisurusov |
| edge:e-dec-slgmsla-substitution | review | proposed | accepted | 2026-11-11T15:16:16Z | ni:///sha-256;mwVaCw_eIieXN29lKjmEb5svQii9Ik-DG1gqGy4JbXs | denisurusov |
| edge:e-dec-slgmsla-rebate | review | proposed | accepted | 2026-11-11T15:16:16Z | ni:///sha-256;mwVaCw_eIieXN29lKjmEb5svQii9Ik-DG1gqGy4JbXs | denisurusov |
| edge:e-dec-slgmsla-lendingfee | review | proposed | accepted | 2026-11-11T15:16:16Z | ni:///sha-256;mwVaCw_eIieXN29lKjmEb5svQii9Ik-DG1gqGy4JbXs | denisurusov |
| edge:e-dec-slgmsla-defaultcloseout | review | proposed | accepted | 2026-11-11T15:16:16Z | ni:///sha-256;mwVaCw_eIieXN29lKjmEb5svQii9Ik-DG1gqGy4JbXs | denisurusov |
| waypoint:wp-adr-gmsla-terms | review |  | proposed | 2026-11-11T15:30:34Z | ni:///sha-256;_m3kmHfnAgV2iz-0XDXYVHqQMgGXcAIMwK89wpXvu8c |  |
| node:task-sme-gmsla-terms-baseline | review |  | proposed | 2026-11-11T15:30:34Z | ni:///sha-256;_m3kmHfnAgV2iz-0XDXYVHqQMgGXcAIMwK89wpXvu8c |  |
| node:task-sme-gmsla-terms-baseline | status |  | open | 2026-11-11T15:30:34Z | ni:///sha-256;_m3kmHfnAgV2iz-0XDXYVHqQMgGXcAIMwK89wpXvu8c |  |
| edge:e-mrk-gmslatermsadr-gmslaterms | review |  | proposed | 2026-11-11T15:30:34Z | ni:///sha-256;_m3kmHfnAgV2iz-0XDXYVHqQMgGXcAIMwK89wpXvu8c |  |
| edge:e-drv-cdmdata-gmslatermsadr | review |  | proposed | 2026-11-11T15:30:34Z | ni:///sha-256;_m3kmHfnAgV2iz-0XDXYVHqQMgGXcAIMwK89wpXvu8c |  |
| edge:e-drv-finality-gmslatermsadr | review |  | proposed | 2026-11-11T15:30:34Z | ni:///sha-256;_m3kmHfnAgV2iz-0XDXYVHqQMgGXcAIMwK89wpXvu8c |  |
| edge:e-dec-cdmdev-smegmslaterms | review |  | proposed | 2026-11-11T15:30:34Z | ni:///sha-256;_m3kmHfnAgV2iz-0XDXYVHqQMgGXcAIMwK89wpXvu8c |  |
| edge:e-lnk-gmslaterms-smegmslaterms | review |  | proposed | 2026-11-11T15:30:34Z | ni:///sha-256;_m3kmHfnAgV2iz-0XDXYVHqQMgGXcAIMwK89wpXvu8c |  |
| waypoint:wp-adr-gmsla-terms | review | proposed | accepted | 2026-11-11T15:32:22Z | ni:///sha-256;nT5WKoqEHr8Xgq0YlpS_GPv9Fj3N2b_TumQMgQrcdRw | denisurusov |
| node:task-sme-gmsla-terms-baseline | review | proposed | accepted | 2026-11-11T15:32:22Z | ni:///sha-256;nT5WKoqEHr8Xgq0YlpS_GPv9Fj3N2b_TumQMgQrcdRw | denisurusov |
| edge:e-mrk-gmslatermsadr-gmslaterms | review | proposed | accepted | 2026-11-11T15:32:22Z | ni:///sha-256;nT5WKoqEHr8Xgq0YlpS_GPv9Fj3N2b_TumQMgQrcdRw | denisurusov |
| edge:e-drv-cdmdata-gmslatermsadr | review | proposed | accepted | 2026-11-11T15:32:22Z | ni:///sha-256;nT5WKoqEHr8Xgq0YlpS_GPv9Fj3N2b_TumQMgQrcdRw | denisurusov |
| edge:e-drv-finality-gmslatermsadr | review | proposed | accepted | 2026-11-11T15:32:22Z | ni:///sha-256;nT5WKoqEHr8Xgq0YlpS_GPv9Fj3N2b_TumQMgQrcdRw | denisurusov |
| edge:e-dec-cdmdev-smegmslaterms | review | proposed | accepted | 2026-11-11T15:32:22Z | ni:///sha-256;nT5WKoqEHr8Xgq0YlpS_GPv9Fj3N2b_TumQMgQrcdRw | denisurusov |
| edge:e-lnk-gmslaterms-smegmslaterms | review | proposed | accepted | 2026-11-11T15:32:22Z | ni:///sha-256;nT5WKoqEHr8Xgq0YlpS_GPv9Fj3N2b_TumQMgQrcdRw | denisurusov |
| waypoint:wp-adr-gmsla-loan-delivery-return | review |  | proposed | 2026-11-11T16:38:28Z | ni:///sha-256;OH_8AvAVJwyXqxfbI3yy1iQNzG1llR5n3b1tIwq39TM |  |
| node:task-sme-gmsla-loan-delivery-return-rules | review |  | proposed | 2026-11-11T16:38:28Z | ni:///sha-256;OH_8AvAVJwyXqxfbI3yy1iQNzG1llR5n3b1tIwq39TM |  |
| node:task-sme-gmsla-loan-delivery-return-rules | status |  | open | 2026-11-11T16:38:28Z | ni:///sha-256;OH_8AvAVJwyXqxfbI3yy1iQNzG1llR5n3b1tIwq39TM |  |
| edge:e-mrk-ldradr-gmslaldr | review |  | proposed | 2026-11-11T16:38:28Z | ni:///sha-256;OH_8AvAVJwyXqxfbI3yy1iQNzG1llR5n3b1tIwq39TM |  |
| edge:e-drv-cdmdata-ldradr | review |  | proposed | 2026-11-11T16:38:28Z | ni:///sha-256;OH_8AvAVJwyXqxfbI3yy1iQNzG1llR5n3b1tIwq39TM |  |
| edge:e-drv-finality-ldradr | review |  | proposed | 2026-11-11T16:38:28Z | ni:///sha-256;OH_8AvAVJwyXqxfbI3yy1iQNzG1llR5n3b1tIwq39TM |  |
| edge:e-dec-cdmdev-smeldr | review |  | proposed | 2026-11-11T16:38:28Z | ni:///sha-256;OH_8AvAVJwyXqxfbI3yy1iQNzG1llR5n3b1tIwq39TM |  |
| edge:e-lnk-gmslaldr-smeldr | review |  | proposed | 2026-11-11T16:38:28Z | ni:///sha-256;OH_8AvAVJwyXqxfbI3yy1iQNzG1llR5n3b1tIwq39TM |  |
| waypoint:wp-adr-gmsla-loan-delivery-return | review | proposed | accepted | 2026-11-11T16:46:56Z | ni:///sha-256;pE3oWmi6qX7xQ096Pm5VL8-omlc-jNxHyC8Wu1T2DpM | denisurusov |
| node:task-sme-gmsla-loan-delivery-return-rules | review | proposed | accepted | 2026-11-11T16:46:56Z | ni:///sha-256;pE3oWmi6qX7xQ096Pm5VL8-omlc-jNxHyC8Wu1T2DpM | denisurusov |
| edge:e-mrk-ldradr-gmslaldr | review | proposed | accepted | 2026-11-11T16:46:56Z | ni:///sha-256;pE3oWmi6qX7xQ096Pm5VL8-omlc-jNxHyC8Wu1T2DpM | denisurusov |
| edge:e-drv-cdmdata-ldradr | review | proposed | accepted | 2026-11-11T16:46:56Z | ni:///sha-256;pE3oWmi6qX7xQ096Pm5VL8-omlc-jNxHyC8Wu1T2DpM | denisurusov |
| edge:e-drv-finality-ldradr | review | proposed | accepted | 2026-11-11T16:46:56Z | ni:///sha-256;pE3oWmi6qX7xQ096Pm5VL8-omlc-jNxHyC8Wu1T2DpM | denisurusov |
| edge:e-dec-cdmdev-smeldr | review | proposed | accepted | 2026-11-11T16:46:56Z | ni:///sha-256;pE3oWmi6qX7xQ096Pm5VL8-omlc-jNxHyC8Wu1T2DpM | denisurusov |
| edge:e-lnk-gmslaldr-smeldr | review | proposed | accepted | 2026-11-11T16:46:56Z | ni:///sha-256;pE3oWmi6qX7xQ096Pm5VL8-omlc-jNxHyC8Wu1T2DpM | denisurusov |
| node:task-gmsla-terms | status | open | resolved | 2026-11-11T17:44:30Z | ni:///sha-256;teBazmaJ4yfcAGhFdqxYuhtaQw-no143y-N1mLt7ZDw | denisurusov |
| node:task-gmsla-loan-delivery-return | status | open | resolved | 2026-11-11T18:10:31Z | ni:///sha-256;kgVPB6yEPVts_4N1nE6YNtHFEHHmd3ZAv7dG9GrXrwU | denisurusov |
| waypoint:wp-adr-gmsla-marking | review |  | proposed | 2026-11-11T18:15:49Z | ni:///sha-256;WfGdBE8oZqdts9vk5oow939vhVqmbyenSQKeY94g6Iw |  |
| node:task-sme-gmsla-marking-rules | review |  | proposed | 2026-11-11T18:15:49Z | ni:///sha-256;WfGdBE8oZqdts9vk5oow939vhVqmbyenSQKeY94g6Iw |  |
| node:task-sme-gmsla-marking-rules | status |  | open | 2026-11-11T18:15:49Z | ni:///sha-256;WfGdBE8oZqdts9vk5oow939vhVqmbyenSQKeY94g6Iw |  |
| edge:e-mrk-mrkadr-gmslamrk | review |  | proposed | 2026-11-11T18:15:49Z | ni:///sha-256;WfGdBE8oZqdts9vk5oow939vhVqmbyenSQKeY94g6Iw |  |
| edge:e-drv-cdmdata-mrkadr | review |  | proposed | 2026-11-11T18:15:49Z | ni:///sha-256;WfGdBE8oZqdts9vk5oow939vhVqmbyenSQKeY94g6Iw |  |
| edge:e-drv-finality-mrkadr | review |  | proposed | 2026-11-11T18:15:49Z | ni:///sha-256;WfGdBE8oZqdts9vk5oow939vhVqmbyenSQKeY94g6Iw |  |
| edge:e-dec-cdmdev-smemrk | review |  | proposed | 2026-11-11T18:15:49Z | ni:///sha-256;WfGdBE8oZqdts9vk5oow939vhVqmbyenSQKeY94g6Iw |  |
| edge:e-lnk-gmslamrk-smemrk | review |  | proposed | 2026-11-11T18:15:49Z | ni:///sha-256;WfGdBE8oZqdts9vk5oow939vhVqmbyenSQKeY94g6Iw |  |
| waypoint:wp-adr-gmsla-marking | review | proposed | accepted | 2026-11-11T18:19:11Z | ni:///sha-256;ezy-BpIMTdY7CsBZ-R5_KzcSCL_p2XTY6PsZ2TAHK9Y | denisurusov |
| node:task-sme-gmsla-marking-rules | review | proposed | accepted | 2026-11-11T18:19:11Z | ni:///sha-256;ezy-BpIMTdY7CsBZ-R5_KzcSCL_p2XTY6PsZ2TAHK9Y | denisurusov |
| edge:e-mrk-mrkadr-gmslamrk | review | proposed | accepted | 2026-11-11T18:19:11Z | ni:///sha-256;ezy-BpIMTdY7CsBZ-R5_KzcSCL_p2XTY6PsZ2TAHK9Y | denisurusov |
| edge:e-drv-cdmdata-mrkadr | review | proposed | accepted | 2026-11-11T18:19:11Z | ni:///sha-256;ezy-BpIMTdY7CsBZ-R5_KzcSCL_p2XTY6PsZ2TAHK9Y | denisurusov |
| edge:e-drv-finality-mrkadr | review | proposed | accepted | 2026-11-11T18:19:11Z | ni:///sha-256;ezy-BpIMTdY7CsBZ-R5_KzcSCL_p2XTY6PsZ2TAHK9Y | denisurusov |
| edge:e-dec-cdmdev-smemrk | review | proposed | accepted | 2026-11-11T18:19:11Z | ni:///sha-256;ezy-BpIMTdY7CsBZ-R5_KzcSCL_p2XTY6PsZ2TAHK9Y | denisurusov |
| edge:e-lnk-gmslamrk-smemrk | review | proposed | accepted | 2026-11-11T18:19:11Z | ni:///sha-256;ezy-BpIMTdY7CsBZ-R5_KzcSCL_p2XTY6PsZ2TAHK9Y | denisurusov |
| waypoint:wp-adr-gmsla-recall | review |  | proposed | 2026-11-11T19:17:49Z | ni:///sha-256;kaOpTN_3Wpj-WOAmNK85IoGN4vg9qvsl4XA52di5Ba0 |  |
| node:task-sme-gmsla-recall-rules | review |  | proposed | 2026-11-11T19:17:49Z | ni:///sha-256;kaOpTN_3Wpj-WOAmNK85IoGN4vg9qvsl4XA52di5Ba0 |  |
| node:task-sme-gmsla-recall-rules | status |  | open | 2026-11-11T19:17:49Z | ni:///sha-256;kaOpTN_3Wpj-WOAmNK85IoGN4vg9qvsl4XA52di5Ba0 |  |
| edge:e-mrk-rcladr-gmslarcl | review |  | proposed | 2026-11-11T19:17:49Z | ni:///sha-256;kaOpTN_3Wpj-WOAmNK85IoGN4vg9qvsl4XA52di5Ba0 |  |
| edge:e-drv-cdmdata-rcladr | review |  | proposed | 2026-11-11T19:17:49Z | ni:///sha-256;kaOpTN_3Wpj-WOAmNK85IoGN4vg9qvsl4XA52di5Ba0 |  |
| edge:e-drv-finality-rcladr | review |  | proposed | 2026-11-11T19:17:49Z | ni:///sha-256;kaOpTN_3Wpj-WOAmNK85IoGN4vg9qvsl4XA52di5Ba0 |  |
| edge:e-dec-cdmdev-smercl | review |  | proposed | 2026-11-11T19:17:49Z | ni:///sha-256;kaOpTN_3Wpj-WOAmNK85IoGN4vg9qvsl4XA52di5Ba0 |  |
| edge:e-lnk-gmslarcl-smercl | review |  | proposed | 2026-11-11T19:17:49Z | ni:///sha-256;kaOpTN_3Wpj-WOAmNK85IoGN4vg9qvsl4XA52di5Ba0 |  |
| waypoint:wp-adr-gmsla-recall | review | proposed | accepted | 2026-11-11T19:39:49Z | ni:///sha-256;tDChllyULArYkvHXZm7GFEF5ju7D-2XdqAeZXXYRSOY | denisurusov |
| node:task-sme-gmsla-recall-rules | review | proposed | accepted | 2026-11-11T19:39:49Z | ni:///sha-256;tDChllyULArYkvHXZm7GFEF5ju7D-2XdqAeZXXYRSOY | denisurusov |
| edge:e-mrk-rcladr-gmslarcl | review | proposed | accepted | 2026-11-11T19:39:49Z | ni:///sha-256;tDChllyULArYkvHXZm7GFEF5ju7D-2XdqAeZXXYRSOY | denisurusov |
| edge:e-drv-cdmdata-rcladr | review | proposed | accepted | 2026-11-11T19:39:49Z | ni:///sha-256;tDChllyULArYkvHXZm7GFEF5ju7D-2XdqAeZXXYRSOY | denisurusov |
| edge:e-drv-finality-rcladr | review | proposed | accepted | 2026-11-11T19:39:49Z | ni:///sha-256;tDChllyULArYkvHXZm7GFEF5ju7D-2XdqAeZXXYRSOY | denisurusov |
| edge:e-dec-cdmdev-smercl | review | proposed | accepted | 2026-11-11T19:39:49Z | ni:///sha-256;tDChllyULArYkvHXZm7GFEF5ju7D-2XdqAeZXXYRSOY | denisurusov |
| edge:e-lnk-gmslarcl-smercl | review | proposed | accepted | 2026-11-11T19:39:49Z | ni:///sha-256;tDChllyULArYkvHXZm7GFEF5ju7D-2XdqAeZXXYRSOY | denisurusov |
| node:task-gmsla-marking | status | open | resolved | 2026-11-11T19:39:49Z | ni:///sha-256;tDChllyULArYkvHXZm7GFEF5ju7D-2XdqAeZXXYRSOY | denisurusov |
| waypoint:wp-adr-gmsla-substitution | review |  | proposed | 2026-11-11T20:05:16Z | ni:///sha-256;SpMyVl29kD7JVrbgrL1AEeBfVf6LxNqb9EDM-FRaXao |  |
| node:task-sme-gmsla-substitution-rules | review |  | proposed | 2026-11-11T20:05:16Z | ni:///sha-256;SpMyVl29kD7JVrbgrL1AEeBfVf6LxNqb9EDM-FRaXao |  |
| node:task-sme-gmsla-substitution-rules | status |  | open | 2026-11-11T20:05:16Z | ni:///sha-256;SpMyVl29kD7JVrbgrL1AEeBfVf6LxNqb9EDM-FRaXao |  |
| edge:e-mrk-lsbadr-gmslasub | review |  | proposed | 2026-11-11T20:05:16Z | ni:///sha-256;SpMyVl29kD7JVrbgrL1AEeBfVf6LxNqb9EDM-FRaXao |  |
| edge:e-drv-cdmdata-lsbadr | review |  | proposed | 2026-11-11T20:05:16Z | ni:///sha-256;SpMyVl29kD7JVrbgrL1AEeBfVf6LxNqb9EDM-FRaXao |  |
| edge:e-drv-finality-lsbadr | review |  | proposed | 2026-11-11T20:05:16Z | ni:///sha-256;SpMyVl29kD7JVrbgrL1AEeBfVf6LxNqb9EDM-FRaXao |  |
| edge:e-dec-cdmdev-smelsb | review |  | proposed | 2026-11-11T20:05:16Z | ni:///sha-256;SpMyVl29kD7JVrbgrL1AEeBfVf6LxNqb9EDM-FRaXao |  |
| edge:e-lnk-gmslasub-smelsb | review |  | proposed | 2026-11-11T20:05:16Z | ni:///sha-256;SpMyVl29kD7JVrbgrL1AEeBfVf6LxNqb9EDM-FRaXao |  |
| waypoint:wp-adr-gmsla-substitution | review | proposed | accepted | 2026-11-11T20:09:55Z | ni:///sha-256;EZNGEmyLhIInxdmMFRhTSuixZVXY5lSwgUGd6Mdcd-U | denisurusov |
| node:task-sme-gmsla-substitution-rules | review | proposed | accepted | 2026-11-11T20:09:55Z | ni:///sha-256;EZNGEmyLhIInxdmMFRhTSuixZVXY5lSwgUGd6Mdcd-U | denisurusov |
| edge:e-mrk-lsbadr-gmslasub | review | proposed | accepted | 2026-11-11T20:09:55Z | ni:///sha-256;EZNGEmyLhIInxdmMFRhTSuixZVXY5lSwgUGd6Mdcd-U | denisurusov |
| edge:e-drv-cdmdata-lsbadr | review | proposed | accepted | 2026-11-11T20:09:55Z | ni:///sha-256;EZNGEmyLhIInxdmMFRhTSuixZVXY5lSwgUGd6Mdcd-U | denisurusov |
| edge:e-drv-finality-lsbadr | review | proposed | accepted | 2026-11-11T20:09:55Z | ni:///sha-256;EZNGEmyLhIInxdmMFRhTSuixZVXY5lSwgUGd6Mdcd-U | denisurusov |
| edge:e-dec-cdmdev-smelsb | review | proposed | accepted | 2026-11-11T20:09:55Z | ni:///sha-256;EZNGEmyLhIInxdmMFRhTSuixZVXY5lSwgUGd6Mdcd-U | denisurusov |
| edge:e-lnk-gmslasub-smelsb | review | proposed | accepted | 2026-11-11T20:09:55Z | ni:///sha-256;EZNGEmyLhIInxdmMFRhTSuixZVXY5lSwgUGd6Mdcd-U | denisurusov |
| node:task-gmsla-recall | status | open | resolved | 2026-11-11T20:43:22Z | ni:///sha-256;3jzI7BHeNkATu3BL11206SQi4wTUSV7gfWfJyvULZBQ | denisurusov |
| waypoint:wp-adr-gmsla-rebate | review |  | proposed | 2026-11-11T20:39:13Z | ni:///sha-256;i_pdEDYZa7G8cVzu_eZudz926MfPmwn6alf-xZ-g-Ho |  |
| node:task-sme-gmsla-rebate-rules | review |  | proposed | 2026-11-11T20:39:13Z | ni:///sha-256;i_pdEDYZa7G8cVzu_eZudz926MfPmwn6alf-xZ-g-Ho |  |
| node:task-sme-gmsla-rebate-rules | status |  | open | 2026-11-11T20:39:13Z | ni:///sha-256;i_pdEDYZa7G8cVzu_eZudz926MfPmwn6alf-xZ-g-Ho |  |
| edge:e-mrk-rbtadr-gmslarbt | review |  | proposed | 2026-11-11T20:39:13Z | ni:///sha-256;i_pdEDYZa7G8cVzu_eZudz926MfPmwn6alf-xZ-g-Ho |  |
| edge:e-drv-cdmdata-rbtadr | review |  | proposed | 2026-11-11T20:39:13Z | ni:///sha-256;i_pdEDYZa7G8cVzu_eZudz926MfPmwn6alf-xZ-g-Ho |  |
| edge:e-drv-finality-rbtadr | review |  | proposed | 2026-11-11T20:39:13Z | ni:///sha-256;i_pdEDYZa7G8cVzu_eZudz926MfPmwn6alf-xZ-g-Ho |  |
| edge:e-dec-cdmdev-smerbt | review |  | proposed | 2026-11-11T20:39:13Z | ni:///sha-256;i_pdEDYZa7G8cVzu_eZudz926MfPmwn6alf-xZ-g-Ho |  |
| edge:e-lnk-gmslarbt-smerbt | review |  | proposed | 2026-11-11T20:39:13Z | ni:///sha-256;i_pdEDYZa7G8cVzu_eZudz926MfPmwn6alf-xZ-g-Ho |  |
| edge:e-lnk-rbtadr-gmslafee | review |  | proposed | 2026-11-11T20:39:13Z | ni:///sha-256;i_pdEDYZa7G8cVzu_eZudz926MfPmwn6alf-xZ-g-Ho |  |
| waypoint:wp-adr-gmsla-rebate | review | proposed | accepted | 2026-11-11T20:43:36Z | ni:///sha-256;3jzI7BHeNkATu3BL11206SQi4wTUSV7gfWfJyvULZBQ | denisurusov |
| edge:e-mrk-rbtadr-gmslarbt | review | proposed | accepted | 2026-11-11T20:43:36Z | ni:///sha-256;3jzI7BHeNkATu3BL11206SQi4wTUSV7gfWfJyvULZBQ | denisurusov |
| edge:e-drv-cdmdata-rbtadr | review | proposed | accepted | 2026-11-11T20:43:36Z | ni:///sha-256;3jzI7BHeNkATu3BL11206SQi4wTUSV7gfWfJyvULZBQ | denisurusov |
| edge:e-drv-finality-rbtadr | review | proposed | accepted | 2026-11-11T20:43:36Z | ni:///sha-256;3jzI7BHeNkATu3BL11206SQi4wTUSV7gfWfJyvULZBQ | denisurusov |
| edge:e-lnk-rbtadr-gmslafee | review | proposed | accepted | 2026-11-11T20:43:36Z | ni:///sha-256;3jzI7BHeNkATu3BL11206SQi4wTUSV7gfWfJyvULZBQ | denisurusov |
| node:task-gmsla-substitution | status | open | resolved | 2026-11-11T22:30:25Z | ni:///sha-256;-4_8CeHdfNziMg8WILpbkAcTnT8ClHTtvlm7CDBqxSs | denisurusov |
| node:task-sme-gmsla-rebate-rules | review | proposed | accepted | 2026-11-11T22:32:46Z | ni:///sha-256;0WriP72NGQNYx0kmInWomt1c37JofYeY8bT44HdP8To | denisurusov |
| edge:e-dec-cdmdev-smerbt | review | proposed | accepted | 2026-11-11T22:32:46Z | ni:///sha-256;0WriP72NGQNYx0kmInWomt1c37JofYeY8bT44HdP8To | denisurusov |
| edge:e-lnk-gmslarbt-smerbt | review | proposed | accepted | 2026-11-11T22:32:46Z | ni:///sha-256;0WriP72NGQNYx0kmInWomt1c37JofYeY8bT44HdP8To | denisurusov |
| node:investigation-live-spec-in-claude-web | review | proposed | accepted | 2026-11-09T00:49:00Z | ni:///sha-256;ZSM7RD-wnqSfs7bEWIVTHcXuZaDYjeaqU8Ftac1Z9sk | denisurusov |
| edge:e-dec-e2eflow-livespecweb | review | proposed | accepted | 2026-11-09T00:49:00Z | ni:///sha-256;ZSM7RD-wnqSfs7bEWIVTHcXuZaDYjeaqU8Ftac1Z9sk | denisurusov |
| waypoint:wp-dec-besu-genesis-entrypoint | review |  | proposed | 2026-11-09T00:49:00Z |  |  |
| edge:e-mrk-besugenesis-livespecweb | review |  | proposed | 2026-11-09T00:49:00Z |  |  |
| node:task-ci-actions-minutes | review |  | accepted | 2026-11-11T23:11:59Z | ni:///sha-256;MkiMPYZRrEaQRBWxbmX6k4r9J2ipKjghlZpI2z9Hv1U | denisurusov |
| node:task-ci-actions-minutes | status |  | resolved | 2026-11-11T23:11:59Z | ni:///sha-256;MkiMPYZRrEaQRBWxbmX6k4r9J2ipKjghlZpI2z9Hv1U | denisurusov |
| edge:e-dec-e2eflow-ciminutes | review |  | accepted | 2026-11-11T23:11:59Z | ni:///sha-256;MkiMPYZRrEaQRBWxbmX6k4r9J2ipKjghlZpI2z9Hv1U | denisurusov |
| noteworthy:nw-konspekt-cross-mode-portability | review |  | proposed | 2026-11-04T02:34:39Z |  |  |
| node:task-konspekt-index-cross-mode-portability | review |  | proposed | 2026-11-04T02:34:39Z |  |  |
| node:task-konspekt-index-cross-mode-portability | status |  | open | 2026-11-04T02:34:39Z |  |  |
| edge:e-note-adoption-crossmode | review |  | proposed | 2026-11-04T02:34:39Z |  |  |
| edge:e-dec-adoption-konspektindex | review |  | proposed | 2026-11-04T02:34:39Z |  |  |
| edge:e-note-konspektindex-crossmode | review |  | proposed | 2026-11-04T02:34:39Z |  |  |
| noteworthy:nw-konspekt-cross-mode-portability | review | proposed | accepted | 2026-11-04T02:46:43Z | ni:///sha-256;G_YJ9YN8dqrTfNU02Q0XpLloKjgzXuWSUOjTNAPHysI | denisurusov |
| node:task-konspekt-index-cross-mode-portability | review | proposed | accepted | 2026-11-04T02:46:43Z | ni:///sha-256;G_YJ9YN8dqrTfNU02Q0XpLloKjgzXuWSUOjTNAPHysI | denisurusov |
| edge:e-note-adoption-crossmode | review | proposed | accepted | 2026-11-04T02:46:43Z | ni:///sha-256;G_YJ9YN8dqrTfNU02Q0XpLloKjgzXuWSUOjTNAPHysI | denisurusov |
| edge:e-dec-adoption-konspektindex | review | proposed | accepted | 2026-11-04T02:46:43Z | ni:///sha-256;G_YJ9YN8dqrTfNU02Q0XpLloKjgzXuWSUOjTNAPHysI | denisurusov |
| edge:e-note-konspektindex-crossmode | review | proposed | accepted | 2026-11-04T02:46:43Z | ni:///sha-256;G_YJ9YN8dqrTfNU02Q0XpLloKjgzXuWSUOjTNAPHysI | denisurusov |
| node:task-konspekt-index-cross-mode-portability | status | open | resolved | 2026-11-04T02:59:07Z | ni:///sha-256;lpJ-E6THEYMuM7fb33ZF9OQ7tZ9KYigekmi21U5ElpY | denisurusov |
| waypoint:wp-dec-besu-genesis-entrypoint | review | proposed | accepted | 2026-11-11T23:18:36Z | ni:///sha-256;S3af2YPYv1OHo4u5jtWkPYMZ68NO53R_bCPx41DhcfQ | denisurusov |
| edge:e-mrk-besugenesis-livespecweb | review | proposed | accepted | 2026-11-11T23:18:36Z | ni:///sha-256;S3af2YPYv1OHo4u5jtWkPYMZ68NO53R_bCPx41DhcfQ | denisurusov |
| waypoint:wp-adr-gmsla-lending-fee | review |  | proposed | 2026-11-11T23:29:22Z | ni:///sha-256;BfvkYjlkvhxSHc9oiXE3PJDhwJxGhSHcbk582-gDCLI |  |
| node:task-sme-gmsla-fee-rules | review |  | proposed | 2026-11-11T23:29:22Z | ni:///sha-256;BfvkYjlkvhxSHc9oiXE3PJDhwJxGhSHcbk582-gDCLI |  |
| node:task-sme-gmsla-fee-rules | status |  | open | 2026-11-11T23:29:22Z | ni:///sha-256;BfvkYjlkvhxSHc9oiXE3PJDhwJxGhSHcbk582-gDCLI |  |
| edge:e-mrk-feeadr-gmslafee | review |  | proposed | 2026-11-11T23:29:22Z | ni:///sha-256;BfvkYjlkvhxSHc9oiXE3PJDhwJxGhSHcbk582-gDCLI |  |
| edge:e-drv-cdmdata-feeadr | review |  | proposed | 2026-11-11T23:29:22Z | ni:///sha-256;BfvkYjlkvhxSHc9oiXE3PJDhwJxGhSHcbk582-gDCLI |  |
| edge:e-drv-finality-feeadr | review |  | proposed | 2026-11-11T23:29:22Z | ni:///sha-256;BfvkYjlkvhxSHc9oiXE3PJDhwJxGhSHcbk582-gDCLI |  |
| edge:e-dec-cdmdev-smefee | review |  | proposed | 2026-11-11T23:29:22Z | ni:///sha-256;BfvkYjlkvhxSHc9oiXE3PJDhwJxGhSHcbk582-gDCLI |  |
| edge:e-lnk-gmslafee-smefee | review |  | proposed | 2026-11-11T23:29:22Z | ni:///sha-256;BfvkYjlkvhxSHc9oiXE3PJDhwJxGhSHcbk582-gDCLI |  |
| waypoint:wp-adr-gmsla-lending-fee | review | proposed | accepted | 2026-11-11T23:42:15Z | ni:///sha-256;7YPkw5jkzDJq8WuffvCeCW97uoYJxJ1DCtreETZtanw | denisurusov |
| node:task-sme-gmsla-fee-rules | review | proposed | accepted | 2026-11-11T23:42:15Z | ni:///sha-256;7YPkw5jkzDJq8WuffvCeCW97uoYJxJ1DCtreETZtanw | denisurusov |
| edge:e-mrk-feeadr-gmslafee | review | proposed | accepted | 2026-11-11T23:42:15Z | ni:///sha-256;7YPkw5jkzDJq8WuffvCeCW97uoYJxJ1DCtreETZtanw | denisurusov |
| edge:e-drv-cdmdata-feeadr | review | proposed | accepted | 2026-11-11T23:42:15Z | ni:///sha-256;7YPkw5jkzDJq8WuffvCeCW97uoYJxJ1DCtreETZtanw | denisurusov |
| edge:e-drv-finality-feeadr | review | proposed | accepted | 2026-11-11T23:42:15Z | ni:///sha-256;7YPkw5jkzDJq8WuffvCeCW97uoYJxJ1DCtreETZtanw | denisurusov |
| edge:e-dec-cdmdev-smefee | review | proposed | accepted | 2026-11-11T23:42:15Z | ni:///sha-256;7YPkw5jkzDJq8WuffvCeCW97uoYJxJ1DCtreETZtanw | denisurusov |
| edge:e-lnk-gmslafee-smefee | review | proposed | accepted | 2026-11-11T23:42:15Z | ni:///sha-256;7YPkw5jkzDJq8WuffvCeCW97uoYJxJ1DCtreETZtanw | denisurusov |
| node:task-gmsla-rebate | status | open | resolved | 2026-11-12T00:00:26Z | ni:///sha-256;gvQ5lKqngqSIktBGICcxSkn9J_ZOwGJkF8NV-iirew0 | denisurusov |
| node:task-gmsla-lending-fee | status | open | resolved | 2026-11-12T00:00:26Z | ni:///sha-256;gvQ5lKqngqSIktBGICcxSkn9J_ZOwGJkF8NV-iirew0 | denisurusov |
| node:task-repo-gmra-workflows | status | open | resolved | 2026-11-12T00:00:26Z | ni:///sha-256;gvQ5lKqngqSIktBGICcxSkn9J_ZOwGJkF8NV-iirew0 | denisurusov |
| node:task-live-spec-duration | status | open | resolved | 2026-11-12T00:00:26Z | ni:///sha-256;gvQ5lKqngqSIktBGICcxSkn9J_ZOwGJkF8NV-iirew0 | denisurusov |
| node:task-konspekt-checkpoint-adoption | status | open | resolved | 2026-11-12T00:00:26Z | ni:///sha-256;gvQ5lKqngqSIktBGICcxSkn9J_ZOwGJkF8NV-iirew0 | denisurusov |
| node:task-ci-deploy-dropped-tx | status | open | resolved | 2026-11-12T00:00:26Z | ni:///sha-256;gvQ5lKqngqSIktBGICcxSkn9J_ZOwGJkF8NV-iirew0 | denisurusov |
| node:task-live-spec-balance-aware-amounts | status | open | abandoned | 2026-11-12T00:00:26Z | ni:///sha-256;gvQ5lKqngqSIktBGICcxSkn9J_ZOwGJkF8NV-iirew0 | denisurusov |
| waypoint:wp-adr-gmsla-default-close-out | review |  | proposed | 2026-11-12T00:05:02Z | ni:///sha-256;FkcPk7FtgY_FTt0jan9GjgTrTGu8yA-LyZP8q7LapLE |  |
| node:task-sme-gmsla-default-rules | review |  | proposed | 2026-11-12T00:05:02Z | ni:///sha-256;FkcPk7FtgY_FTt0jan9GjgTrTGu8yA-LyZP8q7LapLE |  |
| node:task-sme-gmsla-default-rules | status |  | open | 2026-11-12T00:05:02Z | ni:///sha-256;FkcPk7FtgY_FTt0jan9GjgTrTGu8yA-LyZP8q7LapLE |  |
| edge:e-mrk-dfladr-gmsladfl | review |  | proposed | 2026-11-12T00:05:02Z | ni:///sha-256;FkcPk7FtgY_FTt0jan9GjgTrTGu8yA-LyZP8q7LapLE |  |
| edge:e-drv-cdmdata-dfladr | review |  | proposed | 2026-11-12T00:05:02Z | ni:///sha-256;FkcPk7FtgY_FTt0jan9GjgTrTGu8yA-LyZP8q7LapLE |  |
| edge:e-drv-finality-dfladr | review |  | proposed | 2026-11-12T00:05:02Z | ni:///sha-256;FkcPk7FtgY_FTt0jan9GjgTrTGu8yA-LyZP8q7LapLE |  |
| edge:e-dec-cdmdev-smedfl | review |  | proposed | 2026-11-12T00:05:02Z | ni:///sha-256;FkcPk7FtgY_FTt0jan9GjgTrTGu8yA-LyZP8q7LapLE |  |
| edge:e-lnk-gmsladfl-smedfl | review |  | proposed | 2026-11-12T00:05:02Z | ni:///sha-256;FkcPk7FtgY_FTt0jan9GjgTrTGu8yA-LyZP8q7LapLE |  |
| waypoint:wp-adr-gmsla-default-close-out | review | proposed | accepted | 2026-11-12T00:17:36Z | ni:///sha-256;pCRlAgMIzpkMRu53qynECMQMyjMAwUhbnuBW8X9fxDI | denisurusov |
| node:task-sme-gmsla-default-rules | review | proposed | accepted | 2026-11-12T00:17:36Z | ni:///sha-256;pCRlAgMIzpkMRu53qynECMQMyjMAwUhbnuBW8X9fxDI | denisurusov |
| edge:e-mrk-dfladr-gmsladfl | review | proposed | accepted | 2026-11-12T00:17:36Z | ni:///sha-256;pCRlAgMIzpkMRu53qynECMQMyjMAwUhbnuBW8X9fxDI | denisurusov |
| edge:e-drv-cdmdata-dfladr | review | proposed | accepted | 2026-11-12T00:17:36Z | ni:///sha-256;pCRlAgMIzpkMRu53qynECMQMyjMAwUhbnuBW8X9fxDI | denisurusov |
| edge:e-drv-finality-dfladr | review | proposed | accepted | 2026-11-12T00:17:36Z | ni:///sha-256;pCRlAgMIzpkMRu53qynECMQMyjMAwUhbnuBW8X9fxDI | denisurusov |
| edge:e-dec-cdmdev-smedfl | review | proposed | accepted | 2026-11-12T00:17:36Z | ni:///sha-256;pCRlAgMIzpkMRu53qynECMQMyjMAwUhbnuBW8X9fxDI | denisurusov |
| edge:e-lnk-gmsladfl-smedfl | review | proposed | accepted | 2026-11-12T00:17:36Z | ni:///sha-256;pCRlAgMIzpkMRu53qynECMQMyjMAwUhbnuBW8X9fxDI | denisurusov |
| waypoint:wp-adr-triparty-scope | review |  | proposed | 2026-11-12T00:36:54Z | ni:///sha-256;uCFqE3GZejmU7rs2-A1jFqCW9PhOIAzqqN8WMPrmca4 |  |
| node:task-triparty-terms-profile | review |  | proposed | 2026-11-12T00:36:54Z | ni:///sha-256;uCFqE3GZejmU7rs2-A1jFqCW9PhOIAzqqN8WMPrmca4 |  |
| node:task-triparty-terms-profile | status |  | open | 2026-11-12T00:36:54Z | ni:///sha-256;uCFqE3GZejmU7rs2-A1jFqCW9PhOIAzqqN8WMPrmca4 |  |
| node:task-triparty-trade-start | review |  | proposed | 2026-11-12T00:36:54Z | ni:///sha-256;uCFqE3GZejmU7rs2-A1jFqCW9PhOIAzqqN8WMPrmca4 |  |
| node:task-triparty-trade-start | status |  | open | 2026-11-12T00:36:54Z | ni:///sha-256;uCFqE3GZejmU7rs2-A1jFqCW9PhOIAzqqN8WMPrmca4 |  |
| node:task-triparty-revaluation | review |  | proposed | 2026-11-12T00:36:54Z | ni:///sha-256;uCFqE3GZejmU7rs2-A1jFqCW9PhOIAzqqN8WMPrmca4 |  |
| node:task-triparty-revaluation | status |  | open | 2026-11-12T00:36:54Z | ni:///sha-256;uCFqE3GZejmU7rs2-A1jFqCW9PhOIAzqqN8WMPrmca4 |  |
| node:task-triparty-substitution | review |  | proposed | 2026-11-12T00:36:54Z | ni:///sha-256;uCFqE3GZejmU7rs2-A1jFqCW9PhOIAzqqN8WMPrmca4 |  |
| node:task-triparty-substitution | status |  | open | 2026-11-12T00:36:54Z | ni:///sha-256;uCFqE3GZejmU7rs2-A1jFqCW9PhOIAzqqN8WMPrmca4 |  |
| node:task-triparty-trade-end | review |  | proposed | 2026-11-12T00:36:54Z | ni:///sha-256;uCFqE3GZejmU7rs2-A1jFqCW9PhOIAzqqN8WMPrmca4 |  |
| node:task-triparty-trade-end | status |  | open | 2026-11-12T00:36:54Z | ni:///sha-256;uCFqE3GZejmU7rs2-A1jFqCW9PhOIAzqqN8WMPrmca4 |  |
| node:task-triparty-reporting | review |  | proposed | 2026-11-12T00:36:54Z | ni:///sha-256;uCFqE3GZejmU7rs2-A1jFqCW9PhOIAzqqN8WMPrmca4 |  |
| node:task-triparty-reporting | status |  | open | 2026-11-12T00:36:54Z | ni:///sha-256;uCFqE3GZejmU7rs2-A1jFqCW9PhOIAzqqN8WMPrmca4 |  |
| edge:e-mrk-tpscope-tp | review |  | proposed | 2026-11-12T00:36:54Z | ni:///sha-256;uCFqE3GZejmU7rs2-A1jFqCW9PhOIAzqqN8WMPrmca4 |  |
| edge:e-drv-cdmdata-tpscope | review |  | proposed | 2026-11-12T00:36:54Z | ni:///sha-256;uCFqE3GZejmU7rs2-A1jFqCW9PhOIAzqqN8WMPrmca4 |  |
| edge:e-drv-finality-tpscope | review |  | proposed | 2026-11-12T00:36:54Z | ni:///sha-256;uCFqE3GZejmU7rs2-A1jFqCW9PhOIAzqqN8WMPrmca4 |  |
| edge:e-dec-tp-terms | review |  | proposed | 2026-11-12T00:36:54Z | ni:///sha-256;uCFqE3GZejmU7rs2-A1jFqCW9PhOIAzqqN8WMPrmca4 |  |
| edge:e-dec-tp-tradestart | review |  | proposed | 2026-11-12T00:36:54Z | ni:///sha-256;uCFqE3GZejmU7rs2-A1jFqCW9PhOIAzqqN8WMPrmca4 |  |
| edge:e-dec-tp-reval | review |  | proposed | 2026-11-12T00:36:54Z | ni:///sha-256;uCFqE3GZejmU7rs2-A1jFqCW9PhOIAzqqN8WMPrmca4 |  |
| edge:e-dec-tp-subst | review |  | proposed | 2026-11-12T00:36:54Z | ni:///sha-256;uCFqE3GZejmU7rs2-A1jFqCW9PhOIAzqqN8WMPrmca4 |  |
| edge:e-dec-tp-tradeend | review |  | proposed | 2026-11-12T00:36:54Z | ni:///sha-256;uCFqE3GZejmU7rs2-A1jFqCW9PhOIAzqqN8WMPrmca4 |  |
| edge:e-dec-tp-report | review |  | proposed | 2026-11-12T00:36:54Z | ni:///sha-256;uCFqE3GZejmU7rs2-A1jFqCW9PhOIAzqqN8WMPrmca4 |  |
| waypoint:wp-adr-triparty-terms-profile | review |  | proposed | 2026-11-12T00:45:37Z | ni:///sha-256;AgQB7ZI3RfjJfdb1Rt1wDzqbECK7Lk9ZaYGCGoJqyPM |  |
| node:task-sme-triparty-terms-profile | review |  | proposed | 2026-11-12T00:45:37Z | ni:///sha-256;AgQB7ZI3RfjJfdb1Rt1wDzqbECK7Lk9ZaYGCGoJqyPM |  |
| node:task-sme-triparty-terms-profile | status |  | open | 2026-11-12T00:45:37Z | ni:///sha-256;AgQB7ZI3RfjJfdb1Rt1wDzqbECK7Lk9ZaYGCGoJqyPM |  |
| edge:e-mrk-tptermsadr-tpterms | review |  | proposed | 2026-11-12T00:45:37Z | ni:///sha-256;AgQB7ZI3RfjJfdb1Rt1wDzqbECK7Lk9ZaYGCGoJqyPM |  |
| edge:e-drv-cdmdata-tptermsadr | review |  | proposed | 2026-11-12T00:45:37Z | ni:///sha-256;AgQB7ZI3RfjJfdb1Rt1wDzqbECK7Lk9ZaYGCGoJqyPM |  |
| edge:e-drv-finality-tptermsadr | review |  | proposed | 2026-11-12T00:45:37Z | ni:///sha-256;AgQB7ZI3RfjJfdb1Rt1wDzqbECK7Lk9ZaYGCGoJqyPM |  |
| edge:e-dec-cdmdev-smetpterms | review |  | proposed | 2026-11-12T00:45:37Z | ni:///sha-256;AgQB7ZI3RfjJfdb1Rt1wDzqbECK7Lk9ZaYGCGoJqyPM |  |
| edge:e-lnk-tpterms-smetpterms | review |  | proposed | 2026-11-12T00:45:37Z | ni:///sha-256;AgQB7ZI3RfjJfdb1Rt1wDzqbECK7Lk9ZaYGCGoJqyPM |  |
| waypoint:wp-adr-triparty-scope | review | proposed | accepted | 2026-11-12T01:07:01Z | ni:///sha-256;ipCRbvl2MRBclBmWwdk7mnkFBZI7jEgxBnv-QoqYemg | denisurusov |
| waypoint:wp-adr-triparty-terms-profile | review | proposed | accepted | 2026-11-12T01:07:01Z | ni:///sha-256;ipCRbvl2MRBclBmWwdk7mnkFBZI7jEgxBnv-QoqYemg | denisurusov |
| node:task-triparty-terms-profile | review | proposed | accepted | 2026-11-12T01:07:01Z | ni:///sha-256;ipCRbvl2MRBclBmWwdk7mnkFBZI7jEgxBnv-QoqYemg | denisurusov |
| node:task-triparty-trade-start | review | proposed | accepted | 2026-11-12T01:07:01Z | ni:///sha-256;ipCRbvl2MRBclBmWwdk7mnkFBZI7jEgxBnv-QoqYemg | denisurusov |
| node:task-triparty-revaluation | review | proposed | accepted | 2026-11-12T01:07:01Z | ni:///sha-256;ipCRbvl2MRBclBmWwdk7mnkFBZI7jEgxBnv-QoqYemg | denisurusov |
| node:task-triparty-substitution | review | proposed | accepted | 2026-11-12T01:07:01Z | ni:///sha-256;ipCRbvl2MRBclBmWwdk7mnkFBZI7jEgxBnv-QoqYemg | denisurusov |
| node:task-triparty-trade-end | review | proposed | accepted | 2026-11-12T01:07:01Z | ni:///sha-256;ipCRbvl2MRBclBmWwdk7mnkFBZI7jEgxBnv-QoqYemg | denisurusov |
| node:task-triparty-reporting | review | proposed | accepted | 2026-11-12T01:07:01Z | ni:///sha-256;ipCRbvl2MRBclBmWwdk7mnkFBZI7jEgxBnv-QoqYemg | denisurusov |
| node:task-sme-triparty-terms-profile | review | proposed | accepted | 2026-11-12T01:07:01Z | ni:///sha-256;ipCRbvl2MRBclBmWwdk7mnkFBZI7jEgxBnv-QoqYemg | denisurusov |
| edge:e-mrk-tpscope-tp | review | proposed | accepted | 2026-11-12T01:07:01Z | ni:///sha-256;ipCRbvl2MRBclBmWwdk7mnkFBZI7jEgxBnv-QoqYemg | denisurusov |
| edge:e-drv-cdmdata-tpscope | review | proposed | accepted | 2026-11-12T01:07:01Z | ni:///sha-256;ipCRbvl2MRBclBmWwdk7mnkFBZI7jEgxBnv-QoqYemg | denisurusov |
| edge:e-drv-finality-tpscope | review | proposed | accepted | 2026-11-12T01:07:01Z | ni:///sha-256;ipCRbvl2MRBclBmWwdk7mnkFBZI7jEgxBnv-QoqYemg | denisurusov |
| edge:e-dec-tp-terms | review | proposed | accepted | 2026-11-12T01:07:01Z | ni:///sha-256;ipCRbvl2MRBclBmWwdk7mnkFBZI7jEgxBnv-QoqYemg | denisurusov |
| edge:e-dec-tp-tradestart | review | proposed | accepted | 2026-11-12T01:07:01Z | ni:///sha-256;ipCRbvl2MRBclBmWwdk7mnkFBZI7jEgxBnv-QoqYemg | denisurusov |
| edge:e-dec-tp-reval | review | proposed | accepted | 2026-11-12T01:07:01Z | ni:///sha-256;ipCRbvl2MRBclBmWwdk7mnkFBZI7jEgxBnv-QoqYemg | denisurusov |
| edge:e-dec-tp-subst | review | proposed | accepted | 2026-11-12T01:07:01Z | ni:///sha-256;ipCRbvl2MRBclBmWwdk7mnkFBZI7jEgxBnv-QoqYemg | denisurusov |
| edge:e-dec-tp-tradeend | review | proposed | accepted | 2026-11-12T01:07:01Z | ni:///sha-256;ipCRbvl2MRBclBmWwdk7mnkFBZI7jEgxBnv-QoqYemg | denisurusov |
| edge:e-dec-tp-report | review | proposed | accepted | 2026-11-12T01:07:01Z | ni:///sha-256;ipCRbvl2MRBclBmWwdk7mnkFBZI7jEgxBnv-QoqYemg | denisurusov |
| edge:e-mrk-tptermsadr-tpterms | review | proposed | accepted | 2026-11-12T01:07:01Z | ni:///sha-256;ipCRbvl2MRBclBmWwdk7mnkFBZI7jEgxBnv-QoqYemg | denisurusov |
| edge:e-drv-cdmdata-tptermsadr | review | proposed | accepted | 2026-11-12T01:07:01Z | ni:///sha-256;ipCRbvl2MRBclBmWwdk7mnkFBZI7jEgxBnv-QoqYemg | denisurusov |
| edge:e-drv-finality-tptermsadr | review | proposed | accepted | 2026-11-12T01:07:01Z | ni:///sha-256;ipCRbvl2MRBclBmWwdk7mnkFBZI7jEgxBnv-QoqYemg | denisurusov |
| edge:e-dec-cdmdev-smetpterms | review | proposed | accepted | 2026-11-12T01:07:01Z | ni:///sha-256;ipCRbvl2MRBclBmWwdk7mnkFBZI7jEgxBnv-QoqYemg | denisurusov |
| edge:e-lnk-tpterms-smetpterms | review | proposed | accepted | 2026-11-12T01:07:01Z | ni:///sha-256;ipCRbvl2MRBclBmWwdk7mnkFBZI7jEgxBnv-QoqYemg | denisurusov |
| waypoint:wp-adr-triparty-trade-start | review |  | proposed | 2026-11-12T01:20:36Z | ni:///sha-256;-yKSBOR9mILY7KVPWYYiYncIH1lSpW8UGGTQ5STbi-k |  |
| node:task-sme-triparty-trade-start | review |  | proposed | 2026-11-12T01:20:36Z | ni:///sha-256;-yKSBOR9mILY7KVPWYYiYncIH1lSpW8UGGTQ5STbi-k |  |
| node:task-sme-triparty-trade-start | status |  | open | 2026-11-12T01:20:36Z | ni:///sha-256;-yKSBOR9mILY7KVPWYYiYncIH1lSpW8UGGTQ5STbi-k |  |
| edge:e-mrk-tpstartadr-tpstart | review |  | proposed | 2026-11-12T01:20:36Z | ni:///sha-256;-yKSBOR9mILY7KVPWYYiYncIH1lSpW8UGGTQ5STbi-k |  |
| edge:e-drv-cdmdata-tpstartadr | review |  | proposed | 2026-11-12T01:20:36Z | ni:///sha-256;-yKSBOR9mILY7KVPWYYiYncIH1lSpW8UGGTQ5STbi-k |  |
| edge:e-drv-finality-tpstartadr | review |  | proposed | 2026-11-12T01:20:36Z | ni:///sha-256;-yKSBOR9mILY7KVPWYYiYncIH1lSpW8UGGTQ5STbi-k |  |
| edge:e-dec-cdmdev-smetpstart | review |  | proposed | 2026-11-12T01:20:36Z | ni:///sha-256;-yKSBOR9mILY7KVPWYYiYncIH1lSpW8UGGTQ5STbi-k |  |
| edge:e-lnk-tpstart-smetpstart | review |  | proposed | 2026-11-12T01:20:36Z | ni:///sha-256;-yKSBOR9mILY7KVPWYYiYncIH1lSpW8UGGTQ5STbi-k |  |
| waypoint:wp-adr-triparty-trade-start | review | proposed | accepted | 2026-11-12T02:16:12Z | ni:///sha-256;cUpPrhQtdkuKXY9nop1tbsQvtVmbXFEJaJYn6_FEHPM | denisurusov |
| node:task-sme-triparty-trade-start | review | proposed | accepted | 2026-11-12T02:16:12Z | ni:///sha-256;cUpPrhQtdkuKXY9nop1tbsQvtVmbXFEJaJYn6_FEHPM | denisurusov |
| edge:e-mrk-tpstartadr-tpstart | review | proposed | accepted | 2026-11-12T02:16:12Z | ni:///sha-256;cUpPrhQtdkuKXY9nop1tbsQvtVmbXFEJaJYn6_FEHPM | denisurusov |
| edge:e-drv-cdmdata-tpstartadr | review | proposed | accepted | 2026-11-12T02:16:12Z | ni:///sha-256;cUpPrhQtdkuKXY9nop1tbsQvtVmbXFEJaJYn6_FEHPM | denisurusov |
| edge:e-drv-finality-tpstartadr | review | proposed | accepted | 2026-11-12T02:16:12Z | ni:///sha-256;cUpPrhQtdkuKXY9nop1tbsQvtVmbXFEJaJYn6_FEHPM | denisurusov |
| edge:e-dec-cdmdev-smetpstart | review | proposed | accepted | 2026-11-12T02:16:12Z | ni:///sha-256;cUpPrhQtdkuKXY9nop1tbsQvtVmbXFEJaJYn6_FEHPM | denisurusov |
| edge:e-lnk-tpstart-smetpstart | review | proposed | accepted | 2026-11-12T02:16:12Z | ni:///sha-256;cUpPrhQtdkuKXY9nop1tbsQvtVmbXFEJaJYn6_FEHPM | denisurusov |
| waypoint:wp-adr-triparty-revaluation | review |  | accepted | 2026-11-12T04:13:02Z | ni:///sha-256;y73URoctWIzGAFYxJdWd5yIFG8SjWG3ImDVRrRKJM0o | denisurusov |
| node:task-sme-triparty-revaluation | review |  | proposed | 2026-11-12T04:13:02Z | ni:///sha-256;y73URoctWIzGAFYxJdWd5yIFG8SjWG3ImDVRrRKJM0o |  |
| node:task-sme-triparty-revaluation | status |  | open | 2026-11-12T04:13:02Z | ni:///sha-256;y73URoctWIzGAFYxJdWd5yIFG8SjWG3ImDVRrRKJM0o |  |
| edge:e-mrk-tprevaladr-tpreval | review |  | proposed | 2026-11-12T04:13:02Z | ni:///sha-256;y73URoctWIzGAFYxJdWd5yIFG8SjWG3ImDVRrRKJM0o |  |
| edge:e-drv-cdmdata-tprevaladr | review |  | proposed | 2026-11-12T04:13:02Z | ni:///sha-256;y73URoctWIzGAFYxJdWd5yIFG8SjWG3ImDVRrRKJM0o |  |
| edge:e-drv-finality-tprevaladr | review |  | proposed | 2026-11-12T04:13:02Z | ni:///sha-256;y73URoctWIzGAFYxJdWd5yIFG8SjWG3ImDVRrRKJM0o |  |
| edge:e-dec-cdmdev-smetpreval | review |  | proposed | 2026-11-12T04:13:02Z | ni:///sha-256;y73URoctWIzGAFYxJdWd5yIFG8SjWG3ImDVRrRKJM0o |  |
| edge:e-lnk-tpreval-smetpreval | review |  | proposed | 2026-11-12T04:13:02Z | ni:///sha-256;y73URoctWIzGAFYxJdWd5yIFG8SjWG3ImDVRrRKJM0o |  |
| node:task-sme-triparty-revaluation | review | proposed | accepted | 2026-11-12T11:42:00Z | ni:///sha-256;aF2lCaKl5lvxVKHkqu_pMQRnNcahdvJTPn57KhDjPZs | denisurusov |
| edge:e-mrk-tprevaladr-tpreval | review | proposed | accepted | 2026-11-12T11:42:00Z | ni:///sha-256;aF2lCaKl5lvxVKHkqu_pMQRnNcahdvJTPn57KhDjPZs | denisurusov |
| edge:e-drv-cdmdata-tprevaladr | review | proposed | accepted | 2026-11-12T11:42:00Z | ni:///sha-256;aF2lCaKl5lvxVKHkqu_pMQRnNcahdvJTPn57KhDjPZs | denisurusov |
| edge:e-drv-finality-tprevaladr | review | proposed | accepted | 2026-11-12T11:42:00Z | ni:///sha-256;aF2lCaKl5lvxVKHkqu_pMQRnNcahdvJTPn57KhDjPZs | denisurusov |
| edge:e-dec-cdmdev-smetpreval | review | proposed | accepted | 2026-11-12T11:42:00Z | ni:///sha-256;aF2lCaKl5lvxVKHkqu_pMQRnNcahdvJTPn57KhDjPZs | denisurusov |
| edge:e-lnk-tpreval-smetpreval | review | proposed | accepted | 2026-11-12T11:42:00Z | ni:///sha-256;aF2lCaKl5lvxVKHkqu_pMQRnNcahdvJTPn57KhDjPZs | denisurusov |
| edge:e-dec-adoption-presentation | review | proposed | accepted | 2026-11-12T11:42:00Z | ni:///sha-256;aF2lCaKl5lvxVKHkqu_pMQRnNcahdvJTPn57KhDjPZs | denisurusov |
| waypoint:wp-adr-triparty-substitution | review |  | accepted | 2026-11-12T11:53:00Z | ni:///sha-256;6TPBBDofDlexXsJqknY8OnJK6dCtu2t7JP5tGc27s74 | denisurusov |
| node:task-sme-triparty-substitution | review |  | proposed | 2026-11-12T11:53:00Z | ni:///sha-256;6TPBBDofDlexXsJqknY8OnJK6dCtu2t7JP5tGc27s74 |  |
| node:task-sme-triparty-substitution | status |  | open | 2026-11-12T11:53:00Z | ni:///sha-256;6TPBBDofDlexXsJqknY8OnJK6dCtu2t7JP5tGc27s74 |  |
| edge:e-mrk-tpsubadr-tpsub | review |  | proposed | 2026-11-12T11:53:00Z | ni:///sha-256;6TPBBDofDlexXsJqknY8OnJK6dCtu2t7JP5tGc27s74 |  |
| edge:e-drv-cdmdata-tpsubadr | review |  | proposed | 2026-11-12T11:53:00Z | ni:///sha-256;6TPBBDofDlexXsJqknY8OnJK6dCtu2t7JP5tGc27s74 |  |
| edge:e-drv-finality-tpsubadr | review |  | proposed | 2026-11-12T11:53:00Z | ni:///sha-256;6TPBBDofDlexXsJqknY8OnJK6dCtu2t7JP5tGc27s74 |  |
| edge:e-dec-cdmdev-smetpsub | review |  | proposed | 2026-11-12T11:53:00Z | ni:///sha-256;6TPBBDofDlexXsJqknY8OnJK6dCtu2t7JP5tGc27s74 |  |
| edge:e-lnk-tpsub-smetpsub | review |  | proposed | 2026-11-12T11:53:00Z | ni:///sha-256;6TPBBDofDlexXsJqknY8OnJK6dCtu2t7JP5tGc27s74 |  |
| edge:e-mrk-tpsubadr-tpsub | review | proposed | accepted | 2026-11-12T12:33:00Z | ni:///sha-256;Oeh1Qnc18ntGSaN5kgHPyUaFjLbicttR-sITHXYFmtY | denisurusov |
| edge:e-drv-cdmdata-tpsubadr | review | proposed | accepted | 2026-11-12T12:33:00Z | ni:///sha-256;Oeh1Qnc18ntGSaN5kgHPyUaFjLbicttR-sITHXYFmtY | denisurusov |
| edge:e-drv-finality-tpsubadr | review | proposed | accepted | 2026-11-12T12:33:00Z | ni:///sha-256;Oeh1Qnc18ntGSaN5kgHPyUaFjLbicttR-sITHXYFmtY | denisurusov |
| edge:e-dec-cdmdev-smetpsub | review | proposed | accepted | 2026-11-12T12:33:00Z | ni:///sha-256;Oeh1Qnc18ntGSaN5kgHPyUaFjLbicttR-sITHXYFmtY | denisurusov |
| edge:e-lnk-tpsub-smetpsub | review | proposed | accepted | 2026-11-12T12:33:00Z | ni:///sha-256;Oeh1Qnc18ntGSaN5kgHPyUaFjLbicttR-sITHXYFmtY | denisurusov |
| node:task-sme-triparty-substitution | review | proposed | accepted | 2026-11-12T12:42:00Z | ni:///sha-256;kCFINuDc5yr4LikihHp9nanqxBDuQIFznFrI3iOtqWk | denisurusov |
| waypoint:wp-adr-triparty-trade-end | review |  | accepted | 2026-11-12T12:42:00Z | ni:///sha-256;kCFINuDc5yr4LikihHp9nanqxBDuQIFznFrI3iOtqWk | denisurusov |
| node:task-sme-triparty-trade-end | review |  | proposed | 2026-11-12T12:42:00Z | ni:///sha-256;kCFINuDc5yr4LikihHp9nanqxBDuQIFznFrI3iOtqWk |  |
| node:task-sme-triparty-trade-end | status |  | open | 2026-11-12T12:42:00Z | ni:///sha-256;kCFINuDc5yr4LikihHp9nanqxBDuQIFznFrI3iOtqWk |  |
| edge:e-mrk-tpendadr-tpend | review |  | proposed | 2026-11-12T12:42:00Z | ni:///sha-256;kCFINuDc5yr4LikihHp9nanqxBDuQIFznFrI3iOtqWk |  |
| edge:e-drv-cdmdata-tpendadr | review |  | proposed | 2026-11-12T12:42:00Z | ni:///sha-256;kCFINuDc5yr4LikihHp9nanqxBDuQIFznFrI3iOtqWk |  |
| edge:e-drv-finality-tpendadr | review |  | proposed | 2026-11-12T12:42:00Z | ni:///sha-256;kCFINuDc5yr4LikihHp9nanqxBDuQIFznFrI3iOtqWk |  |
| edge:e-dec-cdmdev-smetpend | review |  | proposed | 2026-11-12T12:42:00Z | ni:///sha-256;kCFINuDc5yr4LikihHp9nanqxBDuQIFznFrI3iOtqWk |  |
| edge:e-lnk-tpend-smetpend | review |  | proposed | 2026-11-12T12:42:00Z | ni:///sha-256;kCFINuDc5yr4LikihHp9nanqxBDuQIFznFrI3iOtqWk |  |
| node:task-sme-triparty-trade-end | review | proposed | accepted | 2026-11-12T13:49:00Z | ni:///sha-256;2GVMBxFcikGG3Wd3qWLk9UxGf7SDQCoDmgWEqwOlh4w | denisurusov |
| edge:e-mrk-tpendadr-tpend | review | proposed | accepted | 2026-11-12T13:49:00Z | ni:///sha-256;2GVMBxFcikGG3Wd3qWLk9UxGf7SDQCoDmgWEqwOlh4w | denisurusov |
| edge:e-drv-cdmdata-tpendadr | review | proposed | accepted | 2026-11-12T13:49:00Z | ni:///sha-256;2GVMBxFcikGG3Wd3qWLk9UxGf7SDQCoDmgWEqwOlh4w | denisurusov |
| edge:e-drv-finality-tpendadr | review | proposed | accepted | 2026-11-12T13:49:00Z | ni:///sha-256;2GVMBxFcikGG3Wd3qWLk9UxGf7SDQCoDmgWEqwOlh4w | denisurusov |
| edge:e-dec-cdmdev-smetpend | review | proposed | accepted | 2026-11-12T13:49:00Z | ni:///sha-256;2GVMBxFcikGG3Wd3qWLk9UxGf7SDQCoDmgWEqwOlh4w | denisurusov |
| edge:e-lnk-tpend-smetpend | review | proposed | accepted | 2026-11-12T13:49:00Z | ni:///sha-256;2GVMBxFcikGG3Wd3qWLk9UxGf7SDQCoDmgWEqwOlh4w | denisurusov |
| waypoint:wp-adr-triparty-reporting | review |  | proposed | 2026-11-12T13:55:00Z | ni:///sha-256;2GVMBxFcikGG3Wd3qWLk9UxGf7SDQCoDmgWEqwOlh4w |  |
| node:task-sme-triparty-reporting | review |  | proposed | 2026-11-12T13:55:00Z | ni:///sha-256;2GVMBxFcikGG3Wd3qWLk9UxGf7SDQCoDmgWEqwOlh4w |  |
| node:task-sme-triparty-reporting | status |  | open | 2026-11-12T13:55:00Z | ni:///sha-256;2GVMBxFcikGG3Wd3qWLk9UxGf7SDQCoDmgWEqwOlh4w |  |
| edge:e-mrk-tprepadr-tprep | review |  | proposed | 2026-11-12T13:55:00Z | ni:///sha-256;2GVMBxFcikGG3Wd3qWLk9UxGf7SDQCoDmgWEqwOlh4w |  |
| edge:e-drv-cdmdata-tprepadr | review |  | proposed | 2026-11-12T13:55:00Z | ni:///sha-256;2GVMBxFcikGG3Wd3qWLk9UxGf7SDQCoDmgWEqwOlh4w |  |
| edge:e-dec-cdmdev-smetprep | review |  | proposed | 2026-11-12T13:55:00Z | ni:///sha-256;2GVMBxFcikGG3Wd3qWLk9UxGf7SDQCoDmgWEqwOlh4w |  |
| edge:e-lnk-tprep-smetprep | review |  | proposed | 2026-11-12T13:55:00Z | ni:///sha-256;2GVMBxFcikGG3Wd3qWLk9UxGf7SDQCoDmgWEqwOlh4w |  |
| edge:e-mrk-tprepadr-tprep | review | proposed | accepted | 2026-11-12T18:25:00Z | ni:///sha-256;N4gtG4mbzjE1QoXqgyZKO4nB6ax62aB4uQadg_YPaCg | denisurusov |
| edge:e-drv-cdmdata-tprepadr | review | proposed | accepted | 2026-11-12T18:25:00Z | ni:///sha-256;N4gtG4mbzjE1QoXqgyZKO4nB6ax62aB4uQadg_YPaCg | denisurusov |
| edge:e-dec-cdmdev-smetprep | review | proposed | accepted | 2026-11-12T18:25:00Z | ni:///sha-256;N4gtG4mbzjE1QoXqgyZKO4nB6ax62aB4uQadg_YPaCg | denisurusov |
| edge:e-lnk-tprep-smetprep | review | proposed | accepted | 2026-11-12T18:25:00Z | ni:///sha-256;N4gtG4mbzjE1QoXqgyZKO4nB6ax62aB4uQadg_YPaCg | denisurusov |
| waypoint:wp-adr-ccp-scope | review |  | accepted | 2026-11-12T18:25:00Z | ni:///sha-256;N4gtG4mbzjE1QoXqgyZKO4nB6ax62aB4uQadg_YPaCg | denisurusov |
| node:task-ccp-membership | review |  | accepted | 2026-11-12T18:25:00Z | ni:///sha-256;N4gtG4mbzjE1QoXqgyZKO4nB6ax62aB4uQadg_YPaCg | denisurusov |
| node:task-ccp-membership | status |  | open | 2026-11-12T18:25:00Z | ni:///sha-256;N4gtG4mbzjE1QoXqgyZKO4nB6ax62aB4uQadg_YPaCg |  |
| node:task-ccp-clearing | review |  | accepted | 2026-11-12T18:25:00Z | ni:///sha-256;N4gtG4mbzjE1QoXqgyZKO4nB6ax62aB4uQadg_YPaCg | denisurusov |
| node:task-ccp-clearing | status |  | open | 2026-11-12T18:25:00Z | ni:///sha-256;N4gtG4mbzjE1QoXqgyZKO4nB6ax62aB4uQadg_YPaCg |  |
| node:task-ccp-margin | review |  | accepted | 2026-11-12T18:25:00Z | ni:///sha-256;N4gtG4mbzjE1QoXqgyZKO4nB6ax62aB4uQadg_YPaCg | denisurusov |
| node:task-ccp-margin | status |  | open | 2026-11-12T18:25:00Z | ni:///sha-256;N4gtG4mbzjE1QoXqgyZKO4nB6ax62aB4uQadg_YPaCg |  |
| node:task-ccp-default | review |  | accepted | 2026-11-12T18:25:00Z | ni:///sha-256;N4gtG4mbzjE1QoXqgyZKO4nB6ax62aB4uQadg_YPaCg | denisurusov |
| node:task-ccp-default | status |  | open | 2026-11-12T18:25:00Z | ni:///sha-256;N4gtG4mbzjE1QoXqgyZKO4nB6ax62aB4uQadg_YPaCg |  |
| node:task-ccp-porting | review |  | accepted | 2026-11-12T18:25:00Z | ni:///sha-256;N4gtG4mbzjE1QoXqgyZKO4nB6ax62aB4uQadg_YPaCg | denisurusov |
| node:task-ccp-porting | status |  | open | 2026-11-12T18:25:00Z | ni:///sha-256;N4gtG4mbzjE1QoXqgyZKO4nB6ax62aB4uQadg_YPaCg |  |
| node:task-live-spec-node-read-after-write | review |  | accepted | 2026-11-12T18:25:00Z | ni:///sha-256;N4gtG4mbzjE1QoXqgyZKO4nB6ax62aB4uQadg_YPaCg | denisurusov |
| node:task-live-spec-node-read-after-write | status |  | open | 2026-11-12T18:25:00Z | ni:///sha-256;N4gtG4mbzjE1QoXqgyZKO4nB6ax62aB4uQadg_YPaCg |  |
| edge:e-mrk-ccpscope-ccp | review |  | proposed | 2026-11-12T18:25:00Z | ni:///sha-256;N4gtG4mbzjE1QoXqgyZKO4nB6ax62aB4uQadg_YPaCg |  |
| edge:e-drv-cdmdata-ccpscope | review |  | proposed | 2026-11-12T18:25:00Z | ni:///sha-256;N4gtG4mbzjE1QoXqgyZKO4nB6ax62aB4uQadg_YPaCg |  |
| edge:e-drv-finality-ccpscope | review |  | proposed | 2026-11-12T18:25:00Z | ni:///sha-256;N4gtG4mbzjE1QoXqgyZKO4nB6ax62aB4uQadg_YPaCg |  |
| edge:e-dec-ccp-membership | review |  | proposed | 2026-11-12T18:25:00Z | ni:///sha-256;N4gtG4mbzjE1QoXqgyZKO4nB6ax62aB4uQadg_YPaCg |  |
| edge:e-dec-ccp-clearing | review |  | proposed | 2026-11-12T18:25:00Z | ni:///sha-256;N4gtG4mbzjE1QoXqgyZKO4nB6ax62aB4uQadg_YPaCg |  |
| edge:e-dec-ccp-margin | review |  | proposed | 2026-11-12T18:25:00Z | ni:///sha-256;N4gtG4mbzjE1QoXqgyZKO4nB6ax62aB4uQadg_YPaCg |  |
| edge:e-dec-ccp-default | review |  | proposed | 2026-11-12T18:25:00Z | ni:///sha-256;N4gtG4mbzjE1QoXqgyZKO4nB6ax62aB4uQadg_YPaCg |  |
| edge:e-dec-ccp-porting | review |  | proposed | 2026-11-12T18:25:00Z | ni:///sha-256;N4gtG4mbzjE1QoXqgyZKO4nB6ax62aB4uQadg_YPaCg |  |
| edge:e-dec-e2eflow-readafterwrite | review |  | proposed | 2026-11-12T18:25:00Z | ni:///sha-256;N4gtG4mbzjE1QoXqgyZKO4nB6ax62aB4uQadg_YPaCg |  |
| edge:e-mrk-ccpscope-ccp | review | proposed | accepted | 2026-11-12T19:01:00Z | ni:///sha-256;Q3FCu-uTUmAF5KOP3mhMpPBE4mJ2cn6PTpZ012TENfo | denisurusov |
| edge:e-drv-cdmdata-ccpscope | review | proposed | accepted | 2026-11-12T19:01:00Z | ni:///sha-256;Q3FCu-uTUmAF5KOP3mhMpPBE4mJ2cn6PTpZ012TENfo | denisurusov |
| edge:e-drv-finality-ccpscope | review | proposed | accepted | 2026-11-12T19:01:00Z | ni:///sha-256;Q3FCu-uTUmAF5KOP3mhMpPBE4mJ2cn6PTpZ012TENfo | denisurusov |
| edge:e-dec-ccp-membership | review | proposed | accepted | 2026-11-12T19:01:00Z | ni:///sha-256;Q3FCu-uTUmAF5KOP3mhMpPBE4mJ2cn6PTpZ012TENfo | denisurusov |
| edge:e-dec-ccp-clearing | review | proposed | accepted | 2026-11-12T19:01:00Z | ni:///sha-256;Q3FCu-uTUmAF5KOP3mhMpPBE4mJ2cn6PTpZ012TENfo | denisurusov |
| edge:e-dec-ccp-margin | review | proposed | accepted | 2026-11-12T19:01:00Z | ni:///sha-256;Q3FCu-uTUmAF5KOP3mhMpPBE4mJ2cn6PTpZ012TENfo | denisurusov |
| edge:e-dec-ccp-default | review | proposed | accepted | 2026-11-12T19:01:00Z | ni:///sha-256;Q3FCu-uTUmAF5KOP3mhMpPBE4mJ2cn6PTpZ012TENfo | denisurusov |
| edge:e-dec-ccp-porting | review | proposed | accepted | 2026-11-12T19:01:00Z | ni:///sha-256;Q3FCu-uTUmAF5KOP3mhMpPBE4mJ2cn6PTpZ012TENfo | denisurusov |
| edge:e-dec-e2eflow-readafterwrite | review | proposed | accepted | 2026-11-12T19:01:00Z | ni:///sha-256;Q3FCu-uTUmAF5KOP3mhMpPBE4mJ2cn6PTpZ012TENfo | denisurusov |
| waypoint:wp-adr-ccp-membership | review |  | accepted | 2026-11-12T19:01:00Z | ni:///sha-256;Q3FCu-uTUmAF5KOP3mhMpPBE4mJ2cn6PTpZ012TENfo | denisurusov |
| edge:e-mrk-ccpmemadr-ccpmem | review |  | proposed | 2026-11-12T19:01:00Z | ni:///sha-256;Q3FCu-uTUmAF5KOP3mhMpPBE4mJ2cn6PTpZ012TENfo |  |
| edge:e-drv-cdmdata-ccpmemadr | review |  | proposed | 2026-11-12T19:01:00Z | ni:///sha-256;Q3FCu-uTUmAF5KOP3mhMpPBE4mJ2cn6PTpZ012TENfo |  |
| node:task-sme-ccp-membership | review |  | proposed | 2026-11-12T19:40:00Z | ni:///sha-256;Q3FCu-uTUmAF5KOP3mhMpPBE4mJ2cn6PTpZ012TENfo |  |
| node:task-sme-ccp-membership | status |  | open | 2026-11-12T19:40:00Z | ni:///sha-256;Q3FCu-uTUmAF5KOP3mhMpPBE4mJ2cn6PTpZ012TENfo |  |
| edge:e-dec-cdmdev-smeccpmem | review |  | proposed | 2026-11-12T19:40:00Z | ni:///sha-256;Q3FCu-uTUmAF5KOP3mhMpPBE4mJ2cn6PTpZ012TENfo |  |
| edge:e-lnk-ccpmem-smeccpmem | review |  | proposed | 2026-11-12T19:40:00Z | ni:///sha-256;Q3FCu-uTUmAF5KOP3mhMpPBE4mJ2cn6PTpZ012TENfo |  |
| node:task-sme-ccp-membership | review | proposed | accepted | 2026-11-12T20:48:00Z | ni:///sha-256;EcmrhbhdwdsPcQI60z7kqt7GM1pY-Tuj6tEvPlLCLGg | denisurusov |
| node:task-sme-triparty-reporting | review | proposed | accepted | 2026-11-12T20:48:00Z | ni:///sha-256;EcmrhbhdwdsPcQI60z7kqt7GM1pY-Tuj6tEvPlLCLGg | denisurusov |
| waypoint:wp-adr-triparty-reporting | review | proposed | accepted | 2026-11-12T20:48:00Z | ni:///sha-256;EcmrhbhdwdsPcQI60z7kqt7GM1pY-Tuj6tEvPlLCLGg | denisurusov |
| edge:e-mrk-ccpmemadr-ccpmem | review | proposed | accepted | 2026-11-12T20:48:00Z | ni:///sha-256;EcmrhbhdwdsPcQI60z7kqt7GM1pY-Tuj6tEvPlLCLGg | denisurusov |
| edge:e-drv-cdmdata-ccpmemadr | review | proposed | accepted | 2026-11-12T20:48:00Z | ni:///sha-256;EcmrhbhdwdsPcQI60z7kqt7GM1pY-Tuj6tEvPlLCLGg | denisurusov |
| edge:e-dec-cdmdev-smeccpmem | review | proposed | accepted | 2026-11-12T20:48:00Z | ni:///sha-256;EcmrhbhdwdsPcQI60z7kqt7GM1pY-Tuj6tEvPlLCLGg | denisurusov |
| edge:e-lnk-ccpmem-smeccpmem | review | proposed | accepted | 2026-11-12T20:48:00Z | ni:///sha-256;EcmrhbhdwdsPcQI60z7kqt7GM1pY-Tuj6tEvPlLCLGg | denisurusov |
| node:task-live-spec-node-read-after-write | status | open | resolved | 2026-11-12T22:45:00Z | ni:///sha-256;EcmrhbhdwdsPcQI60z7kqt7GM1pY-Tuj6tEvPlLCLGg |  |
| waypoint:wp-adr-ccp-clearing | review |  | accepted | 2026-11-12T22:50:00Z | ni:///sha-256;aEaA7T5Ai-LFOFvuw677OUTJdvBGv54u697KH8A9EL0 | denisurusov |
| edge:e-mrk-ccpclradr-ccpclr | review |  | proposed | 2026-11-12T22:50:00Z | ni:///sha-256;aEaA7T5Ai-LFOFvuw677OUTJdvBGv54u697KH8A9EL0 |  |
| edge:e-drv-cdmdata-ccpclradr | review |  | proposed | 2026-11-12T22:50:00Z | ni:///sha-256;aEaA7T5Ai-LFOFvuw677OUTJdvBGv54u697KH8A9EL0 |  |
| node:task-sme-ccp-clearing | review |  | proposed | 2026-11-12T23:30:00Z | ni:///sha-256;aEaA7T5Ai-LFOFvuw677OUTJdvBGv54u697KH8A9EL0 |  |
| node:task-sme-ccp-clearing | status |  | open | 2026-11-12T23:30:00Z | ni:///sha-256;aEaA7T5Ai-LFOFvuw677OUTJdvBGv54u697KH8A9EL0 |  |
| edge:e-dec-cdmdev-smeccpclr | review |  | proposed | 2026-11-12T23:30:00Z | ni:///sha-256;aEaA7T5Ai-LFOFvuw677OUTJdvBGv54u697KH8A9EL0 |  |
| edge:e-lnk-ccpclr-smeccpclr | review |  | proposed | 2026-11-12T23:30:00Z | ni:///sha-256;aEaA7T5Ai-LFOFvuw677OUTJdvBGv54u697KH8A9EL0 |  |
| node:task-sme-ccp-clearing | review | proposed | accepted | 2026-11-12T23:43:46Z | ni:///sha-256;58vMcgZhJO932LB70K19ejZw9RWKGfpkEGe8QbQ_li8 | denisurusov |
| edge:e-mrk-ccpclradr-ccpclr | review | proposed | accepted | 2026-11-12T23:43:46Z | ni:///sha-256;58vMcgZhJO932LB70K19ejZw9RWKGfpkEGe8QbQ_li8 | denisurusov |
| edge:e-drv-cdmdata-ccpclradr | review | proposed | accepted | 2026-11-12T23:43:46Z | ni:///sha-256;58vMcgZhJO932LB70K19ejZw9RWKGfpkEGe8QbQ_li8 | denisurusov |
| edge:e-dec-cdmdev-smeccpclr | review | proposed | accepted | 2026-11-12T23:43:46Z | ni:///sha-256;58vMcgZhJO932LB70K19ejZw9RWKGfpkEGe8QbQ_li8 | denisurusov |
| edge:e-lnk-ccpclr-smeccpclr | review | proposed | accepted | 2026-11-12T23:43:46Z | ni:///sha-256;58vMcgZhJO932LB70K19ejZw9RWKGfpkEGe8QbQ_li8 | denisurusov |
| waypoint:wp-adr-ccp-margin | review |  | proposed | 2026-11-13T00:30:00Z | ni:///sha-256;58vMcgZhJO932LB70K19ejZw9RWKGfpkEGe8QbQ_li8 |  |
| waypoint:wp-adr-ccp-default | review |  | proposed | 2026-11-13T00:30:00Z | ni:///sha-256;58vMcgZhJO932LB70K19ejZw9RWKGfpkEGe8QbQ_li8 |  |
| waypoint:wp-adr-ccp-porting | review |  | proposed | 2026-11-13T00:30:00Z | ni:///sha-256;58vMcgZhJO932LB70K19ejZw9RWKGfpkEGe8QbQ_li8 |  |
| node:task-sme-ccp-margin | review |  | proposed | 2026-11-13T00:30:00Z | ni:///sha-256;58vMcgZhJO932LB70K19ejZw9RWKGfpkEGe8QbQ_li8 |  |
| node:task-sme-ccp-margin | status |  | open | 2026-11-13T00:30:00Z | ni:///sha-256;58vMcgZhJO932LB70K19ejZw9RWKGfpkEGe8QbQ_li8 |  |
| node:task-sme-ccp-default | review |  | proposed | 2026-11-13T00:30:00Z | ni:///sha-256;58vMcgZhJO932LB70K19ejZw9RWKGfpkEGe8QbQ_li8 |  |
| node:task-sme-ccp-default | status |  | open | 2026-11-13T00:30:00Z | ni:///sha-256;58vMcgZhJO932LB70K19ejZw9RWKGfpkEGe8QbQ_li8 |  |
| node:task-sme-ccp-porting | review |  | proposed | 2026-11-13T00:30:00Z | ni:///sha-256;58vMcgZhJO932LB70K19ejZw9RWKGfpkEGe8QbQ_li8 |  |
| node:task-sme-ccp-porting | status |  | open | 2026-11-13T00:30:00Z | ni:///sha-256;58vMcgZhJO932LB70K19ejZw9RWKGfpkEGe8QbQ_li8 |  |
| edge:e-mrk-ccpmrgadr-ccpmrg | review |  | proposed | 2026-11-13T00:30:00Z | ni:///sha-256;58vMcgZhJO932LB70K19ejZw9RWKGfpkEGe8QbQ_li8 |  |
| edge:e-drv-cdmdata-ccpmrgadr | review |  | proposed | 2026-11-13T00:30:00Z | ni:///sha-256;58vMcgZhJO932LB70K19ejZw9RWKGfpkEGe8QbQ_li8 |  |
| edge:e-dec-cdmdev-smeccpmrg | review |  | proposed | 2026-11-13T00:30:00Z | ni:///sha-256;58vMcgZhJO932LB70K19ejZw9RWKGfpkEGe8QbQ_li8 |  |
| edge:e-lnk-ccpmrg-smeccpmrg | review |  | proposed | 2026-11-13T00:30:00Z | ni:///sha-256;58vMcgZhJO932LB70K19ejZw9RWKGfpkEGe8QbQ_li8 |  |
| edge:e-mrk-ccpdftadr-ccpdft | review |  | proposed | 2026-11-13T00:30:00Z | ni:///sha-256;58vMcgZhJO932LB70K19ejZw9RWKGfpkEGe8QbQ_li8 |  |
| edge:e-drv-cdmdata-ccpdftadr | review |  | proposed | 2026-11-13T00:30:00Z | ni:///sha-256;58vMcgZhJO932LB70K19ejZw9RWKGfpkEGe8QbQ_li8 |  |
| edge:e-dec-cdmdev-smeccpdft | review |  | proposed | 2026-11-13T00:30:00Z | ni:///sha-256;58vMcgZhJO932LB70K19ejZw9RWKGfpkEGe8QbQ_li8 |  |
| edge:e-lnk-ccpdft-smeccpdft | review |  | proposed | 2026-11-13T00:30:00Z | ni:///sha-256;58vMcgZhJO932LB70K19ejZw9RWKGfpkEGe8QbQ_li8 |  |
| edge:e-mrk-ccpprtadr-ccpprt | review |  | proposed | 2026-11-13T00:30:00Z | ni:///sha-256;58vMcgZhJO932LB70K19ejZw9RWKGfpkEGe8QbQ_li8 |  |
| edge:e-drv-cdmdata-ccpprtadr | review |  | proposed | 2026-11-13T00:30:00Z | ni:///sha-256;58vMcgZhJO932LB70K19ejZw9RWKGfpkEGe8QbQ_li8 |  |
| edge:e-dec-cdmdev-smeccpprt | review |  | proposed | 2026-11-13T00:30:00Z | ni:///sha-256;58vMcgZhJO932LB70K19ejZw9RWKGfpkEGe8QbQ_li8 |  |
| edge:e-lnk-ccpprt-smeccpprt | review |  | proposed | 2026-11-13T00:30:00Z | ni:///sha-256;58vMcgZhJO932LB70K19ejZw9RWKGfpkEGe8QbQ_li8 |  |
| waypoint:wp-adr-ccp-margin | review | proposed | accepted | 2026-11-13T02:31:42Z | ni:///sha-256;fwD_nK5809G6OsLkxUwRyuBUOrzowQJwWZ0amR1soK0 | denisurusov |
| waypoint:wp-adr-ccp-default | review | proposed | accepted | 2026-11-13T02:31:42Z | ni:///sha-256;fwD_nK5809G6OsLkxUwRyuBUOrzowQJwWZ0amR1soK0 | denisurusov |
| waypoint:wp-adr-ccp-porting | review | proposed | accepted | 2026-11-13T02:31:42Z | ni:///sha-256;fwD_nK5809G6OsLkxUwRyuBUOrzowQJwWZ0amR1soK0 | denisurusov |
| node:task-sme-ccp-margin | review | proposed | accepted | 2026-11-13T02:31:42Z | ni:///sha-256;fwD_nK5809G6OsLkxUwRyuBUOrzowQJwWZ0amR1soK0 | denisurusov |
| node:task-sme-ccp-default | review | proposed | accepted | 2026-11-13T02:31:42Z | ni:///sha-256;fwD_nK5809G6OsLkxUwRyuBUOrzowQJwWZ0amR1soK0 | denisurusov |
| node:task-sme-ccp-porting | review | proposed | accepted | 2026-11-13T02:31:42Z | ni:///sha-256;fwD_nK5809G6OsLkxUwRyuBUOrzowQJwWZ0amR1soK0 | denisurusov |
| edge:e-mrk-ccpmrgadr-ccpmrg | review | proposed | accepted | 2026-11-13T02:31:42Z | ni:///sha-256;fwD_nK5809G6OsLkxUwRyuBUOrzowQJwWZ0amR1soK0 | denisurusov |
| edge:e-drv-cdmdata-ccpmrgadr | review | proposed | accepted | 2026-11-13T02:31:42Z | ni:///sha-256;fwD_nK5809G6OsLkxUwRyuBUOrzowQJwWZ0amR1soK0 | denisurusov |
| edge:e-dec-cdmdev-smeccpmrg | review | proposed | accepted | 2026-11-13T02:31:42Z | ni:///sha-256;fwD_nK5809G6OsLkxUwRyuBUOrzowQJwWZ0amR1soK0 | denisurusov |
| edge:e-lnk-ccpmrg-smeccpmrg | review | proposed | accepted | 2026-11-13T02:31:42Z | ni:///sha-256;fwD_nK5809G6OsLkxUwRyuBUOrzowQJwWZ0amR1soK0 | denisurusov |
| edge:e-mrk-ccpdftadr-ccpdft | review | proposed | accepted | 2026-11-13T02:31:42Z | ni:///sha-256;fwD_nK5809G6OsLkxUwRyuBUOrzowQJwWZ0amR1soK0 | denisurusov |
| edge:e-drv-cdmdata-ccpdftadr | review | proposed | accepted | 2026-11-13T02:31:42Z | ni:///sha-256;fwD_nK5809G6OsLkxUwRyuBUOrzowQJwWZ0amR1soK0 | denisurusov |
| edge:e-dec-cdmdev-smeccpdft | review | proposed | accepted | 2026-11-13T02:31:42Z | ni:///sha-256;fwD_nK5809G6OsLkxUwRyuBUOrzowQJwWZ0amR1soK0 | denisurusov |
| edge:e-lnk-ccpdft-smeccpdft | review | proposed | accepted | 2026-11-13T02:31:42Z | ni:///sha-256;fwD_nK5809G6OsLkxUwRyuBUOrzowQJwWZ0amR1soK0 | denisurusov |
| edge:e-mrk-ccpprtadr-ccpprt | review | proposed | accepted | 2026-11-13T02:31:42Z | ni:///sha-256;fwD_nK5809G6OsLkxUwRyuBUOrzowQJwWZ0amR1soK0 | denisurusov |
| edge:e-drv-cdmdata-ccpprtadr | review | proposed | accepted | 2026-11-13T02:31:42Z | ni:///sha-256;fwD_nK5809G6OsLkxUwRyuBUOrzowQJwWZ0amR1soK0 | denisurusov |
| edge:e-dec-cdmdev-smeccpprt | review | proposed | accepted | 2026-11-13T02:31:42Z | ni:///sha-256;fwD_nK5809G6OsLkxUwRyuBUOrzowQJwWZ0amR1soK0 | denisurusov |
| edge:e-lnk-ccpprt-smeccpprt | review | proposed | accepted | 2026-11-13T02:31:42Z | ni:///sha-256;fwD_nK5809G6OsLkxUwRyuBUOrzowQJwWZ0amR1soK0 | denisurusov |
| noteworthy:nw-shared-console-dev-server | review |  | proposed | 2026-11-13T02:42:43Z | ni:///sha-256;mq2D-JKNZGUArv2EqjQWIx1t3QvdBsjWpgBX1ETglMY |  |
| edge:e-note-localenv-sharedconsole | review |  | proposed | 2026-11-13T02:42:43Z | ni:///sha-256;mq2D-JKNZGUArv2EqjQWIx1t3QvdBsjWpgBX1ETglMY |  |
| noteworthy:nw-shared-console-dev-server | review | proposed | accepted | 2026-11-13T02:45:20Z | ni:///sha-256;bvxz34rpFkHmBHasNXl2Kx6UOrql5dWbvGgsDsLyXSo | denisurusov |
| edge:e-note-localenv-sharedconsole | review | proposed | accepted | 2026-11-13T02:45:20Z | ni:///sha-256;bvxz34rpFkHmBHasNXl2Kx6UOrql5dWbvGgsDsLyXSo | denisurusov |
| node:task-docs-readme-organization | review |  | proposed | 2026-11-13T14:59:13Z | ni:///sha-256;nn4stfwVQo46WAFykK398kbcXhl8GdicyuyhSYh-eKY |  |
| node:task-docs-readme-organization | status |  | open | 2026-11-13T14:59:13Z | ni:///sha-256;nn4stfwVQo46WAFykK398kbcXhl8GdicyuyhSYh-eKY |  |
| edge:e-dec-adoption-docsreadme | review |  | proposed | 2026-11-13T14:59:13Z | ni:///sha-256;nn4stfwVQo46WAFykK398kbcXhl8GdicyuyhSYh-eKY |  |
| node:task-docs-readme-organization | review | proposed | accepted | 2026-11-13T15:22:33Z | ni:///sha-256;VXy08vs2kIt0zyLir0roW-aK2BWK2WfqOHTME8LHt_g | denisurusov |
| edge:e-dec-adoption-docsreadme | review | proposed | accepted | 2026-11-13T15:22:33Z | ni:///sha-256;VXy08vs2kIt0zyLir0roW-aK2BWK2WfqOHTME8LHt_g | denisurusov |
| node:task-ccp-membership | status | open | resolved | 2026-11-13T15:22:33Z | ni:///sha-256;VXy08vs2kIt0zyLir0roW-aK2BWK2WfqOHTME8LHt_g | denisurusov |
| node:task-ccp-clearing | status | open | resolved | 2026-11-13T15:22:33Z | ni:///sha-256;VXy08vs2kIt0zyLir0roW-aK2BWK2WfqOHTME8LHt_g | denisurusov |
| node:task-ccp-margin | status | open | resolved | 2026-11-13T15:22:33Z | ni:///sha-256;VXy08vs2kIt0zyLir0roW-aK2BWK2WfqOHTME8LHt_g | denisurusov |
| node:task-ccp-default | status | open | resolved | 2026-11-13T15:22:33Z | ni:///sha-256;VXy08vs2kIt0zyLir0roW-aK2BWK2WfqOHTME8LHt_g | denisurusov |
| node:task-ccp-porting | status | open | resolved | 2026-11-13T15:22:33Z | ni:///sha-256;VXy08vs2kIt0zyLir0roW-aK2BWK2WfqOHTME8LHt_g | denisurusov |
| node:task-ccp-workflows | status | open | resolved | 2026-11-13T15:22:33Z | ni:///sha-256;VXy08vs2kIt0zyLir0roW-aK2BWK2WfqOHTME8LHt_g | denisurusov |
| node:task-triparty-terms-profile | status | open | resolved | 2026-11-13T15:22:33Z | ni:///sha-256;VXy08vs2kIt0zyLir0roW-aK2BWK2WfqOHTME8LHt_g | denisurusov |
| node:task-triparty-trade-start | status | open | resolved | 2026-11-13T15:22:33Z | ni:///sha-256;VXy08vs2kIt0zyLir0roW-aK2BWK2WfqOHTME8LHt_g | denisurusov |
| node:task-triparty-revaluation | status | open | resolved | 2026-11-13T15:22:33Z | ni:///sha-256;VXy08vs2kIt0zyLir0roW-aK2BWK2WfqOHTME8LHt_g | denisurusov |
| node:task-triparty-substitution | status | open | resolved | 2026-11-13T15:22:33Z | ni:///sha-256;VXy08vs2kIt0zyLir0roW-aK2BWK2WfqOHTME8LHt_g | denisurusov |
| node:task-triparty-trade-end | status | open | resolved | 2026-11-13T15:22:33Z | ni:///sha-256;VXy08vs2kIt0zyLir0roW-aK2BWK2WfqOHTME8LHt_g | denisurusov |
| node:task-triparty-reporting | status | open | resolved | 2026-11-13T15:22:33Z | ni:///sha-256;VXy08vs2kIt0zyLir0roW-aK2BWK2WfqOHTME8LHt_g | denisurusov |
| node:task-triparty-workflows | status | open | resolved | 2026-11-13T15:22:33Z | ni:///sha-256;VXy08vs2kIt0zyLir0roW-aK2BWK2WfqOHTME8LHt_g | denisurusov |
| node:task-gmsla-default-close-out | status | open | resolved | 2026-11-13T15:22:33Z | ni:///sha-256;VXy08vs2kIt0zyLir0roW-aK2BWK2WfqOHTME8LHt_g | denisurusov |
| node:task-securities-lending-gmsla-workflows | status | open | resolved | 2026-11-13T15:22:33Z | ni:///sha-256;VXy08vs2kIt0zyLir0roW-aK2BWK2WfqOHTME8LHt_g | denisurusov |
| node:task-konspekt-re-seeding | review |  | proposed | 2026-11-15T14:55:58Z | ni:///sha-256;X0_bvuPkEF43h_xYFW1wq0w2UHOa9SqSGz3M_QbiEUw |  |
| node:task-konspekt-re-seeding | status |  | open | 2026-11-15T14:55:58Z | ni:///sha-256;X0_bvuPkEF43h_xYFW1wq0w2UHOa9SqSGz3M_QbiEUw |  |
| edge:e-dec-konspektadopt-reseeding | review |  | proposed | 2026-11-15T14:55:58Z | ni:///sha-256;X0_bvuPkEF43h_xYFW1wq0w2UHOa9SqSGz3M_QbiEUw |  |
| node:task-konspekt-re-seeding | review | proposed | accepted | 2026-11-15T16:16:33Z | ni:///sha-256;IdkCgyJ2Trhzht84jTS8Ij9ktdaSml3_G3dewCNlJTA | denisurusov |
| node:task-konspekt-re-seeding | status | open | resolved | 2026-11-15T16:16:33Z | ni:///sha-256;IdkCgyJ2Trhzht84jTS8Ij9ktdaSml3_G3dewCNlJTA | denisurusov |
| edge:e-dec-konspektadopt-reseeding | review | proposed | accepted | 2026-11-15T16:16:33Z | ni:///sha-256;IdkCgyJ2Trhzht84jTS8Ij9ktdaSml3_G3dewCNlJTA | denisurusov |
| node:task-docs-readme-organization | status | open | resolved | 2026-11-20T12:40:31Z |  | denisurusov |
| node:goal-tokenized-collateral | review |  | proposed | 2026-11-20T19:51:36Z | ni:///sha-256;zMz4c0RLlkKvHZJaqJm9O9mYoExmGssJv5XXBjuc76Q |  |
| node:goal-tokenized-collateral | status |  | active | 2026-11-20T19:51:36Z | ni:///sha-256;zMz4c0RLlkKvHZJaqJm9O9mYoExmGssJv5XXBjuc76Q |  |
| edge:e-lnk-tokcoll-gapclosure | review |  | proposed | 2026-11-20T19:51:36Z | ni:///sha-256;zMz4c0RLlkKvHZJaqJm9O9mYoExmGssJv5XXBjuc76Q |  |
| edge:e-lnk-tokcoll-smeregistered | review |  | proposed | 2026-11-20T19:51:36Z | ni:///sha-256;zMz4c0RLlkKvHZJaqJm9O9mYoExmGssJv5XXBjuc76Q |  |
| edge:e-lnk-tokcoll-blockchain | review |  | proposed | 2026-11-20T19:51:36Z | ni:///sha-256;zMz4c0RLlkKvHZJaqJm9O9mYoExmGssJv5XXBjuc76Q |  |
| edge:e-men-tokcoll-onchain-asset-identity | review |  | proposed | 2026-11-20T19:51:36Z | ni:///sha-256;zMz4c0RLlkKvHZJaqJm9O9mYoExmGssJv5XXBjuc76Q |  |
| node:goal-tokenized-collateral | review | proposed | accepted | 2026-11-20T20:06:53Z | ni:///sha-256;aJTyNDE7zn5LV5S5ukttpknDpzHaSsIWhmvpRGu1YQQ | denisurusov |
| edge:e-lnk-tokcoll-gapclosure | review | proposed | accepted | 2026-11-20T20:06:53Z | ni:///sha-256;aJTyNDE7zn5LV5S5ukttpknDpzHaSsIWhmvpRGu1YQQ | denisurusov |
| edge:e-lnk-tokcoll-smeregistered | review | proposed | accepted | 2026-11-20T20:06:53Z | ni:///sha-256;aJTyNDE7zn5LV5S5ukttpknDpzHaSsIWhmvpRGu1YQQ | denisurusov |
| edge:e-lnk-tokcoll-blockchain | review | proposed | accepted | 2026-11-20T20:06:53Z | ni:///sha-256;aJTyNDE7zn5LV5S5ukttpknDpzHaSsIWhmvpRGu1YQQ | denisurusov |
| edge:e-men-tokcoll-onchain-asset-identity | review | proposed | accepted | 2026-11-20T20:06:53Z | ni:///sha-256;aJTyNDE7zn5LV5S5ukttpknDpzHaSsIWhmvpRGu1YQQ | denisurusov |
| node:task-authoritative-record-settlement-enforcement | review |  | proposed | 2026-11-20T20:06:53Z | ni:///sha-256;aJTyNDE7zn5LV5S5ukttpknDpzHaSsIWhmvpRGu1YQQ |  |
| node:task-authoritative-record-settlement-enforcement | status |  | open | 2026-11-20T20:06:53Z | ni:///sha-256;aJTyNDE7zn5LV5S5ukttpknDpzHaSsIWhmvpRGu1YQQ |  |
| node:task-dti-format-check | review |  | proposed | 2026-11-20T20:06:53Z | ni:///sha-256;aJTyNDE7zn5LV5S5ukttpknDpzHaSsIWhmvpRGu1YQQ |  |
| node:task-dti-format-check | status |  | open | 2026-11-20T20:06:53Z | ni:///sha-256;aJTyNDE7zn5LV5S5ukttpknDpzHaSsIWhmvpRGu1YQQ |  |
| node:task-second-ledger-token-identity | review |  | proposed | 2026-11-20T20:06:53Z | ni:///sha-256;aJTyNDE7zn5LV5S5ukttpknDpzHaSsIWhmvpRGu1YQQ |  |
| node:task-second-ledger-token-identity | status |  | open | 2026-11-20T20:06:53Z | ni:///sha-256;aJTyNDE7zn5LV5S5ukttpknDpzHaSsIWhmvpRGu1YQQ |  |
| edge:e-dec-tokcoll-authrecord | review |  | proposed | 2026-11-20T20:06:53Z | ni:///sha-256;aJTyNDE7zn5LV5S5ukttpknDpzHaSsIWhmvpRGu1YQQ |  |
| edge:e-dec-tokcoll-dticheck | review |  | proposed | 2026-11-20T20:06:53Z | ni:///sha-256;aJTyNDE7zn5LV5S5ukttpknDpzHaSsIWhmvpRGu1YQQ |  |
| edge:e-dec-tokcoll-secondledger | review |  | proposed | 2026-11-20T20:06:53Z | ni:///sha-256;aJTyNDE7zn5LV5S5ukttpknDpzHaSsIWhmvpRGu1YQQ |  |
| edge:e-lnk-authrecord-smeregistered | review |  | proposed | 2026-11-20T20:06:53Z | ni:///sha-256;aJTyNDE7zn5LV5S5ukttpknDpzHaSsIWhmvpRGu1YQQ |  |
| edge:e-men-dticheck-onchain-asset-identity | review |  | proposed | 2026-11-20T20:06:53Z | ni:///sha-256;aJTyNDE7zn5LV5S5ukttpknDpzHaSsIWhmvpRGu1YQQ |  |
| edge:e-men-secondledger-ledger-neutrality | review |  | proposed | 2026-11-20T20:06:53Z | ni:///sha-256;aJTyNDE7zn5LV5S5ukttpknDpzHaSsIWhmvpRGu1YQQ |  |
| node:task-authoritative-record-settlement-enforcement | review | proposed | accepted | 2026-11-20T21:22:45Z | ni:///sha-256;jsnT6sVVjToL-5wexMGp65tOXPIdeeeurGXdRPtX3xc | denisurusov |
| node:task-dti-format-check | review | proposed | accepted | 2026-11-20T21:22:45Z | ni:///sha-256;jsnT6sVVjToL-5wexMGp65tOXPIdeeeurGXdRPtX3xc | denisurusov |
| node:task-second-ledger-token-identity | review | proposed | accepted | 2026-11-20T21:22:45Z | ni:///sha-256;jsnT6sVVjToL-5wexMGp65tOXPIdeeeurGXdRPtX3xc | denisurusov |
| edge:e-dec-tokcoll-authrecord | review | proposed | accepted | 2026-11-20T21:22:45Z | ni:///sha-256;jsnT6sVVjToL-5wexMGp65tOXPIdeeeurGXdRPtX3xc | denisurusov |
| edge:e-dec-tokcoll-dticheck | review | proposed | accepted | 2026-11-20T21:22:45Z | ni:///sha-256;jsnT6sVVjToL-5wexMGp65tOXPIdeeeurGXdRPtX3xc | denisurusov |
| edge:e-dec-tokcoll-secondledger | review | proposed | accepted | 2026-11-20T21:22:45Z | ni:///sha-256;jsnT6sVVjToL-5wexMGp65tOXPIdeeeurGXdRPtX3xc | denisurusov |
| edge:e-lnk-authrecord-smeregistered | review | proposed | accepted | 2026-11-20T21:22:45Z | ni:///sha-256;jsnT6sVVjToL-5wexMGp65tOXPIdeeeurGXdRPtX3xc | denisurusov |
| edge:e-men-dticheck-onchain-asset-identity | review | proposed | accepted | 2026-11-20T21:22:45Z | ni:///sha-256;jsnT6sVVjToL-5wexMGp65tOXPIdeeeurGXdRPtX3xc | denisurusov |
| edge:e-men-secondledger-ledger-neutrality | review | proposed | accepted | 2026-11-20T21:22:45Z | ni:///sha-256;jsnT6sVVjToL-5wexMGp65tOXPIdeeeurGXdRPtX3xc | denisurusov |
| node:task-document-provenance | review |  | proposed | 2026-11-21T21:42:22Z | ni:///sha-256;hLFf7CFgc6WW1OwyK7s2p6b7LR0GXiCsU-NNIiIW-a4 |  |
| node:task-document-provenance | status |  | open | 2026-11-21T21:42:22Z | ni:///sha-256;hLFf7CFgc6WW1OwyK7s2p6b7LR0GXiCsU-NNIiIW-a4 |  |
| node:task-sme-document-provenance | review |  | proposed | 2026-11-21T21:42:22Z | ni:///sha-256;hLFf7CFgc6WW1OwyK7s2p6b7LR0GXiCsU-NNIiIW-a4 |  |
| node:task-sme-document-provenance | status |  | open | 2026-11-21T21:42:22Z | ni:///sha-256;hLFf7CFgc6WW1OwyK7s2p6b7LR0GXiCsU-NNIiIW-a4 |  |
| edge:e-dec-tokcoll-docprov | review |  | proposed | 2026-11-21T21:42:22Z | ni:///sha-256;hLFf7CFgc6WW1OwyK7s2p6b7LR0GXiCsU-NNIiIW-a4 |  |
| edge:e-lnk-tokcoll-smedocprov | review |  | proposed | 2026-11-21T21:42:22Z | ni:///sha-256;hLFf7CFgc6WW1OwyK7s2p6b7LR0GXiCsU-NNIiIW-a4 |  |
| edge:e-lnk-docprov-smedocprov | review |  | proposed | 2026-11-21T21:42:22Z | ni:///sha-256;hLFf7CFgc6WW1OwyK7s2p6b7LR0GXiCsU-NNIiIW-a4 |  |
| edge:e-lnk-docprov-smeregistered | review |  | proposed | 2026-11-21T21:42:22Z | ni:///sha-256;hLFf7CFgc6WW1OwyK7s2p6b7LR0GXiCsU-NNIiIW-a4 |  |
| edge:e-men-docprov-onchain-asset-identity | review |  | proposed | 2026-11-21T21:42:22Z | ni:///sha-256;hLFf7CFgc6WW1OwyK7s2p6b7LR0GXiCsU-NNIiIW-a4 |  |
| node:task-document-provenance | review | proposed | accepted | 2026-11-21T22:25:05Z | ni:///sha-256;IHv8NEjQCsHLKcMa-PSMVG-t6rWTYNPtky93xB1k3Ug | denisurusov |
| node:task-sme-document-provenance | review | proposed | accepted | 2026-11-21T22:25:05Z | ni:///sha-256;IHv8NEjQCsHLKcMa-PSMVG-t6rWTYNPtky93xB1k3Ug | denisurusov |
| edge:e-dec-tokcoll-docprov | review | proposed | accepted | 2026-11-21T22:25:05Z | ni:///sha-256;IHv8NEjQCsHLKcMa-PSMVG-t6rWTYNPtky93xB1k3Ug | denisurusov |
| edge:e-lnk-tokcoll-smedocprov | review | proposed | accepted | 2026-11-21T22:25:05Z | ni:///sha-256;IHv8NEjQCsHLKcMa-PSMVG-t6rWTYNPtky93xB1k3Ug | denisurusov |
| edge:e-lnk-docprov-smedocprov | review | proposed | accepted | 2026-11-21T22:25:05Z | ni:///sha-256;IHv8NEjQCsHLKcMa-PSMVG-t6rWTYNPtky93xB1k3Ug | denisurusov |
| edge:e-lnk-docprov-smeregistered | review | proposed | accepted | 2026-11-21T22:25:05Z | ni:///sha-256;IHv8NEjQCsHLKcMa-PSMVG-t6rWTYNPtky93xB1k3Ug | denisurusov |
| edge:e-men-docprov-onchain-asset-identity | review | proposed | accepted | 2026-11-21T22:25:05Z | ni:///sha-256;IHv8NEjQCsHLKcMa-PSMVG-t6rWTYNPtky93xB1k3Ug | denisurusov |
| node:task-dti-format-check | status | open | resolved | 2026-11-21T18:16:20Z |  | denisurusov |
| node:task-sme-interim-decision-catalog | review |  | proposed | 2026-11-22T01:58:15Z |  |  |
| node:task-sme-interim-decision-catalog | status |  | resolved | 2026-11-22T01:58:15Z |  |  |
| edge:e-dec-cdmdev-interimcatalog | review |  | proposed | 2026-11-22T01:58:15Z |  |  |
| node:task-sme-interim-decision-catalog | review | proposed | accepted | 2026-11-22T03:03:17Z |  | denisurusov |
| edge:e-dec-cdmdev-interimcatalog | review | proposed | accepted | 2026-11-22T03:03:17Z |  | denisurusov |
| node:task-authoritative-record-settlement-enforcement | status | open | resolved | 2026-11-22T03:03:17Z |  | denisurusov |

| node:task-authoritative-record-other-flows | review |  | proposed | 2026-11-22T03:05:00Z |  |  |
| node:task-authoritative-record-other-flows | status |  | open | 2026-11-22T03:05:00Z |  |  |
| edge:e-dec-tokcoll-authrecordflows | review |  | proposed | 2026-11-22T03:05:00Z |  |  |
| node:task-substitution-ledger-anchors | review |  | proposed | 2026-11-22T03:05:00Z |  |  |
| node:task-substitution-ledger-anchors | status |  | open | 2026-11-22T03:05:00Z |  |  |
| edge:e-dec-tokcoll-subanchors | review |  | proposed | 2026-11-22T03:05:00Z |  |  |
| node:task-console-record-keeper-completion | review |  | proposed | 2026-11-22T03:05:00Z |  |  |
| node:task-console-record-keeper-completion | status |  | open | 2026-11-22T03:05:00Z |  |  |
| edge:e-dec-tokcoll-consolerk | review |  | proposed | 2026-11-22T03:05:00Z |  |  |
| node:task-authoritative-record-other-flows | review | proposed | accepted | 2026-11-22T03:15:57Z |  | denisurusov |
| node:task-substitution-ledger-anchors | review | proposed | accepted | 2026-11-22T03:15:57Z |  | denisurusov |
| node:task-console-record-keeper-completion | review | proposed | accepted | 2026-11-22T03:15:57Z |  | denisurusov |
| edge:e-dec-tokcoll-authrecordflows | review | proposed | accepted | 2026-11-22T03:15:57Z |  | denisurusov |
| edge:e-dec-tokcoll-subanchors | review | proposed | accepted | 2026-11-22T03:15:57Z |  | denisurusov |
| edge:e-dec-tokcoll-consolerk | review | proposed | accepted | 2026-11-22T03:15:57Z |  | denisurusov |
| edge:e-lnk-docprov-subanchors | review |  | proposed | 2026-11-22T03:51:06Z | ni:///sha-256;WMqZKRo8qhPsHGZNTDs8OfhI0QlpyQre1rcv1XPe0fk |  |
| edge:e-lnk-docprov-subanchors | review | proposed | accepted | 2026-11-22T04:24:30Z | ni:///sha-256;3xckuHhf2vR7SAzWShzGIvOyFhntLXrftATavEzljRA | denisurusov |
| waypoint:wp-adr-document-provenance | review |  | proposed | 2026-11-22T14:19:31Z | ni:///sha-256;KrvGiaznHsLxI2I87q5pYkF9Avm4gXWpohvIBSkiICI |  |
| edge:e-mrk-docprovadr-docprov | review |  | proposed | 2026-11-22T14:19:31Z | ni:///sha-256;KrvGiaznHsLxI2I87q5pYkF9Avm4gXWpohvIBSkiICI |  |
| edge:e-drv-cdmdata-docprovadr | review |  | proposed | 2026-11-22T14:19:31Z | ni:///sha-256;KrvGiaznHsLxI2I87q5pYkF9Avm4gXWpohvIBSkiICI |  |
| edge:e-drv-onchainid-docprovadr | review |  | proposed | 2026-11-22T14:19:31Z | ni:///sha-256;KrvGiaznHsLxI2I87q5pYkF9Avm4gXWpohvIBSkiICI |  |
| artifact:artifact-provenance-whiteboard | review |  | proposed | 2026-11-22T14:25:17Z | ni:///sha-256;i2FpMGjbdYLRkcrMU1OhsDLT_SYqPgG6E7N4xuFvQLM |  |
| edge:e-prod-docprov-provboard | review |  | proposed | 2026-11-22T14:25:17Z | ni:///sha-256;i2FpMGjbdYLRkcrMU1OhsDLT_SYqPgG6E7N4xuFvQLM |  |
| artifact:artifact-provenance-whiteboard | review | proposed | accepted | 2026-11-22T14:30:35Z | ni:///sha-256;WPhJ4xzqcCj4qAHiE9p2kg5a_ubNNPrvOI4ORa2QLF4 | denisurusov |
| edge:e-prod-docprov-provboard | review | proposed | accepted | 2026-11-22T14:30:35Z | ni:///sha-256;WPhJ4xzqcCj4qAHiE9p2kg5a_ubNNPrvOI4ORa2QLF4 | denisurusov |
| waypoint:wp-adr-document-provenance | review | proposed | accepted | 2026-11-22T14:57:02Z | ni:///sha-256;NsuxkeNc2uUCWepWhEN-9uV2abTpGg1EQqIJy5aNCWI | denisurusov |
| edge:e-mrk-docprovadr-docprov | review | proposed | accepted | 2026-11-22T14:57:02Z | ni:///sha-256;NsuxkeNc2uUCWepWhEN-9uV2abTpGg1EQqIJy5aNCWI | denisurusov |
| edge:e-drv-cdmdata-docprovadr | review | proposed | accepted | 2026-11-22T14:57:02Z | ni:///sha-256;NsuxkeNc2uUCWepWhEN-9uV2abTpGg1EQqIJy5aNCWI | denisurusov |
| edge:e-drv-onchainid-docprovadr | review | proposed | accepted | 2026-11-22T14:57:02Z | ni:///sha-256;NsuxkeNc2uUCWepWhEN-9uV2abTpGg1EQqIJy5aNCWI | denisurusov |
| node:task-console-record-keeper-completion | status | open | resolved | 2026-11-22T15:20:15Z |  | denisurusov |
| node:task-authoritative-record-other-flows | status | open | resolved | 2026-11-22T16:47:09Z |  | denisurusov |
| node:task-konspekt-kit-refresh | review |  | proposed | 2026-11-22T19:59:28Z | ni:///sha-256;6GeYYxRpR9dtmUBSchT0VVVfCSN768IF6r1HjN6e84k |  |
| node:task-konspekt-kit-refresh | status |  | open | 2026-11-22T19:59:28Z | ni:///sha-256;6GeYYxRpR9dtmUBSchT0VVVfCSN768IF6r1HjN6e84k |  |
| edge:e-dec-konspektadopt-kitrefresh | review |  | proposed | 2026-11-22T19:59:28Z | ni:///sha-256;6GeYYxRpR9dtmUBSchT0VVVfCSN768IF6r1HjN6e84k |  |
| node:task-substitution-ledger-anchors | status | open | resolved | 2026-11-22T20:04:22Z |  | denisurusov |
| node:task-konspekt-kit-refresh | review | proposed | accepted | 2026-11-22T20:05:41Z | ni:///sha-256;Ro6tTs7j-8VzyJ6EAm276xnWWKiCFMo0ECxGewUmP-k | denisurusov |
| edge:e-dec-konspektadopt-kitrefresh | review | proposed | accepted | 2026-11-22T20:05:41Z | ni:///sha-256;Ro6tTs7j-8VzyJ6EAm276xnWWKiCFMo0ECxGewUmP-k | denisurusov |
| node:task-konspekt-kit-refresh | status | open | resolved | 2026-11-22T20:05:41Z | ni:///sha-256;Ro6tTs7j-8VzyJ6EAm276xnWWKiCFMo0ECxGewUmP-k | denisurusov |
| node:task-v02-demo-release-summary | review |  | proposed | 2026-11-22T20:56:04Z | ni:///sha-256;xAW0L5hnTNwr61J1XP5el8MYc7zYDGS4OZN19oaICag |  |
| node:task-v02-demo-release-summary | status |  | open | 2026-11-22T20:56:04Z | ni:///sha-256;xAW0L5hnTNwr61J1XP5el8MYc7zYDGS4OZN19oaICag |  |
| edge:e-dec-adoption-v02summary | review |  | proposed | 2026-11-22T20:56:04Z | ni:///sha-256;xAW0L5hnTNwr61J1XP5el8MYc7zYDGS4OZN19oaICag |  |
| node:task-collateral-service-unit-tests | status | open | resolved | 2026-11-22T21:17:53Z | ni:///sha-256;tLPKtaJDaXLBydHSDQhLUTlGA11CPCXJ-_sojy2Jk1c | denisurusov |
| node:task-calm-model-contracts | review |  | proposed | 2026-11-22T21:17:53Z | ni:///sha-256;tLPKtaJDaXLBydHSDQhLUTlGA11CPCXJ-_sojy2Jk1c |  |
| node:task-calm-model-contracts | status |  | open | 2026-11-22T21:17:53Z | ni:///sha-256;tLPKtaJDaXLBydHSDQhLUTlGA11CPCXJ-_sojy2Jk1c |  |
| edge:e-dec-archdesign-calmcontracts | review |  | proposed | 2026-11-22T21:17:53Z | ni:///sha-256;tLPKtaJDaXLBydHSDQhLUTlGA11CPCXJ-_sojy2Jk1c |  |
| node:task-konspekt-kit-refresh-rest-fallback | review |  | accepted | 2026-11-22T21:21:07Z | ni:///sha-256;hvZtMGBcgRmOfnaMzR0IwF1htyo2uGy3kt_XmQvMwhI | denisurusov |
| node:task-konspekt-kit-refresh-rest-fallback | status |  | open | 2026-11-22T21:21:07Z | ni:///sha-256;hvZtMGBcgRmOfnaMzR0IwF1htyo2uGy3kt_XmQvMwhI | denisurusov |
| edge:e-dec-konspektadopt-kitrefreshrest | review |  | accepted | 2026-11-22T21:21:07Z | ni:///sha-256;hvZtMGBcgRmOfnaMzR0IwF1htyo2uGy3kt_XmQvMwhI | denisurusov |
| node:task-konspekt-review-units-graphql-error | review |  | proposed | 2026-11-22T21:38:22Z | ni:///sha-256;Y5OTivZPha4le_cJOqThz2JLJVHWYoHQIRPJP7Jxn7c |  |
| node:task-konspekt-review-units-graphql-error | status |  | open | 2026-11-22T21:38:22Z | ni:///sha-256;Y5OTivZPha4le_cJOqThz2JLJVHWYoHQIRPJP7Jxn7c |  |
| edge:e-dec-konspektadopt-reviewunitsgqlerror | review |  | proposed | 2026-11-22T21:38:22Z | ni:///sha-256;Y5OTivZPha4le_cJOqThz2JLJVHWYoHQIRPJP7Jxn7c |  |
| node:task-konspekt-kit-refresh-rest-fallback | status | open | resolved | 2026-11-22T21:44:54Z | ni:///sha-256;C3WoiSeBXK7F8X3cwdh02iFP0iCEUdZaIBVYuSv7EuU | denisurusov |
| node:task-konspekt-review-units-graphql-error | review | proposed | accepted | 2026-11-22T21:44:54Z | ni:///sha-256;C3WoiSeBXK7F8X3cwdh02iFP0iCEUdZaIBVYuSv7EuU | denisurusov |
| edge:e-dec-konspektadopt-reviewunitsgqlerror | review | proposed | accepted | 2026-11-22T21:44:54Z | ni:///sha-256;C3WoiSeBXK7F8X3cwdh02iFP0iCEUdZaIBVYuSv7EuU | denisurusov |
| node:task-calm-model-contracts | review | proposed | accepted | 2026-11-22T21:44:54Z | ni:///sha-256;C3WoiSeBXK7F8X3cwdh02iFP0iCEUdZaIBVYuSv7EuU | denisurusov |
| edge:e-dec-archdesign-calmcontracts | review | proposed | accepted | 2026-11-22T21:44:54Z | ni:///sha-256;C3WoiSeBXK7F8X3cwdh02iFP0iCEUdZaIBVYuSv7EuU | denisurusov |
| node:task-calm-model-contracts | status | open | resolved | 2026-11-22T21:44:54Z | ni:///sha-256;C3WoiSeBXK7F8X3cwdh02iFP0iCEUdZaIBVYuSv7EuU | denisurusov |
| node:task-v02-demo-release-summary | review | proposed | accepted | 2026-11-22T21:44:54Z | ni:///sha-256;C3WoiSeBXK7F8X3cwdh02iFP0iCEUdZaIBVYuSv7EuU | denisurusov |
| edge:e-dec-adoption-v02summary | review | proposed | accepted | 2026-11-22T21:44:54Z | ni:///sha-256;C3WoiSeBXK7F8X3cwdh02iFP0iCEUdZaIBVYuSv7EuU | denisurusov |
| node:task-v02-demo-release-summary | status | open | resolved | 2026-11-22T21:44:54Z | ni:///sha-256;C3WoiSeBXK7F8X3cwdh02iFP0iCEUdZaIBVYuSv7EuU | denisurusov |
| node:task-live-suite-modules | review |  | accepted | 2026-11-22T23:56:25Z | ni:///sha-256;GRkTUKGNjCeVEe7hf28ZFA5epuRvXl3cMIJGVauf7cw | denisurusov |
| node:task-live-suite-modules | status |  | open | 2026-11-22T23:56:25Z | ni:///sha-256;GRkTUKGNjCeVEe7hf28ZFA5epuRvXl3cMIJGVauf7cw | denisurusov |
| edge:e-dec-e2eflow-livesuitemodules | review |  | proposed | 2026-11-22T23:56:25Z |  |  |
| edge:e-lnk-cilivestack-livesuitemodules | review |  | proposed | 2026-11-22T23:56:25Z |  |  |
| edge:e-dec-e2eflow-livesuitemodules | review | proposed | accepted | 2026-11-23T00:18:17Z | ni:///sha-256;kc6PK3Vh5H0SIfpHt1oha9Qi_ZpyEwImUZuIQd0jads | denisurusov |
| edge:e-lnk-cilivestack-livesuitemodules | review | proposed | accepted | 2026-11-23T00:18:17Z | ni:///sha-256;kc6PK3Vh5H0SIfpHt1oha9Qi_ZpyEwImUZuIQd0jads | denisurusov |
| node:task-live-suite-modules | status | open | resolved | 2026-11-23T01:17:35Z | ni:///sha-256;Brbrt37nGrgWknVFtcpb48R_FBPwyaaPT31qNw_j_4U | denisurusov |
| node:task-document-provenance | status | open | resolved | 2026-11-23T01:21:52Z | ni:///sha-256;oNnx3i6ACO-jMJv1RjUzYyJY9r_aDT-qpXzUueFiMxY | denisurusov |
| node:investigation-cdm-workflow-task-map | status | active | resolved | 2026-11-23T01:21:52Z | ni:///sha-256;oNnx3i6ACO-jMJv1RjUzYyJY9r_aDT-qpXzUueFiMxY | denisurusov |
| node:investigation-live-spec-in-claude-web | status | active | resolved | 2026-11-23T01:21:52Z | ni:///sha-256;oNnx3i6ACO-jMJv1RjUzYyJY9r_aDT-qpXzUueFiMxY | denisurusov |
| node:task-konspekt-review-units-graphql-error | status | open | resolved | 2026-11-23T01:23:54Z | ni:///sha-256;TQSVIbbj6Y8DWBRBoxTWV49PMzDNZsts63TD77wR-KE | denisurusov |
| node:investigation-onchain-data-protection | review |  | proposed | 2026-11-23T01:51:26Z |  |  |
| node:investigation-onchain-data-protection | status |  | active | 2026-11-23T01:51:26Z |  |  |
| edge:e-note-onchainprotect-besuvisibility | review |  | proposed | 2026-11-23T01:51:26Z |  |  |
| edge:e-dec-archdesign-onchainprotect | review |  | proposed | 2026-11-23T01:51:26Z |  |  |
| edge:e-lnk-onchainprotect-onchainprivacy | review |  | proposed | 2026-11-23T01:51:26Z |  |  |
| noteworthy:nw-visibility-rule-deal-participants | review |  | proposed | 2026-11-23T02:15:35Z |  |  |
| noteworthy:nw-visibility-rule-deal-participants | status |  | active | 2026-11-23T02:15:35Z |  |  |
| edge:e-note-onchainprotect-visibilityrule | review |  | proposed | 2026-11-23T02:15:35Z |  |  |
| noteworthy:nw-decision-onchain-privacy-paladin | review |  | proposed | 2026-11-23T12:35:59Z |  |  |
| edge:e-note-onchainprotect-paladindecision | review |  | proposed | 2026-11-23T12:35:59Z |  |  |
| noteworthy:nw-proposal-regulator-selective-disclosure | review |  | proposed | 2026-11-23T12:51:04Z | ni:///sha-256;ccLiFZ9NZdcBNsRGsa8r4wA0Hi_TLU4VmwaRWHnvP1Q |  |
| edge:e-note-onchainprotect-regulatorselec | review |  | proposed | 2026-11-23T12:51:04Z | ni:///sha-256;ccLiFZ9NZdcBNsRGsa8r4wA0Hi_TLU4VmwaRWHnvP1Q |  |
| noteworthy:nw-proposal-visibility-metadata-scope | review |  | proposed | 2026-11-23T12:51:04Z | ni:///sha-256;ccLiFZ9NZdcBNsRGsa8r4wA0Hi_TLU4VmwaRWHnvP1Q |  |
| edge:e-note-onchainprotect-visibilitymeta | review |  | proposed | 2026-11-23T12:51:04Z | ni:///sha-256;ccLiFZ9NZdcBNsRGsa8r4wA0Hi_TLU4VmwaRWHnvP1Q |  |
| noteworthy:nw-proposal-deal-scoped-noto-hooks | review |  | proposed | 2026-11-23T12:51:04Z | ni:///sha-256;ccLiFZ9NZdcBNsRGsa8r4wA0Hi_TLU4VmwaRWHnvP1Q |  |
| edge:e-note-onchainprotect-dealscopednoto | review |  | proposed | 2026-11-23T12:51:04Z | ni:///sha-256;ccLiFZ9NZdcBNsRGsa8r4wA0Hi_TLU4VmwaRWHnvP1Q |  |
| artifact:artifact-bank-use-of-besu | review |  | proposed | 2026-11-23T12:51:04Z | ni:///sha-256;ccLiFZ9NZdcBNsRGsa8r4wA0Hi_TLU4VmwaRWHnvP1Q |  |
| edge:e-prod-onchainprotect-bankbesu | review |  | proposed | 2026-11-23T12:51:04Z | ni:///sha-256;ccLiFZ9NZdcBNsRGsa8r4wA0Hi_TLU4VmwaRWHnvP1Q |  |
