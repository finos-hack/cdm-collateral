package collateral;

import cdm.base.staticdata.party.CounterpartyRoleEnum;
import cdm.legaldocumentation.master.isla.GlobalMasterSecuritiesLendingAgreement;
import cdmx.collateral.gmsla.GmslaPrototypeElections;
import cdmx.collateral.gmsla.GmslaTerms;
import cdmx.collateral.gmsla.GmslaTermsAmendment;
import cdmx.collateral.gmsla.functions.Create_GmslaTermsAmendment;
import cdmx.collateral.gmsla.functions.GmslaElectionsOf;
import cdmx.collateral.gmsla.functions.GmslaMinimumTransferAmountFor;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.rosetta.model.lib.records.Date;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static collateral.CdmRuntime.l;
import static collateral.CdmRuntime.o;

/**
 * The GMSLA 2010 between the two parties as CDM data (wp-adr-gmsla-terms): CDM's LegalAgreement with its GMSLA
 * elections, and the cdm-ext elections CDM's type lacks, held as cdm-ext {@code GmslaTerms}; and its amendments. As
 * for the GMRA, Party1 is BANK-A and Party2 BANK-B on both services, both start from the same baseline, and both fold
 * the same agreed amendments, in chain order, to the same terms.
 */
public final class CdmGmsla {
    public static final String KIND = "GMSLA";
    public static final long BASELINE_MTA_USD = 250_000;
    public static final String BASELINE_DEFAULT_MARGIN = "1.02";
    public static final String BASELINE_NOTIFICATION_TIME = "10:00:00";
    static final String AGREEMENT_DATE = "2026-11-02";

    /** The terms in force and the hash of the last agreed amendment (NO_HASH for the baseline). */
    public record Terms(GmslaTerms terms, String hash, int amendments) {}

    /** A proposed amendment as CDM data with its payload hash. */
    public record Proposal(GmslaTermsAmendment amendment, String json, String hash) {}

    private CdmGmsla() {}

    private static Map<String, Object> party(String name) {
        return o("partyId", l(o("identifier", o("@data", name))), "name", o("@data", name));
    }

    private static Map<String, Object> eventsOfDefault(String role) {
        return o("party", role, "automaticEarlyTerminationApplies", "NotApplicable",
                "automaticEarlyTerminationSpecifiedSeparatelyForEachPrinciple", false,
                "automaticEarlyTerminationRequiredDueToSystemOfLaw", false, "automaticEarlyTerminationInModifiedForm", false);
    }

    /** The baseline GMSLA: ISLA GMSLA 2010, English law, party1 as Party1 and party2 as Party2, the elections of the ADR. */
    public static Terms baseline(String party1, String party2) {
        Map<String, Object> gmsla = o(
                "collateral", o("standardDefinitionOfMarketValueUsed", true,
                        "aggregation", o("aggregationType", "Aggregated", "loansCanBeGrouped", false),
                        "nettingObligationsApply", "Applicable", "failureToDevliverIndemnityApplies", "Applicable",
                        "notificationTime", o("hourMinuteTime", BASELINE_NOTIFICATION_TIME, "businessCenter", o("@data", "GBLO"))),
                "baseCurrency", o("baseCurrency", "USD"),
                "eventsOfDefault", o("partyElection", l(eventsOfDefault("Party1"), eventsOfDefault("Party2"))));
        GmslaTerms t = CdmRuntime.load(GmslaTerms.class, o(
                "agreement", o("agreementDate", AGREEMENT_DATE,
                        "legalAgreementIdentification", o("agreementName", o("agreementType", "MasterAgreement",
                                "masterAgreementType", o("@data", "GMSLA")), "governingLaw", "GBEN", "publisher", "ISLA", "vintage", 2010),
                        "contractualParty", l(party(party1), party(party2)),
                        "agreementTerms", o("agreement", o("masterAgreementElections", o("islaGmsla", gmsla)),
                                "counterparty", l(o("role", "Party1", "partyReference", party(party1)),
                                        o("role", "Party2", "partyReference", party(party2))))),
                "elections", o("minimumTransferAmount", l(
                                o("party", "Party1", "amount", o("value", BASELINE_MTA_USD, "unit", o("currency", o("@data", "USD")))),
                                o("party", "Party2", "amount", o("value", BASELINE_MTA_USD, "unit", o("currency", o("@data", "USD"))))),
                        "defaultMargin", new BigDecimal(BASELINE_DEFAULT_MARGIN))));
        CdmRuntime.validate(t);
        return new Terms(t, CdmAgreement.NO_HASH, 0);
    }

    public static GlobalMasterSecuritiesLendingAgreement gmsla(GmslaTerms t) {
        return CdmRuntime.fn(GmslaElectionsOf.class).evaluate(t);
    }

    /** A party's minimum transfer amount, whole USD. */
    public static long mtaUsd(GmslaTerms t, CounterpartyRoleEnum role) {
        return CdmRuntime.fn(GmslaMinimumTransferAmountFor.class).evaluate(t, role).getValue().longValueExact();
    }

    /** The notification time, HH:mm. */
    public static String notificationTime(GmslaTerms t) {
        return gmsla(t).getCollateral().getNotificationTime().getHourMinuteTime().toString().substring(0, 5);
    }

    private static <T> T edit(Object o, Class<T> type, java.util.function.Consumer<ObjectNode> change) {
        try {
            ObjectNode tree = CdmRuntime.JSON.valueToTree(o);
            change.accept(tree);
            return CdmRuntime.JSON.treeToValue(tree, type);
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    /**
     * Build and validate an amendment of the terms in force: the notification time ("HH:mm"), one party's minimum
     * transfer amount and/or the default margin (null: unchanged).
     */
    public static Proposal propose(Terms current, String notificationTime, CounterpartyRoleEnum role, Long mtaUsd, BigDecimal defaultMargin, LocalDate date) {
        GmslaTerms t = current.terms();
        GlobalMasterSecuritiesLendingAgreement g = notificationTime == null ? gmsla(t) : edit(gmsla(t), GlobalMasterSecuritiesLendingAgreement.class, tree ->
                ((ObjectNode) tree.path("collateral").path("notificationTime")).put("hourMinuteTime", LocalTime.parse(notificationTime).withSecond(0).toString() + ":00"));
        GmslaPrototypeElections e = edit(t.getElections(), GmslaPrototypeElections.class, tree -> {
            if (mtaUsd != null)
                for (var m : tree.path("minimumTransferAmount"))
                    if (m.path("party").asText().equals(role.toDisplayString())) ((ObjectNode) m.path("amount")).put("value", mtaUsd);
            if (defaultMargin != null) tree.put("defaultMargin", defaultMargin);
        });
        Date d = Date.of(date);
        GmslaTermsAmendment m = CdmRuntime.fn(Create_GmslaTermsAmendment.class).evaluate(t, g, e, d, d);
        CdmRuntime.validate(m);
        String json = CdmRuntime.toJson(m);
        return new Proposal(m, json, Cdm.keccakHex(json));
    }

    /**
     * Check an amendment received through the payload store against the terms in force: it parses, passes CDM
     * validation, its terms before are the terms in force, and Create_GmslaTermsAmendment over its own inputs gives
     * the same amendment. Returns it; throws otherwise.
     */
    public static GmslaTermsAmendment verify(String json, Terms current) {
        GmslaTermsAmendment m;
        try {
            m = CdmRuntime.JSON.readValue(json, GmslaTermsAmendment.class);
        } catch (Exception e) {
            throw new IllegalStateException("not a GmslaTermsAmendment: " + e.getMessage(), e);
        }
        CdmRuntime.validate(m);
        if (!current.terms().equals(m.getBefore())) throw new IllegalStateException("the amendment does not apply to the terms in force");
        GmslaTermsAmendment again = CdmRuntime.fn(Create_GmslaTermsAmendment.class)
                .evaluate(current.terms(), gmsla(m.getAfter()), m.getAfter().getElections(), m.getEventDate(), m.getEffectiveDate());
        if (!again.equals(m)) throw new IllegalStateException("Create_GmslaTermsAmendment over the amendment's inputs gives a different amendment");
        return m;
    }

    public static Terms apply(Terms current, GmslaTermsAmendment m, String hash) {
        return new Terms(m.getAfter(), hash, current.amendments() + 1);
    }

    /** Whether automatic early termination applies when the party in this role defaults (wp-adr-gmsla-default-close-out):
     *  that party's EventsOfDefaultElection. */
    public static boolean automaticEarlyTermination(GmslaTerms t, CounterpartyRoleEnum role) {
        for (var e : gmsla(t).getEventsOfDefault().getPartyElection())
            if (e.getParty() == role) return e.getAutomaticEarlyTerminationApplies().name().equals("APPLICABLE");
        return false;
    }

    private static String applies(Object enumValue) {
        return "Applicable".equals(String.valueOf(enumValue)) || "APPLICABLE".equals(String.valueOf(enumValue)) ? "applies" : "does not apply";
    }

    /** The elections as the console shows them. */
    public static Map<String, Object> view(GmslaTerms t) {
        var g = gmsla(t);
        var c = g.getCollateral();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("baseCurrency", g.getBaseCurrency().getBaseCurrency().toDisplayString());
        m.put("marketValue", c.getStandardDefinitionOfMarketValueUsed() ? "standard definition" : c.getDefinitionOfMarketValueNonStandard());
        m.put("aggregation", c.getAggregation().getAggregationType().toDisplayString() + (c.getAggregation().getLoansCanBeGrouped() ? ", loans grouped" : ""));
        m.put("nettingOfDeliveries", applies(c.getNettingObligationsApply().toDisplayString()));
        m.put("failureToRedeliverIndemnity", applies(c.getFailureToDevliverIndemnityApplies().toDisplayString()));
        m.put("notificationTime", notificationTime(t) + " " + c.getNotificationTime().getBusinessCenter().getValue());
        Map<String, String> aet = new LinkedHashMap<>();
        for (var e : g.getEventsOfDefault().getPartyElection())
            aet.put(e.getParty() == CounterpartyRoleEnum.PARTY_1 ? "A" : "B", applies(e.getAutomaticEarlyTerminationApplies().toDisplayString()));
        m.put("automaticEarlyTermination", aet);
        m.put("mtaUsd", Map.of("A", String.valueOf(mtaUsd(t, CounterpartyRoleEnum.PARTY_1)), "B", String.valueOf(mtaUsd(t, CounterpartyRoleEnum.PARTY_2))));
        m.put("defaultMargin", t.getElections().getDefaultMargin().stripTrailingZeros().toPlainString());
        return m;
    }

    /** The changed elections of an amendment, by name. */
    public static List<String> changed(GmslaTermsAmendment m) {
        return m.getChangedElection().stream().map(Object::toString).toList();
    }
}
