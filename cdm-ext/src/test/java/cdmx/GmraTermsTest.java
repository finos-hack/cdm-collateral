package cdmx;

import cdm.base.staticdata.party.CounterpartyRoleEnum;
import cdm.legaldocumentation.common.LegalAgreementBase;
import cdmx.collateral.gmra.GmraElectionEnum;
import cdmx.collateral.gmra.GmraElections;
import cdmx.collateral.gmra.GmraTerms;
import cdmx.collateral.gmra.GmraTermsAmendment;
import cdmx.collateral.gmra.functions.Create_GmraTermsAmendment;
import cdmx.collateral.gmra.functions.GmraMinimumTransferAmountFor;
import cdmx.collateral.gmra.functions.Qualify_GmraTermsChange;
import com.rosetta.model.lib.records.Date;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static cdmx.Cdm.*;
import static cdmx.Data.money;
import static cdmx.Data.party;
import static org.junit.jupiter.api.Assertions.*;

/** GMRA terms and their amendment (task-repo-gmra-terms, wp-adr-repo-gmra-terms): the baseline the pair starts on,
 *  BANK-A as Party1 and BANK-B as Party2. */
class GmraTermsTest {
    private final Create_GmraTermsAmendment amend = fn(Create_GmraTermsAmendment.class);
    private static final Date EVENT = Date.of(2026, 11, 7);

    static Map<String, Object> agreementDoc() {
        return o("agreementDate", "2026-11-02",
            "legalAgreementIdentification", o("agreementName", o("agreementType", "MasterAgreement",
                    "masterAgreementType", o("@data", "GMRA")),
                "governingLaw", "GBEN", "publisher", "ICMA", "vintage", 2011),
            "contractualParty", l(party("BANK-A"), party("BANK-B")));
    }

    static List<Object> roles() {
        return l(o("role", "Party1", "partyReference", party("BANK-A")), o("role", "Party2", "partyReference", party("BANK-B")));
    }

    static Map<String, Object> electionsDoc(long mtaParty1, long mtaParty2, String mtaCcy) {
        return o("baseCurrency", "USD", "marginRatioBasis", "PerTransaction", "defaultMarginRatio", 1.02,
            "minimumTransferAmount", l(o("party", "Party1", "amount", money(mtaParty1, mtaCcy)),
                o("party", "Party2", "amount", money(mtaParty2, mtaCcy))),
            "marginTransfer", o("cashMargin", true, "securitiesMargin", true, "transferBusinessDays", 1),
            "netMarginInterest", o("floatingRateIndex", "USD_SOFR", "spread", 0),
            "incomePayment", "PaidToSeller",
            "defaultValuation", o("valuationTime", "17:00:00", "businessCenter", "GBLO", "automaticEarlyTermination", false));
    }

    static GmraElections elections(long mtaParty1, long mtaParty2) {
        return load(GmraElections.class, electionsDoc(mtaParty1, mtaParty2, "USD"));
    }

    static GmraTerms baseline() {
        return load(GmraTerms.class, o("agreement", agreementDoc(), "counterparty", roles(), "elections", electionsDoc(250_000, 250_000, "USD")));
    }

    private GmraTermsAmendment run(GmraTerms before, GmraElections after, Date effective) {
        return amend.evaluate(before, after, EVENT, effective);
    }

    @Test
    void theBaselineIsValidCdmAndReadsAsAGmra() throws Exception {
        GmraTerms t = baseline();
        assertEquals("", failedText(t));
        // The agreement alone is a valid CDM LegalAgreementBase that names the GMRA.
        LegalAgreementBase a = JSON.readValue(toJson(t.getAgreement()), LegalAgreementBase.class);
        assertEquals("", failedText(a));
        assertEquals("GMRA", a.getLegalAgreementIdentification().getAgreementName().getMasterAgreementType().getValue().name());
        assertEquals(0, new BigDecimal("250000").compareTo(fn(GmraMinimumTransferAmountFor.class)
            .evaluate(t.getElections(), CounterpartyRoleEnum.PARTY_2).getValue()));
    }

    @Test
    void anAmendmentOfTheMinimumTransferAmountIsQualifiedAndNamesTheElection() {
        GmraTerms before = baseline();
        GmraTermsAmendment a = run(before, elections(250_000, 400_000), EVENT);
        assertEquals("", failedText(a));
        assertEquals(List.of(GmraElectionEnum.MINIMUM_TRANSFER_AMOUNT), a.getChangedElection());
        assertEquals("AgreementTermsChange", a.getEventQualifier());
        assertTrue(fn(Qualify_GmraTermsChange.class).evaluate(a));
        assertEquals(before.getAgreement(), a.getAfter().getAgreement());
        assertEquals(0, new BigDecimal("400000").compareTo(fn(GmraMinimumTransferAmountFor.class)
            .evaluate(a.getAfter().getElections(), CounterpartyRoleEnum.PARTY_2).getValue()));
        assertEquals(before, a.getBefore());
    }

    @Test
    void anAmendmentCanBeAmendedAgainAndBackToTheBaseline() {
        GmraTerms base = baseline();
        GmraTermsAmendment first = run(base, elections(250_000, 400_000), EVENT);
        GmraTermsAmendment back = run(first.getAfter(), base.getElections(), EVENT);
        assertEquals(base, back.getAfter());
        assertEquals(List.of(GmraElectionEnum.MINIMUM_TRANSFER_AMOUNT), back.getChangedElection());
    }

    @Test
    void anAmendmentMustChangeSomething() {
        assertTrue(rejected(() -> run(baseline(), baseline().getElections(), EVENT)).contains("At least one election differs"));
    }

    @Test
    void anAmendmentTakesEffectOnOrAfterItsEventDate() {
        assertTrue(rejected(() -> run(baseline(), elections(250_000, 400_000), Date.of(2026, 11, 6)))
            .contains("on or after its event date"));
    }

    @Test
    void electionsNeedBothPartiesInTheBaseCurrencyAndSomeMargin() {
        assertTrue(failedText(load(GmraElections.class, electionsDoc(250_000, 250_000, "EUR"))).contains("InBaseCurrency"));
        Map<String, Object> one = electionsDoc(250_000, 250_000, "USD");
        one.put("minimumTransferAmount", l(o("party", "Party1", "amount", money(250_000)), o("party", "Party1", "amount", money(250_000))));
        assertTrue(failedText(load(GmraElections.class, one)).contains("OnePerParty"));
        Map<String, Object> none = electionsDoc(250_000, 250_000, "USD");
        none.put("marginTransfer", o("cashMargin", false, "securitiesMargin", false, "transferBusinessDays", 1));
        assertTrue(failedText(load(GmraElections.class, none)).contains("SomeMargin"));
    }

    @Test
    void anotherKindOfAgreementIsNotGmraTerms() {
        Map<String, Object> csa = agreementDoc();
        csa.put("legalAgreementIdentification", o("agreementName", o("agreementType", "MasterAgreement",
            "masterAgreementType", o("@data", "ISDAMaster"))));
        String f = failedText(load(GmraTerms.class, o("agreement", csa, "counterparty", roles(), "elections", electionsDoc(250_000, 250_000, "USD"))));
        assertTrue(f.contains("IsGmra"), f);
    }
}
