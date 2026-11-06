package cdmx;

import cdm.base.staticdata.asset.common.AssetIdentifier;
import cdm.base.staticdata.party.CounterpartyRoleEnum;
import cdm.event.common.AgreementEvent;
import cdm.event.common.AgreementEventIntentEnum;
import cdm.event.common.functions.Create_AgreementEvent;
import cdm.legaldocumentation.common.LegalAgreement;
import cdm.legaldocumentation.csa.CreditSupportAgreementInitialMarginElections;
import cdm.product.collateral.EligibleCollateralSpecification;
import cdmx.collateral.amendment.CollateralAgreementAmendment;
import cdmx.collateral.amendment.HaircutChange;
import cdmx.collateral.amendment.functions.Create_CollateralAgreementAmendment;
import cdmx.collateral.amendment.functions.HaircutFor;
import cdmx.collateral.amendment.functions.InitialMarginElections;
import cdmx.collateral.amendment.functions.MinimumTransferAmountFor;
import cdmx.collateral.amendment.functions.Qualify_AgreementTermsChange;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.regnosys.rosetta.common.serialisation.RosettaObjectMapper;
import com.rosetta.model.lib.records.Date;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static cdmx.Cdm.*;
import static cdmx.ConcentrationTest.upTo;
import static org.junit.jupiter.api.Assertions.*;

/** Amendment of an IM CSA's terms (task-csa-amendment): the elections through CDM's Create_AgreementEvent, the
 *  eligibility schedule per asset. Baseline: CDM's published sample 01-2018-NY-Law-IM-CSA (common-domain-model 7.7.0,
 *  examples/samples/legal-agreements), Community Specification License 1.0. */
class AmendmentTest {
    private final Create_CollateralAgreementAmendment amend = fn(Create_CollateralAgreementAmendment.class);
    private static final String TUST = "US912810TM60";
    private static final String TMMF = "US9128100000";
    private static final String TUSD = "US0000000USD";
    private static final Date EVENT = Date.of(2026, 11, 6);

    static LegalAgreement sample() {
        try (var in = AmendmentTest.class.getResourceAsStream("/cdm-samples/01-2018-NY-Law-IM-CSA.json")) {
            return RosettaObjectMapper.getNewRosettaObjectMapper().readValue(in, LegalAgreement.class);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    static CreditSupportAgreementInitialMarginElections elections(LegalAgreement a) {
        return fn(InitialMarginElections.class).evaluate(a);
    }

    /** The elections with PARTY_2's (the posting party's) fixed Minimum Transfer Amount changed. */
    static CreditSupportAgreementInitialMarginElections withMta(CreditSupportAgreementInitialMarginElections e, long usd) {
        try {
            ObjectNode tree = JSON.valueToTree(e);
            for (var pe : tree.path("creditSupportObligations").path("minimumTransferAmount").path("partyElection"))
                if (pe.path("party").asText().equals("Party2"))
                    ((ObjectNode) pe.path("fixedAmount").path("amount")).put("value", usd);
            return JSON.treeToValue(tree, CreditSupportAgreementInitialMarginElections.class);
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    static Map<String, Object> asset(String isin) {
        return o("identifier", o("@data", isin), "identifierType", "ISIN");
    }

    static Map<String, Object> criterion(String isin, double haircut, Object... limits) {
        Map<String, Object> t = o("isIncluded", true, "valuationTreatment", o("haircutPercentage", haircut));
        if (limits.length > 0) t.put("concentrationLimit", l(limits));
        return o("collateralCriteria", o("@type", "cdm.base.staticdata.asset.common.AssetIdentifier", "identifier", o("@data", isin), "identifierType", "ISIN"),
            "treatment", t);
    }

    /** The prototype's schedule: tUST 2%, tMMF 4% up to 50% of the collateral, tUSD 0%. */
    static EligibleCollateralSpecification schedule() {
        return load(EligibleCollateralSpecification.class,
            o("criteria", l(criterion(TUST, 0.02), criterion(TMMF, 0.04, upTo(0.5)), criterion(TUSD, 0.0))));
    }

    static HaircutChange change(String isin, boolean included, Double haircut) {
        Map<String, Object> m = o("asset", asset(isin), "isIncluded", included);
        if (haircut != null) m.put("haircutPercentage", haircut);
        return load(HaircutChange.class, m);
    }

    private static BigDecimal haircut(EligibleCollateralSpecification s, String isin) {
        return fn(HaircutFor.class).evaluate(s, load(AssetIdentifier.class, asset(isin)));
    }

    private static long mta(CreditSupportAgreementInitialMarginElections e, CounterpartyRoleEnum p) {
        return fn(MinimumTransferAmountFor.class).evaluate(e, p).getValue().longValueExact();
    }

    @Test
    void theCdmSampleIsAValidImCsa() {
        LegalAgreement a = sample();
        assertEquals("", failedText(a));
        assertEquals(30_000, mta(elections(a), CounterpartyRoleEnum.PARTY_2));
        assertEquals("", failedText(schedule()));
        assertEquals(0, new BigDecimal("0.04").compareTo(haircut(schedule(), TMMF)));
    }

    @Test
    void aChangedMinimumTransferAmountAmendsTheAgreementThroughCdmsAgreementEvent() {
        LegalAgreement before = sample();
        CollateralAgreementAmendment m = amend.evaluate(before, withMta(elections(before), 250_000), schedule(), List.of(), EVENT, EVENT);
        AgreementEvent e = m.getAgreementEvent();
        assertEquals("AgreementTermsChange", e.getEventQualifier());
        assertEquals(List.of(AgreementEventIntentEnum.AMENDED_TERMS), e.getIntent());
        LegalAgreement after = e.getAfter().get(0);
        assertEquals(250_000, mta(elections(after), CounterpartyRoleEnum.PARTY_2));
        assertEquals(30_000, mta(elections(after), CounterpartyRoleEnum.PARTY_1));
        assertEquals(30_000, mta(elections(before), CounterpartyRoleEnum.PARTY_2));  // the agreement before is unchanged
        assertEquals(schedule(), m.getScheduleAfter());
        assertEquals("", failedText(m));
    }

    @Test
    void aHaircutChangeReplacesThatAssetsCriterionAndKeepsItsConcentrationLimit() {
        CollateralAgreementAmendment m = amend.evaluate(sample(), null, schedule(), List.of(change(TMMF, true, 0.10)), EVENT, EVENT);
        assertNull(m.getAgreementEvent());
        assertEquals(0, new BigDecimal("0.10").compareTo(haircut(m.getScheduleAfter(), TMMF)));
        assertEquals(0, new BigDecimal("0.02").compareTo(haircut(m.getScheduleAfter(), TUST)));
        assertEquals(3, m.getScheduleAfter().getCriteria().size());
        var tmmf = m.getScheduleAfter().getCriteria().get(2);
        assertEquals(1, tmmf.getTreatment().getConcentrationLimit().size());
        assertEquals(0, new BigDecimal("0.04").compareTo(haircut(m.getScheduleBefore(), TMMF)));
        assertEquals("", failedText(m));
    }

    @Test
    void anAssetCanBeExcludedOrAdded() {
        String other = "US912828ZZ00";
        CollateralAgreementAmendment m = amend.evaluate(sample(), null, schedule(),
            List.of(change(TUST, false, null), change(other, true, 0.05)), EVENT, EVENT);
        assertNull(haircut(m.getScheduleAfter(), TUST));
        assertEquals(0, new BigDecimal("0.05").compareTo(haircut(m.getScheduleAfter(), other)));
        assertEquals(4, m.getScheduleAfter().getCriteria().size());
    }

    @Test
    void electionsAndHaircutsChangeTogether() {
        LegalAgreement before = sample();
        CollateralAgreementAmendment m = amend.evaluate(before, withMta(elections(before), 400_000), schedule(),
            List.of(change(TMMF, true, 0.05)), EVENT, Date.of(2026, 11, 9));
        assertEquals(400_000, mta(elections(m.getAgreementEvent().getAfter().get(0)), CounterpartyRoleEnum.PARTY_2));
        assertEquals(0, new BigDecimal("0.05").compareTo(haircut(m.getScheduleAfter(), TMMF)));
        assertEquals(Date.of(2026, 11, 9), m.getAgreementEvent().getEffectiveDate());
    }

    @Test
    void anAmendmentThatChangesNothingIsRejected() {
        LegalAgreement before = sample();
        assertTrue(rejected(() -> amend.evaluate(before, null, schedule(), List.of(), EVENT, EVENT)).contains("schedule or both"));
        assertTrue(rejected(() -> amend.evaluate(before, elections(before), schedule(), List.of(), EVENT, EVENT)).contains("differ"));
    }

    @Test
    void oneChangePerAssetAndAnEffectiveDateNotBeforeTheEvent() {
        assertTrue(rejected(() -> amend.evaluate(sample(), null, schedule(),
            List.of(change(TMMF, true, 0.1), change(TMMF, true, 0.2)), EVENT, EVENT)).contains("One change per asset"));
        assertTrue(rejected(() -> amend.evaluate(sample(), null, schedule(), List.of(change(TMMF, true, 0.1)), EVENT,
            Date.of(2026, 11, 5))).contains("on or after"));
    }

    @Test
    void aHaircutChangeIsCheckedByItsConditions() {
        assertTrue(failedText(change(TMMF, true, 1.0)).contains("HaircutRange"));
        assertTrue(failedText(change(TMMF, true, null)).contains("IncludedHasHaircut"));
    }

    @Test
    void cdmsOwnEventIsQualifiedOnlyWhenTheTermsChange() {
        LegalAgreement before = sample();
        var instruction = load(cdm.event.common.AgreementInstruction.class, o(
            "primitiveInstruction", l(o("termsChange", o("imCSATermsChange", JSON.convertValue(elections(before), Map.class))))));
        instruction = instruction.toBuilder().setBeforeValue(before).build();
        AgreementEvent same = fn(Create_AgreementEvent.class).evaluate(List.of(instruction), List.of(), EVENT, EVENT);
        assertNull(same.getEventQualifier());  // CDM leaves it empty
        assertFalse(fn(Qualify_AgreementTermsChange.class).evaluate(same));  // the agreement does not change
    }

    @Test
    void theAmendmentSurvivesARuneJsonRoundTrip() throws Exception {
        LegalAgreement before = sample();
        CollateralAgreementAmendment m = amend.evaluate(before, withMta(elections(before), 250_000), schedule(),
            List.of(change(TMMF, true, 0.1)), EVENT, EVENT);
        assertEquals(m, JSON.readValue(toJson(m), CollateralAgreementAmendment.class));
    }

    @Test
    void cdmsCloneEligibleCollateralWithChangedTreatmentOverwritesTheFirstCriterion() {
        // CDM 7.7.0: asked to change tMMF's treatment, the function writes the changed criterion and treatment into the
        // first criterion (tUST), so tUST leaves the schedule and tMMF appears twice. ApplyHaircutChanges replaces the
        // matching criterion instead.
        var tmmf = schedule().getCriteria().get(1).getCollateralCriteria();
        var treatment = load(cdm.product.collateral.CollateralTreatment.class,
            o("isIncluded", true, "valuationTreatment", o("haircutPercentage", 0.1)));
        var out = fn(cdm.product.collateral.functions.CloneEligibleCollateralWithChangedTreatment.class).evaluate(schedule(), tmmf, treatment);
        List<String> ids = out.getCriteria().stream()
            .map(c -> c.getCollateralCriteria().getAssetIdentifier().getIdentifier().getValue()).toList();
        assertEquals(List.of(TMMF, TMMF, TUSD), ids);
        assertNull(haircut(out, TUST));
        assertEquals(0, new BigDecimal("0.10").compareTo(out.getCriteria().get(0).getTreatment().getValuationTreatment().getHaircutPercentage()));
    }
}
