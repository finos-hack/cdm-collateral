package cdmx;

import cdmx.collateral.triparty.TripartyDeposit;
import cdmx.collateral.triparty.TripartyMovementDirectionEnum;
import cdmx.collateral.triparty.TripartySubstitution;
import cdmx.collateral.triparty.TripartySubstitutionOutcomeEnum;
import cdmx.collateral.triparty.TripartyValuedPosition;
import cdmx.collateral.triparty.functions.SubstituteTriparty;
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

/** The agent's substitution (task-triparty-substitution, wp-adr-triparty-substitution) over the trade-start holding of
 *  3,000 tUST (96.432 a unit after haircuts) and 2,190 tAGY (96.224) for a required value of 500,000, the live spec's
 *  numbers. The baseline profile: tUST less 2%, tAGY less 3% and at most half of the required value. */
class TripartySubstitutionTest {
    static TripartySubstitution substitute(String required, List<TripartyDeposit> held, List<TripartyDeposit> free, String isin, long units) {
        return fn(SubstituteTriparty.class).evaluate("0xrequest", "0xbasis", Date.of(2026, 11, 13), load(cdm.observable.asset.Money.class, money(new BigDecimal(required))),
                new ArrayList<>(held), new ArrayList<>(free), isin, BigDecimal.valueOf(units), profile());
    }

    static List<TripartyDeposit> start() {
        return List.of(deposit(1, TUST, 3_000, "98.4"), deposit(2, TAGY, 2_190, "99.2"));
    }

    static void units(TripartyValuedPosition p, String isin, long units) {
        assertEquals(isin, p.getIsin());
        assertEquals(0, BigDecimal.valueOf(units).compareTo(p.getUnits()), isin);
    }

    @Test
    void returnedUnitsAreReplacedFromTheFreeAccountWithoutTheReturnedAsset() {
        // 1,000 tAGY back leaves 403,802.56, 96,197.44 short; 998 free tUST (96,239.14) replace them, not free tAGY.
        var s = substitute("500000", start(), List.of(deposit(1, TUST, 1_500, "98.4"), deposit(2, TAGY, 1_810, "99.2")), TAGY, 1_000);
        assertEquals("", failedText(s));
        assertEquals(TripartySubstitutionOutcomeEnum.SUBSTITUTED, s.getOutcome());
        assertEquals(2, s.getMovements().size());
        assertEquals(TAGY, s.getMovements().get(0).getIsin());
        assertEquals(TripartyMovementDirectionEnum.RELEASE, s.getMovements().get(0).getDirection());
        assertEquals(TUST, s.getMovements().get(1).getIsin());
        assertEquals(0, BigDecimal.valueOf(998).compareTo(s.getMovements().get(1).getUnits()));
        units(s.getHeldAfter().get(0), TUST, 3_998);
        units(s.getHeldAfter().get(1), TAGY, 1_190);
        assertEquals(0, new BigDecimal("500041.696").compareTo(s.getValueAfter().getValue()));
    }

    @Test
    void aRequestTheFreeAccountCannotReplaceIsDeclined() {
        // After the first substitution: the remaining 1,190 tAGY back leaves 385,535.14; 502 free tUST cannot cover it.
        var s = substitute("500000", List.of(deposit(1, TUST, 3_998, "98.4"), deposit(2, TAGY, 1_190, "99.2")),
                List.of(deposit(1, TUST, 502, "98.4"), deposit(2, TAGY, 2_810, "99.2")), TAGY, 1_190);
        assertEquals("", failedText(s));
        assertEquals(TripartySubstitutionOutcomeEnum.DECLINED, s.getOutcome());
        assertNull(s.getMovements());
        units(s.getHeldAfter().get(1), TAGY, 1_190);
    }

    @Test
    void moreUnitsThanTheRepoHoldsIsDeclined() {
        var s = substitute("500000", start(), List.of(deposit(1, TUST, 9_000, "98.4")), TAGY, 3_000);
        assertEquals(TripartySubstitutionOutcomeEnum.DECLINED, s.getOutcome());
    }

    @Test
    void theLimitCapsAReplacementWithTheUnitsStillHeld() {
        // 1,000 tUST back leaves 96,405.44 short; tAGY may grow from 2,190 to 2,598 units only (39,259.39): declined.
        var s = substitute("500000", start(), List.of(deposit(2, TAGY, 1_810, "99.2")), TUST, 1_000);
        assertEquals(TripartySubstitutionOutcomeEnum.DECLINED, s.getOutcome());
    }

    @Test
    void aHoldingStillCoveredAfterTheReturnNeedsNoReplacement() {
        var s = substitute("400000", start(), List.of(deposit(1, TUST, 1_500, "98.4")), TAGY, 1_000);
        assertEquals("", failedText(s));
        assertEquals(TripartySubstitutionOutcomeEnum.SUBSTITUTED, s.getOutcome());
        assertEquals(1, s.getMovements().size());
        units(s.getHeldAfter().get(1), TAGY, 1_190);
    }

    @Test
    void aWholePositionReturnedLeavesTheHolding() {
        // All 2,190 tAGY (210,730.56) back: 2,186 free tUST (210,800.35) replace them; tAGY leaves the holding.
        var s = substitute("500000", start(), List.of(deposit(1, TUST, 2_500, "98.4")), TAGY, 2_190);
        assertEquals("", failedText(s));
        assertEquals(TripartySubstitutionOutcomeEnum.SUBSTITUTED, s.getOutcome());
        assertEquals(1, s.getHeldAfter().size());
        units(s.getHeldAfter().get(0), TUST, 5_186);
    }
}
