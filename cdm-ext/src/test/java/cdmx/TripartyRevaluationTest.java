package cdmx;

import cdmx.collateral.triparty.TripartyDeposit;
import cdmx.collateral.triparty.TripartyMovementDirectionEnum;
import cdmx.collateral.triparty.TripartyRevaluation;
import cdmx.collateral.triparty.TripartyRevaluationOutcomeEnum;
import cdmx.collateral.triparty.TripartyValuedPosition;
import cdmx.collateral.triparty.functions.RevalueTriparty;
import com.rosetta.model.lib.records.Date;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import static cdmx.Cdm.*;
import static cdmx.Data.money;
import static cdmx.TripartyAllocationTest.deposit;
import static cdmx.TripartyAllocationTest.profile;
import static cdmx.TripartyTermsTest.TAGY;
import static cdmx.TripartyTermsTest.TUST;
import static org.junit.jupiter.api.Assertions.*;

/** The agent's revaluation of a settled repo (task-triparty-revaluation, wp-adr-triparty-revaluation), over the
 *  trade-start allocation of 3,000 tUST and 2,190 tAGY for 500,000 at 5%, revalued three days in, when the required
 *  value is 500,208.33. The baseline profile: tUST less 2%, tAGY less 3% and at most half of the required value. */
class TripartyRevaluationTest {
    static final String REQUIRED = "500208.33";

    static TripartyRevaluation revalue(String required, List<TripartyDeposit> held, List<TripartyDeposit> free) {
        return fn(RevalueTriparty.class).evaluate("0xbasis", Date.of(2026, 11, 15), load(cdm.observable.asset.Money.class, money(new BigDecimal(required))),
                new ArrayList<>(held), new ArrayList<>(free), profile());
    }

    static void units(TripartyValuedPosition p, String isin, long units) {
        assertEquals(isin, p.getIsin());
        assertEquals(0, BigDecimal.valueOf(units).compareTo(p.getUnits()), isin);
    }

    static void value(String expected, cdm.observable.asset.Money m) {
        assertEquals(0, new BigDecimal(expected).compareTo(m.getValue()), () -> expected + " vs " + m.getValue());
    }

    @Test
    void aPriceFallIsToppedUpFromTheFreeAccountWithinTheLimit() {
        // tUST 96.0 (94.08 a unit) and tAGY 97.0 (94.09): 282,240 + 206,057.10 = 488,297.10, 11,911.23 short.
        // 127 free tAGY (11,949.43) cover it; tAGY then 2,317 units, 43.6% of the required value.
        var r = revalue(REQUIRED, List.of(deposit(1, TUST, 3_000, "96.0"), deposit(2, TAGY, 2_190, "97.0")), List.of(deposit(2, TAGY, 1_810, "97.0")));
        assertEquals("", failedText(r));
        assertEquals(TripartyRevaluationOutcomeEnum.TOP_UP, r.getOutcome());
        value("488297.10", r.getValueBefore());
        assertEquals(1, r.getMovements().size());
        assertEquals(TAGY, r.getMovements().get(0).getIsin());
        assertEquals(0, BigDecimal.valueOf(127).compareTo(r.getMovements().get(0).getUnits()));
        assertEquals(TripartyMovementDirectionEnum.TOP_UP, r.getMovements().get(0).getDirection());
        units(r.getHeldAfter().get(0), TUST, 3_000);
        units(r.getHeldAfter().get(1), TAGY, 2_317);
        value("500246.53", r.getValueAfter());
        assertNull(r.getBreaches());
    }

    @Test
    void aTopUpTakesTheGiversRankingFirst() {
        // Free tUST ranked first covers the shortfall alone: 127 tUST (11,948.16); the free tAGY is not used.
        var r = revalue(REQUIRED, List.of(deposit(1, TUST, 3_000, "96.0"), deposit(2, TAGY, 2_190, "97.0")),
                List.of(deposit(1, TUST, 500, "96.0"), deposit(2, TAGY, 1_810, "97.0")));
        assertEquals(TripartyRevaluationOutcomeEnum.TOP_UP, r.getOutcome());
        assertEquals(1, r.getMovements().size());
        assertEquals(TUST, r.getMovements().get(0).getIsin());
        assertEquals(0, BigDecimal.valueOf(127).compareTo(r.getMovements().get(0).getUnits()));
        units(r.getHeldAfter().get(0), TUST, 3_127);
        units(r.getHeldAfter().get(1), TAGY, 2_190);
    }

    @Test
    void aTopUpCanAddAnAssetNotHeldBefore() {
        // 5,100 tUST (479,808) leave 20,400.33; 217 free tAGY (20,417.53) cover it as a new position.
        var r = revalue(REQUIRED, List.of(deposit(1, TUST, 5_100, "96.0")), List.of(deposit(2, TAGY, 1_810, "97.0")));
        assertEquals("", failedText(r));
        assertEquals(TripartyRevaluationOutcomeEnum.TOP_UP, r.getOutcome());
        assertEquals(2, r.getHeldAfter().size());
        units(r.getHeldAfter().get(0), TUST, 5_100);
        units(r.getHeldAfter().get(1), TAGY, 217);
    }

    @Test
    void aShortfallTheFreeAccountCannotCoverMovesNothing() {
        // 100 free tAGY (9,409) cannot cover 11,911.23: recorded as uncovered.
        var r = revalue(REQUIRED, List.of(deposit(1, TUST, 3_000, "96.0"), deposit(2, TAGY, 2_190, "97.0")), List.of(deposit(2, TAGY, 100, "97.0")));
        assertEquals("", failedText(r));
        assertEquals(TripartyRevaluationOutcomeEnum.UNCOVERED, r.getOutcome());
        assertNull(r.getMovements());
        units(r.getHeldAfter().get(1), TAGY, 2_190);
        value("488297.10", r.getValueAfter());
    }

    @Test
    void theLimitCapsATopUpWithTheUnitsAlreadyHeld() {
        // tAGY is capped at 2,658 units (half of 500,208.33 at 94.09): only 468 more may be added to the 2,190 held.
        // With tUST at 80 (78.40) the shortfall is 46,543.23, which 468 tAGY (44,034.12) cannot cover: uncovered.
        var r = revalue(REQUIRED, List.of(deposit(1, TUST, 3_000, "80.0"), deposit(2, TAGY, 2_190, "97.0")), List.of(deposit(2, TAGY, 1_810, "97.0")));
        assertEquals(TripartyRevaluationOutcomeEnum.UNCOVERED, r.getOutcome());
        assertNull(r.getMovements());
    }

    @Test
    void aPriceRiseReleasesFromTheAssetRankedLast() {
        // tUST 100 (98.00) and tAGY 101 (97.97): 294,000 + 214,554.30 = 508,554.30, 8,345.97 above the required value.
        // 85 tAGY (8,327.45) are released, leaving 500,226.85.
        var r = revalue(REQUIRED, List.of(deposit(1, TUST, 3_000, "100.0"), deposit(2, TAGY, 2_190, "101.0")), List.of());
        assertEquals("", failedText(r));
        assertEquals(TripartyRevaluationOutcomeEnum.RELEASE, r.getOutcome());
        assertEquals(1, r.getMovements().size());
        assertEquals(TAGY, r.getMovements().get(0).getIsin());
        assertEquals(0, BigDecimal.valueOf(85).compareTo(r.getMovements().get(0).getUnits()));
        assertEquals(TripartyMovementDirectionEnum.RELEASE, r.getMovements().get(0).getDirection());
        units(r.getHeldAfter().get(1), TAGY, 2_105);
        value("500226.85", r.getValueAfter());
    }

    @Test
    void theNextAssetIsReleasedOnlyOnceTheOneRankedAfterItIsReleasedInFull() {
        // Required 290,000 against 3,000 tUST (294,000) and 100 tAGY (9,797): all 100 tAGY go, then 40 tUST (3,920).
        var r = revalue("290000", List.of(deposit(1, TUST, 3_000, "100.0"), deposit(2, TAGY, 100, "101.0")), List.of());
        assertEquals("", failedText(r));
        assertEquals(TripartyRevaluationOutcomeEnum.RELEASE, r.getOutcome());
        assertEquals(1, r.getHeldAfter().size());
        units(r.getHeldAfter().get(0), TUST, 2_960);
        value("290080", r.getValueAfter());
    }

    @Test
    void collateralWorthTheRequiredValueMovesNothing() {
        var r = revalue("488297.10", List.of(deposit(1, TUST, 3_000, "96.0"), deposit(2, TAGY, 2_190, "97.0")), List.of(deposit(2, TAGY, 1_810, "97.0")));
        assertEquals("", failedText(r));
        assertEquals(TripartyRevaluationOutcomeEnum.UNCHANGED, r.getOutcome());
        assertNull(r.getMovements());
    }

    @Test
    void aBreachCausedByPricesAloneIsRecorded() {
        // tUST 80 (78.40) and tAGY 120 (116.40): tAGY's 254,916 is 50.96% of the required value; nothing free.
        var r = revalue(REQUIRED, List.of(deposit(1, TUST, 3_000, "80.0"), deposit(2, TAGY, 2_190, "120.0")), List.of());
        assertEquals(TripartyRevaluationOutcomeEnum.UNCOVERED, r.getOutcome());
        assertEquals(1, r.getBreaches().size());
        assertEquals(TAGY, r.getBreaches().get(0).getIsin());
    }
}
