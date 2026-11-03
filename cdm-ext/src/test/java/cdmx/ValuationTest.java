package cdmx;

import cdm.legaldocumentation.csa.CollateralRounding;
import cdm.legaldocumentation.csa.MarginApproachEnum;
import cdm.legaldocumentation.csa.PostedCreditSupportItem;
import cdm.legaldocumentation.csa.functions.PostedCreditSupportItemAmount;
import cdm.observable.asset.Money;
import cdmx.collateral.valuation.functions.CorrectedDeliveryAmount;
import cdmx.collateral.valuation.functions.CorrectedPostedCreditSupportItemAmount;
import cdmx.collateral.valuation.functions.CorrectedReturnAmount;
import cdmx.collateral.valuation.functions.CorrectedUndisputedAdjustedPostedCreditSupportAmount;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static cdmx.Cdm.*;
import static cdmx.Data.amount;
import static cdmx.Data.money;
import static org.junit.jupiter.api.Assertions.*;

/** Gap G7 (defect D1): the IM value of posted credit support with the additional haircut applied, and the Delivery and
 *  Return Amounts (IM) built on it. Amounts in USD, invented. */
class ValuationTest {
    private final CorrectedPostedCreditSupportItemAmount itemValue = fn(CorrectedPostedCreditSupportItemAmount.class);
    private final CorrectedUndisputedAdjustedPostedCreditSupportAmount posted = fn(CorrectedUndisputedAdjustedPostedCreditSupportAmount.class);
    private final CorrectedDeliveryAmount delivery = fn(CorrectedDeliveryAmount.class);
    private final CorrectedReturnAmount ret = fn(CorrectedReturnAmount.class);

    /** One posted item; fx or additional null leaves that haircut absent. */
    static PostedCreditSupportItem item(Number value, Number haircut, Number fx, Number additional, Number disputed, String ccy) {
        Map<String, Object> doc = o("cashOrSecurityValue", money(value, ccy), "haircutPercentage", haircut,
            "disputedCashOrSecurityValue", money(disputed, ccy));
        if (fx != null) doc.put("fxHaircutPercentage", fx);
        if (additional != null) doc.put("additionalHaircutPercentage", additional);
        return load(PostedCreditSupportItem.class, doc);
    }

    static PostedCreditSupportItem item(Number value, Number haircut, Number fx, Number additional) {
        return item(value, haircut, fx, additional, 0, "USD");
    }

    static CollateralRounding rounding(Number delivery, Number ret) {
        return load(CollateralRounding.class, o("deliveryAmount", delivery, "returnAmount", ret));
    }

    static void assertAmount(Number expected, Money actual) {
        assertEquals(0, new BigDecimal(expected.toString()).compareTo(actual.getValue()),
            "expected " + expected + ", got " + actual.getValue());
        assertEquals("USD", actual.getUnit().getCurrency().getValue());
    }

    private Money usd(Number v) {
        return amount(v, "USD");
    }

    @Test
    void cdmsOwnFunctionAppliesTheFxHaircutTwiceAndTheAdditionalHaircutNever() {
        // D1 as shipped in CDM 7.7.0: 10m x (1 - (0.02 + 0.08 + 0.08)) instead of 10m x (1 - (0.02 + 0.08 + 0.05)).
        PostedCreditSupportItem it = item(10_000_000, 0.02, 0.08, 0.05);
        assertAmount(8_200_000, fn(PostedCreditSupportItemAmount.class).evaluate(it, "USD"));
        assertAmount(8_500_000, itemValue.evaluate(it, "USD"));
    }

    @Test
    void theAdditionalHaircutIsAppliedWithoutAnFxHaircut() {
        assertAmount(9_300_000, itemValue.evaluate(item(10_000_000, 0.02, null, 0.05), "USD"));
    }

    @Test
    void absentFxAndAdditionalHaircutsCountAsZero() {
        assertAmount(9_800_000, itemValue.evaluate(item(10_000_000, 0.02, null, null), "USD"));
    }

    @Test
    void theDisputedValueIsDeducted() {
        assertAmount(9_550_000, itemValue.evaluate(item(10_000_000, 0.02, null, null, 250_000, "USD"), "USD"));
    }

    @Test
    void anItemInAnotherCurrencyIsRejected() {
        assertTrue(rejected(() -> itemValue.evaluate(item(10_000_000, 0.02, null, null, 0, "EUR"), "USD"))
            .contains("base currency"));
    }

    @Test
    void postedCreditSupportSumsTheItemsAndAppliesTheAdjustments() {
        // 9.3m + 4.9m + 1m prior delivery - 0.5m prior return - 0.2m disputed transfer
        List<PostedCreditSupportItem> items = List.of(item(10_000_000, 0.02, null, 0.05), item(5_000_000, 0.02, null, null));
        assertAmount(14_500_000, posted.evaluate(items, usd(1_000_000), usd(500_000), usd(200_000), "USD"));
    }

    private Money deliver(Number margin, Number mta) {
        return delivery.evaluate(List.of(item(10_000_000, 0.02, null, 0.05)), usd(0), usd(0), usd(0),
            usd(margin), usd(0), MarginApproachEnum.DISTINCT, null, usd(mta), rounding(10_000, 10_000), usd(0), "USD");
    }

    @Test
    void deliveryAmountIsTheShortfallAgainstTheCorrectedValueRoundedUp() {
        // 12,345,678 - 9,300,000 = 3,045,678 -> 3,050,000. With CDM's D1 value (9.0m) it would be 3,350,000.
        assertAmount(3_050_000, deliver(12_345_678, 500_000));
    }

    @Test
    void noDeliveryBelowTheMinimumTransferAmount() {
        assertAmount(0, deliver(9_700_000, 500_000)); // shortfall 400,000
    }

    @Test
    void returnAmountIsTheExcessOverTheCreditSupportAmountRoundedDown() {
        // 9,300,000 - 7,991,234 = 1,308,766 -> 1,300,000
        Money r = ret.evaluate(List.of(item(10_000_000, 0.02, null, 0.05)), usd(0), usd(0), usd(0),
            usd(7_991_234), usd(0), MarginApproachEnum.DISTINCT, null, usd(500_000), rounding(10_000, 10_000), usd(0), "USD");
        assertAmount(1_300_000, r);
    }

    @Test
    void aDisputedReturnAmountIsDeducted() {
        // 1,308,766 - 900,000 disputed = 408,766, below the 500,000 MTA
        Money r = ret.evaluate(List.of(item(10_000_000, 0.02, null, 0.05)), usd(0), usd(0), usd(0),
            usd(7_991_234), usd(0), MarginApproachEnum.DISTINCT, null, usd(500_000), rounding(10_000, 10_000), usd(900_000), "USD");
        assertAmount(0, r);
    }

}
