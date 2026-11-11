package cdmx;

import cdmx.collateral.gmsla.GmslaLoanTerms;
import cdmx.collateral.gmsla.functions.GmslaRequiredCollateral;
import cdmx.collateral.gmsla.functions.GmslaReturnCollateral;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static cdmx.Cdm.*;
import static org.junit.jupiter.api.Assertions.*;

/** The rules of a securities loan's delivery and return (task-gmsla-loan-delivery-return,
 *  wp-adr-gmsla-loan-delivery-return). The loan's CDM events are tested in the collateral service (CdmLoanTest). */
class GmslaLoanTest {
    static BigDecimal n(String s) {
        return new BigDecimal(s);
    }

    static BigDecimal required(String quantity, String price, String margin, String collateralPrice) {
        return fn(GmslaRequiredCollateral.class).evaluate(n(quantity), n(price), n(margin), n(collateralPrice));
    }

    static BigDecimal redelivered(String held, String returned, String outstanding) {
        return fn(GmslaReturnCollateral.class).evaluate(n(held), n(returned), n(outstanding));
    }

    @Test
    void requiredCollateralIsMarketValueTimesMarginOverTheCollateralPriceRoundedUp() {
        assertEquals(0, required("100000", "1", "1.02", "1").compareTo(n("102000")));
        assertEquals(0, required("100000", "1", "1.02", "98.4").compareTo(n("1037"))); // 1036.585...
        assertEquals(0, required("3", "33.34", "1", "1").compareTo(n("101"))); // 100.02
    }

    @Test
    void requiredCollateralNeedsAPositiveQuantityAndPricesAndAMarginOfAtLeastOne() {
        rejected(() -> required("0", "1", "1.02", "1"));
        rejected(() -> required("1", "0", "1.02", "1"));
        rejected(() -> required("1", "1", "0.99", "1"));
    }

    @Test
    void aPartialReturnRedeliversProRataRoundedDownAndAFullReturnAllThatIsHeld() {
        assertEquals(0, redelivered("102000", "40000", "100000").compareTo(n("40800")));
        assertEquals(0, redelivered("1037", "40000", "100000").compareTo(n("414"))); // 414.8
        assertEquals(0, redelivered("1037", "100000", "100000").compareTo(n("1037")));
        assertEquals(0, redelivered("623", "60000", "60000").compareTo(n("623")));
        rejected(() -> redelivered("100", "0", "10"));
        rejected(() -> redelivered("100", "11", "10"));
    }

    @Test
    void aLoanStatesEitherARebateRateOrAFeeRate() {
        GmslaLoanTerms cash = load(GmslaLoanTerms.class, o("loanId", "L1", "margin", 1.02, "rebateRate", 0.04));
        GmslaLoanTerms fee = load(GmslaLoanTerms.class, o("loanId", "L2", "margin", 1.05, "feeRate", 0.005, "termDate", "2026-12-11"));
        GmslaLoanTerms both = load(GmslaLoanTerms.class, o("loanId", "L3", "margin", 1.02, "rebateRate", 0.04, "feeRate", 0.005));
        GmslaLoanTerms none = load(GmslaLoanTerms.class, o("loanId", "L4", "margin", 1.02));
        GmslaLoanTerms low = load(GmslaLoanTerms.class, o("loanId", "L5", "margin", 0.98, "feeRate", 0.005));
        assertEquals("", failedText(cash));
        assertEquals("", failedText(fee));
        assertTrue(failedText(both).contains("OneRate"), failedText(both));
        assertTrue(failedText(none).contains("OneRate"), failedText(none));
        assertTrue(failedText(low).contains("MarginAtLeastOne"), failedText(low));
    }
}
