"""Rune JSON builders for test data (invented identifiers and amounts, matching the console scenarios)."""
from cdm_runtime import load


def money(v, ccy="USD"):
    return {"value": v, "unit": {"currency": {"@data": ccy}}}


def ident(v, issuer):
    return {"issuer": {"@data": issuer}, "assignedIdentifier": [{"identifier": {"@data": v}}]}


def security(isin="XS0000TUST01"):
    # Tokenised US Treasury held as collateral (console scenarios: tUST).
    return {"Instrument": {"Security": {"identifier": [{"identifier": {"@data": isin}, "identifierType": "ISIN"}],
                                        "securityType": "Debt", "assetType": "Security"}}}


def position(units, isin="XS0000TUST01"):
    return {"priceQuantity": [{"quantity": {"value": units, "unit": {"financialUnit": "Share"}}}],
            "asset": security(isin)}


def proposal_doc(pid="P-1", value=12_400_094, call="C-0001", status="Proposed", units=128_589):
    return {"proposalIdentifier": ident(pid, "BANK-A"), "callIdentifier": ident(call, "BANK-B"),
            "proposedCollateral": [position(units)], "valueAfterHaircuts": money(value), "status": status}


def party(name):
    return {"partyId": [{"identifier": {"@data": name}}]}


def call_base(call="C-0001", caller="BANK-B", pledgor="BANK-A", secured="BANK-B"):
    # In the console scenarios BANK-A posts initial margin to BANK-B, whichever party issues the call.
    return {"instructionType": {"callType": "MarginCall"}, "callIdentifier": ident(call, caller),
            "callAgreementType": {"agreementType": "CreditSupportAgreement", "creditSupportAgreementType": {"@data": "CreditSupportAnnex"}}, "regMarginType": "RegIM",
            "partyRole": [{"partyReference": party(pledgor), "role": "Pledgor"},
                          {"partyReference": party(secured), "role": "SecuredParty"}]}


def issuance_doc(amount, call="C-0001", caller="BANK-B"):
    return {**call_base(call, caller), "callAmountInBaseCurrency": money(amount)}


def response_doc(kind, agreed, call="C-0001", caller="BANK-B", action="Delivery", units=128_589):
    return {**call_base(call, caller), "marginResponseType": kind, "agreedAmountBaseCurrency": money(agreed),
            "marginCallResponseAction": [{"collateralPositionComponent": [position(units)], "marginCallAction": action}]}


def instruction(**step):
    return load("finos.cdmx.collateral.margincall.MarginCallInstruction", step)


def amount(v, ccy="USD"):
    return load("finos.cdm.observable.asset.Money", money(v, ccy), check_conditions=True)


def proposal(**kw):
    return load("finos.cdmx.collateral.proposal.CollateralProposal", proposal_doc(**kw))
