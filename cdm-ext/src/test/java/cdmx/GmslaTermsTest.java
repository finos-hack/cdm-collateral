package cdmx;

import cdm.base.staticdata.party.CounterpartyRoleEnum;
import cdm.legaldocumentation.common.LegalAgreement;
import cdm.legaldocumentation.master.isla.GlobalMasterSecuritiesLendingAgreement;
import cdmx.collateral.gmsla.GmslaElectionEnum;
import cdmx.collateral.gmsla.GmslaPrototypeElections;
import cdmx.collateral.gmsla.GmslaTerms;
import cdmx.collateral.gmsla.GmslaTermsAmendment;
import cdmx.collateral.gmsla.functions.Create_GmslaTermsAmendment;
import cdmx.collateral.gmsla.functions.GmslaElectionsOf;
import cdmx.collateral.gmsla.functions.GmslaMinimumTransferAmountFor;
import cdmx.collateral.gmsla.functions.Qualify_GmslaTermsChange;
import com.rosetta.model.lib.records.Date;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static cdmx.Cdm.*;
import static cdmx.Data.money;
import static cdmx.Data.party;
import static org.junit.jupiter.api.Assertions.*;

/** GMSLA terms and their amendment (task-gmsla-terms, wp-adr-gmsla-terms): the baseline the pair starts on, BANK-A as
 *  Party1 and BANK-B as Party2. */
class GmslaTermsTest {
    private final Create_GmslaTermsAmendment amend = fn(Create_GmslaTermsAmendment.class);
    private static final Date EVENT = Date.of(2026, 11, 11);

    static Map<String, Object> eod(String role) {
        return o("party", role, "automaticEarlyTerminationApplies", "NotApplicable",
            "automaticEarlyTerminationSpecifiedSeparatelyForEachPrinciple", false,
            "automaticEarlyTerminationRequiredDueToSystemOfLaw", false, "automaticEarlyTerminationInModifiedForm", false);
    }

    static Map<String, Object> gmslaDoc(String notificationTime) {
        return o("collateral", o("standardDefinitionOfMarketValueUsed", true,
                "aggregation", o("aggregationType", "Aggregated", "loansCanBeGrouped", false),
                "nettingObligationsApply", "Applicable", "failureToDevliverIndemnityApplies", "Applicable",
                "notificationTime", o("hourMinuteTime", notificationTime, "businessCenter", o("@data", "GBLO"))),
            "baseCurrency", o("baseCurrency", "USD"),
            "eventsOfDefault", o("partyElection", l(eod("Party1"), eod("Party2"))));
    }

    static Map<String, Object> agreementDoc(String masterType) {
        return o("agreementDate", "2026-11-02",
            "legalAgreementIdentification", o("agreementName", o("agreementType", "MasterAgreement",
                    "masterAgreementType", o("@data", masterType)), "governingLaw", "GBEN", "publisher", "ISLA", "vintage", 2010),
            "contractualParty", l(party("BANK-A"), party("BANK-B")),
            "agreementTerms", o("agreement", o("masterAgreementElections", o("islaGmsla", gmslaDoc("10:00:00"))),
                "counterparty", l(o("role", "Party1", "partyReference", party("BANK-A")), o("role", "Party2", "partyReference", party("BANK-B")))));
    }

    static Map<String, Object> electionsDoc(long mtaParty1, long mtaParty2, String ccy) {
        return o("minimumTransferAmount", l(o("party", "Party1", "amount", money(mtaParty1, ccy)), o("party", "Party2", "amount", money(mtaParty2, ccy))),
            "defaultMargin", 1.02);
    }

    static GmslaTerms baseline() {
        return load(GmslaTerms.class, o("agreement", agreementDoc("GMSLA"), "elections", electionsDoc(250_000, 250_000, "USD")));
    }

    static GlobalMasterSecuritiesLendingAgreement gmsla(String notificationTime) {
        return load(GlobalMasterSecuritiesLendingAgreement.class, gmslaDoc(notificationTime));
    }

    @Test
    void theBaselineIsValidCdmAndItsAgreementIsACdmGmsla() throws Exception {
        GmslaTerms t = baseline();
        assertEquals("", failedText(t));
        // The agreement alone is a valid CDM LegalAgreement that holds the GMSLA elections, and round-trips.
        String json = toJson(t.getAgreement());
        LegalAgreement a = JSON.readValue(json, LegalAgreement.class);
        assertEquals("", failedText(a));
        assertEquals(json, toJson(a));
        assertEquals("GMSLA", a.getLegalAgreementIdentification().getAgreementName().getMasterAgreementType().getValue().name());
        assertEquals("Aggregated", fn(GmslaElectionsOf.class).evaluate(t).getCollateral().getAggregation().getAggregationType().toDisplayString());
        assertEquals(0, new BigDecimal("250000").compareTo(fn(GmslaMinimumTransferAmountFor.class).evaluate(t, CounterpartyRoleEnum.PARTY_2).getValue()));
    }

    @Test
    void anAmendmentOfTheNotificationTimeIsQualifiedAndNamesTheElection() {
        GmslaTerms before = baseline();
        GmslaTermsAmendment a = amend.evaluate(before, gmsla("11:00:00"), before.getElections(), EVENT, EVENT);
        assertEquals("", failedText(a));
        assertEquals(List.of(GmslaElectionEnum.NOTIFICATION_TIME), a.getChangedElection());
        assertEquals("AgreementTermsChange", a.getEventQualifier());
        assertTrue(fn(Qualify_GmslaTermsChange.class).evaluate(a));
        assertEquals(before, a.getBefore());
        assertEquals("11:00", fn(GmslaElectionsOf.class).evaluate(a.getAfter()).getCollateral().getNotificationTime().getHourMinuteTime().toString().substring(0, 5));
        assertEquals(before.getAgreement().getLegalAgreementIdentification(), a.getAfter().getAgreement().getLegalAgreementIdentification());
    }

    @Test
    void theMinimumTransferAmountAndTheDefaultMarginAreElectionsToo() {
        GmslaTerms before = baseline();
        GmslaPrototypeElections e = load(GmslaPrototypeElections.class, electionsDoc(250_000, 400_000, "USD"));
        GmslaTermsAmendment a = amend.evaluate(before, fn(GmslaElectionsOf.class).evaluate(before), e, EVENT, EVENT);
        assertEquals(List.of(GmslaElectionEnum.MINIMUM_TRANSFER_AMOUNT), a.getChangedElection());
        Map<String, Object> m = electionsDoc(250_000, 250_000, "USD");
        m.put("defaultMargin", 1.05);
        a = amend.evaluate(before, gmsla("11:00:00"), load(GmslaPrototypeElections.class, m), EVENT, EVENT);
        assertEquals(List.of(GmslaElectionEnum.NOTIFICATION_TIME, GmslaElectionEnum.DEFAULT_MARGIN), a.getChangedElection());
    }

    @Test
    void anAmendmentCanBeAmendedBackToTheBaseline() {
        GmslaTerms base = baseline();
        GmslaTermsAmendment first = amend.evaluate(base, gmsla("11:00:00"), base.getElections(), EVENT, EVENT);
        GmslaTermsAmendment back = amend.evaluate(first.getAfter(), gmsla("10:00:00"), base.getElections(), EVENT, EVENT);
        assertEquals(base, back.getAfter());
        assertEquals(List.of(GmslaElectionEnum.NOTIFICATION_TIME), back.getChangedElection());
    }

    @Test
    void anAmendmentMustChangeSomethingAndTakeEffectOnOrAfterItsEventDate() {
        GmslaTerms base = baseline();
        assertNotNull(rejected(() -> amend.evaluate(base, gmsla("10:00:00"), base.getElections(), EVENT, EVENT)));
        assertNotNull(rejected(() -> amend.evaluate(base, gmsla("11:00:00"), base.getElections(), EVENT, Date.of(2026, 11, 10))));
    }

    @Test
    void anotherKindOfAgreementOrAnotherCurrencyIsNotGmslaTerms() {
        // CDM accepts GMSLA elections under any agreement type (D28); GmslaTerms does not.
        String f = failedText(load(GmslaTerms.class, o("agreement", agreementDoc("GMRA"), "elections", electionsDoc(250_000, 250_000, "USD"))));
        assertTrue(f.contains("IsGmsla"), f);
        assertEquals("", failedText(load(LegalAgreement.class, agreementDoc("GMRA"))));
        f = failedText(load(GmslaTerms.class, o("agreement", agreementDoc("GMSLA"), "elections", electionsDoc(250_000, 250_000, "EUR"))));
        assertTrue(f.contains("InBaseCurrency"), f);
        Map<String, Object> one = electionsDoc(250_000, 250_000, "USD");
        one.put("minimumTransferAmount", l(o("party", "Party1", "amount", money(250_000)), o("party", "Party1", "amount", money(250_000))));
        assertTrue(failedText(load(GmslaPrototypeElections.class, one)).contains("OnePerParty"));
    }
}
