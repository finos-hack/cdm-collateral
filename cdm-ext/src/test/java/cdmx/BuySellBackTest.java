package cdmx;

import cdm.event.common.TradeState;
import cdmx.collateral.repo.BuySellBackIncome;
import cdmx.collateral.repo.functions.BuySellBackIncomeDeduction;
import cdmx.collateral.repo.functions.BuySellBackSellBackPrice;
import cdmx.collateral.repo.functions.RepoIsBuySellBack;
import cdmx.collateral.repo.functions.RepoPairOffMatches;
import cdmx.collateral.repo.functions.RepoPairOffNetAmount;
import com.rosetta.model.lib.records.Date;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static cdmx.Cdm.*;
import static cdmx.RepoTest.*;
import static org.junit.jupiter.api.Assertions.*;

/** Buy/sell-back economics (task-repo-buy-sell-back, wp-adr-repo-buy-sell-back): CDM's trade type and qualification, the
 *  income deduction and the Sell Back Price, and pair-off only within one type. */
class BuySellBackTest {
    static final BigDecimal ZERO = BigDecimal.ZERO;

    @SuppressWarnings("unchecked")
    static TradeState trade(String id, String seller, String buyer, String rate, boolean buySellBack) {
        Map<String, Object> ex = execution(id, seller, buyer, TUST, 10_366, "98.40", 1_000_000, rate, "1.02",
            "2026-11-09", "2026-11-09", "2026-11-16");
        if (buySellBack) {
            Map<String, Object> position = ((List<Map<String, Object>>) ((Map<String, Object>) ((List<Map<String, Object>>) ((Map<String, Object>)
                ((Map<String, Object>) ((Map<String, Object>) ex.get("product")).get("economicTerms")).get("collateral"))
                .get("collateralPortfolio")).get(0)).get("collateralPosition")).get(0);
            Map<String, Object> payout = ((List<Map<String, Object>>) ((Map<String, Object>) ((Map<String, Object>) position.get("product"))
                .get("economicTerms")).get("payout")).get(0);
            payout.put("tradeType", "BuySellBack");
        }
        return book(ex, "2026-11-09").getAfter().get(0);
    }

    static TradeState bsb() {
        return trade("BSB-1", "BANK-A", "BANK-B", "0.045", true);
    }

    static BigDecimal deduction(TradeState t, String income, Date date) {
        return fn(BuySellBackIncomeDeduction.class).evaluate(t, new BigDecimal(income), date, 0);
    }

    @Test
    void theTradeTypeMakesABuySellBack() {
        assertTrue(fn(RepoIsBuySellBack.class).evaluate(bsb()));
        assertFalse(fn(RepoIsBuySellBack.class).evaluate(trade("REPO-1", "BANK-A", "BANK-B", "0.045", false)));
    }

    @Test
    void theDeductionIsTheIncomePlusInterestToTheRepurchaseDate() {
        // 5,183 income on 2026-11-12: 5,183 x 4.5% x 4 / 360 = 2.59 -> 5,185.59 -> 5,186
        same("5186", deduction(bsb(), "5183", Date.of(2026, 11, 12)));
        // on the Repurchase Date no interest is added
        same("5183", deduction(bsb(), "5183", Date.of(2026, 11, 16)));
    }

    @Test
    void aRepoOrAnIncomeDateOutsideTheTermHasNoDeduction() {
        TradeState repo = trade("REPO-1", "BANK-A", "BANK-B", "0.045", false);
        rejected(() -> deduction(repo, "5183", Date.of(2026, 11, 12)));
        rejected(() -> deduction(bsb(), "5183", Date.of(2026, 11, 17)));
        rejected(() -> deduction(bsb(), "5183", Date.of(2026, 11, 8)));
        rejected(() -> deduction(bsb(), "0", Date.of(2026, 11, 12)));
    }

    @Test
    void theSellBackPriceIsTheRepurchasePriceLessTheDeduction() {
        var price = fn(BuySellBackSellBackPrice.class);
        // 1,000,000 x 4.5% x 7 / 360 = 875
        same("1000875", price.evaluate(bsb(), ZERO, 0));
        same("995689", price.evaluate(bsb(), new BigDecimal(5186), 0));
        TradeState repo = trade("REPO-1", "BANK-A", "BANK-B", "0.045", false);
        same("1000875", price.evaluate(repo, ZERO, 0));
        rejected(() -> price.evaluate(repo, new BigDecimal(5186), 0));
        rejected(() -> price.evaluate(bsb(), new BigDecimal(1_000_875), 0));
    }

    @Test
    void onlyTradesOfTheSameTypePairOff() {
        var matches = fn(RepoPairOffMatches.class);
        TradeState back = trade("BSB-2", "BANK-B", "BANK-A", "0.04", true);
        assertTrue(matches.evaluate(bsb(), back));
        assertFalse(matches.evaluate(bsb(), trade("REPO-2", "BANK-B", "BANK-A", "0.04", false)));
        assertFalse(matches.evaluate(trade("REPO-1", "BANK-A", "BANK-B", "0.045", false), back));
    }

    @Test
    void thePairOffNetsTheSellBackPrices() {
        // 1,000,875 - 5,186 = 995,689 against 1,000,778: the Seller of the second pays 5,089
        same("-5089", fn(RepoPairOffNetAmount.class).evaluate(bsb(), trade("BSB-2", "BANK-B", "BANK-A", "0.04", true),
            new BigDecimal(5186), ZERO, 0));
    }

    @Test
    void theIncomeRecordIsValidAndRejectsADeductionBelowTheIncome() {
        Map<String, Object> doc = o("repoId", "0xabc", "tradeHash", "0x1", "security", TUST, "quantity", 10_366,
            "incomePerUnit", 0.5, "incomeDate", "2026-11-12", "incomeAmount", 5183, "deduction", 5186,
            "buyer", "BANK-B", "seller", "BANK-A");
        assertEquals("", failedText(load(BuySellBackIncome.class, doc)));
        doc.put("deduction", 5000);
        assertNotEquals("", failedText(load(BuySellBackIncome.class, doc)));
    }

    static void same(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual), () -> expected + " != " + actual);
    }
}
