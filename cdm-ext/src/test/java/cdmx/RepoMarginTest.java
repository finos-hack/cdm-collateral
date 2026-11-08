package cdmx;

import cdm.event.common.TradeState;
import cdmx.collateral.gmra.GmraElections;
import cdmx.collateral.gmra.MarginRatioBasisEnum;
import cdmx.collateral.gmra.NetMarginInterest;
import cdmx.collateral.repo.functions.RepoAccruedPriceDifferential;
import cdmx.collateral.repo.functions.RepoMarginCallAmount;
import cdmx.collateral.repo.functions.RepoMarginRatio;
import cdmx.collateral.repo.functions.RepoNetExposure;
import cdmx.collateral.repo.functions.RepoNetMarginInterest;
import cdmx.collateral.repo.functions.RepoPurchasePriceForMarketValue;
import cdmx.collateral.repo.functions.RepoRepriceCashDifference;
import cdmx.collateral.repo.functions.RepoRepricedPurchasePrice;
import cdmx.collateral.repo.functions.RepoTransactionExposure;
import com.rosetta.model.lib.records.Date;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

import static cdmx.Cdm.fn;
import static org.junit.jupiter.api.Assertions.*;

/** Margin maintenance on repos (task-repo-margin-maintenance, wp-adr-repo-margin-maintenance). */
class RepoMarginTest {
    static TradeState trade() {
        return RepoTest.sample().getAfter().get(0);
    }

    static GmraElections elections(MarginRatioBasisEnum basis, String defaultRatio) {
        return GmraElections.builder().setMarginRatioBasis(basis).setDefaultMarginRatio(new BigDecimal(defaultRatio)).build();
    }

    static void same(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual.setScale(10, RoundingMode.HALF_UP)), "was " + actual);
    }

    @Test
    void marginRatioFollowsTheBasisElection() {
        TradeState ts = trade();
        same("1.02", fn(RepoMarginRatio.class).evaluate(ts, elections(MarginRatioBasisEnum.PER_TRANSACTION, "1.05")));
        same("1.05", fn(RepoMarginRatio.class).evaluate(ts, elections(MarginRatioBasisEnum.AGREEMENT_DEFAULT, "1.05")));
    }

    @Test
    void transactionExposureIsAccruedRepurchasePriceTimesRatioLessMarketValue() {
        // (1,000,000 + 1,000,000 x 4.5% x 2 / 360) x 1.02 - 10,366 x 95 = 1,020,255 - 984,770 = 35,485
        same("35485", fn(RepoTransactionExposure.class).evaluate(trade(), Date.of(2026, 11, 11),
            new BigDecimal(10_366), new BigDecimal(95), new BigDecimal("1.02")));
    }

    @Test
    void transactionExposureIsNegativeWhenTheSecuritiesRise() {
        BigDecimal e = fn(RepoTransactionExposure.class).evaluate(trade(), Date.of(2026, 11, 9),
            new BigDecimal(10_366), new BigDecimal(100), new BigDecimal("1.02"));
        // 1,020,000 - 1,036,600
        same("-16600", e);
    }

    @Test
    void netExposureSumsBothDirectionsLessMarginHeld() {
        var f = fn(RepoNetExposure.class);
        same("15000", f.evaluate(List.of(new BigDecimal(35_000), new BigDecimal(-10_000)), new BigDecimal(10_000)));
        same("35000", f.evaluate(List.of(new BigDecimal(25_000)), new BigDecimal(-10_000)));
        same("0", f.evaluate(List.of(), BigDecimal.ZERO));
    }

    @Test
    void aCallNeedsNetExposureAboveTheMinimumTransferAmount() {
        var f = fn(RepoMarginCallAmount.class);
        same("15000", f.evaluate(new BigDecimal(15_000), new BigDecimal(10_000)));
        same("0", f.evaluate(new BigDecimal(10_000), new BigDecimal(10_000)));
        same("0", f.evaluate(new BigDecimal(-15_000), new BigDecimal(10_000)));
    }

    @Test
    void d2PurchasePriceDividesMarketValueByTheMarginRatio() {
        var f = fn(RepoPurchasePriceForMarketValue.class);
        BigDecimal pp = f.evaluate(new BigDecimal(1_020_000), new BigDecimal("1.02"));
        same("1000000", pp);
        assertTrue(pp.compareTo(new BigDecimal(1_020_000)) < 0, "the cash is below the market value");
    }

    @Test
    void repricedPurchasePriceIsMarketValueOverTheRatioRounded() {
        // 10,366 x 95 / 1.02 = 965,460.78
        same("965461", fn(RepoRepricedPurchasePrice.class).evaluate(new BigDecimal(10_366), new BigDecimal(95), new BigDecimal("1.02"), 0));
    }

    @Test
    void accruedPriceDifferentialIsRoundedToTheCashPrecision() {
        // 1,000,000 x 4.5% x 2 / 360 = 250
        same("250", fn(RepoAccruedPriceDifferential.class).evaluate(trade(), Date.of(2026, 11, 11), 0));
    }

    @Test
    void repriceCashDifferenceIsPurchasePricePlusAccruedLessNewPurchasePrice() {
        // 1,000,000 + 250 - 965,461: the securities fell, so the Seller pays the Buyer
        same("34789", fn(RepoRepriceCashDifference.class).evaluate(trade(), Date.of(2026, 11, 11), new BigDecimal(965_461), 0));
        // 1,000,250 - 1,016,275: the securities rose, so the Buyer pays the Seller
        same("-16025", fn(RepoRepriceCashDifference.class).evaluate(trade(), Date.of(2026, 11, 11), new BigDecimal(1_016_275), 0));
    }

    @Test
    void netMarginInterestAccruesAtRatePlusSpreadOnAct360() {
        NetMarginInterest terms = NetMarginInterest.builder().setSpread(new BigDecimal("0.001")).build();
        // 1,000,000 x (4.4% + 0.1%) x 7 / 360 = 875
        same("875", fn(RepoNetMarginInterest.class).evaluate(new BigDecimal(1_000_000), new BigDecimal("0.044"), 7, terms, 0));
    }
}
