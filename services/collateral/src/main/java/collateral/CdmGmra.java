package collateral;

import cdm.base.staticdata.party.CounterpartyRoleEnum;
import cdmx.collateral.gmra.GmraElections;
import cdmx.collateral.gmra.GmraTerms;
import cdmx.collateral.gmra.GmraTermsAmendment;
import cdmx.collateral.gmra.functions.Create_GmraTermsAmendment;
import cdmx.collateral.gmra.functions.GmraMinimumTransferAmountFor;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.rosetta.model.lib.records.Date;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static collateral.CdmRuntime.l;
import static collateral.CdmRuntime.o;

/**
 * The GMRA 2011 between the two parties as CDM data (cdm-ext {@code cdmx.collateral.gmra}, wp-adr-repo-gmra-terms),
 * and its amendments. The GMRA has no pledgor and secured party: Party1 is BANK-A and Party2 BANK-B on both services.
 * The baseline is the same document on both sides; each agreed amendment's GmraTermsAmendment replaces the
 * elections, and both parties fold the same agreed amendments, in chain order, to the same terms.
 */
public final class CdmGmra {
    public static final String KIND = "GMRA";
    public static final long BASELINE_MTA_USD = 250_000;
    public static final String BASELINE_MARGIN_RATIO = "1.02";
    static final String AGREEMENT_DATE = "2026-11-02";

    /** The terms in force and the hash of the last agreed amendment (NO_HASH for the baseline). */
    public record Terms(GmraTerms terms, String hash, int amendments) {}

    /** A proposed amendment as CDM data with its payload hash. */
    public record Proposal(GmraTermsAmendment amendment, String json, String hash) {}

    private CdmGmra() {}

    private static Map<String, Object> party(String name) {
        return o("partyId", l(o("identifier", o("@data", name))), "name", o("@data", name));
    }

    static Map<String, Object> electionsDoc(long mtaParty1, long mtaParty2, String marginRatio) {
        return o("baseCurrency", "USD", "marginRatioBasis", "PerTransaction", "defaultMarginRatio", new BigDecimal(marginRatio),
                "minimumTransferAmount", l(
                        o("party", "Party1", "amount", o("value", mtaParty1, "unit", o("currency", o("@data", "USD")))),
                        o("party", "Party2", "amount", o("value", mtaParty2, "unit", o("currency", o("@data", "USD"))))),
                "marginTransfer", o("cashMargin", true, "securitiesMargin", true, "transferBusinessDays", 1),
                "netMarginInterest", o("floatingRateIndex", "USD_SOFR", "spread", 0),
                "incomePayment", "PaidToSeller",
                "defaultValuation", o("valuationTime", "17:00:00", "businessCenter", "GBLO", "automaticEarlyTermination", false));
    }

    /** The baseline GMRA: ICMA GMRA 2011, English law, party1 as Party1 and party2 as Party2, the elections of the ADR. */
    public static Terms baseline(String party1, String party2) {
        GmraTerms t = CdmRuntime.load(GmraTerms.class, o(
                "agreement", o("agreementDate", AGREEMENT_DATE,
                        "legalAgreementIdentification", o("agreementName", o("agreementType", "MasterAgreement",
                                "masterAgreementType", o("@data", "GMRA")), "governingLaw", "GBEN", "publisher", "ICMA", "vintage", 2011),
                        "contractualParty", l(party(party1), party(party2))),
                "counterparty", l(o("role", "Party1", "partyReference", party(party1)), o("role", "Party2", "partyReference", party(party2))),
                "elections", electionsDoc(BASELINE_MTA_USD, BASELINE_MTA_USD, BASELINE_MARGIN_RATIO)));
        CdmRuntime.validate(t);
        return new Terms(t, CdmAgreement.NO_HASH, 0);
    }

    /** A party's minimum transfer amount, whole USD. */
    public static long mtaUsd(GmraElections e, CounterpartyRoleEnum role) {
        return CdmRuntime.fn(GmraMinimumTransferAmountFor.class).evaluate(e, role).getValue().longValueExact();
    }

    /** The elections with one party's minimum transfer amount and the default Margin Ratio replaced (null: unchanged). */
    static GmraElections with(GmraElections e, CounterpartyRoleEnum role, Long mtaUsd, BigDecimal marginRatio) {
        try {
            ObjectNode tree = CdmRuntime.JSON.valueToTree(e);
            if (mtaUsd != null)
                for (var m : tree.path("minimumTransferAmount"))
                    if (m.path("party").asText().equals(role.toDisplayString())) ((ObjectNode) m.path("amount")).put("value", mtaUsd);
            if (marginRatio != null) tree.put("defaultMarginRatio", marginRatio);
            return CdmRuntime.JSON.treeToValue(tree, GmraElections.class);
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    /** Build and validate an amendment of the terms in force: one party's MTA and/or the default Margin Ratio. */
    public static Proposal propose(Terms current, CounterpartyRoleEnum role, Long mtaUsd, BigDecimal marginRatio, LocalDate date) {
        GmraElections after = with(current.terms().getElections(), role, mtaUsd, marginRatio);
        Date d = Date.of(date);
        GmraTermsAmendment m = CdmRuntime.fn(Create_GmraTermsAmendment.class).evaluate(current.terms(), after, d, d);
        CdmRuntime.validate(m);
        String json = CdmRuntime.toJson(m);
        return new Proposal(m, json, Cdm.keccakHex(json));
    }

    /**
     * Check an amendment received through the payload store against the terms in force: it parses, passes CDM
     * validation, its terms before are the terms in force, and Create_GmraTermsAmendment over its own inputs gives
     * the same amendment. Returns it; throws otherwise.
     */
    public static GmraTermsAmendment verify(String json, Terms current) {
        GmraTermsAmendment m;
        try {
            m = CdmRuntime.JSON.readValue(json, GmraTermsAmendment.class);
        } catch (Exception e) {
            throw new IllegalStateException("not a GmraTermsAmendment: " + e.getMessage(), e);
        }
        CdmRuntime.validate(m);
        if (!current.terms().equals(m.getBefore())) throw new IllegalStateException("the amendment does not apply to the terms in force");
        GmraTermsAmendment again = CdmRuntime.fn(Create_GmraTermsAmendment.class)
                .evaluate(current.terms(), m.getAfter().getElections(), m.getEventDate(), m.getEffectiveDate());
        if (!again.equals(m)) throw new IllegalStateException("Create_GmraTermsAmendment over the amendment's inputs gives a different amendment");
        return m;
    }

    public static Terms apply(Terms current, GmraTermsAmendment m, String hash) {
        return new Terms(m.getAfter(), hash, current.amendments() + 1);
    }

    /** The elections as the console shows them. */
    public static Map<String, Object> view(GmraElections e) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("baseCurrency", e.getBaseCurrency());
        m.put("marginRatioBasis", e.getMarginRatioBasis().toDisplayString());
        m.put("defaultMarginRatio", e.getDefaultMarginRatio().stripTrailingZeros().toPlainString());
        m.put("mtaUsd", Map.of("A", String.valueOf(mtaUsd(e, CounterpartyRoleEnum.PARTY_1)), "B", String.valueOf(mtaUsd(e, CounterpartyRoleEnum.PARTY_2))));
        var t = e.getMarginTransfer();
        m.put("marginTransfer", (t.getCashMargin() && t.getSecuritiesMargin() ? "cash or securities" : t.getCashMargin() ? "cash" : "securities")
                + " by title transfer, due " + t.getTransferBusinessDays() + " business day(s) after the call");
        var i = e.getNetMarginInterest();
        m.put("netMarginInterest", i.getFloatingRateIndex().toDisplayString() + (i.getSpread().signum() == 0 ? "" : " + " + i.getSpread().toPlainString()));
        m.put("incomePayment", e.getIncomePayment().toDisplayString());
        var v = e.getDefaultValuation();
        m.put("defaultValuation", "by the non-defaulting party at " + v.getValuationTime() + " " + v.getBusinessCenter()
                + "; automatic early termination " + (v.getAutomaticEarlyTermination() ? "on" : "off"));
        return m;
    }

    /** The changed elections of an amendment, by name. */
    public static List<String> changed(GmraTermsAmendment m) {
        return m.getChangedElection().stream().map(Object::toString).toList();
    }
}
