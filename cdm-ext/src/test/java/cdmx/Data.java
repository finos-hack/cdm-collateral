package cdmx;

import cdm.observable.asset.Money;
import cdmx.collateral.margincall.MarginCallInstruction;
import cdmx.collateral.proposal.CollateralProposal;

import java.util.Map;

import static cdmx.Cdm.*;

/** Rune JSON builders for test data (invented identifiers and amounts, matching the console scenarios). */
final class Data {
    private Data() {}

    static Map<String, Object> money(Number v, String ccy) {
        return o("value", v, "unit", o("currency", o("@data", ccy)));
    }

    static Map<String, Object> money(Number v) {
        return money(v, "USD");
    }

    static Map<String, Object> ident(String v, String issuer) {
        return o("issuer", o("@data", issuer), "assignedIdentifier", l(o("identifier", o("@data", v))));
    }

    /** Tokenised US Treasury held as collateral (console scenarios: tUST). A choice value carries its option's @type. */
    static Map<String, Object> security(String isin) {
        return o("@type", "cdm.base.staticdata.asset.common.Security",
            "identifier", l(o("identifier", o("@data", isin), "identifierType", "ISIN")),
            "securityType", "Debt", "assetType", "Security");
    }

    static Map<String, Object> position(Number units, String isin) {
        return o("priceQuantity", l(o("quantity", o("value", units, "unit", o("financialUnit", "Share")))),
            "asset", security(isin));
    }

    static Map<String, Object> position(Number units) {
        return position(units, "XS0000TUST01");
    }

    static Map<String, Object> proposalDoc(String pid, Number value, String call, String status, Number units) {
        return o("proposalIdentifier", ident(pid, "BANK-A"), "callIdentifier", ident(call, "BANK-B"),
            "proposedCollateral", l(position(units)), "valueAfterHaircuts", money(value), "status", status);
    }

    static Map<String, Object> proposalDoc(String pid, Number value) {
        return proposalDoc(pid, value, "C-0001", "Proposed", 128_589);
    }

    static Map<String, Object> proposalDoc() {
        return proposalDoc("P-1", 12_400_094);
    }

    static Map<String, Object> party(String name) {
        return o("partyId", l(o("identifier", o("@data", name))));
    }

    /** In the console scenarios BANK-A posts initial margin to BANK-B, whichever party issues the call. */
    static Map<String, Object> callBase(String call, String caller) {
        return o("instructionType", o("callType", "MarginCall"), "callIdentifier", ident(call, caller),
            "callAgreementType", o("agreementType", "CreditSupportAgreement", "creditSupportAgreementType", o("@data", "CreditSupportAnnex")),
            "regMarginType", "RegIM",
            "partyRole", l(o("partyReference", party("BANK-A"), "role", "Pledgor"),
                           o("partyReference", party("BANK-B"), "role", "SecuredParty")));
    }

    static Map<String, Object> issuanceDoc(Number amount, String caller) {
        Map<String, Object> d = callBase("C-0001", caller);
        d.put("callAmountInBaseCurrency", money(amount));
        return d;
    }

    static Map<String, Object> responseDoc(String kind, Number agreed, String action, Number units) {
        Map<String, Object> d = callBase("C-0001", "BANK-B");
        d.put("marginResponseType", kind);
        d.put("agreedAmountBaseCurrency", money(agreed));
        d.put("marginCallResponseAction", l(o("collateralPositionComponent", l(position(units)), "marginCallAction", action)));
        return d;
    }

    static Map<String, Object> responseDoc(String kind, Number agreed) {
        return responseDoc(kind, agreed, "Delivery", 128_589);
    }

    static MarginCallInstruction instruction(String step, Object value) {
        return load(MarginCallInstruction.class, o(step, value));
    }

    static Money amount(Number v, String ccy) {
        return load(Money.class, money(v, ccy));
    }

    static CollateralProposal proposal(Map<String, Object> doc) {
        return load(CollateralProposal.class, doc);
    }
}
