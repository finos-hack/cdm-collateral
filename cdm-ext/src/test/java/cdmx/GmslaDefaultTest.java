package cdmx;

import cdmx.collateral.gmsla.GmslaDefaultHeldMargin;
import cdmx.collateral.gmsla.GmslaDefaultLoanValue;
import cdmx.collateral.gmsla.GmslaLoanInvoice;
import cdmx.collateral.gmsla.GmslaRateTypeEnum;
import cdmx.collateral.gmsla.functions.GmslaCloseOutNetAmount;
import cdmx.collateral.gmsla.functions.GmslaDefaultLoanAmount;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import static cdmx.Cdm.fn;
import static org.junit.jupiter.api.Assertions.*;

/** The amounts of a GMSLA default close-out (task-gmsla-default-close-out, wp-adr-gmsla-default-close-out). The
 *  statement's validation, with CDM's termination events, is tested in the collateral service (CdmLoanDefaultTest). */
class GmslaDefaultTest {
    static GmslaDefaultLoanValue loan(String lender, String borrower, long dmv, long collateral, GmslaRateTypeEnum rate, long accrued) {
        var b = GmslaDefaultLoanValue.builder().setLoanId("L").setLender(lender).setBorrower(borrower)
                .setDefaultMarketValue(BigDecimal.valueOf(dmv)).setCollateralValue(BigDecimal.valueOf(collateral))
                .setAccruedAmount(BigDecimal.valueOf(accrued));
        if (rate != null) b.setAccrual(GmslaLoanInvoice.builder().setLoanId("L").setRateType(rate).setAmount(BigDecimal.valueOf(accrued)));
        return b.build();
    }

    @Test
    void theLenderIsOwedTheMarketValueAndAFeeAndOwesTheCollateral() {
        var fee = loan("BANK-A", "BANK-B", 110_000, 112_000, GmslaRateTypeEnum.FEE, 14);
        // 110,000 - 112,000 + 14: the lender owes 1,986.
        assertEquals(0, new BigDecimal("-1986").compareTo(fn(GmslaDefaultLoanAmount.class).evaluate(fee, "BANK-A")));
        assertEquals(0, new BigDecimal("1986").compareTo(fn(GmslaDefaultLoanAmount.class).evaluate(fee, "BANK-B")));
    }

    @Test
    void theLenderOwesTheRebateOnCash() {
        var rebate = loan("BANK-A", "BANK-B", 100_000, 102_000, GmslaRateTypeEnum.REBATE, 113);
        assertEquals(0, new BigDecimal("-2113").compareTo(fn(GmslaDefaultLoanAmount.class).evaluate(rebate, "BANK-A")));
        var none = loan("BANK-A", "BANK-B", 100_000, 102_000, null, 0);
        assertEquals(0, new BigDecimal("-2000").compareTo(fn(GmslaDefaultLoanAmount.class).evaluate(none, "BANK-A")));
    }

    @Test
    void theNetAmountSetsOffEveryLoanAndTheMarginHeld() {
        var one = loan("BANK-A", "BANK-B", 110_000, 112_000, GmslaRateTypeEnum.FEE, 14);
        var two = loan("BANK-B", "BANK-A", 110_000, 112_000, GmslaRateTypeEnum.FEE, 22);
        var margin = GmslaDefaultHeldMargin.builder().setHolder("BANK-B").setGiver("BANK-A").setValue(BigDecimal.valueOf(500)).build();
        // From B's side: loan one +1,986, loan two -1,978, margin held by B -500.
        BigDecimal net = fn(GmslaCloseOutNetAmount.class).evaluate(new ArrayList<>(List.of(one, two)), new ArrayList<>(List.of(margin)), "BANK-B");
        assertEquals(0, new BigDecimal("-492").compareTo(net));
        assertEquals(0, BigDecimal.ZERO.compareTo(fn(GmslaCloseOutNetAmount.class).evaluate(new ArrayList<>(), new ArrayList<>(), "BANK-B")));
    }
}
