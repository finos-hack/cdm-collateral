package cdmx;

import cdm.product.collateral.EligibleCollateralSpecification;
import cdmx.collateral.triparty.TripartyAllocation;
import cdmx.collateral.triparty.TripartyConcentrationBreach;
import cdmx.collateral.triparty.TripartyDeposit;
import cdmx.collateral.triparty.TripartyRepoRequest;
import cdmx.collateral.triparty.TripartyValuedPosition;
import cdmx.collateral.triparty.functions.AllocateTriparty;
import cdmx.collateral.triparty.functions.TripartyConcentrationBreaches;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static cdmx.Cdm.*;
import static cdmx.Data.money;
import static cdmx.TripartyTermsTest.TAGY;
import static cdmx.TripartyTermsTest.TMMF;
import static cdmx.TripartyTermsTest.TUST;
import static org.junit.jupiter.api.Assertions.*;

/** The agent's allocation at trade start (task-triparty-trade-start, wp-adr-triparty-trade-start), with the numbers of
 *  the live spec: a 500,000 repo against the baseline profile, tUST at 98.4 less 2% (96.432 a unit) ranked first and
 *  tAGY at 99.2 less 3% (96.224 a unit) up to half of the Purchase Price (at most 2,598 units). */
class TripartyAllocationTest {

    static EligibleCollateralSpecification profile() {
        return load(EligibleCollateralSpecification.class, TripartyTermsTest.profile());
    }

    static TripartyRepoRequest request(long purchasePrice) {
        return load(TripartyRepoRequest.class, o("termsHash", "0x" + "cd".repeat(32), "tradeId", "TP-1",
                "purchasePrice", money(purchasePrice), "repoRate", 0.05, "purchaseDate", "2026-11-12", "repurchaseDate", "2026-12-12"));
    }

    static TripartyDeposit deposit(int rank, String isin, long units, String price) {
        return load(TripartyDeposit.class, o("rank", rank, "isin", isin, "units", units, "unitPrice", money(new BigDecimal(price))));
    }

    static TripartyAllocation allocate(long purchasePrice, TripartyDeposit... deposits) {
        return fn(AllocateTriparty.class).evaluate(request(purchasePrice), "0xrequest", new ArrayList<>(List.of(deposits)), profile());
    }

    static void units(TripartyValuedPosition p, String isin, long units) {
        assertEquals(isin, p.getIsin());
        assertEquals(0, BigDecimal.valueOf(units).compareTo(p.getUnits()), isin);
    }

    @Test
    void aDepositShortOfThePurchasePriceWithinTheLimitAllocatesNothing() {
        // 2,000 tUST (192,864) and tAGY capped at 2,598 units (249,989.95): 442,853.95 < 500,000.
        TripartyAllocation a = allocate(500_000, deposit(1, TUST, 2_000, "98.4"), deposit(2, TAGY, 4_000, "99.2"));
        assertEquals("", failedText(a));
        assertFalse(a.getCoversPurchasePrice());
        assertNull(a.getPositions());
        assertEquals(0, BigDecimal.ZERO.compareTo(a.getAllocatedValue().getValue()));
    }

    @Test
    void theAllocationTakesTheGiversRankingAndStaysWithinTheLimit() {
        // 3,000 tUST (289,296) leave 210,704, which 2,190 tAGY (210,730.56) cover: tAGY at about 42%.
        TripartyAllocation a = allocate(500_000, deposit(1, TUST, 3_000, "98.4"), deposit(2, TAGY, 4_000, "99.2"));
        assertEquals("", failedText(a));
        assertTrue(a.getCoversPurchasePrice());
        assertEquals(2, a.getPositions().size());
        units(a.getPositions().get(0), TUST, 3_000);
        units(a.getPositions().get(1), TAGY, 2_190);
        assertEquals(0, new BigDecimal("500026.56").compareTo(a.getAllocatedValue().getValue()));
        assertEquals(0, new BigDecimal("0.03").compareTo(a.getPositions().get(1).getHaircutPercentage()));
        assertTrue(fn(TripartyConcentrationBreaches.class).evaluate(profile(), new ArrayList<>(a.getPositions()), a.getRequiredValue()).isEmpty());
    }

    @Test
    void anAssetUnderALimitRankedFirstIsCappedAndTheNextAssetFillsTheRest() {
        // tAGY first: capped at 2,598 units (249,989.95), then 2,593 tUST (250,048.18) cover the remaining 250,010.05.
        TripartyAllocation a = allocate(500_000, deposit(1, TAGY, 4_000, "99.2"), deposit(2, TUST, 5_000, "98.4"));
        assertTrue(a.getCoversPurchasePrice());
        units(a.getPositions().get(0), TAGY, 2_598);
        units(a.getPositions().get(1), TUST, 2_593);
        assertTrue(fn(TripartyConcentrationBreaches.class).evaluate(profile(), new ArrayList<>(a.getPositions()), a.getRequiredValue()).isEmpty());
    }

    @Test
    void anAssetOutsideTheProfileIsNotAllocated() {
        TripartyAllocation a = allocate(500_000, deposit(1, TMMF, 1_000_000, "1"), deposit(2, TUST, 6_000, "98.4"));
        assertTrue(a.getCoversPurchasePrice());
        assertEquals(1, a.getPositions().size());
        units(a.getPositions().get(0), TUST, 5_186);
    }

    /** The per-ISIN check finds the 60% tAGY that CDM's ConcentrationLimitBreaches does not (defect D30). */
    @Test
    void thePerIsinCheckFindsTheBreachCdmsCheckMisses() {
        Map<String, Object> agy = o("isin", TAGY, "units", 6_236, "unitPrice", money(new BigDecimal("99.2")),
                "haircutPercentage", 0.03, "valueAfterHaircuts", money(600_000));
        Map<String, Object> ust = o("isin", TUST, "units", 4_148, "unitPrice", money(new BigDecimal("98.4")),
                "haircutPercentage", 0.02, "valueAfterHaircuts", money(400_000));
        List<? extends TripartyConcentrationBreach> over = fn(TripartyConcentrationBreaches.class).evaluate(profile(),
                new ArrayList<>(List.of(load(TripartyValuedPosition.class, ust), load(TripartyValuedPosition.class, agy))),
                load(cdm.observable.asset.Money.class, money(1_000_000)));
        assertEquals(1, over.size());
        assertEquals(TAGY, over.get(0).getIsin());
        assertEquals(0, new BigDecimal("0.6").compareTo(over.get(0).getPercentage()));
    }

    @Test
    void anAllocationThatCoversNothingCannotCarryARepo() {
        TripartyAllocation a = allocate(500_000, deposit(1, TUST, 10, "98.4")).toBuilder()
                .setTrade(load(cdm.event.common.TradeState.class, o())).build();
        assertTrue(failedText(a).contains("NothingWhenUncovered"), failedText(a));
    }

    @Test
    void theRequestNeedsAPositivePriceAndARepurchaseAfterThePurchase() {
        assertEquals("", failedText(request(500_000)));
        TripartyRepoRequest bad = request(0).toBuilder().setRepurchaseDate(com.rosetta.model.lib.records.Date.of(2026, 11, 1)).build();
        assertTrue(failedText(bad).contains("PositivePurchasePrice"));
        assertTrue(failedText(bad).contains("RepurchaseAfterPurchase"));
    }
}
