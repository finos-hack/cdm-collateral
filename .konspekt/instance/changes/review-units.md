# Review units (engineer layer)

Derived by `node tools/review-units.mjs`; do not edit by hand. Each row links a
commit bound in `changed.md` to a review unit (on GitHub, a pull request) that
contains it, one row per (review unit, commit), in the changed-code log's
commit order. The entity is found through `changed.md`. `state` is open,
merged, or closed; `timestamp` is the unit's merge, else close, else creation
time. A commit on the default branch that no review unit contains has one
`direct` row, with no review unit or merge commit and the commit's committer
time; a commit with no row is not on the default branch yet, or not derived
yet. `landed` is the default-branch commit that carries the change; `match` is
`same`, `squash`, `patch-id`, or `position` (spec/personas/engineer/SPEC.md).

| review unit | state | merge commit | commit | timestamp | landed | match |
|-------------|-------|--------------|--------|-----------|--------|-------|
| https://github.com/finos-hack/cdm-collateral/pull/1 | merged | 7a574f4b4cacd206a06df1a7d3dc3dc384a1a86d | 2bd570ec6bd32ebcff5a6168fd01260b87fed17f | 2026-10-15T02:18:43Z | 2bd570ec6bd32ebcff5a6168fd01260b87fed17f | same |
|  | direct |  | 9c2b9aa13312a3ba058e8c135fe7b254c04e6206 | 2026-10-15T12:22:58Z | 9c2b9aa13312a3ba058e8c135fe7b254c04e6206 | same |
|  | direct |  | fd3851eb0240bbe8c060a51211f78cb1b831ff2c | 2026-10-15T12:33:08Z | fd3851eb0240bbe8c060a51211f78cb1b831ff2c | same |
|  | direct |  | 40a0f83e827a49331a05c384224f7d0eb5c921ce | 2026-10-15T22:31:52Z | 40a0f83e827a49331a05c384224f7d0eb5c921ce | same |
|  | direct |  | 9c0a2e66faa60068677c123dbbf53b00aa79f96f | 2026-10-15T22:33:28Z | 9c0a2e66faa60068677c123dbbf53b00aa79f96f | same |
|  | direct |  | 0c325b984260873fc6eac068633a668b69e10bc0 | 2026-10-15T22:41:02Z | 0c325b984260873fc6eac068633a668b69e10bc0 | same |
|  | direct |  | 0b8609b21f09592e5981c63468f190173d6b7555 | 2026-10-15T22:52:39Z | 0b8609b21f09592e5981c63468f190173d6b7555 | same |
|  | direct |  | b456d4825123a9b06e0fc78ce416a34c8c3d46bb | 2026-10-15T22:55:58Z | b456d4825123a9b06e0fc78ce416a34c8c3d46bb | same |
|  | direct |  | 126443d57bbe27cfda54892ad05c5fef1b0cf43f | 2026-10-15T23:01:30Z | 126443d57bbe27cfda54892ad05c5fef1b0cf43f | same |
|  | direct |  | 8af66c6a9a6a96c7b601af50c251feb29b0042ea | 2026-10-15T23:04:45Z | 8af66c6a9a6a96c7b601af50c251feb29b0042ea | same |
|  | direct |  | abf24679340a1d2a41b83157194d7581164f34c4 | 2026-10-15T23:10:48Z | abf24679340a1d2a41b83157194d7581164f34c4 | same |
|  | direct |  | 965054a6bb76e3c509bae77b12857f9022f58081 | 2026-10-15T23:25:52Z | 965054a6bb76e3c509bae77b12857f9022f58081 | same |
|  | direct |  | 7d25e532b3a7cd454fb5285d98eb063cd3fc13bf | 2026-10-15T23:35:01Z | 7d25e532b3a7cd454fb5285d98eb063cd3fc13bf | same |
|  | direct |  | 02e52a683a7d0eb2dbb0eefe08a68cfcce3c10b3 | 2026-10-15T23:38:19Z | 02e52a683a7d0eb2dbb0eefe08a68cfcce3c10b3 | same |
|  | direct |  | 738c6296a86535f717a2522702ce814ceabfeb00 | 2026-10-15T23:43:17Z | 738c6296a86535f717a2522702ce814ceabfeb00 | same |
|  | direct |  | 618be95ac2eba89ec2868690c2776aa3cdea2756 | 2026-10-15T23:48:20Z | 618be95ac2eba89ec2868690c2776aa3cdea2756 | same |
|  | direct |  | 9c14ce38c4382c60388ede870e509474455da0d7 | 2026-10-15T23:55:51Z | 9c14ce38c4382c60388ede870e509474455da0d7 | same |
|  | direct |  | bce788a5e4efe73d461ab22366cabe308ae20a3a | 2026-10-16T00:27:52Z | bce788a5e4efe73d461ab22366cabe308ae20a3a | same |
|  | direct |  | 6921b898d52f4dc0919fa2931fbf778009e3e285 | 2026-10-16T02:47:21Z | 6921b898d52f4dc0919fa2931fbf778009e3e285 | same |
|  | direct |  | d64bd5d5ea182f07bde0b5e12d83e121a4943100 | 2026-10-16T02:55:34Z | d64bd5d5ea182f07bde0b5e12d83e121a4943100 | same |
|  | direct |  | d519ebb68267a0f91e1032a6e80d2d1855c8114a | 2026-10-16T19:30:55Z | d519ebb68267a0f91e1032a6e80d2d1855c8114a | same |
|  | direct |  | e517e160050c13972649bcba194281aca5099861 | 2026-10-16T19:49:05Z | e517e160050c13972649bcba194281aca5099861 | same |
|  | direct |  | a398eb8a8e394c1a3973ee461b1f26c93665cb6a | 2026-10-16T20:08:49Z | a398eb8a8e394c1a3973ee461b1f26c93665cb6a | same |
|  | direct |  | 672697dbbdf260a5ed99ca6758f2d8cb0d7b28e2 | 2026-10-16T20:21:13Z | 672697dbbdf260a5ed99ca6758f2d8cb0d7b28e2 | same |
|  | direct |  | 08ecc8d4aeb5955070e827069e8462347eb5c9e5 | 2026-10-16T20:44:06Z | 08ecc8d4aeb5955070e827069e8462347eb5c9e5 | same |
|  | direct |  | 25355efc371ab6c52c09bb89da76e22021a9710d | 2026-10-16T21:09:57Z | 25355efc371ab6c52c09bb89da76e22021a9710d | same |
|  | direct |  | 58be34dd93aa88cd463dd9e14624bdde13098e68 | 2026-10-16T21:36:47Z | 58be34dd93aa88cd463dd9e14624bdde13098e68 | same |
|  | direct |  | 5c3dfe01b23e7d80087ee3be6396543779330907 | 2026-10-16T22:15:10Z | 5c3dfe01b23e7d80087ee3be6396543779330907 | same |
|  | direct |  | d46610bd819fe03a90da24a5f082e742e28ac3c8 | 2026-10-16T22:20:40Z | d46610bd819fe03a90da24a5f082e742e28ac3c8 | same |
|  | direct |  | ded9ffd3aefba768891ecc5ee46c22bf11ebf458 | 2026-10-16T22:31:29Z | ded9ffd3aefba768891ecc5ee46c22bf11ebf458 | same |
|  | direct |  | 2242b848f97ae67ff60f9c4194744b5fb1eda48d | 2026-10-16T22:23:51Z | 2242b848f97ae67ff60f9c4194744b5fb1eda48d | same |
|  | direct |  | 60073e15f7d86676b9e9144278e04d769b6a2149 | 2026-10-16T22:52:27Z | 60073e15f7d86676b9e9144278e04d769b6a2149 | same |
|  | direct |  | 93df3bc9563722d54e54c7c201615f65d0d0be67 | 2026-10-16T23:02:27Z | 93df3bc9563722d54e54c7c201615f65d0d0be67 | same |
|  | direct |  | a7d9e53004ce5817beaa34e4413b69975cdd441b | 2026-10-16T23:07:09Z | a7d9e53004ce5817beaa34e4413b69975cdd441b | same |
|  | direct |  | d796a70da9bb9bccd483e134ea0e21e38f5d71aa | 2026-10-16T23:17:18Z | d796a70da9bb9bccd483e134ea0e21e38f5d71aa | same |
|  | direct |  | 61315ad349b7f4beb0a304b0bf815551fbb84b12 | 2026-10-17T00:16:25Z | 61315ad349b7f4beb0a304b0bf815551fbb84b12 | same |
|  | direct |  | 6dfc59fcf50b1457aab7ed2f335a36569e46f459 | 2026-10-17T00:25:47Z | 6dfc59fcf50b1457aab7ed2f335a36569e46f459 | same |
|  | direct |  | f784730126970ae3c8aaceecab9d384905e98aa3 | 2026-10-17T01:16:19Z | f784730126970ae3c8aaceecab9d384905e98aa3 | same |
|  | direct |  | e1957fa97ef1f5a7d1ae0fb7c14f335b5e14694b | 2026-10-17T13:40:04Z | e1957fa97ef1f5a7d1ae0fb7c14f335b5e14694b | same |
|  | direct |  | 36a3f300d305a663ff0faa8c683dd699cf5cd666 | 2026-10-17T16:04:01Z | 36a3f300d305a663ff0faa8c683dd699cf5cd666 | same |
|  | direct |  | 0da774e65d47b7dbfe35c5faac21d984f42b9eb2 | 2026-10-17T16:53:35Z | 0da774e65d47b7dbfe35c5faac21d984f42b9eb2 | same |
|  | direct |  | 3f2be38d3c8049c8659822651da9202a071c6588 | 2026-10-17T16:59:27Z | 3f2be38d3c8049c8659822651da9202a071c6588 | same |
|  | direct |  | 5508454ce8b1dbb33693c0e84666c2ed8ddf69bb | 2026-10-17T17:01:44Z | 5508454ce8b1dbb33693c0e84666c2ed8ddf69bb | same |
|  | direct |  | 4503371f5a9098bba714ff97db5419fe1e52a884 | 2026-10-17T18:33:30Z | 4503371f5a9098bba714ff97db5419fe1e52a884 | same |
|  | direct |  | c61ab6b767ebb4be9fca70eb86cae793e127ed4a | 2026-10-18T00:07:30Z | c61ab6b767ebb4be9fca70eb86cae793e127ed4a | same |
|  | direct |  | bd9eb1a35fc84915c41ba6e07b918bd40ee2400f | 2026-10-18T01:28:34Z | bd9eb1a35fc84915c41ba6e07b918bd40ee2400f | same |
|  | direct |  | 76cc4710be86d3496e835ecd716b2cdcfd7b19c2 | 2026-10-22T22:46:29Z | 76cc4710be86d3496e835ecd716b2cdcfd7b19c2 | same |
|  | direct |  | 4c3266413f6b2791dec4a60aef5e65ac03dc8237 | 2026-10-22T23:29:56Z | 4c3266413f6b2791dec4a60aef5e65ac03dc8237 | same |
|  | direct |  | f816c822c2fdb6a23deb87b798fe4de4492365fb | 2026-10-22T23:31:04Z | f816c822c2fdb6a23deb87b798fe4de4492365fb | same |
|  | direct |  | 6140563e91b6c10751019063b5c27e9a43bcb402 | 2026-10-22T23:57:08Z | 6140563e91b6c10751019063b5c27e9a43bcb402 | same |
|  | direct |  | e346a36f3e201f8a919e657fd4b01b3cd005fed2 | 2026-10-23T00:57:39Z | e346a36f3e201f8a919e657fd4b01b3cd005fed2 | same |
|  | direct |  | 85aee02609b972906d023cb4004ada1076162354 | 2026-10-23T15:48:11Z | 85aee02609b972906d023cb4004ada1076162354 | same |
|  | direct |  | 647133a5144782597370485bf37502f9aeb2ef78 | 2026-10-23T17:00:09Z | 647133a5144782597370485bf37502f9aeb2ef78 | same |
|  | direct |  | 255117e129e7dcef3cf41e4ae4ba5720b9b2d02c | 2026-10-23T21:29:16Z | 255117e129e7dcef3cf41e4ae4ba5720b9b2d02c | same |
|  | direct |  | 646e6e8d052d225e35e42937f06169ac055b4ab1 | 2026-10-23T21:41:29Z | 646e6e8d052d225e35e42937f06169ac055b4ab1 | same |
|  | direct |  | c099decf22238270c4b1e0c8af94bc99f96a4470 | 2026-10-24T14:49:59Z | c099decf22238270c4b1e0c8af94bc99f96a4470 | same |
|  | direct |  | d8840001d0f8292aed1980a7f06ff40e0d32956e | 2026-10-24T14:10:19Z | d8840001d0f8292aed1980a7f06ff40e0d32956e | same |
|  | direct |  | 950fcd5970c9496221cddb1c4fef0833e1df0e63 | 2026-10-24T14:11:20Z | 950fcd5970c9496221cddb1c4fef0833e1df0e63 | same |
|  | direct |  | f72d49792225325ee72e2e26a39e8c89748ec316 | 2026-10-24T15:01:04Z | f72d49792225325ee72e2e26a39e8c89748ec316 | same |
|  | direct |  | 862b3c282f19943ead86d1ed0d48f6eb19df9024 | 2026-10-24T15:03:11Z | 862b3c282f19943ead86d1ed0d48f6eb19df9024 | same |
| https://github.com/finos-hack/cdm-collateral/pull/5 | merged | b169b35c34fc2f8b7ef1151aecc59add82e4ddea | 880ef0dcf3b918301b78d305aa4c66f668d341c9 | 2026-10-25T01:55:39Z | 880ef0dcf3b918301b78d305aa4c66f668d341c9 | same |
| https://github.com/finos-hack/cdm-collateral/pull/5 | merged | b169b35c34fc2f8b7ef1151aecc59add82e4ddea | 8d2bba18b3f885c4ea8338e496ec6cde1bdd99b9 | 2026-10-25T01:55:39Z | 8d2bba18b3f885c4ea8338e496ec6cde1bdd99b9 | same |
| https://github.com/finos-hack/cdm-collateral/pull/5 | merged | b169b35c34fc2f8b7ef1151aecc59add82e4ddea | 70e8ceacdfb4c41b923ed3fb91b5404b62ae9532 | 2026-10-25T01:55:39Z | 70e8ceacdfb4c41b923ed3fb91b5404b62ae9532 | same |
| https://github.com/finos-hack/cdm-collateral/pull/5 | merged | b169b35c34fc2f8b7ef1151aecc59add82e4ddea | aa342a9c92b0c235da1cae1bca92413e39fd99c9 | 2026-10-25T01:55:39Z | aa342a9c92b0c235da1cae1bca92413e39fd99c9 | same |
| https://github.com/finos-hack/cdm-collateral/pull/5 | merged | b169b35c34fc2f8b7ef1151aecc59add82e4ddea | 6530b14e506d7248c60dadab89091d5bdf7180a1 | 2026-10-25T01:55:39Z | 6530b14e506d7248c60dadab89091d5bdf7180a1 | same |
| https://github.com/finos-hack/cdm-collateral/pull/5 | merged | b169b35c34fc2f8b7ef1151aecc59add82e4ddea | 3a89b7c4d9c3cc2c43bfae9092ca03870752333f | 2026-10-25T01:55:39Z | 3a89b7c4d9c3cc2c43bfae9092ca03870752333f | same |
| https://github.com/finos-hack/cdm-collateral/pull/5 | merged | b169b35c34fc2f8b7ef1151aecc59add82e4ddea | 2494e3996df4b6a73ae1c54df3e19f08e3a5a770 | 2026-10-25T01:55:39Z | 2494e3996df4b6a73ae1c54df3e19f08e3a5a770 | same |
| https://github.com/finos-hack/cdm-collateral/pull/5 | merged | b169b35c34fc2f8b7ef1151aecc59add82e4ddea | a1c87087bcae0ff0a3cd7286a330ea5c41bbc563 | 2026-10-25T01:55:39Z | a1c87087bcae0ff0a3cd7286a330ea5c41bbc563 | same |
| https://github.com/finos-hack/cdm-collateral/pull/5 | merged | b169b35c34fc2f8b7ef1151aecc59add82e4ddea | 688ba4beaeaa17c7e41538b86f321ef252f53743 | 2026-10-25T01:55:39Z | 688ba4beaeaa17c7e41538b86f321ef252f53743 | same |
| https://github.com/finos-hack/cdm-collateral/pull/5 | merged | b169b35c34fc2f8b7ef1151aecc59add82e4ddea | 11cd42f3897a5da1a29e28068620447bc1d5d0f1 | 2026-10-25T01:55:39Z | 11cd42f3897a5da1a29e28068620447bc1d5d0f1 | same |
| https://github.com/finos-hack/cdm-collateral/pull/5 | merged | b169b35c34fc2f8b7ef1151aecc59add82e4ddea | 77afa82fd8329c078491b7a50758b86c2fddb700 | 2026-10-25T01:55:39Z | 77afa82fd8329c078491b7a50758b86c2fddb700 | same |
| https://github.com/finos-hack/cdm-collateral/pull/5 | merged | b169b35c34fc2f8b7ef1151aecc59add82e4ddea | b65a7e58293d224eb8734b902883655bc5c66dc4 | 2026-10-25T01:55:39Z | b65a7e58293d224eb8734b902883655bc5c66dc4 | same |
| https://github.com/finos-hack/cdm-collateral/pull/5 | merged | b169b35c34fc2f8b7ef1151aecc59add82e4ddea | 9a5c8e1af3c745e3a13ecda85954266455c0fd86 | 2026-10-25T01:55:39Z | 9a5c8e1af3c745e3a13ecda85954266455c0fd86 | same |
| https://github.com/finos-hack/cdm-collateral/pull/5 | merged | b169b35c34fc2f8b7ef1151aecc59add82e4ddea | eebd4f95ec9aabc9bc336ccb5e7dbb5feff582d2 | 2026-10-25T01:55:39Z | eebd4f95ec9aabc9bc336ccb5e7dbb5feff582d2 | same |
| https://github.com/finos-hack/cdm-collateral/pull/5 | merged | b169b35c34fc2f8b7ef1151aecc59add82e4ddea | ac6474a87a0d169fb07dabee079955de1a9ef529 | 2026-10-25T01:55:39Z | ac6474a87a0d169fb07dabee079955de1a9ef529 | same |
| https://github.com/finos-hack/cdm-collateral/pull/5 | merged | b169b35c34fc2f8b7ef1151aecc59add82e4ddea | e1749a16dbe36ea32e49fb2a2e8f6a0791ba95a0 | 2026-10-25T01:55:39Z | e1749a16dbe36ea32e49fb2a2e8f6a0791ba95a0 | same |
| https://github.com/finos-hack/cdm-collateral/pull/5 | merged | b169b35c34fc2f8b7ef1151aecc59add82e4ddea | b317dfc6fbec38423a67ca976c4e948cc00df688 | 2026-10-25T01:55:39Z | b317dfc6fbec38423a67ca976c4e948cc00df688 | same |
| https://github.com/finos-hack/cdm-collateral/pull/7 | merged | c10f1f05178a529304a0353d45964811ff88ce4b | 22bbcafad80e8b6c08bfb436c59ebcfb29e37cca | 2026-10-25T02:16:33Z | 22bbcafad80e8b6c08bfb436c59ebcfb29e37cca | same |
| https://github.com/finos-hack/cdm-collateral/pull/8 | merged | 98de1915d2ed0df7751207f4dba5f1a6eb9bf893 | b3296bbfa9089521504cdfd081f749654ac877c9 | 2026-10-31T23:58:33Z | b3296bbfa9089521504cdfd081f749654ac877c9 | same |
| https://github.com/finos-hack/cdm-collateral/pull/8 | merged | 98de1915d2ed0df7751207f4dba5f1a6eb9bf893 | da3007e9b82f49c217f24e0cdf08df8fafbb24c8 | 2026-10-31T23:58:33Z | da3007e9b82f49c217f24e0cdf08df8fafbb24c8 | same |
| https://github.com/finos-hack/cdm-collateral/pull/8 | merged | 98de1915d2ed0df7751207f4dba5f1a6eb9bf893 | 887fc35707cc163417dd90b81840a1a7d52b75b0 | 2026-10-31T23:58:33Z | 887fc35707cc163417dd90b81840a1a7d52b75b0 | same |
| https://github.com/finos-hack/cdm-collateral/pull/8 | merged | 98de1915d2ed0df7751207f4dba5f1a6eb9bf893 | 980397c13e3f81964e129a5398e0178d8dd2d71a | 2026-10-31T23:58:33Z | 980397c13e3f81964e129a5398e0178d8dd2d71a | same |
| https://github.com/finos-hack/cdm-collateral/pull/8 | merged | 98de1915d2ed0df7751207f4dba5f1a6eb9bf893 | ba3a7967c8cfd0c5c1aa0f4c9b245e6b50f50c99 | 2026-10-31T23:58:33Z | ba3a7967c8cfd0c5c1aa0f4c9b245e6b50f50c99 | same |
| https://github.com/finos-hack/cdm-collateral/pull/8 | merged | 98de1915d2ed0df7751207f4dba5f1a6eb9bf893 | 7d49e20217581a79677bfcb480bcb11b60c751dc | 2026-10-31T23:58:33Z | 7d49e20217581a79677bfcb480bcb11b60c751dc | same |
| https://github.com/finos-hack/cdm-collateral/pull/8 | merged | 98de1915d2ed0df7751207f4dba5f1a6eb9bf893 | e7f4e272be1f3d7ccfb1eab23a5b5ddd59dce9d4 | 2026-10-31T23:58:33Z | e7f4e272be1f3d7ccfb1eab23a5b5ddd59dce9d4 | same |
| https://github.com/finos-hack/cdm-collateral/pull/8 | merged | 98de1915d2ed0df7751207f4dba5f1a6eb9bf893 | d4b0fcb4a8f81abc9fe0f221967475013a0cf558 | 2026-10-31T23:58:33Z | d4b0fcb4a8f81abc9fe0f221967475013a0cf558 | same |
| https://github.com/finos-hack/cdm-collateral/pull/8 | merged | 98de1915d2ed0df7751207f4dba5f1a6eb9bf893 | 3caa6f534296f2990560fa5c0c0fe91364abfcf5 | 2026-10-31T23:58:33Z | 3caa6f534296f2990560fa5c0c0fe91364abfcf5 | same |
| https://github.com/finos-hack/cdm-collateral/pull/9 | merged | f0ab9aa877d40cd8cc3d070cfae9757df4b8641d | a40dfd46d27375fe41855c42dee53963b6ba261c | 2026-11-01T21:37:33Z | a40dfd46d27375fe41855c42dee53963b6ba261c | same |
| https://github.com/finos-hack/cdm-collateral/pull/9 | merged | f0ab9aa877d40cd8cc3d070cfae9757df4b8641d | 383a6f5d2e636111fc22c40c6a93cf67ad12318d | 2026-11-01T21:37:33Z | 383a6f5d2e636111fc22c40c6a93cf67ad12318d | same |
| https://github.com/finos-hack/cdm-collateral/pull/9 | merged | f0ab9aa877d40cd8cc3d070cfae9757df4b8641d | 24ae23451a699619108bf0a62d6e634799317ab6 | 2026-11-01T21:37:33Z | 24ae23451a699619108bf0a62d6e634799317ab6 | same |
| https://github.com/finos-hack/cdm-collateral/pull/9 | merged | f0ab9aa877d40cd8cc3d070cfae9757df4b8641d | c9e0983644bfd4d1099a7a19dc814e0c893ec0bd | 2026-11-01T21:37:33Z | c9e0983644bfd4d1099a7a19dc814e0c893ec0bd | same |
| https://github.com/finos-hack/cdm-collateral/pull/9 | merged | f0ab9aa877d40cd8cc3d070cfae9757df4b8641d | b6d0a52a2b12cde68ae8275d43efed4d076f33e9 | 2026-11-01T21:37:33Z | b6d0a52a2b12cde68ae8275d43efed4d076f33e9 | same |
| https://github.com/finos-hack/cdm-collateral/pull/10 | merged | 09bb91a4cc3d502f342fdb026155f9775ca41fef | 68bcc94bed8a1a906c48094062cbd9934bee2f39 | 2026-11-03T03:45:57Z | 68bcc94bed8a1a906c48094062cbd9934bee2f39 | same |
| https://github.com/finos-hack/cdm-collateral/pull/10 | merged | 09bb91a4cc3d502f342fdb026155f9775ca41fef | 84ad917ab87fcd28f9164695f6f5752a5cdd5923 | 2026-11-03T03:45:57Z | 84ad917ab87fcd28f9164695f6f5752a5cdd5923 | same |
| https://github.com/finos-hack/cdm-collateral/pull/10 | merged | 09bb91a4cc3d502f342fdb026155f9775ca41fef | cbaf7ed5e77f24af605ad36bcedded59d64643fc | 2026-11-03T03:45:57Z | cbaf7ed5e77f24af605ad36bcedded59d64643fc | same |
| https://github.com/finos-hack/cdm-collateral/pull/10 | merged | 09bb91a4cc3d502f342fdb026155f9775ca41fef | 725cbac2e46792c689a06931697fd8b2936c4baf | 2026-11-03T03:45:57Z | 725cbac2e46792c689a06931697fd8b2936c4baf | same |
| https://github.com/finos-hack/cdm-collateral/pull/10 | merged | 09bb91a4cc3d502f342fdb026155f9775ca41fef | da9f71a1131ba17463fcc9dbc26bb57a85c01150 | 2026-11-03T03:45:57Z | da9f71a1131ba17463fcc9dbc26bb57a85c01150 | same |
| https://github.com/finos-hack/cdm-collateral/pull/10 | merged | 09bb91a4cc3d502f342fdb026155f9775ca41fef | 509c87039c22769f8667b42cd16bf242984a988c | 2026-11-03T03:45:57Z | 509c87039c22769f8667b42cd16bf242984a988c | same |
| https://github.com/finos-hack/cdm-collateral/pull/10 | merged | 09bb91a4cc3d502f342fdb026155f9775ca41fef | 24b484732475687713a529801ad07747f933ab17 | 2026-11-03T03:45:57Z | 24b484732475687713a529801ad07747f933ab17 | same |
| https://github.com/finos-hack/cdm-collateral/pull/10 | merged | 09bb91a4cc3d502f342fdb026155f9775ca41fef | e167324316ee7dbbc780cb3b2e3aa79a4215328b | 2026-11-03T03:45:57Z | e167324316ee7dbbc780cb3b2e3aa79a4215328b | same |
| https://github.com/finos-hack/cdm-collateral/pull/10 | merged | 09bb91a4cc3d502f342fdb026155f9775ca41fef | 5f463bd61feb30c3ea260845bb927911c220d68f | 2026-11-03T03:45:57Z | 5f463bd61feb30c3ea260845bb927911c220d68f | same |
| https://github.com/finos-hack/cdm-collateral/pull/11 | merged | 916f51fb20118b8cd9808602321923cfe2fba3c1 | 6ac01216656a05adeaace7982910ae025ded0bf3 | 2026-11-03T14:24:43Z | 6ac01216656a05adeaace7982910ae025ded0bf3 | same |
| https://github.com/finos-hack/cdm-collateral/pull/11 | merged | 916f51fb20118b8cd9808602321923cfe2fba3c1 | 2e0e130bdad4a9dc2a00d453f6648542936a8ec9 | 2026-11-03T14:24:43Z | 2e0e130bdad4a9dc2a00d453f6648542936a8ec9 | same |
| https://github.com/finos-hack/cdm-collateral/pull/11 | merged | 916f51fb20118b8cd9808602321923cfe2fba3c1 | 5aed76f8e42968ffde8f2a7e7bedd8b62ece33b8 | 2026-11-03T14:24:43Z | 5aed76f8e42968ffde8f2a7e7bedd8b62ece33b8 | same |
| https://github.com/finos-hack/cdm-collateral/pull/11 | merged | 916f51fb20118b8cd9808602321923cfe2fba3c1 | 7ee1ba8cf336865ceec0e3a94184ecb84dfeab92 | 2026-11-03T14:24:43Z | 7ee1ba8cf336865ceec0e3a94184ecb84dfeab92 | same |
| https://github.com/finos-hack/cdm-collateral/pull/11 | merged | 916f51fb20118b8cd9808602321923cfe2fba3c1 | cbd2673c60bc45c3ca58535fb8b3bea31eff6cf5 | 2026-11-03T14:24:43Z | cbd2673c60bc45c3ca58535fb8b3bea31eff6cf5 | same |
| https://github.com/finos-hack/cdm-collateral/pull/11 | merged | 916f51fb20118b8cd9808602321923cfe2fba3c1 | 281e67c2cdf6385bd57df1f7675d041ea798d9c9 | 2026-11-03T14:24:43Z | 281e67c2cdf6385bd57df1f7675d041ea798d9c9 | same |
| https://github.com/finos-hack/cdm-collateral/pull/11 | merged | 916f51fb20118b8cd9808602321923cfe2fba3c1 | 11497bc5fc04184e3c3b94f3cbf5d19c2892f2f5 | 2026-11-03T14:24:43Z | 11497bc5fc04184e3c3b94f3cbf5d19c2892f2f5 | same |
| https://github.com/finos-hack/cdm-collateral/pull/11 | merged | 916f51fb20118b8cd9808602321923cfe2fba3c1 | 11460e4f7534506bafd97f402a7bb7527399e655 | 2026-11-03T14:24:43Z | 11460e4f7534506bafd97f402a7bb7527399e655 | same |
| https://github.com/finos-hack/cdm-collateral/pull/11 | merged | 916f51fb20118b8cd9808602321923cfe2fba3c1 | 97d2b10ef85d732600e758fd7b008990af6c03ca | 2026-11-03T14:24:43Z | 97d2b10ef85d732600e758fd7b008990af6c03ca | same |
| https://github.com/finos-hack/cdm-collateral/pull/11 | merged | 916f51fb20118b8cd9808602321923cfe2fba3c1 | c3e70b68a1ad0a3437734dababbf5b5e427bc21c | 2026-11-03T14:24:43Z | c3e70b68a1ad0a3437734dababbf5b5e427bc21c | same |
| https://github.com/finos-hack/cdm-collateral/pull/12 | merged | f5d377a219165ae1a0fe2f8690113726e30f7c0f | 4b3592dc18bdf095710198c0eb0c28e1a1ee2c9f | 2026-11-03T14:45:16Z | 4b3592dc18bdf095710198c0eb0c28e1a1ee2c9f | same |
| https://github.com/finos-hack/cdm-collateral/pull/13 | merged | 54db8f4f937297fcf6ee979f96be46644216b757 | 5d81b5d289064fc07d3898003334a2369d98fd13 | 2026-11-03T16:36:44Z | 5d81b5d289064fc07d3898003334a2369d98fd13 | same |
| https://github.com/finos-hack/cdm-collateral/pull/13 | merged | 54db8f4f937297fcf6ee979f96be46644216b757 | 159fe5bd95f5ddef9259fe1e98bf7a491565e3f0 | 2026-11-03T16:36:44Z | 159fe5bd95f5ddef9259fe1e98bf7a491565e3f0 | same |
| https://github.com/finos-hack/cdm-collateral/pull/13 | merged | 54db8f4f937297fcf6ee979f96be46644216b757 | 2a21629780d74e6469f38bcbe4e6d5699f8ba312 | 2026-11-03T16:36:44Z | 2a21629780d74e6469f38bcbe4e6d5699f8ba312 | same |
| https://github.com/finos-hack/cdm-collateral/pull/13 | merged | 54db8f4f937297fcf6ee979f96be46644216b757 | b28cb8a91d3b5dcbeaa79b0307471cd231c8acf7 | 2026-11-03T16:36:44Z | b28cb8a91d3b5dcbeaa79b0307471cd231c8acf7 | same |
| https://github.com/finos-hack/cdm-collateral/pull/14 | merged | 60c6a9b9e6f86ae46e0ed708d896af4c84009e65 | 15e3acf8f2d8fb5341193af931cc2a5eba2275ed | 2026-11-03T16:36:56Z | 15e3acf8f2d8fb5341193af931cc2a5eba2275ed | same |
| https://github.com/finos-hack/cdm-collateral/pull/15 | merged | 88347a2370d5d7f2424a47d135f2671bafbd0d9a | 15e3acf8f2d8fb5341193af931cc2a5eba2275ed | 2026-11-03T16:54:36Z | 15e3acf8f2d8fb5341193af931cc2a5eba2275ed | same |
| https://github.com/finos-hack/cdm-collateral/pull/16 | merged | 8c9731aadef543dd38ca35c8b48fdb05d0a6b404 | 3e8a86896d3237e85772f20a2a87368decd12f04 | 2026-11-03T17:46:06Z | 3e8a86896d3237e85772f20a2a87368decd12f04 | same |
| https://github.com/finos-hack/cdm-collateral/pull/16 | merged | 8c9731aadef543dd38ca35c8b48fdb05d0a6b404 | 95c5e03b601b69b086397ae923f04aa6ff218142 | 2026-11-03T17:46:06Z | 95c5e03b601b69b086397ae923f04aa6ff218142 | same |
| https://github.com/finos-hack/cdm-collateral/pull/17 | merged | 88d09118b8e6febbc9d78e4d6b1c298701f82ac8 | 78a91206e40605b34ff534ed34bfa5ac3eee9ba2 | 2026-11-03T21:11:42Z | 78a91206e40605b34ff534ed34bfa5ac3eee9ba2 | same |
| https://github.com/finos-hack/cdm-collateral/pull/17 | merged | 88d09118b8e6febbc9d78e4d6b1c298701f82ac8 | a7732cdc4720676ab283f473685196d5d5bafd39 | 2026-11-03T21:11:42Z | a7732cdc4720676ab283f473685196d5d5bafd39 | same |
| https://github.com/finos-hack/cdm-collateral/pull/17 | merged | 88d09118b8e6febbc9d78e4d6b1c298701f82ac8 | 15eacf78bb64f1bb66cd85c85a20e78d590d6c55 | 2026-11-03T21:11:42Z | 15eacf78bb64f1bb66cd85c85a20e78d590d6c55 | same |
| https://github.com/finos-hack/cdm-collateral/pull/18 | merged | 97767846d76cc9f148bc5e18fc0dd3dc0e0c7d63 | 55b6ba2fdb98d35561b1ee07891372091d5b1ec0 | 2026-11-03T23:01:45Z | 55b6ba2fdb98d35561b1ee07891372091d5b1ec0 | same |
| https://github.com/finos-hack/cdm-collateral/pull/19 | merged | aee72032f276318e1725df067bffbe5dc631c77f | e00ca27850d692c5d1493e78412bb62d0ae23510 | 2026-11-03T23:54:02Z | e00ca27850d692c5d1493e78412bb62d0ae23510 | same |
| https://github.com/finos-hack/cdm-collateral/pull/20 | merged | ef05e4e5f5465a35ffcf0d38753c89fb5c67c843 | e7d16782e84a0db904b7866a2722d758d72327b2 | 2026-11-04T00:08:23Z | e7d16782e84a0db904b7866a2722d758d72327b2 | same |
| https://github.com/finos-hack/cdm-collateral/pull/21 | merged | 9460f7cbe07a4514dffbbe080ead8bf2937af107 | 79f9e8b6c475fd338117378ff776b6267b14ce06 | 2026-11-04T02:13:58Z | 79f9e8b6c475fd338117378ff776b6267b14ce06 | same |
| https://github.com/finos-hack/cdm-collateral/pull/22 | merged | d921528094ff121ef3026965dbdb5f51b1f4a0f6 | 6a09211522581e30866e020f30e806b52042afdd | 2026-11-04T02:28:02Z | 6a09211522581e30866e020f30e806b52042afdd | same |
| https://github.com/finos-hack/cdm-collateral/pull/23 | merged | 74ad75f853818a7e384817b9630fffa543151e2b | 27348a5abaa79b2a595c6190cda070853961de41 | 2026-11-04T02:47:52Z | 27348a5abaa79b2a595c6190cda070853961de41 | same |
| https://github.com/finos-hack/cdm-collateral/pull/24 | merged | d2ad03bfd771124a806b83389b70e7ddf8350900 | 00fd02b3ec13fca558266457f4762c832a0af4fb | 2026-11-04T04:09:26Z | 00fd02b3ec13fca558266457f4762c832a0af4fb | same |
| https://github.com/finos-hack/cdm-collateral/pull/25 | merged | e9321bba37e51e898b84e46882df410f1963385f | eb995edda8dd06f0509a456ed22e842443a5625c | 2026-11-06T15:24:59Z | eb995edda8dd06f0509a456ed22e842443a5625c | same |
| https://github.com/finos-hack/cdm-collateral/pull/25 | merged | e9321bba37e51e898b84e46882df410f1963385f | 8bb98918a0097a90fdafa85808f785c174b72c7b | 2026-11-06T15:24:59Z | 8bb98918a0097a90fdafa85808f785c174b72c7b | same |
| https://github.com/finos-hack/cdm-collateral/pull/25 | merged | e9321bba37e51e898b84e46882df410f1963385f | 34d13876bcacfbaa080c8fcf3b64728abe449f83 | 2026-11-06T15:24:59Z | 34d13876bcacfbaa080c8fcf3b64728abe449f83 | same |
| https://github.com/finos-hack/cdm-collateral/pull/26 | merged | 771506e9e52b8056947b0a4bfd614cfb93c39372 | 6a2dbc5324563b7f1a23308857ddc8cf92071781 | 2026-11-06T16:28:39Z | 6a2dbc5324563b7f1a23308857ddc8cf92071781 | same |
| https://github.com/finos-hack/cdm-collateral/pull/26 | merged | 771506e9e52b8056947b0a4bfd614cfb93c39372 | 0f04add596a67c7d8324f59797d83a61e8ce453d | 2026-11-06T16:28:39Z | 0f04add596a67c7d8324f59797d83a61e8ce453d | same |
| https://github.com/finos-hack/cdm-collateral/pull/27 | merged | b9b9b0beeb768ff7ce22b67394c1be6437afbd79 | 77f21681f87062c650cf3394c0f92287c706f751 | 2026-11-06T20:09:55Z | 77f21681f87062c650cf3394c0f92287c706f751 | same |
| https://github.com/finos-hack/cdm-collateral/pull/27 | merged | b9b9b0beeb768ff7ce22b67394c1be6437afbd79 | 33a7a11583068ebe4c5a8f3fa0587a9bc7bc640f | 2026-11-06T20:09:55Z | 33a7a11583068ebe4c5a8f3fa0587a9bc7bc640f | same |
| https://github.com/finos-hack/cdm-collateral/pull/28 | merged | 8d6eeb3010ecef6cf9519f27d8dbec666691e8d8 | 9469cd757c63c60cdbeca737ae1ad6868b74c4ce | 2026-11-06T21:07:00Z | 9469cd757c63c60cdbeca737ae1ad6868b74c4ce | same |
| https://github.com/finos-hack/cdm-collateral/pull/28 | merged | 8d6eeb3010ecef6cf9519f27d8dbec666691e8d8 | b69747038b84a2eedb85abc0ca765216af747014 | 2026-11-06T21:07:00Z | b69747038b84a2eedb85abc0ca765216af747014 | same |
| https://github.com/finos-hack/cdm-collateral/pull/29 | merged | f40c3cb9ea21994fe7ecc1b14ad046d9bf4d2c72 | 493672b5c993a93cf79ad72eab88947225725a9c | 2026-11-06T21:32:59Z | 493672b5c993a93cf79ad72eab88947225725a9c | same |
| https://github.com/finos-hack/cdm-collateral/pull/30 | merged | a49898bbed065cfeef1e1d58a8fea882afb85544 | e5d8ded8a57acc47f677f0f3d938432e30c468dc | 2026-11-06T21:51:50Z | e5d8ded8a57acc47f677f0f3d938432e30c468dc | same |
| https://github.com/finos-hack/cdm-collateral/pull/30 | merged | a49898bbed065cfeef1e1d58a8fea882afb85544 | 696ff06f1804db5d7f0f37ce27e85f3679300bfe | 2026-11-06T21:51:50Z | 696ff06f1804db5d7f0f37ce27e85f3679300bfe | same |
| https://github.com/finos-hack/cdm-collateral/pull/30 | merged | a49898bbed065cfeef1e1d58a8fea882afb85544 | 8d0b85735e6ee9cc96256e42e9960d83be3d7ce7 | 2026-11-06T21:51:50Z | 8d0b85735e6ee9cc96256e42e9960d83be3d7ce7 | same |
| https://github.com/finos-hack/cdm-collateral/pull/32 | merged | 0de31848290bbacecbcf9827d04c51346e1b0afb | dce468865ee876955bf239015ed46c51ab60d571 | 2026-11-06T23:33:52Z | dce468865ee876955bf239015ed46c51ab60d571 | same |
| https://github.com/finos-hack/cdm-collateral/pull/32 | merged | 0de31848290bbacecbcf9827d04c51346e1b0afb | 1de903f6322b3db7866009f3f74e26b376511a5c | 2026-11-06T23:33:52Z | 1de903f6322b3db7866009f3f74e26b376511a5c | same |
| https://github.com/finos-hack/cdm-collateral/pull/32 | merged | 0de31848290bbacecbcf9827d04c51346e1b0afb | 72bc9e1865b008bfc380f7185875f6c47132ab9a | 2026-11-06T23:33:52Z | 72bc9e1865b008bfc380f7185875f6c47132ab9a | same |
| https://github.com/finos-hack/cdm-collateral/pull/35 | merged | 4db2dcb849dd258f68d66ca53b6e37b2e4875134 | 5dedd5336f99cab07baf47f4976508e28b06332b | 2026-11-07T13:46:12Z | 5dedd5336f99cab07baf47f4976508e28b06332b | same |
| https://github.com/finos-hack/cdm-collateral/pull/36 | merged | 547e26eecd5e54d16218ee89420a7f484312d077 | 2b60bbeacabbeba6def81fe32ecc5a31d51dd308 | 2026-11-07T18:28:53Z | 2b60bbeacabbeba6def81fe32ecc5a31d51dd308 | same |
| https://github.com/finos-hack/cdm-collateral/pull/36 | merged | 547e26eecd5e54d16218ee89420a7f484312d077 | 04499c653ec6cdaa506047b022d05c02336aea9a | 2026-11-07T18:28:53Z | 04499c653ec6cdaa506047b022d05c02336aea9a | same |
| https://github.com/finos-hack/cdm-collateral/pull/36 | merged | 547e26eecd5e54d16218ee89420a7f484312d077 | 8d2617e7f5bbd65724d0644fdddc2d4359866e08 | 2026-11-07T18:28:53Z | 8d2617e7f5bbd65724d0644fdddc2d4359866e08 | same |
| https://github.com/finos-hack/cdm-collateral/pull/37 | merged | dd7f478337e282954ea60951973062544be46024 | b39ad55a7eba419b776073f61eeee31a56eb27d2 | 2026-11-07T21:06:26Z | b39ad55a7eba419b776073f61eeee31a56eb27d2 | same |
| https://github.com/finos-hack/cdm-collateral/pull/37 | merged | dd7f478337e282954ea60951973062544be46024 | 64fbc164d223a4d0b9f611469ea9e07bdf6f10dd | 2026-11-07T21:06:26Z | 64fbc164d223a4d0b9f611469ea9e07bdf6f10dd | same |
| https://github.com/finos-hack/cdm-collateral/pull/37 | merged | dd7f478337e282954ea60951973062544be46024 | 44a2f285c9f6d4ecedebc1b0d2115d3c2b18d87c | 2026-11-07T21:06:26Z | 44a2f285c9f6d4ecedebc1b0d2115d3c2b18d87c | same |
| https://github.com/finos-hack/cdm-collateral/pull/37 | merged | dd7f478337e282954ea60951973062544be46024 | 7b5327957bc89026f8220bd4b80afb821471de8c | 2026-11-07T21:06:26Z | 7b5327957bc89026f8220bd4b80afb821471de8c | same |
| https://github.com/finos-hack/cdm-collateral/pull/37 | merged | dd7f478337e282954ea60951973062544be46024 | bbfcec4b2076ecad24e2b46f63eb0a2e95580a02 | 2026-11-07T21:06:26Z | bbfcec4b2076ecad24e2b46f63eb0a2e95580a02 | same |
| https://github.com/finos-hack/cdm-collateral/pull/37 | merged | dd7f478337e282954ea60951973062544be46024 | cb56fc6e0848c4dc26e8cc4c68b5335225fea9df | 2026-11-07T21:06:26Z | cb56fc6e0848c4dc26e8cc4c68b5335225fea9df | same |
| https://github.com/finos-hack/cdm-collateral/pull/38 | merged | 808cd055034e55c830f020a6d98bb4cc5cd622eb | 1413a64a0930c4a957a75bb00f9bf2eb33bb81c5 | 2026-11-07T21:19:04Z | 1413a64a0930c4a957a75bb00f9bf2eb33bb81c5 | same |
| https://github.com/finos-hack/cdm-collateral/pull/38 | merged | 808cd055034e55c830f020a6d98bb4cc5cd622eb | 8a44f914f5c2af025dcf0cd266dddb379c58c27a | 2026-11-07T21:19:04Z | 8a44f914f5c2af025dcf0cd266dddb379c58c27a | same |
| https://github.com/finos-hack/cdm-collateral/pull/38 | merged | 808cd055034e55c830f020a6d98bb4cc5cd622eb | fca88b7e8a3c39ab0d130588d945eebf4f1a6198 | 2026-11-07T21:19:04Z | fca88b7e8a3c39ab0d130588d945eebf4f1a6198 | same |
| https://github.com/finos-hack/cdm-collateral/pull/39 | merged | b6c8328c32f84f0cc6f8ec00bbce0b163715480d | dfefd4c904004a3913c273ca3021a1bcd2c60228 | 2026-11-07T21:19:46Z | dfefd4c904004a3913c273ca3021a1bcd2c60228 | same |
| https://github.com/finos-hack/cdm-collateral/pull/40 | merged | d381282b8ddffb8ba6dce22c267d4b13d7e0614a | 6add06573ac5cc4fb6e7cb1f74f185585030c4df | 2026-11-07T22:08:47Z | 6add06573ac5cc4fb6e7cb1f74f185585030c4df | same |
| https://github.com/finos-hack/cdm-collateral/pull/40 | merged | d381282b8ddffb8ba6dce22c267d4b13d7e0614a | a2e93e6cd9fd0166155a7be283ae52a9b18411d5 | 2026-11-07T22:08:47Z | a2e93e6cd9fd0166155a7be283ae52a9b18411d5 | same |
| https://github.com/finos-hack/cdm-collateral/pull/40 | merged | d381282b8ddffb8ba6dce22c267d4b13d7e0614a | f0d0d4cdb518f6e25ff2e358b029de7fd99a4ea8 | 2026-11-07T22:08:47Z | f0d0d4cdb518f6e25ff2e358b029de7fd99a4ea8 | same |
| https://github.com/finos-hack/cdm-collateral/pull/40 | merged | d381282b8ddffb8ba6dce22c267d4b13d7e0614a | 2674038e0c54ccbb8c2d34497d37c9270d015886 | 2026-11-07T22:08:47Z | 2674038e0c54ccbb8c2d34497d37c9270d015886 | same |
| https://github.com/finos-hack/cdm-collateral/pull/41 | merged | 316f94606456d4b5e506748ebd055dff70f27119 | 8ce4f5b5b4b0f3442ed6b588efa0ae3e6ec02762 | 2026-11-07T22:09:00Z | 8ce4f5b5b4b0f3442ed6b588efa0ae3e6ec02762 | same |
| https://github.com/finos-hack/cdm-collateral/pull/42 | merged | 414181dcbee2ad2a91fdcb51dfda8b1602939190 | fa15b602f6ac15e2d997d2447dbe796a7bed54e1 | 2026-11-07T22:33:24Z | fa15b602f6ac15e2d997d2447dbe796a7bed54e1 | same |
| https://github.com/finos-hack/cdm-collateral/pull/43 | merged | 08b54ab0450e8ef44d863a2161a7c20e6481eea9 | 55caf46500d1415b4d60efc78f681b0129482cee | 2026-11-07T23:16:39Z | 55caf46500d1415b4d60efc78f681b0129482cee | same |
| https://github.com/finos-hack/cdm-collateral/pull/43 | merged | 08b54ab0450e8ef44d863a2161a7c20e6481eea9 | 6da64df7927c48a4017dfc77491b6b9e188c47c4 | 2026-11-07T23:16:39Z | 6da64df7927c48a4017dfc77491b6b9e188c47c4 | same |
| https://github.com/finos-hack/cdm-collateral/pull/44 | merged | 8bea3155874b250e60e4e700675e4e80d2f5bdb6 | 799c9283e88f0ed06f1847cc6a31c71d2496a818 | 2026-11-08T01:17:23Z | 799c9283e88f0ed06f1847cc6a31c71d2496a818 | same |
| https://github.com/finos-hack/cdm-collateral/pull/44 | merged | 8bea3155874b250e60e4e700675e4e80d2f5bdb6 | 5034edf5cb17df72abac5f713195dabe7d490019 | 2026-11-08T01:17:23Z | 5034edf5cb17df72abac5f713195dabe7d490019 | same |
| https://github.com/finos-hack/cdm-collateral/pull/45 | merged | 6d9dd4679f49810c384c1ff3e383f50d2e89c57d | 920d9b8152c5a26c1bdebb35c3503235d0b11645 | 2026-11-08T02:29:54Z | 920d9b8152c5a26c1bdebb35c3503235d0b11645 | same |
| https://github.com/finos-hack/cdm-collateral/pull/46 | merged | e8b49dc393d1ab373e668a37483fa2e26b423f71 | 41567e7ba4656ce8011931f5641228abe236d010 | 2026-11-08T15:56:18Z | 41567e7ba4656ce8011931f5641228abe236d010 | same |
| https://github.com/finos-hack/cdm-collateral/pull/46 | merged | e8b49dc393d1ab373e668a37483fa2e26b423f71 | 9612a93ffbcd4507ddd17d08a47c71a1a8454609 | 2026-11-08T15:56:18Z | 9612a93ffbcd4507ddd17d08a47c71a1a8454609 | same |
| https://github.com/finos-hack/cdm-collateral/pull/46 | merged | e8b49dc393d1ab373e668a37483fa2e26b423f71 | 853652872f27bacfcb404464b092c3b68cd2bcba | 2026-11-08T15:56:18Z | 853652872f27bacfcb404464b092c3b68cd2bcba | same |
| https://github.com/finos-hack/cdm-collateral/pull/46 | merged | e8b49dc393d1ab373e668a37483fa2e26b423f71 | 214173ec84eab7c6a2913f8530507bccf75be49c | 2026-11-08T15:56:18Z | 214173ec84eab7c6a2913f8530507bccf75be49c | same |
| https://github.com/finos-hack/cdm-collateral/pull/46 | merged | e8b49dc393d1ab373e668a37483fa2e26b423f71 | 29ffbd54da0bdaa999a940e89aedc269c7687a78 | 2026-11-08T15:56:18Z | 29ffbd54da0bdaa999a940e89aedc269c7687a78 | same |
| https://github.com/finos-hack/cdm-collateral/pull/47 | merged | 34992269d34d61a5f7cf11477e79e6053df67c49 | a9fbf27604ad655e42b6bbaa8513cbc29c744f67 | 2026-11-08T16:53:29Z | a9fbf27604ad655e42b6bbaa8513cbc29c744f67 | same |
| https://github.com/finos-hack/cdm-collateral/pull/47 | merged | 34992269d34d61a5f7cf11477e79e6053df67c49 | 9bfa180713717647fb593561db8477a17efe6431 | 2026-11-08T16:53:29Z | 9bfa180713717647fb593561db8477a17efe6431 | same |
| https://github.com/finos-hack/cdm-collateral/pull/47 | merged | 34992269d34d61a5f7cf11477e79e6053df67c49 | 8ef6cb8383da0554a2235d7df03d9be09a032d92 | 2026-11-08T16:53:29Z | 8ef6cb8383da0554a2235d7df03d9be09a032d92 | same |
| https://github.com/finos-hack/cdm-collateral/pull/47 | merged | 34992269d34d61a5f7cf11477e79e6053df67c49 | b0f242e5875fd217710f2a8043a9e2cc0407c5d6 | 2026-11-08T16:53:29Z | b0f242e5875fd217710f2a8043a9e2cc0407c5d6 | same |
| https://github.com/finos-hack/cdm-collateral/pull/47 | merged | 34992269d34d61a5f7cf11477e79e6053df67c49 | 67bb0e712aceb92c73d74c970c22d0e866c8b0b3 | 2026-11-08T16:53:29Z | 67bb0e712aceb92c73d74c970c22d0e866c8b0b3 | same |
| https://github.com/finos-hack/cdm-collateral/pull/48 | merged | 0d367bfb96ce6982252e0d071de90f0a24b18a8d | 93ee6f433c34adbb0b1823b04b00100acf5cf698 | 2026-11-08T19:31:09Z | 93ee6f433c34adbb0b1823b04b00100acf5cf698 | same |
| https://github.com/finos-hack/cdm-collateral/pull/48 | merged | 0d367bfb96ce6982252e0d071de90f0a24b18a8d | b19ffe9728d950aa158a78c0897e291af81e8d42 | 2026-11-08T19:31:09Z | b19ffe9728d950aa158a78c0897e291af81e8d42 | same |
| https://github.com/finos-hack/cdm-collateral/pull/48 | merged | 0d367bfb96ce6982252e0d071de90f0a24b18a8d | 8ef9eea8bee3f5bb64241819f04b255b99570d36 | 2026-11-08T19:31:09Z | 8ef9eea8bee3f5bb64241819f04b255b99570d36 | same |
| https://github.com/finos-hack/cdm-collateral/pull/49 | merged | b39e760f06201b476c61a99a8c50e845d2e6dbd7 | 1be0b267e3a27c5ce8d5aac5839eeaec9d538d04 | 2026-11-08T20:45:33Z | 1be0b267e3a27c5ce8d5aac5839eeaec9d538d04 | same |
| https://github.com/finos-hack/cdm-collateral/pull/49 | merged | b39e760f06201b476c61a99a8c50e845d2e6dbd7 | 5be9ab787ecff50f7f2f97f6622f8488c6c70dfa | 2026-11-08T20:45:33Z | 5be9ab787ecff50f7f2f97f6622f8488c6c70dfa | same |
| https://github.com/finos-hack/cdm-collateral/pull/49 | merged | b39e760f06201b476c61a99a8c50e845d2e6dbd7 | 2aed9f119f1310b5facb8cce046f4b24130e0303 | 2026-11-08T20:45:33Z | 2aed9f119f1310b5facb8cce046f4b24130e0303 | same |
| https://github.com/finos-hack/cdm-collateral/pull/50 | merged | c44747e22067978beab725e06d8b7b9767039ac7 | 8dcf6e91d844f6638b17eca2c1a90cb38129f9a7 | 2026-11-08T21:54:20Z | 8dcf6e91d844f6638b17eca2c1a90cb38129f9a7 | same |
| https://github.com/finos-hack/cdm-collateral/pull/50 | merged | c44747e22067978beab725e06d8b7b9767039ac7 | 2132990d57a936fb1ef31aec0544ab38b401476d | 2026-11-08T21:54:20Z | 2132990d57a936fb1ef31aec0544ab38b401476d | same |
| https://github.com/finos-hack/cdm-collateral/pull/50 | merged | c44747e22067978beab725e06d8b7b9767039ac7 | cfd1a6d799c85860aa6f39f9840185c2d590a2d4 | 2026-11-08T21:54:20Z | cfd1a6d799c85860aa6f39f9840185c2d590a2d4 | same |
| https://github.com/finos-hack/cdm-collateral/pull/51 | merged | e276f3938466892ffc534f55108a5995c8e1d010 | 218e98d3162e08e3429d0beb543b59eb46b9e630 | 2026-11-08T23:12:56Z | 218e98d3162e08e3429d0beb543b59eb46b9e630 | same |
| https://github.com/finos-hack/cdm-collateral/pull/52 | merged | dc55bed5636c36b9dd4ae32fadb05e75f569ab45 | 5bc1336f2781b75e70e085267991b5b4ccd3a430 | 2026-11-09T00:26:02Z | 5bc1336f2781b75e70e085267991b5b4ccd3a430 | same |
| https://github.com/finos-hack/cdm-collateral/pull/52 | merged | dc55bed5636c36b9dd4ae32fadb05e75f569ab45 | 5855a1af3600eddd68bee65824672c3e39115e8d | 2026-11-09T00:26:02Z | 5855a1af3600eddd68bee65824672c3e39115e8d | same |
| https://github.com/finos-hack/cdm-collateral/pull/52 | merged | dc55bed5636c36b9dd4ae32fadb05e75f569ab45 | 4e0d2366aeff0928d36a646694d41d4c3999c3b9 | 2026-11-09T00:26:02Z | 4e0d2366aeff0928d36a646694d41d4c3999c3b9 | same |
| https://github.com/finos-hack/cdm-collateral/pull/53 | merged | 6d9825188d8352cb907240142a674f995423fbd6 | 8cef35111a7d4d9635370b4ce25f116245c46559 | 2026-11-09T00:55:49Z | 8cef35111a7d4d9635370b4ce25f116245c46559 | same |
| https://github.com/finos-hack/cdm-collateral/pull/55 | merged | 579a59a424f191089bc51c488f0c801d087f1007 | c84e55622af51beea51821e3202c68e22dcb3ac7 | 2026-11-11T01:11:14Z | c84e55622af51beea51821e3202c68e22dcb3ac7 | same |
|  | direct |  | 81f929ce1ea85bc1f789c6b2d638a28c1df5126b | 2026-11-10T23:04:12Z | 81f929ce1ea85bc1f789c6b2d638a28c1df5126b | same |
| https://github.com/finos-hack/cdm-collateral/pull/54 | merged | b8ddd2730b8790fe8c86a8ab3b0229d9c527a05f | daf689eee077b697d4db4d5a07989901732583c3 | 2026-11-10T23:19:21Z | daf689eee077b697d4db4d5a07989901732583c3 | same |
| https://github.com/finos-hack/cdm-collateral/pull/55 | merged | 579a59a424f191089bc51c488f0c801d087f1007 | ce2d6d12a392d364211fa7c7b7c3eadec69c2b81 | 2026-11-11T01:11:14Z | ce2d6d12a392d364211fa7c7b7c3eadec69c2b81 | same |
| https://github.com/finos-hack/cdm-collateral/pull/55 | merged | 579a59a424f191089bc51c488f0c801d087f1007 | 875c780d2690486372edd953d20c1a6390f51d0a | 2026-11-11T01:11:14Z | 875c780d2690486372edd953d20c1a6390f51d0a | same |
| https://github.com/finos-hack/cdm-collateral/pull/55 | merged | 579a59a424f191089bc51c488f0c801d087f1007 | c34369784ca25f096728a40c1ebe40fbb6abdc04 | 2026-11-11T01:11:14Z | c34369784ca25f096728a40c1ebe40fbb6abdc04 | same |
| https://github.com/finos-hack/cdm-collateral/pull/55 | merged | 579a59a424f191089bc51c488f0c801d087f1007 | f49e13c6b2438369169cdcb649cf20bdca92c35e | 2026-11-11T01:11:14Z | f49e13c6b2438369169cdcb649cf20bdca92c35e | same |
| https://github.com/finos-hack/cdm-collateral/pull/55 | merged | 579a59a424f191089bc51c488f0c801d087f1007 | fc520bacc0025994060e0c177a4603c18a088586 | 2026-11-11T01:11:14Z | fc520bacc0025994060e0c177a4603c18a088586 | same |
| https://github.com/finos-hack/cdm-collateral/pull/56 | merged | b134526c0caab50a0d504eb2063aa703f1c6c4a3 | 0ae20dd50798878c72d7a176a3c4989caced3038 | 2026-11-11T04:19:34Z | 0ae20dd50798878c72d7a176a3c4989caced3038 | same |
| https://github.com/finos-hack/cdm-collateral/pull/56 | merged | b134526c0caab50a0d504eb2063aa703f1c6c4a3 | ea620110aea2443dd3700efc9bac3b202bfcbe9d | 2026-11-11T04:19:34Z | ea620110aea2443dd3700efc9bac3b202bfcbe9d | same |
| https://github.com/finos-hack/cdm-collateral/pull/56 | merged | b134526c0caab50a0d504eb2063aa703f1c6c4a3 | 67577b7ad5198c106e793696d2d4df557be5d3bb | 2026-11-11T04:19:34Z | 67577b7ad5198c106e793696d2d4df557be5d3bb | same |
| https://github.com/finos-hack/cdm-collateral/pull/56 | merged | b134526c0caab50a0d504eb2063aa703f1c6c4a3 | 7b3a87d0ad9c03a74dc119bbc974030cccf1ae25 | 2026-11-11T04:19:34Z | 7b3a87d0ad9c03a74dc119bbc974030cccf1ae25 | same |
| https://github.com/finos-hack/cdm-collateral/pull/57 | merged | 7f8858165d9ac8cb584b53b7ab004ea17a147a74 | e45964f499be84b372eec579c8dc95cabf24402b | 2026-11-11T13:09:13Z | e45964f499be84b372eec579c8dc95cabf24402b | same |
| https://github.com/finos-hack/cdm-collateral/pull/57 | merged | 7f8858165d9ac8cb584b53b7ab004ea17a147a74 | bea0467a2d69fef5c805598cb85be3ec4cbbc4a8 | 2026-11-11T13:09:13Z | bea0467a2d69fef5c805598cb85be3ec4cbbc4a8 | same |
| https://github.com/finos-hack/cdm-collateral/pull/58 | merged | ef526b1a946c01bb7cedce914ce6b0d67c7cb973 | ea69851dd6053d59de1f78fec8adf7c4c86181d4 | 2026-11-11T14:57:00Z | ea69851dd6053d59de1f78fec8adf7c4c86181d4 | same |
| https://github.com/finos-hack/cdm-collateral/pull/58 | merged | ef526b1a946c01bb7cedce914ce6b0d67c7cb973 | 80c1f419000d558d70d5b8c0df96397ae64019a5 | 2026-11-11T14:57:00Z | 80c1f419000d558d70d5b8c0df96397ae64019a5 | same |
| https://github.com/finos-hack/cdm-collateral/pull/58 | merged | ef526b1a946c01bb7cedce914ce6b0d67c7cb973 | 59818ef472e6c32b48cde8e8ef480b02601273a2 | 2026-11-11T14:57:00Z | 59818ef472e6c32b48cde8e8ef480b02601273a2 | same |
| https://github.com/finos-hack/cdm-collateral/pull/58 | merged | ef526b1a946c01bb7cedce914ce6b0d67c7cb973 | 3b274115d7478618c879e38e6003f9f1b730676a | 2026-11-11T14:57:00Z | 3b274115d7478618c879e38e6003f9f1b730676a | same |
| https://github.com/finos-hack/cdm-collateral/pull/58 | merged | ef526b1a946c01bb7cedce914ce6b0d67c7cb973 | dfe9831f9df6b6c95dc0bec404e6294cab8843fe | 2026-11-11T14:57:00Z | dfe9831f9df6b6c95dc0bec404e6294cab8843fe | same |
| https://github.com/finos-hack/cdm-collateral/pull/59 | merged | 9fd95dc8fd63dd968b6544414987bf54777e73fd | 461bbfdb0daf252c2c21eed06d699f4c03015df6 | 2026-11-11T17:43:05Z | 461bbfdb0daf252c2c21eed06d699f4c03015df6 | same |
| https://github.com/finos-hack/cdm-collateral/pull/59 | merged | 9fd95dc8fd63dd968b6544414987bf54777e73fd | bf56ee10eb7683a124c0531ebc360d945d840d06 | 2026-11-11T17:43:05Z | bf56ee10eb7683a124c0531ebc360d945d840d06 | same |
| https://github.com/finos-hack/cdm-collateral/pull/59 | merged | 9fd95dc8fd63dd968b6544414987bf54777e73fd | f7a192ce82a2032739228729051211079b685efa | 2026-11-11T17:43:05Z | f7a192ce82a2032739228729051211079b685efa | same |
| https://github.com/finos-hack/cdm-collateral/pull/59 | merged | 9fd95dc8fd63dd968b6544414987bf54777e73fd | 74cce9230e70062f6044b49c6ca45714a2881317 | 2026-11-11T17:43:05Z | 74cce9230e70062f6044b49c6ca45714a2881317 | same |
| https://github.com/finos-hack/cdm-collateral/pull/59 | merged | 9fd95dc8fd63dd968b6544414987bf54777e73fd | 820ba93ee389e470e0ff2ae6765aeb5673ac871f | 2026-11-11T17:43:05Z | 820ba93ee389e470e0ff2ae6765aeb5673ac871f | same |
| https://github.com/finos-hack/cdm-collateral/pull/59 | merged | 9fd95dc8fd63dd968b6544414987bf54777e73fd | f958cfbb9f5213a8615921d08f7b1ffe2a398ffc | 2026-11-11T17:43:05Z | f958cfbb9f5213a8615921d08f7b1ffe2a398ffc | same |
| https://github.com/finos-hack/cdm-collateral/pull/59 | merged | 9fd95dc8fd63dd968b6544414987bf54777e73fd | e15d8a97b7abd286148c200db694ae3443d05146 | 2026-11-11T17:43:05Z | e15d8a97b7abd286148c200db694ae3443d05146 | same |
| https://github.com/finos-hack/cdm-collateral/pull/59 | merged | 9fd95dc8fd63dd968b6544414987bf54777e73fd | 16acbe73fa85dde6792f25be18069e0997527030 | 2026-11-11T17:43:05Z | 16acbe73fa85dde6792f25be18069e0997527030 | same |
| https://github.com/finos-hack/cdm-collateral/pull/59 | merged | 9fd95dc8fd63dd968b6544414987bf54777e73fd | d30f416195a7ec5e655d17ff240efffdbcf7f597 | 2026-11-11T17:43:05Z | d30f416195a7ec5e655d17ff240efffdbcf7f597 | same |
| https://github.com/finos-hack/cdm-collateral/pull/60 | merged | 6cf7b323528a0bd1339734ea42f53712edf541d6 | a3654ea1225a2e3d8f29bc8e665ae0d59007e667 | 2026-11-11T18:09:49Z | a3654ea1225a2e3d8f29bc8e665ae0d59007e667 | same |
| https://github.com/finos-hack/cdm-collateral/pull/60 | merged | 6cf7b323528a0bd1339734ea42f53712edf541d6 | 88fd8f4a683dc53e653d970d3a0cab56b4524086 | 2026-11-11T18:09:49Z | 88fd8f4a683dc53e653d970d3a0cab56b4524086 | same |
| https://github.com/finos-hack/cdm-collateral/pull/60 | merged | 6cf7b323528a0bd1339734ea42f53712edf541d6 | b619e91694e744a2a072ddcdf7e84049ba7a61ae | 2026-11-11T18:09:49Z | b619e91694e744a2a072ddcdf7e84049ba7a61ae | same |
| https://github.com/finos-hack/cdm-collateral/pull/60 | merged | 6cf7b323528a0bd1339734ea42f53712edf541d6 | c01bc1ba9fec40f1b28069299d889e10427d28d4 | 2026-11-11T18:09:49Z | c01bc1ba9fec40f1b28069299d889e10427d28d4 | same |
| https://github.com/finos-hack/cdm-collateral/pull/61 | merged | 71a42904c361865a66e8d68a004efaaed8a291d2 | 6d40f93fafbb26321a0db891928e23d083e9f2f4 | 2026-11-11T19:38:46Z | 6d40f93fafbb26321a0db891928e23d083e9f2f4 | same |
| https://github.com/finos-hack/cdm-collateral/pull/61 | merged | 71a42904c361865a66e8d68a004efaaed8a291d2 | 8db7673026497b77cc0ab0010171990f5800e324 | 2026-11-11T19:38:46Z | 8db7673026497b77cc0ab0010171990f5800e324 | same |
| https://github.com/finos-hack/cdm-collateral/pull/61 | merged | 71a42904c361865a66e8d68a004efaaed8a291d2 | 8d0230eee8cd9fff0d63c29b5c33d43914fb1831 | 2026-11-11T19:38:46Z | 8d0230eee8cd9fff0d63c29b5c33d43914fb1831 | same |
| https://github.com/finos-hack/cdm-collateral/pull/61 | merged | 71a42904c361865a66e8d68a004efaaed8a291d2 | abc4b791a2cd900e0624e539d5705fca8aec3236 | 2026-11-11T19:38:46Z | abc4b791a2cd900e0624e539d5705fca8aec3236 | same |
| https://github.com/finos-hack/cdm-collateral/pull/62 | merged | 3b7d0eb28bc7b97dcae8059fe84eec7f6fd4072e | f35d347d69a733c43647262f6f621efe7bb8dcfd | 2026-11-11T20:28:25Z | f35d347d69a733c43647262f6f621efe7bb8dcfd | same |
| https://github.com/finos-hack/cdm-collateral/pull/62 | merged | 3b7d0eb28bc7b97dcae8059fe84eec7f6fd4072e | 42ad79d7f93b034c29732b14fa2124b841330ac5 | 2026-11-11T20:28:25Z | 42ad79d7f93b034c29732b14fa2124b841330ac5 | same |
| https://github.com/finos-hack/cdm-collateral/pull/62 | merged | 3b7d0eb28bc7b97dcae8059fe84eec7f6fd4072e | b4934d72fdff4aed452df12e3cca5d14885befa6 | 2026-11-11T20:28:25Z | b4934d72fdff4aed452df12e3cca5d14885befa6 | same |
| https://github.com/finos-hack/cdm-collateral/pull/62 | merged | 3b7d0eb28bc7b97dcae8059fe84eec7f6fd4072e | ac93b2fd3886e407f86e52820ea8d3c2b7e7b36c | 2026-11-11T20:28:25Z | ac93b2fd3886e407f86e52820ea8d3c2b7e7b36c | same |
| https://github.com/finos-hack/cdm-collateral/pull/63 | merged | e5ad4d30ad4e7328f4af053b74049d1fe8964e70 | 713b7431fe7c17469cc9208b9c30adc19cc054a4 | 2026-11-11T22:09:21Z | 713b7431fe7c17469cc9208b9c30adc19cc054a4 | same |
| https://github.com/finos-hack/cdm-collateral/pull/63 | merged | e5ad4d30ad4e7328f4af053b74049d1fe8964e70 | 6a778e45fcb3714e8cd57f8528e8fc9a3cab3763 | 2026-11-11T22:09:21Z | 6a778e45fcb3714e8cd57f8528e8fc9a3cab3763 | same |
| https://github.com/finos-hack/cdm-collateral/pull/63 | merged | e5ad4d30ad4e7328f4af053b74049d1fe8964e70 | 8b880c7073a00f2969b2628c3d903db7da5d448e | 2026-11-11T22:09:21Z | 8b880c7073a00f2969b2628c3d903db7da5d448e | same |
| https://github.com/finos-hack/cdm-collateral/pull/63 | merged | e5ad4d30ad4e7328f4af053b74049d1fe8964e70 | 51dfeb02f32e22f07c80808e4ebcc5721385b8d5 | 2026-11-11T22:09:21Z | 51dfeb02f32e22f07c80808e4ebcc5721385b8d5 | same |
| https://github.com/finos-hack/cdm-collateral/pull/63 | merged | e5ad4d30ad4e7328f4af053b74049d1fe8964e70 | bda49e1d7ed0f3892f5d312fee7a4d98bd2f41a0 | 2026-11-11T22:09:21Z | bda49e1d7ed0f3892f5d312fee7a4d98bd2f41a0 | same |
|  | direct |  | 15da56b92f2de7d6070ca046af61d50b9c446d92 | 2026-11-11T23:07:38Z | 15da56b92f2de7d6070ca046af61d50b9c446d92 | same |
|  | direct |  | d4862ff11a7f1668b4a50eb788ac0e469e2dd46e | 2026-11-11T23:07:38Z | d4862ff11a7f1668b4a50eb788ac0e469e2dd46e | same |
|  | direct |  | 61a535fddfc2d35518e373101f5243abb58b75fa | 2026-11-11T23:07:38Z | 61a535fddfc2d35518e373101f5243abb58b75fa | same |
|  | direct |  | d4e50c67855a68202620be58e1d0e8e002621b06 | 2026-11-11T23:07:38Z | d4e50c67855a68202620be58e1d0e8e002621b06 | same |
|  | direct |  | 48a74555d486485ff12e4ba2e5374542a57a3c44 | 2026-11-11T23:07:38Z | 48a74555d486485ff12e4ba2e5374542a57a3c44 | same |
|  | direct |  | a382005dcc0c2ed9098a015adb4768ae39e857a3 | 2026-11-11T23:07:38Z | a382005dcc0c2ed9098a015adb4768ae39e857a3 | same |
|  | direct |  | 64cd9565fd0ce9f23a8ff39e2d37b8af0dee1f77 | 2026-11-11T23:09:57Z | 64cd9565fd0ce9f23a8ff39e2d37b8af0dee1f77 | same |
|  | direct |  | 824cce0c6810fe0476912d664486b60e01eab734 | 2026-11-11T23:12:00Z | 824cce0c6810fe0476912d664486b60e01eab734 | same |
| https://github.com/finos-hack/cdm-collateral/pull/64 | merged | 05b165e9afa0a4f4ccee33c3dace22d67cf909cd | 40ee16fd66197011360568a4995058af5a444101 | 2026-11-11T23:40:50Z | 40ee16fd66197011360568a4995058af5a444101 | same |
| https://github.com/finos-hack/cdm-collateral/pull/65 | merged | 15e1a9ede2cd9f29434e3e144e5cd5ccff9cdd4e | bf003b897ccd685193fe0af8f7bf71d1ebdc3ba3 | 2026-11-12T18:24:01Z | bf003b897ccd685193fe0af8f7bf71d1ebdc3ba3 | same |
| https://github.com/finos-hack/cdm-collateral/pull/65 | merged | 15e1a9ede2cd9f29434e3e144e5cd5ccff9cdd4e | 167aa6173929dc800e39e051ac9fdbcb02570a40 | 2026-11-12T18:24:01Z | 167aa6173929dc800e39e051ac9fdbcb02570a40 | same |
| https://github.com/finos-hack/cdm-collateral/pull/65 | merged | 15e1a9ede2cd9f29434e3e144e5cd5ccff9cdd4e | 83ab4ddd88955c496be28bbf6faac969fb76d610 | 2026-11-12T18:24:01Z | 83ab4ddd88955c496be28bbf6faac969fb76d610 | same |
| https://github.com/finos-hack/cdm-collateral/pull/65 | merged | 15e1a9ede2cd9f29434e3e144e5cd5ccff9cdd4e | c1f6a97399434e3e6de9e24e2ea8ab5d9849944c | 2026-11-12T18:24:01Z | c1f6a97399434e3e6de9e24e2ea8ab5d9849944c | same |
| https://github.com/finos-hack/cdm-collateral/pull/65 | merged | 15e1a9ede2cd9f29434e3e144e5cd5ccff9cdd4e | 9b631df6b65983cf6d5d65c339d34b6e4fd52b7e | 2026-11-12T18:24:01Z | 9b631df6b65983cf6d5d65c339d34b6e4fd52b7e | same |
| https://github.com/finos-hack/cdm-collateral/pull/65 | merged | 15e1a9ede2cd9f29434e3e144e5cd5ccff9cdd4e | e3652e8c97a24b96f2bad26c27d581eca8b3ff1f | 2026-11-12T18:24:01Z | e3652e8c97a24b96f2bad26c27d581eca8b3ff1f | same |
| https://github.com/finos-hack/cdm-collateral/pull/65 | merged | 15e1a9ede2cd9f29434e3e144e5cd5ccff9cdd4e | 8dd0a17ba93d5b1f7fd3eb50b5f49391c9f926fd | 2026-11-12T18:24:01Z | 8dd0a17ba93d5b1f7fd3eb50b5f49391c9f926fd | same |
| https://github.com/finos-hack/cdm-collateral/pull/65 | merged | 15e1a9ede2cd9f29434e3e144e5cd5ccff9cdd4e | 264dda6fb43330a8be94d436ca3b4c0bc3c0621c | 2026-11-12T18:24:01Z | 264dda6fb43330a8be94d436ca3b4c0bc3c0621c | same |
| https://github.com/finos-hack/cdm-collateral/pull/65 | merged | 15e1a9ede2cd9f29434e3e144e5cd5ccff9cdd4e | 46e64a4b4c4eb4b173c023efea5fc84ec2dc1c6e | 2026-11-12T18:24:01Z | 46e64a4b4c4eb4b173c023efea5fc84ec2dc1c6e | same |
| https://github.com/finos-hack/cdm-collateral/pull/65 | merged | 15e1a9ede2cd9f29434e3e144e5cd5ccff9cdd4e | 621b6e8166bf3ce8063a4112060955e67c1765bf | 2026-11-12T18:24:01Z | 621b6e8166bf3ce8063a4112060955e67c1765bf | same |
| https://github.com/finos-hack/cdm-collateral/pull/65 | merged | 15e1a9ede2cd9f29434e3e144e5cd5ccff9cdd4e | 315d8e20c2445606591efbcb87c28707eaec604e | 2026-11-12T18:24:01Z | 315d8e20c2445606591efbcb87c28707eaec604e | same |
| https://github.com/finos-hack/cdm-collateral/pull/65 | merged | 15e1a9ede2cd9f29434e3e144e5cd5ccff9cdd4e | 0ece52a4e45162ef704d602420364298fa0b428c | 2026-11-12T18:24:01Z | 0ece52a4e45162ef704d602420364298fa0b428c | same |
| https://github.com/finos-hack/cdm-collateral/pull/65 | merged | 15e1a9ede2cd9f29434e3e144e5cd5ccff9cdd4e | 4918492052580373387f9aa89c0d2f10178fd533 | 2026-11-12T18:24:01Z | 4918492052580373387f9aa89c0d2f10178fd533 | same |
| https://github.com/finos-hack/cdm-collateral/pull/65 | merged | 15e1a9ede2cd9f29434e3e144e5cd5ccff9cdd4e | 9d8c3730dd765ac1bb7f58c65269563ad9af1f07 | 2026-11-12T18:24:01Z | 9d8c3730dd765ac1bb7f58c65269563ad9af1f07 | same |
| https://github.com/finos-hack/cdm-collateral/pull/65 | merged | 15e1a9ede2cd9f29434e3e144e5cd5ccff9cdd4e | ec1bc65b6950031ab10903d22522d08b2cb471f1 | 2026-11-12T18:24:01Z | ec1bc65b6950031ab10903d22522d08b2cb471f1 | same |
|  | direct |  | 00078bbaa67a3004b2cbd496f650ecc3a0543632 | 2026-11-12T02:29:40Z | 00078bbaa67a3004b2cbd496f650ecc3a0543632 | same |
| https://github.com/finos-hack/cdm-collateral/pull/65 | merged | 15e1a9ede2cd9f29434e3e144e5cd5ccff9cdd4e | b3e5bfd049ea8b6c77db7cb4b4fd7be7fccb9ebb | 2026-11-12T18:24:01Z | b3e5bfd049ea8b6c77db7cb4b4fd7be7fccb9ebb | same |
| https://github.com/finos-hack/cdm-collateral/pull/65 | merged | 15e1a9ede2cd9f29434e3e144e5cd5ccff9cdd4e | 06887c2080f2d0c50cd893a79f2a20ef501ebe91 | 2026-11-12T18:24:01Z | 06887c2080f2d0c50cd893a79f2a20ef501ebe91 | same |
| https://github.com/finos-hack/cdm-collateral/pull/65 | merged | 15e1a9ede2cd9f29434e3e144e5cd5ccff9cdd4e | fea1e4afc226d1a90c58c83d0d0573a2f3f44c5b | 2026-11-12T18:24:01Z | fea1e4afc226d1a90c58c83d0d0573a2f3f44c5b | same |
| https://github.com/finos-hack/cdm-collateral/pull/65 | merged | 15e1a9ede2cd9f29434e3e144e5cd5ccff9cdd4e | 1e0282590185c35213b83a5361f360c30ff34cad | 2026-11-12T18:24:01Z | 1e0282590185c35213b83a5361f360c30ff34cad | same |
| https://github.com/finos-hack/cdm-collateral/pull/66 | merged | 6d6b0d7531cf76b7840654222c1c5fb34cc26afe | d046d86636a1bc324e2db67f3fb512fbbde744e9 | 2026-11-13T14:38:37Z | d046d86636a1bc324e2db67f3fb512fbbde744e9 | same |
| https://github.com/finos-hack/cdm-collateral/pull/66 | merged | 6d6b0d7531cf76b7840654222c1c5fb34cc26afe | d57db97197b3647985148e6b6d578698bf5fd978 | 2026-11-13T14:38:37Z | d57db97197b3647985148e6b6d578698bf5fd978 | same |
| https://github.com/finos-hack/cdm-collateral/pull/66 | merged | 6d6b0d7531cf76b7840654222c1c5fb34cc26afe | 2497b3be84fc07e4483393e1fe3d13758421f9ef | 2026-11-13T14:38:37Z | 2497b3be84fc07e4483393e1fe3d13758421f9ef | same |
| https://github.com/finos-hack/cdm-collateral/pull/66 | merged | 6d6b0d7531cf76b7840654222c1c5fb34cc26afe | 7bc7675638ea325a8f46583c3a63c638cd6ada5f | 2026-11-13T14:38:37Z | 7bc7675638ea325a8f46583c3a63c638cd6ada5f | same |
| https://github.com/finos-hack/cdm-collateral/pull/66 | merged | 6d6b0d7531cf76b7840654222c1c5fb34cc26afe | bb81b56ae1365850cac76d309d353a4ffbb902b0 | 2026-11-13T14:38:37Z | bb81b56ae1365850cac76d309d353a4ffbb902b0 | same |
| https://github.com/finos-hack/cdm-collateral/pull/66 | merged | 6d6b0d7531cf76b7840654222c1c5fb34cc26afe | 015700333e381b17a0d6b8d6f025ce1a16e85882 | 2026-11-13T14:38:37Z | 015700333e381b17a0d6b8d6f025ce1a16e85882 | same |
| https://github.com/finos-hack/cdm-collateral/pull/66 | merged | 6d6b0d7531cf76b7840654222c1c5fb34cc26afe | 2ebd70f776156f6ca513acd8db98fb58406eda04 | 2026-11-13T14:38:37Z | 2ebd70f776156f6ca513acd8db98fb58406eda04 | same |
| https://github.com/finos-hack/cdm-collateral/pull/66 | merged | 6d6b0d7531cf76b7840654222c1c5fb34cc26afe | 4b8860231d972fca76e0fe584cd251010a09598d | 2026-11-13T14:38:37Z | 4b8860231d972fca76e0fe584cd251010a09598d | same |
|  | direct |  | 6a8e5a89b583a95b66b8052c6c0e64cbb918919d | 2026-11-13T14:39:55Z | 6a8e5a89b583a95b66b8052c6c0e64cbb918919d | same |
| https://github.com/finos-hack/cdm-collateral/pull/67 | merged | 99fc26f1ac0ca4b3e50134adaaedc898d5af68e0 | 0d288ef8750d69101e9442dd937f1be1d8ce3092 | 2026-11-13T17:34:15Z | 0d288ef8750d69101e9442dd937f1be1d8ce3092 | same |
| https://github.com/finos-hack/cdm-collateral/pull/67 | merged | 99fc26f1ac0ca4b3e50134adaaedc898d5af68e0 | 2f5499b5bf98dd47912848e0f8c4aa4fe01cc0bc | 2026-11-13T17:34:15Z | 2f5499b5bf98dd47912848e0f8c4aa4fe01cc0bc | same |
| https://github.com/finos-hack/cdm-collateral/pull/67 | merged | 99fc26f1ac0ca4b3e50134adaaedc898d5af68e0 | 3890d593a0d7443234613212ba802b6eb492e3a6 | 2026-11-13T17:34:15Z | 3890d593a0d7443234613212ba802b6eb492e3a6 | same |
| https://github.com/finos-hack/cdm-collateral/pull/67 | merged | 99fc26f1ac0ca4b3e50134adaaedc898d5af68e0 | 739318361197345abb62e4e8a2c7a53360f275d4 | 2026-11-13T17:34:15Z | 739318361197345abb62e4e8a2c7a53360f275d4 | same |
| https://github.com/finos-hack/cdm-collateral/pull/67 | merged | 99fc26f1ac0ca4b3e50134adaaedc898d5af68e0 | 0ffbc5c0662368cf4314e8a4cc21fd7182176591 | 2026-11-13T17:34:15Z | 0ffbc5c0662368cf4314e8a4cc21fd7182176591 | same |
| https://github.com/finos-hack/cdm-collateral/pull/67 | merged | 99fc26f1ac0ca4b3e50134adaaedc898d5af68e0 | 7d8568cb199e47bea7c314759adc3f63189b0b70 | 2026-11-13T17:34:15Z | 7d8568cb199e47bea7c314759adc3f63189b0b70 | same |
| https://github.com/finos-hack/cdm-collateral/pull/69 | merged | 4352756b6e75fdf31b48a66ec92b482b9e54bed1 | 30fea910589de5a4b3f6f025703b955b022e6a39 | 2026-11-15T16:30:15Z | 30fea910589de5a4b3f6f025703b955b022e6a39 | same |
| https://github.com/finos-hack/cdm-collateral/pull/69 | merged | 4352756b6e75fdf31b48a66ec92b482b9e54bed1 | 22b36978730483fe656c8ad12f7f100128e6ce81 | 2026-11-15T16:30:15Z | 22b36978730483fe656c8ad12f7f100128e6ce81 | same |
| https://github.com/finos-hack/cdm-collateral/pull/70 | merged | 268ea0c6b723e1d1588332a15107170cea94f434 | 96f5aeabc851bcc70bf462851b7e0f3fe3a0f805 | 2026-11-15T19:20:37Z | 96f5aeabc851bcc70bf462851b7e0f3fe3a0f805 | same |
| https://github.com/finos-hack/cdm-collateral/pull/73 | merged | cc1fb4f070b66cd18c02266c77f097a9bc9131ac | ea745b0ae817597a0611cf2b8a64b8c426d18ed3 | 2026-11-21T20:21:31Z | ea745b0ae817597a0611cf2b8a64b8c426d18ed3 | same |
| https://github.com/finos-hack/cdm-collateral/pull/73 | merged | cc1fb4f070b66cd18c02266c77f097a9bc9131ac | 92dd78dc34b5f5a41fb6e38359e5928e3146687a | 2026-11-21T20:21:31Z | 92dd78dc34b5f5a41fb6e38359e5928e3146687a | same |
| https://github.com/finos-hack/cdm-collateral/pull/73 | merged | cc1fb4f070b66cd18c02266c77f097a9bc9131ac | 9cb111083dcf44bf90f9ac53eec9bca02226e938 | 2026-11-21T20:21:31Z | 9cb111083dcf44bf90f9ac53eec9bca02226e938 | same |
| https://github.com/finos-hack/cdm-collateral/pull/74 | merged | 04071269718451d58eb4d40bf2eea32e727c87b7 | 1c11418cdb5c65c32da25e35fa941e020d797bae | 2026-11-21T22:32:27Z | 1c11418cdb5c65c32da25e35fa941e020d797bae | same |
| https://github.com/finos-hack/cdm-collateral/pull/75 | merged | f68be6220c4963f3575e20b2f683aaa674011ce4 | e49e3e8f40da12623560a67c80fbe0c8073765cc | 2026-11-22T03:23:35Z | e49e3e8f40da12623560a67c80fbe0c8073765cc | same |
| https://github.com/finos-hack/cdm-collateral/pull/75 | merged | f68be6220c4963f3575e20b2f683aaa674011ce4 | 6c9570990bbccdba9c3f170e7b0efa483e96c662 | 2026-11-22T03:23:35Z | 6c9570990bbccdba9c3f170e7b0efa483e96c662 | same |
| https://github.com/finos-hack/cdm-collateral/pull/75 | merged | f68be6220c4963f3575e20b2f683aaa674011ce4 | 4169fb3b1f52506751b831bb755f62cbf1b6ac43 | 2026-11-22T03:23:35Z | 4169fb3b1f52506751b831bb755f62cbf1b6ac43 | same |
| https://github.com/finos-hack/cdm-collateral/pull/75 | merged | f68be6220c4963f3575e20b2f683aaa674011ce4 | ec13d40fe5d81a7f1873a9ee884288bf9fb32507 | 2026-11-22T03:23:35Z | ec13d40fe5d81a7f1873a9ee884288bf9fb32507 | same |
| https://github.com/finos-hack/cdm-collateral/pull/75 | merged | f68be6220c4963f3575e20b2f683aaa674011ce4 | 78fc4d5513719b9af5c82a33d7eec90099658a33 | 2026-11-22T03:23:35Z | 78fc4d5513719b9af5c82a33d7eec90099658a33 | same |
| https://github.com/finos-hack/cdm-collateral/pull/75 | merged | f68be6220c4963f3575e20b2f683aaa674011ce4 | 156510b712e776c8efb18725bcf5f72f601206a2 | 2026-11-22T03:23:35Z | 156510b712e776c8efb18725bcf5f72f601206a2 | same |
| https://github.com/finos-hack/cdm-collateral/pull/76 | merged | 738ddbdbf48a641790d8c3af280dff1979fa2cb3 | 3bb563359c739b9b7b663d1179d3442599fc1a6b | 2026-11-22T04:26:37Z | 3bb563359c739b9b7b663d1179d3442599fc1a6b | same |
| https://github.com/finos-hack/cdm-collateral/pull/78 | merged | b9bf30f6e644a68f074b794485c2cb76b1cf0baf | 45cf16d88138bbd3b4e6146f6697927c168b2769 | 2026-11-22T14:26:05Z | 45cf16d88138bbd3b4e6146f6697927c168b2769 | same |
| https://github.com/finos-hack/cdm-collateral/pull/80 | merged | e6ffe0c07889ebb61b2b9cc2e1bff5117e3c67ee | b6871425b5a1da367125a15dfdfa465069bd7b54 | 2026-11-22T15:16:39Z | b6871425b5a1da367125a15dfdfa465069bd7b54 | same |
| https://github.com/finos-hack/cdm-collateral/pull/81 | merged | a00cfad99822b594f297d483fbe3abd6d7c0d267 | 7fff2914424f10cd61e956f8b582807d02bda9ad | 2026-11-22T15:25:08Z | 7fff2914424f10cd61e956f8b582807d02bda9ad | same |
| https://github.com/finos-hack/cdm-collateral/pull/81 | merged | a00cfad99822b594f297d483fbe3abd6d7c0d267 | 557d8af383a59b533e37d15d33f5d7c1d717107c | 2026-11-22T15:25:08Z | 557d8af383a59b533e37d15d33f5d7c1d717107c | same |
| https://github.com/finos-hack/cdm-collateral/pull/82 | merged | afb06c6825303febaaf3d11af73396fddcadf040 | e1d0e620ccc62e5b2a7ec2f76a05cf87ad7906d1 | 2026-11-22T15:22:00Z | e1d0e620ccc62e5b2a7ec2f76a05cf87ad7906d1 | same |
| https://github.com/finos-hack/cdm-collateral/pull/83 | merged | 6ceb2e53c302aca9d0a40b80e99b6effef15594e | eb932fd3363890047c87b07480449a3750e1b0f3 | 2026-11-22T16:40:17Z | eb932fd3363890047c87b07480449a3750e1b0f3 | same |
| https://github.com/finos-hack/cdm-collateral/pull/84 | merged | 327baff61f43097443ef3ee1edcb1faabbd19573 | 9c15510d3708f679f9510c01c730c20cbab80a0a | 2026-11-22T16:44:22Z | 9c15510d3708f679f9510c01c730c20cbab80a0a | same |
| https://github.com/finos-hack/cdm-collateral/pull/84 | merged | 327baff61f43097443ef3ee1edcb1faabbd19573 | e3426dc72e15b134e4085994500ac9e3602b62b4 | 2026-11-22T16:44:22Z | e3426dc72e15b134e4085994500ac9e3602b62b4 | same |
| https://github.com/finos-hack/cdm-collateral/pull/85 | merged | 2a613b20852395c2c7b8acee9b7b2661d3474403 | 188c3e98872db5438b8fa660488de1823613e66a | 2026-11-22T18:06:54Z | 188c3e98872db5438b8fa660488de1823613e66a | same |
| https://github.com/finos-hack/cdm-collateral/pull/86 | merged | 9052907ac33e7281360977818f4dfdc1e296c845 | 6fd927af06080014ffa7b6d3c8b122189b222dab | 2026-11-22T18:13:17Z | 6fd927af06080014ffa7b6d3c8b122189b222dab | same |
| https://github.com/finos-hack/cdm-collateral/pull/87 | merged | 77f49a87a0c573d0cbf5dfd8fe4de2397420713e | 6fd927af06080014ffa7b6d3c8b122189b222dab | 2026-11-22T18:13:31Z | 6fd927af06080014ffa7b6d3c8b122189b222dab | same |
| https://github.com/finos-hack/cdm-collateral/pull/86 | merged | 9052907ac33e7281360977818f4dfdc1e296c845 | e383b5fab7c0b8e41ea0e8dfc3f89e055923e8af | 2026-11-22T18:13:17Z | e383b5fab7c0b8e41ea0e8dfc3f89e055923e8af | same |
| https://github.com/finos-hack/cdm-collateral/pull/87 | merged | 77f49a87a0c573d0cbf5dfd8fe4de2397420713e | e383b5fab7c0b8e41ea0e8dfc3f89e055923e8af | 2026-11-22T18:13:31Z | e383b5fab7c0b8e41ea0e8dfc3f89e055923e8af | same |
| https://github.com/finos-hack/cdm-collateral/pull/86 | merged | 9052907ac33e7281360977818f4dfdc1e296c845 | e8772a455fb21db63926cced29a346ca3db53f84 | 2026-11-22T18:13:17Z | e8772a455fb21db63926cced29a346ca3db53f84 | same |
| https://github.com/finos-hack/cdm-collateral/pull/87 | merged | 77f49a87a0c573d0cbf5dfd8fe4de2397420713e | e8772a455fb21db63926cced29a346ca3db53f84 | 2026-11-22T18:13:31Z | e8772a455fb21db63926cced29a346ca3db53f84 | same |
| https://github.com/finos-hack/cdm-collateral/pull/87 | merged | 77f49a87a0c573d0cbf5dfd8fe4de2397420713e | 63ef07bead0b19c1617ebed22ebb204b9218e20b | 2026-11-22T18:13:31Z | 63ef07bead0b19c1617ebed22ebb204b9218e20b | same |
| https://github.com/finos-hack/cdm-collateral/pull/88 | merged | c1f4b3aae87b1550ede25470a7542f4a5515c1b0 | 0959d21b9eee1fba58a9e0ec948a7e0e1090e96f | 2026-11-22T18:59:49Z | 0959d21b9eee1fba58a9e0ec948a7e0e1090e96f | same |
| https://github.com/finos-hack/cdm-collateral/pull/89 | merged | d1f01e46fc40d1180724fac601750fac5f56b332 | b361461695a6c622e0176c39547116da74802584 | 2026-11-22T19:58:03Z | b361461695a6c622e0176c39547116da74802584 | same |
| https://github.com/finos-hack/cdm-collateral/pull/90 | merged | fc6ef2fb8b9fab47b77bd693b3ac8e76924346f2 | 20ec5e719068718a807c94f85c62822aa57ce991 | 2026-11-22T20:01:33Z | 20ec5e719068718a807c94f85c62822aa57ce991 | same |
| https://github.com/finos-hack/cdm-collateral/pull/91 | merged | c4221ed8f4d9e121c3f63d7b2b07621b499d876a | ce8e1a73a6385389d09864737f06e1db2c0c05aa | 2026-11-22T20:36:42Z | ce8e1a73a6385389d09864737f06e1db2c0c05aa | same |
| https://github.com/finos-hack/cdm-collateral/pull/91 | merged | c4221ed8f4d9e121c3f63d7b2b07621b499d876a | bb2494192badaa80c17ac417e51a396aac41aa7b | 2026-11-22T20:36:42Z | bb2494192badaa80c17ac417e51a396aac41aa7b | same |
| https://github.com/finos-hack/cdm-collateral/pull/91 | merged | c4221ed8f4d9e121c3f63d7b2b07621b499d876a | 4f27a88183ac4a520e4e593ef4e6ceae6df2277d | 2026-11-22T20:36:42Z | 4f27a88183ac4a520e4e593ef4e6ceae6df2277d | same |
| https://github.com/finos-hack/cdm-collateral/pull/94 | merged | 02ae9fac44872a068c3b033daad4e249f2e5ef29 | e8ddf56d6121e3e4cf85299a8cbf6c3b123d9fca | 2026-11-22T21:16:50Z | e8ddf56d6121e3e4cf85299a8cbf6c3b123d9fca | same |
| https://github.com/finos-hack/cdm-collateral/pull/94 | merged | 02ae9fac44872a068c3b033daad4e249f2e5ef29 | a5fa1d5ae05db8894ca75ca71194156f2cb6e242 | 2026-11-22T21:16:50Z | a5fa1d5ae05db8894ca75ca71194156f2cb6e242 | same |
| https://github.com/finos-hack/cdm-collateral/pull/95 | merged | 3b019d588e1947d065d9f8c9c3524c347e641543 | 3f823d64e42655f0f3eec55a37c93535d4187c53 | 2026-11-22T21:19:55Z | 3f823d64e42655f0f3eec55a37c93535d4187c53 | same |
| https://github.com/finos-hack/cdm-collateral/pull/96 | merged | 72ff842574ca7679609b784729efa918ccd09575 | d55187615b82f5e803cf264c44121667782100b3 | 2026-11-22T21:31:40Z | d55187615b82f5e803cf264c44121667782100b3 | same |
