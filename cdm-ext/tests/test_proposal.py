"""Exercise the generated cdmx extension (G2: collateral proposal) on top of the published finos-cdm package."""
from decimal import Decimal

import pytest
from cdm_runtime import failed_conditions, load  # must come before other finos imports (D14)
from rune.runtime.base_data_class import BaseDataClass
from finos.cdmx.collateral.proposal.CollateralProposalStatusEnum import CollateralProposalStatusEnum as St
from finos.cdmx.collateral.proposal.functions.DecideCollateralProposal import DecideCollateralProposal
from finos.cdmx.collateral.proposal.functions.ProposalCoversAgreedAmount import ProposalCoversAgreedAmount

PROPOSAL = "finos.cdmx.collateral.proposal.CollateralProposal"


def money(v, ccy="USD"):
    return {"value": v, "unit": {"currency": {"@data": ccy}}}


def ident(v, issuer):
    return {"issuer": {"@data": issuer}, "assignedIdentifier": [{"identifier": {"@data": v}}]}


def proposal(value=12_400_094, status="Proposed", decision=None):
    doc = {"proposalIdentifier": ident("P-1", "BANK-A"), "callIdentifier": ident("C-0001", "BANK-B"),
           "proposedCollateral": [{"priceQuantity": [{"quantity": {"value": 128_589, "unit": {"financialUnit": "Share"}}}]}],
           "valueAfterHaircuts": money(value), "status": status}
    if decision is not None:
        doc["decision"] = decision
    return load(PROPOSAL, doc)


def amount(v, ccy="USD"):
    return load("finos.cdm.observable.asset.Money", money(v, ccy), check_conditions=True)


def test_covers_agreed_amount():
    assert ProposalCoversAgreedAmount(proposal(), amount(12_400_000)) is True
    assert ProposalCoversAgreedAmount(proposal(11_000_000), amount(12_400_000)) is False


def test_currency_precondition():
    with pytest.raises(Exception, match="SameCurrency"):
        ProposalCoversAgreedAmount(proposal(), amount(1, "EUR"))


def test_accept_and_reject():
    acc = DecideCollateralProposal(proposal(), True, None)
    assert acc.status == St.ACCEPTED and acc.decision.accepted is True
    rej = DecideCollateralProposal(proposal(), False, "tMMF over the 50% concentration limit")
    assert rej.status == St.REJECTED and rej.decision.reason.startswith("tMMF")


def test_cannot_decide_twice():
    acc = DecideCollateralProposal(proposal(), True, None)
    with pytest.raises(Exception, match="StillProposed"):
        DecideCollateralProposal(acc, False, "too late")


def test_type_conditions():
    assert "DecisionMatchesStatus" not in failed_conditions(proposal())
    assert "DecisionMatchesStatus" in failed_conditions(proposal(status="Accepted"))  # Accepted without a decision
    assert "DecisionMatchesStatus" not in failed_conditions(DecideCollateralProposal(proposal(), True, None))
    no_reason = load("finos.cdmx.collateral.proposal.CollateralProposalDecision", {"accepted": False})
    assert "ReasonForRejection" in failed_conditions(no_reason)


def test_serialisation_roundtrip():
    from rune.runtime.cow import rune_unwrap
    acc = rune_unwrap(DecideCollateralProposal(proposal(), True, None))
    js = acc.rune_serialize(check_rune_constraints=False)  # CDM's own position condition cannot pass (D14)
    assert '"@type":"cdmx.collateral.proposal.CollateralProposal"' in js  # Rune type name, without the package prefix
    back = BaseDataClass.rune_deserialize(js, check_rune_constraints=False, namespace_prefix="finos")
    assert back.status == St.ACCEPTED and back.valueAfterHaircuts.value == Decimal("12400094")
