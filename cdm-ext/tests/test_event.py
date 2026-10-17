"""Margin call events (G1) with qualification and, on settlement, CDM transfers (G4), following the console
scenarios (console/src/scenarios/scenarios.ts)."""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from cdm_runtime import failed_conditions, load  # must come before other finos imports (D14)
from data import call_base, instruction, issuance_doc, position, proposal_doc, response_doc
from rune.runtime.cow import rune_unwrap
from finos.cdm.event.common.TransferStatusEnum import TransferStatusEnum
from finos.cdmx.collateral.event.functions.Create_CollateralEvent import Create_CollateralEvent

T0 = datetime(2026, 10, 16, 9, 0, tzinfo=timezone.utc)
D0 = date(2026, 10, 16)


class Events:
    """Applies steps in order as events, as a workflow service would, and keeps them."""

    def __init__(self):
        self.events = []

    @property
    def state(self):
        return self.events[-1].after if self.events else None

    def apply(self, **step):
        n = len(self.events) + 1
        self.events.append(rune_unwrap(Create_CollateralEvent(
            self.state, f"S-{n}", D0, T0 + timedelta(minutes=n), instruction(**step))))
        return self

    @property
    def qualifiers(self):
        return [e.eventQualifier for e in self.events]


def issued(amount=12_400_000, direction="Delivery", caller="BANK-B"):
    return Events().apply(issue={"issuance": issuance_doc(amount, caller=caller), "direction": direction})


def leg(t):
    """(payer, receiver, quantity, ISIN, settlement date, status) of a TransferState."""
    u = t.transfer.UnscheduledTransfer
    return (u.payerReceiver.payerPartyReference.partyId[0].identifier,
            u.payerReceiver.receiverPartyReference.partyId[0].identifier,
            u.quantity.value, u.asset.Instrument.Security.identifier[0].identifier,
            u.settlementDate.adjustedDate, t.transferStatus)


def test_delivery_events_and_transfer():  # console scenario im-call
    e = issued().apply(respond=response_doc("AgreeinFull", 12_400_000)).apply(propose=proposal_doc())
    e.apply(decide={"proposalId": "P-1", "accept": True}).apply(settle={"proposalId": "P-1"})
    assert e.qualifiers == ["MarginCallIssued", "MarginCallAgreed", "CollateralProposed",
                            "CollateralProposalAccepted", "CollateralDelivered"]
    assert all(not ev.transfer for ev in e.events[:-1])
    assert [leg(t) for t in e.events[-1].transfer] == [
        ("BANK-A", "BANK-B", Decimal("128589"), "XS0000TUST01", D0, TransferStatusEnum.SETTLED)]
    assert e.events[0].before is None
    # Generated functions copy their inputs: each event's before state equals (is a copy of) the previous after state.
    assert all(repr(e.events[i].before) == repr(e.events[i - 1].after) for i in range(1, len(e.events)))
    for ev in e.events:
        assert failed_conditions(ev) == ""
    # CDM's own conditions as well: the transfer and the issue event pass them. Later events carry PriceQuantity,
    # whose CDM condition PriceQuantityTriangulation fails in the CDM 7.7.0 Python package (D14).
    assert e.events[-1].transfer[0].validate_model(check_rune_constraints=True, raise_exc=False) == []
    assert e.events[0].validate_model(check_rune_constraints=True, raise_exc=False) == []


def test_partial_agreement_and_rejection_are_qualified():  # console scenario im-dispute
    e = issued().apply(respond=response_doc("PartiallyAgree", 11_900_000))
    e.apply(propose=proposal_doc("P-1", 11_900_001)).apply(decide={"proposalId": "P-1", "accept": False, "reason": "limit"})
    assert e.qualifiers[1:] == ["MarginCallPartiallyAgreed", "CollateralProposed", "CollateralProposalRejected"]


def test_dispute_is_qualified():
    assert issued().apply(respond=response_doc("Dispute", 0)).qualifiers[-1] == "MarginCallDisputed"


def test_return_transfers_go_from_secured_party_to_pledgor():  # console scenario im-return
    e = issued(4_300_000, "Return", caller="BANK-A").apply(respond=response_doc("AgreeinFull", 4_300_000, action="Return"))
    e.apply(settle={"releasedValue": {"value": 4_299_999, "unit": {"currency": {"@data": "USD"}}},
                    "releasedCollateral": [position(44_000), position(1_000, "XS0000TMMF01")]})
    assert e.qualifiers[-1] == "CollateralReturned"
    assert [leg(t)[:4] for t in e.events[-1].transfer] == [
        ("BANK-B", "BANK-A", Decimal("44000"), "XS0000TUST01"), ("BANK-B", "BANK-A", Decimal("1000"), "XS0000TMMF01")]


def test_call_must_name_pledgor_and_secured_party():
    doc = {**issuance_doc(12_400_000), "partyRole": call_base()["partyRole"][:1]}
    issue = load("finos.cdmx.collateral.margincall.IssueCallInstruction", {"issuance": doc, "direction": "Delivery"})
    assert "PledgorAndSecuredParty" in failed_conditions(issue)
