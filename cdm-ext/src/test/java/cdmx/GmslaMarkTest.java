package cdmx;

import cdmx.collateral.gmsla.GmslaMarkStatement;
import cdmx.collateral.gmsla.GmslaMarkedLoan;
import cdmx.collateral.gmsla.functions.GmslaLoanRequirement;
import cdmx.collateral.gmsla.functions.GmslaMarginCallAmount;
import cdmx.collateral.gmsla.functions.GmslaNetExposure;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static cdmx.Cdm.*;
import static org.junit.jupiter.api.Assertions.*;

/** The aggregated mark of a pair's securities loans (task-gmsla-marking, wp-adr-gmsla-marking). */
class GmslaMarkTest {
    static BigDecimal n(String s) {
        return new BigDecimal(s);
    }

    /** A loan of tMMF against tUSD: requirement quantity x price x margin, collateral value the cash held. */
    static Map<String, Object> loan(String id, String lender, String borrower, long quantity, String price, String margin, long cash) {
        BigDecimal q = BigDecimal.valueOf(quantity), p = n(price), m = n(margin), c = BigDecimal.valueOf(cash);
        return o("loanId", id, "tradeHash", "0x01", "lender", lender, "borrower", borrower, "security", "US0000000MMF",
                "quantity", q, "price", p, "marketValue", q.multiply(p), "margin", m, "requirement", q.multiply(p).multiply(m),
                "collateral", "USD", "collateralAmount", c, "collateralPrice", BigDecimal.ONE, "collateralValue", c);
    }

    static BigDecimal net(List<Map<String, Object>> loans, String party, String held) {
        List<GmslaMarkedLoan> ls = new ArrayList<>();
        for (Map<String, Object> l : loans) ls.add(load(GmslaMarkedLoan.class, l));
        return fn(GmslaNetExposure.class).evaluate(ls, party, n(held));
    }

    static BigDecimal call(String net, String mta) {
        return fn(GmslaMarginCallAmount.class).evaluate(n(net), n(mta));
    }

    @Test
    void theRequirementIsMarketValueTimesMarginAtThePrice() {
        assertEquals(0, fn(GmslaLoanRequirement.class).evaluate(n("5000000"), n("1.1"), n("1.02")).compareTo(n("5610000")));
        rejected(() -> fn(GmslaLoanRequirement.class).evaluate(n("1"), n("1"), n("0.9")));
    }

    @Test
    void theLenderShortOfCollateralHasAPositiveNetFigureAndTheBorrowerItsNegative() {
        var loans = List.of(loan("L1", "BANK-A", "BANK-B", 5_000_000, "1.1", "1.02", 5_100_000));
        assertEquals(0, net(loans, "BANK-A", "0").compareTo(n("510000")));
        assertEquals(0, net(loans, "BANK-B", "0").compareTo(n("-510000")));
        // After B delivers the 510,000, nothing is left to call; at the price restored, B may call it back.
        assertEquals(0, net(loans, "BANK-A", "510000").compareTo(BigDecimal.ZERO));
        var restored = List.of(loan("L1", "BANK-A", "BANK-B", 5_000_000, "1", "1.02", 5_100_000));
        assertEquals(0, net(restored, "BANK-B", "-510000").compareTo(n("510000")));
    }

    @Test
    void theTwoDirectionsNetToOneFigure() {
        var loans = List.of(loan("L1", "BANK-A", "BANK-B", 1_000_000, "1.1", "1.02", 1_020_000),
                loan("L2", "BANK-B", "BANK-A", 500_000, "1.1", "1.02", 510_000));
        // A is short 102,000 as lender; B is short 51,000 as lender: A's net figure is 51,000.
        assertEquals(0, net(loans, "BANK-A", "0").compareTo(n("51000")));
        assertEquals(0, net(loans, "BANK-B", "0").compareTo(n("-51000")));
    }

    @Test
    void aCallIsTheNetFigureRoundedDownOnlyAboveTheMinimumTransferAmount() {
        assertEquals(0, call("510000.7", "250000").compareTo(n("510000")));
        assertEquals(0, call("250000", "250000").compareTo(BigDecimal.ZERO));
        assertEquals(0, call("-510000", "250000").compareTo(BigDecimal.ZERO));
        rejected(() -> call("1", "-1"));
    }

    static Map<String, Object> statement(List<Map<String, Object>> loans, String held, String netExposure, String callAmount) {
        return o("party", "BANK-A", "counterparty", "BANK-B", "businessDate", "2026-11-11", "baseCurrency", "USD", "loan", loans,
                "netMarginHeld", n(held), "netExposure", n(netExposure), "minimumTransferAmount", n("250000"), "callAmount", n(callAmount));
    }

    @Test
    void aStatementHoldsOnlyWhenItsFiguresFollowFromItsLoans() {
        var loans = List.of(loan("L1", "BANK-A", "BANK-B", 5_000_000, "1.1", "1.02", 5_100_000));
        assertEquals("", failedText(load(GmslaMarkStatement.class, statement(loans, "0", "510000", "510000"))));
        assertTrue(failedText(load(GmslaMarkStatement.class, statement(loans, "0", "510001", "510001"))).contains("NetExposure"));
        assertTrue(failedText(load(GmslaMarkStatement.class, statement(loans, "0", "510000", "500000"))).contains("CallAmount"));
        Map<String, Object> bad = loan("L1", "BANK-A", "BANK-B", 5_000_000, "1.1", "1.02", 5_100_000);
        bad.put("requirement", n("5100000"));
        assertTrue(failedText(load(GmslaMarkStatement.class, statement(List.of(bad), "0", "0", "0"))).contains("Requirement"));
        var other = List.of(loan("L1", "BANK-A", "BANK-C", 5_000_000, "1.1", "1.02", 5_100_000));
        assertTrue(failedText(load(GmslaMarkStatement.class, statement(other, "0", "510000", "510000"))).contains("LoansOfThePair"));
    }
}
