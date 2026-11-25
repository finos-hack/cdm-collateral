```yaml
id: nw-decision-epoch-keys-hsm
kind: decision
review: proposed
provenance:
  conversationId: onchain-data-protection
  sourceRef: ni:///sha-256;aW9MurizteBIXvDhhNoKpxqWoieaNdRlA9tmIT9c3u8
  timestamp: 2026-11-25T01:01:15Z
  confidence: 0.8
createdAt: 2026-11-25T01:01:15Z
updatedAt: 2026-11-25T01:01:15Z
```
# Decision: one-business-day epoch keys derived inside the member's HSM from a wrapped body key

Set by the project owner (2026-11-24): epoch length is one day, and the design is to be updated accordingly. The
owner asked whether the body key can be encrypted before use; the design answers with key wrapping.

Design as updated in `docs/architecture/onchain-privacy.md`, section 6:

- One epoch is one business day under the calendar named in the opening envelope.
- Epoch key for day n = HKDF(body key, streamId, n), derived from the body key, not from the previous epoch.
- The body key is stored wrapped under a key-encryption key that the member's hardware security module creates and
  never exports; it is unwrapped and used only inside the HSM.
- Escrow holds shares of the unwrapped body key.

The owner stated the epoch length and asked for the update; the HSM wording is the maintainer's answer to the
owner's question and was not separately confirmed.
