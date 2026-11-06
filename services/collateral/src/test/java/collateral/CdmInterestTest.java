package collateral;

import cdmx.collateral.interest.CollateralInterestStatement;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.*;

/** The CDM document of flow-interest-on-cash (G17) as the collateral service builds and checks it. */
class CdmInterestTest {
    private static final LocalDate START = LocalDate.of(2026, 11, 1);
    private static final LocalDate END = LocalDate.of(2026, 12, 1);

    @Test
    void aMonthOnTenMillionTUsdIsRoundedToWholeUsd() {
        // 10,000,000 x 4.30% x 30/360 = 35,833.33, rounded to 35,833
        CdmInterest c = CdmInterest.build("BANK-B", "BANK-A", START, END, 10_000_000, new BigDecimal("0.043"));
        assertEquals(30, c.statement.getAccrual().size());
        assertEquals(35_833, CdmInterest.usd(c.statement.getInterestAmount()));
        assertEquals(35_833, CdmInterest.usd(c.statement.getTransferAmount()));
        assertEquals(c.hash, Cdm.keccakHex(c.json));
        CollateralInterestStatement s = CdmInterest.verify(c.json);
        assertEquals(c.statement, s);
    }

    @Test
    void negativeInterestIsPayableByThePledgor() {
        CdmInterest c = CdmInterest.build("BANK-B", "BANK-A", START, END, 10_000_000, new BigDecimal("-0.005"));
        assertEquals(-4_167, CdmInterest.usd(c.statement.getTransferAmount()));
        CdmInterest.verify(c.json);
    }

    @Test
    void aStatementWhoseAmountDoesNotFollowFromItsDaysIsRejected() {
        CdmInterest c = CdmInterest.build("BANK-B", "BANK-A", START, END, 10_000_000, new BigDecimal("0.043"));
        String tampered = c.json.replace("35833", "45833");
        assertNotEquals(c.json, tampered);
        assertThrows(RuntimeException.class, () -> CdmInterest.verify(tampered));
    }

    @Test
    void thePeriodMustBeForward() {
        assertThrows(IllegalArgumentException.class,
            () -> CdmInterest.build("BANK-B", "BANK-A", END, START, 1, new BigDecimal("0.01")));
    }
}
