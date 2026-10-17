"""Margin call lifecycle (G1, G3, G4, G6) through the generated cdmx functions, following the console scenarios
(console/src/scenarios/scenarios.ts)."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from cdm_runtime import failed_conditions  # must come before other finos imports (D14)
from data import instruction, issuance_doc, proposal_doc, response_doc
from rune.runtime.cow import rune_unwrap
from finos.cdmx.collateral.margincall.MarginCallStatusEnum import MarginCallStatusEnum as Status
from finos.cdmx.collateral.margincall.MarginCallStepEnum import MarginCallStepEnum as Step
from finos.cdmx.collateral.margincall.functions.Create_MarginCallState import Create_MarginCallState
from finos.cdmx.collateral.margincall.functions.NextMarginCallStep import NextMarginCallStep
from finos.cdmx.collateral.proposal.CollateralProposalStatusEnum import CollateralProposalStatusEnum as PSt

T0 = datetime(2026, 10, 16, 9, 0, tzinfo=timezone.utc)


class Call:
    """Applies steps in order and keeps the state, as a workflow service would."""

    def __init__(self):
        self.state, self.n = None, 0

    def apply(self, **step):
        self.n += 1
        self.state = rune_unwrap(Create_MarginCallState(self.state, f"S-{self.n}", T0 + timedelta(minutes=self.n), instruction(**step)))
        return self

    @property
    def next(self):
        step = NextMarginCallStep(self.state)
        return step or None  # generated Python returns [] for an empty result


def issued(amount=12_400_000, direction="Delivery", caller="BANK-B"):
    return Call().apply(issue={"issuance": issuance_doc(amount, caller=caller), "direction": direction})


def test_full_agreement_proposal_and_settlement():  # console scenario im-call
    c = issued()
    assert c.state.status == Status.ISSUED and c.next == Step.RESPOND_TO_CALL
    c.apply(respond=response_doc("AgreeinFull", 12_400_000))
    assert c.state.status == Status.AGREED and c.state.disputedAmount.value == 0 and c.next == Step.PROPOSE_COLLATERAL
    c.apply(propose=proposal_doc())
    assert c.next == Step.DECIDE_PROPOSAL
    c.apply(decide={"proposalId": "P-1", "accept": True})
    assert c.state.proposal[0].status == PSt.ACCEPTED and c.next == Step.SETTLE_CALL
    c.apply(settle={"proposalId": "P-1"})
    assert c.state.status == Status.SETTLED and c.next is None
    assert [r.step for r in c.state.stepRecord] == [Step.ISSUE_CALL, Step.RESPOND_TO_CALL, Step.PROPOSE_COLLATERAL, Step.DECIDE_PROPOSAL, Step.SETTLE_CALL]
    assert "AmountsAfterResponse" not in failed_conditions(c.state)


def test_partial_agreement_rejected_then_accepted_proposal():  # console scenario im-dispute
    c = issued().apply(respond=response_doc("PartiallyAgree", 11_900_000, units=12_395_834))
    assert c.state.status == Status.PARTIALLY_AGREED
    assert c.state.agreedAmount.value == Decimal("11900000") and c.state.disputedAmount.value == Decimal("500000")
    c.apply(propose=proposal_doc("P-1", 11_900_001, units=12_395_834))
    c.apply(decide={"proposalId": "P-1", "accept": False, "reason": "tMMF over the 50% concentration limit"})
    assert c.state.proposal[0].status == PSt.REJECTED and c.next == Step.PROPOSE_COLLATERAL
    c.apply(propose=proposal_doc("P-2", 11_902_934))
    c.apply(decide={"proposalId": "P-2", "accept": True}).apply(settle={"proposalId": "P-2"})
    assert c.state.status == Status.SETTLED and c.state.disputedAmount.value == Decimal("500000")


def test_return_call_released_without_proposal():  # console scenario im-return
    c = issued(4_300_000, "Return", caller="BANK-A").apply(respond=response_doc("AgreeinFull", 4_300_000, action="Return"))
    assert c.next == Step.SETTLE_CALL
    with pytest.raises(Exception, match="ExpectedStep"):
        c.apply(propose=proposal_doc(value=4_300_000))
    c.apply(settle={"releasedValue": {"value": 4_299_999, "unit": {"currency": {"@data": "USD"}}}})
    assert c.state.status == Status.SETTLED


def test_return_cannot_release_more_than_agreed():
    c = issued(4_300_000, "Return", caller="BANK-A").apply(respond=response_doc("AgreeinFull", 4_300_000, action="Return"))
    with pytest.raises(Exception, match="ReturnWithinAgreedAmount"):
        c.apply(settle={"releasedValue": {"value": 4_400_000, "unit": {"currency": {"@data": "USD"}}}})


def test_wholly_disputed_call_waits_for_nothing():
    c = issued().apply(respond=response_doc("Dispute", 0))
    assert c.state.status == Status.DISPUTED and c.state.disputedAmount.value == Decimal("12400000") and c.next is None


@pytest.mark.parametrize("kind,agreed", [("AgreeinFull", 11_900_000), ("Dispute", 1), ("PartiallyAgree", 12_400_000)])
def test_response_type_must_match_amount(kind, agreed):
    with pytest.raises(Exception, match="ResponseTypeMatchesAmount"):
        issued().apply(respond=response_doc(kind, agreed))


def test_steps_out_of_order_are_rejected():
    with pytest.raises(Exception, match="ExpectedStep"):
        Call().apply(respond=response_doc("AgreeinFull", 12_400_000))  # nothing issued yet
    c = issued().apply(respond=response_doc("AgreeinFull", 12_400_000)).apply(propose=proposal_doc())
    with pytest.raises(Exception, match="ExpectedStep"):
        c.apply(settle={"proposalId": "P-1"})  # P-1 not yet accepted


def test_settlement_must_cover_agreed_amount():
    c = issued().apply(respond=response_doc("AgreeinFull", 12_400_000)).apply(propose=proposal_doc(value=12_000_000))
    c.apply(decide={"proposalId": "P-1", "accept": True})
    with pytest.raises(Exception, match="DeliveryAgainstAcceptedProposal"):
        c.apply(settle={"proposalId": "P-1"})


def test_proposal_must_answer_this_call():
    c = issued().apply(respond=response_doc("AgreeinFull", 12_400_000))
    with pytest.raises(Exception, match="SameCall"):
        c.apply(propose=proposal_doc(call="C-0099"))


def test_previous_state_is_not_modified():
    c = issued().apply(respond=response_doc("AgreeinFull", 12_400_000)).apply(propose=proposal_doc())
    before = c.state
    snapshot = repr(before)  # model_dump_json fails on absent metadata fields (D14)
    c.apply(decide={"proposalId": "P-1", "accept": True}).apply(settle={"proposalId": "P-1"})
    assert repr(before) == snapshot
    assert before.status == Status.AGREED and before.proposal[0].status == PSt.PROPOSED and len(before.stepRecord) == 3
