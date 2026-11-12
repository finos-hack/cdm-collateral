package cdmx;

import cdm.base.staticdata.asset.common.AssetIdentifier;
import cdmx.collateral.amendment.functions.HaircutFor;
import cdmx.collateral.concentration.ConcentrationLimitBreach;
import cdmx.collateral.concentration.ValuedCollateral;
import cdmx.collateral.concentration.functions.ConcentrationLimitBreaches;
import cdmx.collateral.triparty.TripartyTerms;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static cdmx.Cdm.*;
import static cdmx.Data.money;
import static cdmx.Data.position;
import static org.junit.jupiter.api.Assertions.*;

/** Triparty terms and the collateral profile (task-triparty-terms-profile, wp-adr-triparty-terms-profile): BANK-A gives
 *  collateral to BANK-B through the agent BANK-T against the CSA baseline profile, tUST at 2% and tAGY at 3% up to half
 *  of the allocated value. */
class TripartyTermsTest {
    static final String TUST = "US912810TM60", TAGY = "US3137EAGY10", TMMF = "US9128100000";

    static Map<String, Object> party(String name) {
        return o("partyId", l(o("identifier", o("@data", name))), "name", o("@data", name));
    }

    static Map<String, Object> criterion(String isin, int haircutBps, Object... limits) {
        Map<String, Object> treatment = o("isIncluded", true, "valuationTreatment", o("haircutPercentage", BigDecimal.valueOf(haircutBps, 4)));
        if (limits.length > 0) treatment.put("concentrationLimit", l(limits));
        return o("collateralCriteria", o("@type", "cdm.base.staticdata.asset.common.AssetIdentifier",
                "identifier", o("@data", isin), "identifierType", "ISIN"), "treatment", treatment);
    }

    static Map<String, Object> profile() {
        return o("criteria", l(criterion(TUST, 200), criterion(TAGY, 300, o("percentageLimit", o("upperBound", o("number", 0.5, "inclusive", true))))));
    }

    static Map<String, Object> termsDoc(String giver, String receiver, String agent, String role) {
        return o("giver", party(giver), "receiver", party(receiver), "agent", o("partyReference", party(agent), "role", role),
                "gmraTermsHash", "0x" + "ab".repeat(32), "baseCurrency", "USD", "effectiveDate", "2026-11-12", "profile", profile());
    }

    static TripartyTerms terms() {
        return load(TripartyTerms.class, termsDoc("BANK-A", "BANK-B", "BANK-T", "TripartyAgent"));
    }

    static AssetIdentifier isin(String isin) {
        return load(AssetIdentifier.class, o("identifier", o("@data", isin), "identifierType", "ISIN"));
    }

    static ValuedCollateral valued(String isin, long value) {
        return load(ValuedCollateral.class, o("position", position(1_000, isin), "valueAfterHaircuts", money(value),
                "details", ConcentrationTest.details("Debt", "SovereignCentralBank", "US Treasury")));
    }

    @Test
    void theBaselineTermsAreValidAndTheProfileGivesItsHaircuts() {
        TripartyTerms t = terms();
        assertEquals("", failedText(t));
        HaircutFor h = fn(HaircutFor.class);
        assertEquals(0, new BigDecimal("0.02").compareTo(h.evaluate(t.getProfile(), isin(TUST))));
        assertEquals(0, new BigDecimal("0.03").compareTo(h.evaluate(t.getProfile(), isin(TAGY))));
        assertNull(h.evaluate(t.getProfile(), isin(TMMF)));
        assertEquals(toJson(t), toJson(load(TripartyTerms.class, termsDoc("BANK-A", "BANK-B", "BANK-T", "TripartyAgent"))));
    }

    /** The profile carries the tAGY limit, but CDM's CheckCriteria has no case for an AssetIdentifier criterion (its
     *  switch falls to default False), so ConcentrationLimitBreaches, which checks each criterion with it, finds no
     *  collateral under the limit: 60% tAGY gives no breach. HaircutFor matches the same criterion by ISIN. */
    @Test
    void cdmsCriteriaCheckDoesNotMatchTheProfilesIsinCriteria() {
        TripartyTerms t = terms();
        assertEquals(0, new BigDecimal("0.5").compareTo(t.getProfile().getCriteria().get(1).getTreatment().getConcentrationLimit().get(0)
                .getPercentageLimit().getUpperBound().getNumber()));
        List<? extends ConcentrationLimitBreach> over = fn(ConcentrationLimitBreaches.class)
                .evaluate(t.getProfile(), new ArrayList<>(List.of(valued(TUST, 400_000), valued(TAGY, 600_000))), "USD");
        assertTrue(over.isEmpty());
    }

    @Test
    void theTermsRefuseTwoPartiesAnotherRoleOrAnEmptyProfile() {
        assertTrue(failedText(load(TripartyTerms.class, termsDoc("BANK-A", "BANK-A", "BANK-T", "TripartyAgent"))).contains("ThreeParties"));
        assertTrue(failedText(load(TripartyTerms.class, termsDoc("BANK-A", "BANK-B", "BANK-B", "TripartyAgent"))).contains("ThreeParties"));
        assertTrue(failedText(load(TripartyTerms.class, termsDoc("BANK-A", "BANK-B", "BANK-T", "Custodian"))).contains("AgentRole"));
        Map<String, Object> none = termsDoc("BANK-A", "BANK-B", "BANK-T", "TripartyAgent");
        none.put("profile", o("criteria", l(o("collateralCriteria", o("@type", "cdm.base.staticdata.asset.common.AssetIdentifier",
                "identifier", o("@data", TMMF), "identifierType", "ISIN"), "treatment", o("isIncluded", false)))));
        assertTrue(failedText(load(TripartyTerms.class, none)).contains("ProfileIncludesAnAsset"));
    }
}
