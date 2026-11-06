package cdmx;

import cdm.product.collateral.CollateralInterestParameters;
import cdmx.collateral.interest.CashCollateralDay;
import cdmx.collateral.interest.CollateralInterestStatement;
import cdmx.collateral.interest.functions.Create_CollateralInterestStatement;
import org.junit.jupiter.api.Test;

import com.rosetta.model.lib.records.Date;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static cdmx.Cdm.*;
import static cdmx.Data.*;
import static cdmx.ValuationTest.assertAmount;
import static cdmx.VariationMarginTest.bank;
import static org.junit.jupiter.api.Assertions.*;

/** Gap G17: interest on cash collateral. BANK-A posts USD cash (the console's tUSD) to BANK-B, which pays interest on it
 *  for the Interest Period of November 2026 (30 days), at SOFR minus 10 basis points, ACT/360, rounded to cents at period
 *  end. Rates and amounts invented. */
class InterestTest {
    private final Create_CollateralInterestStatement statement = fn(Create_CollateralInterestStatement.class);
    private static final LocalDate START = LocalDate.of(2026, 11, 1);
    private static final LocalDate END = LocalDate.of(2026, 12, 1);

    /** Calculation parameters: SOFR minus 10 bp, negative interest passed on, cents at period end. */
    static Map<String, Object> calc() {
        return o("floatingRate", o("spreadSchedule", rate(-0.001), "negativeInterest", true, "compressibleSpread", false),
            "inBaseCurrency", false, "dayCountFraction", "ACT/360",
            "rounding", o("roundingDirection", "Nearest", "precision", 2), "roundingFrequency", "PeriodEnd");
    }

    static Map<String, Object> rate(double value) {
        return o("price", o("value", value, "priceType", "InterestRate"));
    }

    static Map<String, Object> handling(String how) {
        return o("interestPaymentHandling", how, "netPostedAndHeldInterest", false, "netInterestWithMarginCalls", false,
            "includeAccrualInMarginCalc", false, "onFullReturn", true, "onPartialReturn", false);
    }

    static CollateralInterestParameters params(Map<String, Object> calc, Map<String, Object> handling) {
        return load(CollateralInterestParameters.class,
            o("currency", "USD", "interestCalculationParameters", calc, "interestHandlingParameters", handling));
    }

    static CollateralInterestParameters params() {
        return params(calc(), handling("Transfer"));
    }

    /** One day per calendar day from START: n days of balance at the observed rate. */
    static List<CashCollateralDay> days(int from, int n, Number balance, Double observed, String ccy) {
        List<CashCollateralDay> out = new ArrayList<>();
        for (int i = from; i < from + n; i++) {
            Map<String, Object> d = o("date", START.plusDays(i).toString(), "balance", money(balance, ccy));
            if (observed != null) d.put("observedRate", observed);
            out.add(load(CashCollateralDay.class, d));
        }
        return out;
    }

    static List<CashCollateralDay> month(Number balance, Double observed) {
        return days(0, 30, balance, observed, "USD");
    }

    private CollateralInterestStatement run(CollateralInterestParameters p, List<CashCollateralDay> days) {
        return statement.evaluate(p, bank("BANK-B"), bank("BANK-A"), Date.of(START), Date.of(END), days, null, null);
    }

    private CollateralInterestStatement run(CollateralInterestParameters p, List<CashCollateralDay> days,
                                            Number excess, Number mta) {
        return statement.evaluate(p, bank("BANK-B"), bank("BANK-A"), Date.of(START), Date.of(END), days,
            excess == null ? null : amount(excess, "USD"), mta == null ? null : amount(mta, "USD"));
    }

    private static void assertSplit(CollateralInterestStatement s, Number transfer, Number adjust, Number writtenOff) {
        assertAmount(transfer, s.getTransferAmount());
        assertAmount(adjust, s.getCollateralAdjustment());
        assertAmount(writtenOff, s.getWrittenOff());
        assertEquals("", failedText(s));
    }

    @Test
    void aMonthOnTenMillionAtSofrMinusTenBasisPointsIsTransferredToThePledgor() {
        // 10,000,000 x (4.30% - 0.10%) x 30/360 = 35,000.00
        CollateralInterestStatement s = run(params(), month(10_000_000, 0.043));
        assertEquals(30, s.getAccrual().size());
        assertEquals(0, new java.math.BigDecimal("0.042").compareTo(s.getAccrual().get(0).getRate()));
        assertAmount(35_000, s.getGrossInterestAmount());
        assertAmount(0, s.getWithholdingTax());
        assertAmount(35_000, s.getInterestAmount());
        assertSplit(s, 35_000, 0, 0);
    }

    @Test
    void eachDayAccruesOnThatDaysBalance() {
        // (10m x 15 + 12m x 15) x 4.2% / 360 = 38,500.00
        List<CashCollateralDay> d = days(0, 15, 10_000_000, 0.043, "USD");
        d.addAll(days(15, 15, 12_000_000, 0.043, "USD"));
        assertAmount(38_500, run(params(), d).getInterestAmount());
    }

    @Test
    void negativeInterestIsPayableByThePledgor() {
        // SOFR -0.50% less 10 bp: 10m x -0.60% x 30/360 = -5,000.00
        CollateralInterestStatement s = run(params(), month(10_000_000, -0.005));
        assertAmount(-5_000, s.getInterestAmount());
        assertSplit(s, -5_000, 0, 0);
    }

    @Test
    void withoutTheNegativeInterestElectionTheRateIsFlooredAtZero() {
        Map<String, Object> c = calc();
        ((Map<String, Object>) c.get("floatingRate")).put("negativeInterest", false);
        assertAmount(0, run(params(c, handling("Transfer")), month(10_000_000, -0.005)).getInterestAmount());
    }

    @Test
    void aCompressibleSpreadIsNotAppliedWhenTheRateIsNotPositive() {
        // +10 bp compressible: at -0.20% the spread is dropped: 10m x -0.20% x 30/360 = -1,666.67
        Map<String, Object> c = calc();
        ((Map<String, Object>) c.get("floatingRate")).putAll(o("spreadSchedule", rate(0.001), "compressibleSpread", true));
        CollateralInterestParameters p = params(c, handling("Transfer"));
        assertAmount(-1_666.67, run(p, month(10_000_000, -0.002)).getInterestAmount());
        assertAmount(36_666.67, run(p, month(10_000_000, 0.043)).getInterestAmount());  // 4.40%
    }

    @Test
    void aFloorBoundsTheObservedRateBeforeTheSpread() {
        // floor 0% on SOFR -0.50%, then less 10 bp: 10m x -0.10% x 30/360 = -833.33
        Map<String, Object> c = calc();
        ((Map<String, Object>) c.get("floatingRate")).put("floorRateSchedule", rate(0.0));
        assertAmount(-833.33, run(params(c, handling("Transfer")), month(10_000_000, -0.005)).getInterestAmount());
    }

    @Test
    void aFixedRateNeedsNoObservation() {
        Map<String, Object> c = calc();
        c.remove("floatingRate");
        c.put("fixedRate", 0.03);
        assertAmount(25_000, run(params(c, handling("Transfer")), month(10_000_000, null)).getInterestAmount());
    }

    @Test
    void dailyRoundingRoundsEachDay() {
        // 10m x 4.2% / 360 = 1,166.666... per day, 1,166.67 rounded, x 30 = 35,000.10
        Map<String, Object> c = calc();
        c.put("roundingFrequency", "Daily");
        assertAmount(35_000.10, run(params(c, handling("Transfer")), month(10_000_000, 0.043)).getInterestAmount());
    }

    @Test
    void withholdingTaxIsDeductedFromAPositiveAmount() {
        Map<String, Object> c = calc();
        c.put("withholdingTaxRate", 0.15);
        CollateralInterestStatement s = run(params(c, handling("Transfer")), month(10_000_000, 0.043));
        assertAmount(5_250, s.getWithholdingTax());
        assertAmount(29_750, s.getInterestAmount());
        assertAmount(0, run(params(c, handling("Transfer")), month(10_000_000, -0.005)).getWithholdingTax());
    }

    @Test
    void underAdjustTheInterestIsAddedToThePostedCollateral() {
        assertSplit(run(params(calc(), handling("Adjust")), month(10_000_000, 0.043)), 0, 35_000, 0);
    }

    @Test
    void underTransferOrAdjustAnAmountBelowTheRolloverLimitIsRolledOver() {
        Map<String, Object> h = handling("Transfer_or_Adjust");
        h.put("interestRolloverLimit", o("number", 50_000, "inclusive", false));
        assertSplit(run(params(calc(), h), month(10_000_000, 0.043)), 0, 35_000, 0);
        h.put("interestRolloverLimit", o("number", 10_000, "inclusive", false));
        assertSplit(run(params(calc(), h), month(10_000_000, 0.043)), 35_000, 0, 0);
    }

    @Test
    void anAmountBelowTheWriteOffLimitIsWrittenOff() {
        // 10,000 x 4.2% x 30/360 = 35.00, below the USD 100 limit
        Map<String, Object> h = handling("Transfer");
        h.put("writeoffLimit", o("number", 100, "inclusive", false));
        assertSplit(run(params(calc(), h), month(10_000, 0.043)), 0, 0, 35);
        assertSplit(run(params(calc(), h), month(10_000_000, 0.043)), 35_000, 0, 0);
    }

    @Test
    void underTheStandardAlternativeOnlyTheExcessIsTransferred() {
        Map<String, Object> h = handling("Transfer");
        h.put("alternativeToInterestAmount", "Standard");
        CollateralInterestParameters p = params(calc(), h);
        assertSplit(run(p, month(10_000_000, 0.043), 20_000, null), 20_000, 15_000, 0);
        assertSplit(run(p, month(10_000_000, 0.043), 50_000, null), 35_000, 0, 0);
        assertSplit(run(p, month(10_000_000, 0.043), -5_000, null), 0, 35_000, 0);  // a Delivery Amount is due already
        assertSplit(run(p, month(10_000_000, -0.005), -5_000, null), -5_000, 0, 0);  // negative interest is not withheld
    }

    @Test
    void transferIfDeliveryAmountBelowMtaTransfersInFullUnderTheMinimumTransferAmount() {
        Map<String, Object> h = handling("Transfer");
        h.put("alternativeToInterestAmount", "TransferIfDeliveryAmountBelowMTA");
        CollateralInterestParameters p = params(calc(), h);
        assertSplit(run(p, month(10_000_000, 0.043), 20_000, 250_000), 35_000, 0, 0);  // Delivery Amount 15,000
        assertSplit(run(p, month(10_000_000, 0.043), 20_000, 10_000), 20_000, 15_000, 0);
    }

    @Test
    void theAlternativesNeedTheCreditSupportExcess() {
        Map<String, Object> h = handling("Transfer");
        h.put("alternativeToInterestAmount", "Standard");
        assertTrue(rejected(() -> run(params(calc(), h), month(10_000_000, 0.043))).contains("Credit Support excess"));
    }

    @Test
    void everyDayOfThePeriodIsNeeded() {
        assertTrue(rejected(() -> run(params(), days(0, 29, 10_000_000, 0.043, "USD"))).contains("calendar day"));
        assertTrue(rejected(() -> run(params(), days(1, 30, 10_000_000, 0.043, "USD"))).contains("calendar day"));
    }

    @Test
    void compoundingIsNotCovered() {
        Map<String, Object> c = calc();
        c.put("compoundingType", "Business");
        assertTrue(rejected(() -> run(params(c, handling("Transfer")), month(10_000_000, 0.043))).contains("Compounding"));
    }

    @Test
    void aBalanceInAnotherCurrencyIsRejected() {
        assertTrue(rejected(() -> run(params(), days(0, 30, 10_000_000, 0.043, "EUR"))).contains("currency"));
    }

    @Test
    void aFloatingRateNeedsAnObservation() {
        assertTrue(rejected(() -> run(params(), month(10_000_000, null))).contains("rate observed"));
    }

    @Test
    void theStatementSurvivesARuneJsonRoundTrip() throws Exception {
        CollateralInterestStatement s = run(params(), month(10_000_000, 0.043));
        assertEquals(s, JSON.readValue(toJson(s), CollateralInterestStatement.class));
    }

    @Test
    void aNegativeBalanceIsInvalid() {
        CashCollateralDay d = load(CashCollateralDay.class, o("date", START.toString(), "balance", money(-1, "USD")));
        assertTrue(failedText(d).contains("BalanceNotNegative"));
    }
}
