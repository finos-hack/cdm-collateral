package cdmx;

import cdm.base.staticdata.party.Party;
import cdm.legaldocumentation.csa.PostedCreditSupportItem;
import cdm.observable.asset.Money;
import cdmx.collateral.exposure.NettingSet;
import cdmx.collateral.exposure.functions.NettedExposure;
import cdmx.collateral.valuation.functions.CreditSupportAmountVM;
import cdmx.collateral.valuation.functions.DeliveryAmountVM;
import cdmx.collateral.valuation.functions.ReturnAmountVM;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static cdmx.Cdm.*;
import static cdmx.Data.*;
import static cdmx.ValuationTest.assertAmount;
import static cdmx.ValuationTest.item;
import static cdmx.ValuationTest.rounding;
import static org.junit.jupiter.api.Assertions.*;

/** Gaps G9 (Delivery and Return Amount under the 2016 VM CSA) and G10 (netting set and netted exposure), on the
 *  console's vm-call and vm-return scenarios. Amounts in USD, invented. */
class VariationMarginTest {
    private final NettedExposure netted = fn(NettedExposure.class);
    private final CreditSupportAmountVM csa = fn(CreditSupportAmountVM.class);
    private final DeliveryAmountVM delivery = fn(DeliveryAmountVM.class);
    private final ReturnAmountVM ret = fn(ReturnAmountVM.class);

    static Party bank(String name) {
        return load(Party.class, party(name));
    }

    /** Values from BANK-B's side: positive when BANK-B would be owed on termination. */
    static Map<String, Object> nettingSetDoc(Object... tradeAndValue) {
        List<Object> trades = new ArrayList<>();
        for (int i = 0; i < tradeAndValue.length; i += 2) {
            Object v = tradeAndValue[i + 1];
            trades.add(o("tradeIdentifier", ident((String) tradeAndValue[i], "BANK-B"),
                "markToMarket", v instanceof Map ? v : money((Number) v)));
        }
        return o("nettingSetIdentifier", ident("ISDA-2002-A-B", "BANK-B"), "valuationParty", party("BANK-B"),
            "counterparty", party("BANK-A"), "tradeExposure", trades);
    }

    static NettingSet nettingSet(Object... tradeAndValue) {
        return load(NettingSet.class, nettingSetDoc(tradeAndValue));
    }

    /** vm-call: three trades netting to USD 8.24m owed to BANK-B. */
    static NettingSet vmCall() {
        return nettingSet("IRS-1", 10_000_000, "IRS-2", -3_000_000, "FXF-1", 1_240_000);
    }

    private static Money usd(Number v) {
        return amount(v, "USD");
    }

    /** Credit support held: cash in the base currency, haircut 0 (Valuation Percentage 100%, see D17). */
    private static List<PostedCreditSupportItem> cashHeld(Number v) {
        return List.of(item(v, 0, null, null));
    }

    private Money deliveryAmount(Number exposure, Number held, Money threshold, Number mta, Number disputed) {
        return delivery.evaluate(cashHeld(held), usd(0), usd(0), usd(0), usd(exposure), threshold, usd(mta),
            rounding(10_000, 10_000), usd(disputed), "USD");
    }

    private Money returnAmount(Number exposure, Number held, Number mta, Number disputed) {
        return ret.evaluate(cashHeld(held), usd(0), usd(0), usd(0), usd(exposure), null, usd(mta),
            rounding(10_000, 10_000), usd(disputed), "USD");
    }

    // G10: netting set

    @Test
    void tradesOfOppositeSignOffset() {
        assertAmount(8_240_000, netted.evaluate(vmCall(), bank("BANK-B"), "USD"));
        assertEquals("", failedText(vmCall()));
    }

    @Test
    void theCounterpartysExposureIsTheNegative() {
        assertAmount(-8_240_000, netted.evaluate(vmCall(), bank("BANK-A"), "USD"));
    }

    @Test
    void anEmptyNettingSetHasNoExposure() {
        assertAmount(0, netted.evaluate(nettingSet(), bank("BANK-B"), "USD"));
    }

    @Test
    void aTradeAppearsOnceInANettingSet() {
        assertTrue(failedText(nettingSet("IRS-1", 1_000_000, "IRS-1", 2_000_000)).contains("OneValuePerTrade"));
    }

    @Test
    void valuesInAnotherCurrencyAreRejected() {
        NettingSet s = nettingSet("IRS-1", 1_000_000, "IRS-2", money(500_000, "EUR"));
        assertTrue(rejected(() -> netted.evaluate(s, bank("BANK-B"), "USD")).contains("Base Currency Equivalent"));
    }

    @Test
    void aPartyOutsideTheNettingSetIsRejected() {
        assertTrue(rejected(() -> netted.evaluate(vmCall(), bank("BANK-C"), "USD")).contains("one of the netting set"));
    }

    // G9: 2016 VM CSA amounts

    @Test
    void vmCallDeliversTheExposureLessTheCreditSupportHeld() {  // 8.24m exposure, 5m held
        Money exposure = netted.evaluate(vmCall(), bank("BANK-B"), "USD");
        assertAmount(3_240_000, deliveryAmount(exposure.getValue(), 5_000_000, null, 250_000, 0));
        assertAmount(0, returnAmount(exposure.getValue(), 5_000_000, 250_000, 0));
    }

    @Test
    void vmReturnReleasesTheExcessOverTheExposure() {  // exposure fell to 6m, 8.24m held
        assertAmount(2_240_000, returnAmount(6_000_000, 8_240_000, 250_000, 0));
        assertAmount(0, deliveryAmount(6_000_000, 8_240_000, null, 250_000, 0));
    }

    @Test
    void aNegativeExposureMeansNoCreditSupportIsDue() {
        assertAmount(0, csa.evaluate(usd(-1_500_000), null, "USD"));
        assertAmount(2_000_000, returnAmount(-1_500_000, 2_000_000, 250_000, 0));
    }

    @Test
    void aThresholdReducesTheCreditSupportAmount() {
        assertAmount(7_240_000, csa.evaluate(usd(8_240_000), usd(1_000_000), "USD"));
        assertAmount(2_240_000, deliveryAmount(8_240_000, 5_000_000, usd(1_000_000), 250_000, 0));
    }

    @Test
    void amountsBelowTheMinimumTransferAmountAreZero() {
        assertAmount(0, deliveryAmount(5_200_000, 5_000_000, null, 250_000, 0));
        assertAmount(0, returnAmount(4_800_000, 5_000_000, 250_000, 0));
    }

    @Test
    void deliveryRoundsUpAndReturnRoundsDown() {
        assertAmount(3_250_000, deliveryAmount(8_243_333, 5_000_000, null, 250_000, 0));
        assertAmount(2_230_000, returnAmount(6_003_333, 8_240_000, 250_000, 0));
    }

    @Test
    void aDisputedAmountIsDeducted() {
        assertAmount(2_740_000, deliveryAmount(8_240_000, 5_000_000, null, 250_000, 500_000));
        assertAmount(1_740_000, returnAmount(6_000_000, 8_240_000, 250_000, 500_000));
    }

    @Test
    void anExposureInAnotherCurrencyIsRejected() {
        assertTrue(rejected(() -> csa.evaluate(amount(1_000_000, "EUR"), null, "USD")).contains("base currency"));
    }
}
