## Maintainer

Remaining P1 gaps closed (proposed). G3: the dispute is its own record (Dispute) next to the margin call, built from the
call's agreed and disputed amounts; ResolveDispute settles it by agreement, or by recalculation only after the
Resolution Time, at an amount between the agreed and the called amount; the additional amount due (resolved less
agreed) is transferred through a new call; the recalculation itself and the FpML dispute reason codes are out of scope.
G24: TokenizedAsset links a CDM Asset to its network, contract, token standard, decimals, ISO 24165 DTI and the
authoritative record (Bearer, Registered, Claim, with the record keeper when off-ledger), with lookups both ways; the
DTI format is not checked. G25: LedgerReference (network, contract, transaction, block, log, contract event, content
hash) on margin call step records and the three event types, attached after mining by AnchorCollateralEvent and
AnchorMarginCallStep; ContentAnchored compares the on-chain hash with one the caller computes. G29: every extension
function runs in the 120 tests, helpers through their entry functions.

## User

1. accept 2. ok 3. will do 4.  the priority one parts
