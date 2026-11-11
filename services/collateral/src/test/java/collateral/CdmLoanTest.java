package collateral;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.*;

/** A securities loan's booking, delivery and returns as CDM data (task-gmsla-loan-delivery-return). */
class CdmLoanTest {
    static final LocalDate D = LocalDate.of(2026, 11, 11);
    static final String TMMF = "US9128100000", TUST = "US912810TM60";

    static CdmLoan.Terms terms(boolean cash) {
        BigDecimal margin = new BigDecimal("1.02");
        long collateral = cash
                ? CdmLoan.requiredCollateral(100_000, BigDecimal.ONE, margin, BigDecimal.ONE)
                : CdmLoan.requiredCollateral(100_000, BigDecimal.ONE, margin, new BigDecimal("98.4"));
        return new CdmLoan.Terms(cash ? "0xloan-cash" : "0xloan-ust", "BANK-A", "BANK-B", TMMF, 100_000, BigDecimal.ONE,
                cash ? null : TUST, collateral, margin, cash ? new BigDecimal("0.04") : null, cash ? null : new BigDecimal("0.005"), D, null);
    }

    @Test
    void requiredCollateralIsMarketValueTimesMarginRoundedUp() {
        assertEquals(102_000, CdmLoan.requiredCollateral(100_000, BigDecimal.ONE, new BigDecimal("1.02"), BigDecimal.ONE));
        assertEquals(1037, CdmLoan.requiredCollateral(100_000, BigDecimal.ONE, new BigDecimal("1.02"), new BigDecimal("98.4"))); // 1036.59
    }

    @Test
    void returnCollateralIsProRataRoundedDownAndAllOnAFullReturn() {
        assertEquals(40_800, CdmLoan.returnCollateral(102_000, 40_000, 100_000));
        assertEquals(414, CdmLoan.returnCollateral(1037, 40_000, 100_000)); // 414.8
        assertEquals(1037, CdmLoan.returnCollateral(1037, 100_000, 100_000));
    }

    @Test
    void cashLoanBooksVerifiesDeliversAndReturnsInTwoParts() {
        CdmLoan.Booking b = CdmLoan.book(terms(true));
        assertEquals(b.hash(), CdmLoan.verify(b.json()).hash());
        CdmLoan.Terms t = CdmLoan.terms(b.trade(), b.loan().getTerms());
        assertTrue(t.cash());
        assertEquals(100_000, t.quantity());
        assertEquals(102_000, t.collateralAmount());
        assertEquals(TMMF, t.isin());

        CdmLoan.Settlement d = CdmLoan.delivery(b, D);
        assertEquals(102_000, d.collateralAmount());

        CdmLoan.Settlement part = CdmLoan.returnOf(b.trade(), b.loan().getTerms(), 40_000, D.plusDays(3));
        assertEquals("PartialReturn", part.settlement().getReturnQualification().toString());
        assertEquals(40_800, part.collateralAmount());
        assertEquals(60_000, CdmLoan.terms(part.after(), null).quantity());
        assertEquals(61_200, CdmLoan.collateralHeld(part.after()));
        assertEquals(part.hash(), CdmLoan.verifyReturn(part.json()).hash());
        assertTrue(CdmLoan.cdmQualifications(part.settlement().getReturnEvent()).contains("PartialTermination"));

        CdmLoan.Settlement rest = CdmLoan.returnOf(part.after(), b.loan().getTerms(), 60_000, D.plusDays(5));
        assertEquals("FullReturn", rest.settlement().getReturnQualification().toString());
        assertEquals(61_200, rest.collateralAmount());
        assertEquals(0, CdmLoan.collateralHeld(rest.after()));
        assertEquals(rest.hash(), CdmLoan.verifyReturn(rest.json()).hash());
        assertTrue(CdmLoan.cdmQualifications(rest.settlement().getReturnEvent()).contains("Termination"));
    }

    @Test
    void securitiesLoanReturnsInFullAndCdmAlsoQualifiesFullReturn() {
        CdmLoan.Booking b = CdmLoan.book(terms(false));
        assertEquals(b.hash(), CdmLoan.verify(b.json()).hash());
        CdmLoan.Terms t = CdmLoan.terms(b.trade(), b.loan().getTerms());
        assertFalse(t.cash());
        assertEquals(TUST, t.collateralIsin());
        assertEquals(1037, t.collateralAmount());
        CdmLoan.Settlement full = CdmLoan.returnOf(b.trade(), b.loan().getTerms(), 100_000, D.plusDays(1));
        assertEquals("FullReturn", full.settlement().getReturnQualification().toString());
        assertEquals(1037, full.collateralAmount());
        var cdm = CdmLoan.cdmQualifications(full.settlement().getReturnEvent());
        assertTrue(cdm.contains("Termination") && cdm.contains("FullReturn"), cdm.toString()); // D4
    }

    @Test
    void aTamperedBookingOrReturnIsRejected() {
        CdmLoan.Booking b = CdmLoan.book(terms(true));
        int at = b.json().lastIndexOf("100000"); // the loaned quantity in the event's after state
        assertTrue(at > 0);
        String tampered = b.json().substring(0, at) + "90000" + b.json().substring(at + 6);
        assertThrows(IllegalStateException.class, () -> CdmLoan.verify(tampered));
        CdmLoan.Settlement part = CdmLoan.returnOf(b.trade(), b.loan().getTerms(), 40_000, D);
        assertThrows(RuntimeException.class, () -> CdmLoan.verifyReturn(part.json().replace("40800", "50800")));
        assertThrows(IllegalArgumentException.class, () -> CdmLoan.returnOf(b.trade(), b.loan().getTerms(), 100_001, D));
    }
}
