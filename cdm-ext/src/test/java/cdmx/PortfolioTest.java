package cdmx;

import cdm.event.common.CollateralBalance;
import cdm.event.common.CollateralPortfolio;
import cdm.event.common.CollateralPosition;
import cdm.event.common.CollateralStatusEnum;
import cdm.event.common.HaircutIndicatorEnum;
import cdmx.collateral.event.CollateralEvent;
import cdmx.collateral.portfolio.functions.ApplyCollateralEvent;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.Map;
import java.util.TreeMap;

import static cdmx.Cdm.*;
import static cdmx.Data.*;
import static cdmx.EventTest.issued;
import static org.junit.jupiter.api.Assertions.*;

/** Gap G5: collateral positions and balance updated from settled margin call events. */
class PortfolioTest {
    private final ApplyCollateralEvent apply = fn(ApplyCollateralEvent.class);

    /** ISIN -> held quantity. */
    static Map<String, String> holdings(CollateralPortfolio p) {
        Map<String, String> out = new TreeMap<>();
        if (p.getCollateralPosition() == null) return out;
        for (CollateralPosition pos : p.getCollateralPosition()) {
            out.put(pos.getAsset().getInstrument().getSecurity().getIdentifier().get(0).getIdentifier().getValue(),
                pos.getPriceQuantity().get(0).getQuantity().getValue().getValue().stripTrailingZeros().toPlainString());
        }
        return out;
    }

    static String balance(CollateralPortfolio p) {
        return p.getCollateralBalance().get(0).getAmountBaseCurrency().getValue().stripTrailingZeros().toPlainString();
    }

    /** The im-call scenario: 128,589 tUST worth USD 12,400,094 after haircuts delivered to BANK-B. */
    static CollateralEvent delivered() {
        return issued(12_400_000, "Delivery", "BANK-B").apply("respond", responseDoc("AgreeinFull", 12_400_000))
            .apply("propose", proposalDoc()).apply("decide", o("proposalId", "P-1", "accept", true))
            .apply("settle", o("proposalId", "P-1")).last();
    }

    /** A return call for the released value, agreed in full and settled by releasing the positions. */
    static CollateralEvent returned(Number value, Object... positions) {
        return issued(value, "Return", "BANK-A").apply("respond", responseDoc("AgreeinFull", value, "Return", 128_589))
            .apply("settle", o("releasedValue", money(value), "releasedCollateral", l(positions))).last();
    }

    @Test
    void aDeliveryAddsThePositionsAndTheValueAfterHaircuts() {
        CollateralPortfolio p = apply.evaluate(null, delivered());
        assertEquals(Map.of("XS0000TUST01", "128589"), holdings(p));
        CollateralBalance b = p.getCollateralBalance().get(0);
        assertEquals("12400094", balance(p));
        assertEquals("USD", b.getAmountBaseCurrency().getUnit().getCurrency().getValue());
        assertEquals(CollateralStatusEnum.SETTLED_AMOUNT, b.getCollateralBalanceStatus());
        assertEquals(HaircutIndicatorEnum.POST_HAIRCUT, b.getHaircutIndicator());
        assertEquals("BANK-A", b.getPayerReceiver().getPayerPartyReference().getValue().getPartyId().get(0).getIdentifier().getValue());
        assertEquals("BANK-B", b.getPayerReceiver().getReceiverPartyReference().getValue().getPartyId().get(0).getIdentifier().getValue());
        assertEquals(CollateralStatusEnum.SETTLED_AMOUNT, p.getCollateralPosition().get(0).getCollateralPositionStatus());
        assertEquals("", failedText(p));  // CDM's conditions on the portfolio, positions and balance
    }

    @Test
    void aReturnRemovesTheReleasedPositionsAndValue() {  // im-call then im-return
        CollateralPortfolio p = apply.evaluate(apply.evaluate(null, delivered()), returned(4_299_999, position(44_000)));
        assertEquals(Map.of("XS0000TUST01", "84589"), holdings(p));
        assertEquals("8100095", balance(p));
        assertEquals("", failedText(p));
    }

    @Test
    void aFullyReleasedAssetLeavesNoPosition() {
        CollateralPortfolio p = apply.evaluate(apply.evaluate(null, delivered()), returned(12_400_094, position(128_589)));
        assertEquals(Map.of(), holdings(p));
        assertEquals("0", balance(p));
    }

    @Test
    void positionsAreNettedPerAsset() {
        CollateralPortfolio once = apply.evaluate(null, delivered());
        CollateralPortfolio twice = apply.evaluate(once, delivered());
        assertEquals(Map.of("XS0000TUST01", "257178"), holdings(twice));
        assertEquals("24800188", balance(twice));
    }

    @Test
    void stepsBeforeSettlementLeaveThePortfolioUnchanged() {
        CollateralPortfolio p = apply.evaluate(null, delivered());
        CollateralEvent agreed = issued(1_000_000, "Delivery", "BANK-B").apply("respond", responseDoc("AgreeinFull", 1_000_000)).last();
        CollateralPortfolio after = apply.evaluate(p, agreed);
        assertEquals(holdings(p), holdings(after));
        assertEquals(new BigDecimal(balance(p)), new BigDecimal(balance(after)));
    }

    @Test
    void aReturnCannotReleaseAnAssetThatIsNotHeld() {
        CollateralPortfolio p = apply.evaluate(null, delivered());
        assertTrue(rejected(() -> apply.evaluate(p, returned(100_000, position(1_000, "XS0000TMMF01"))))
            .contains("no more of an asset than is held"));
    }

    @Test
    void aReturnCannotReleaseMoreThanIsHeld() {
        CollateralPortfolio p = apply.evaluate(null, delivered());
        assertTrue(rejected(() -> apply.evaluate(p, returned(13_000_000, position(130_000))))
            .contains("no more of an asset than is held"));
    }

    @Test
    void portfolioAndBalanceSurviveARuneJsonRoundTrip() throws Exception {
        CollateralPortfolio p = apply.evaluate(null, delivered());
        assertEquals(p, JSON.readValue(toJson(p), CollateralPortfolio.class));
    }
}
