package collateral;

import cdm.event.common.TradeState;
import cdmx.collateral.gmra.GmraElections;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** Repo margin maintenance in the service (task-repo-margin-maintenance, wp-adr-repo-margin-maintenance). */
class CdmRepoMarginTest {
    private static final LocalDate DAY = LocalDate.of(2026, 11, 9);

    static GmraElections elections() {
        return CdmGmra.baseline("BANK-A", "BANK-B").terms().getElections();
    }

    static TradeState trade() {
        return CdmRepo.book(CdmRepoTest.terms(1_000_000)).trade();
    }

    @Test
    void theTwoSidesAreOppositeAndABuyerIsExposedWhenTheSecuritiesFall() {
        // 1,020,000 - 10,366 x 90 = 87,060
        BigDecimal buyer = CdmRepoMargin.exposure(trade(), elections(), DAY, 10_366, new BigDecimal(90), false);
        BigDecimal seller = CdmRepoMargin.exposure(trade(), elections(), DAY, 10_366, new BigDecimal(90), true);
        assertEquals(0, new BigDecimal(87_060).compareTo(buyer.setScale(6, java.math.RoundingMode.HALF_UP)));
        assertEquals(0, buyer.negate().compareTo(seller));
    }

    @Test
    void aBuySellBackIncomeDeductionLowersTheBuyersExposureByTheDeductionTimesTheMarginRatio() {
        // 87,060 - 5,186 x 1.02 = 81,770.28 (wp-adr-repo-buy-sell-back)
        BigDecimal buyer = CdmRepoMargin.exposure(trade(), elections(), DAY, 10_366, new BigDecimal(90), false, 5_186);
        assertEquals(0, new BigDecimal("81770.28").compareTo(buyer.setScale(2, java.math.RoundingMode.HALF_UP)));
    }

    @Test
    void aCallIsWholeUsdRoundedDownAboveTheMinimum() {
        assertEquals(300_000, CdmRepoMargin.callAmount(new BigDecimal("300000.9"), 250_000));
        assertEquals(0, CdmRepoMargin.callAmount(new BigDecimal(250_000), 250_000));
    }

    @Test
    void netExposureDeductsTheMarginHeld() {
        assertEquals(0, new BigDecimal(70_000).compareTo(CdmRepoMargin.netExposure(List.of(new BigDecimal(100_000), new BigDecimal(-10_000)), new BigDecimal(20_000))));
    }

    @Test
    void aGmraIssuanceNamesTheGmraAndACsaIssuanceDoesNot() {
        assertTrue(CdmRepoMargin.isGmraIssue(Cdm.issue("C-1", "BANK-A", 300_000, "Delivery", null, "VM", true).json));
        assertFalse(CdmRepoMargin.isGmraIssue(Cdm.issue("C-1", "BANK-A", 300_000, "Delivery", null, "VM").json));
    }

    @Test
    void theInterestStatementRebuildsAndATamperedOneIsRejected() {
        var s = CdmRepoMargin.build("BANK-B", "BANK-A", DAY, DAY.plusDays(7), 1_000_000, new BigDecimal("0.045"), elections());
        assertEquals(875, CdmRepoMargin.amount(s.statement()));
        assertTrue(CdmRepoMargin.isStatement(s.json()));
        assertEquals(875, CdmRepoMargin.amount(CdmRepoMargin.verify(s.json(), elections())));
        String tampered = s.json().replace("\"interest\":875", "\"interest\":900").replace("\"interest\" : 875", "\"interest\" : 900");
        assertNotEquals(s.json(), tampered);
        assertThrows(IllegalStateException.class, () -> CdmRepoMargin.verify(tampered, elections()));
    }
}
