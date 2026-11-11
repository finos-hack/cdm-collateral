package collateral;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.*;

/** The recall notice and its withdrawal on the prototype's loans (task-gmsla-recall, wp-adr-gmsla-recall). */
class CdmRecallTest {
    static final LocalDate THU = LocalDate.of(2026, 11, 12);

    @Test
    void aNewLoanIsRecallableWithTheSettlementCycleAndPassesCdmValidation() {
        for (boolean cash : new boolean[] {true, false}) {
            var b = CdmLoan.book(CdmLoanTest.terms(cash));
            assertEquals(CdmLoan.RECALL_SETTLEMENT_DAYS, CdmRecall.offset(b.trade()));
            assertEquals(java.util.List.of(), CdmRuntime.failures(b.trade()));
        }
    }

    @Test
    void theLenderRecallsPartDueTwoBusinessDaysLaterAndTheBorrowerRebuildsIt() {
        var b = CdmLoan.book(CdmLoanTest.terms(true));
        var n = CdmRecall.notice(b.trade(), b.hash(), 40_000, THU);
        assertEquals(LocalDate.of(2026, 11, 16), n.notice().getIntendedSettlementDate().toLocalDate()); // over the weekend
        assertEquals(20261116, n.settlementDate());
        assertEquals(LocalDate.of(2026, 11, 16), CdmRecall.fromYyyymmdd(n.settlementDate()));
        assertEquals(n.hash(), CdmRecall.verify(n.json(), b.trade()).hash());
        // A due date that does not follow from the notice date fails; the quantity is held by the on-chain notice hash.
        String tampered = n.json().replace("2026-11-16", "2026-11-14");
        assertNotEquals(n.json(), tampered);
        assertThrows(IllegalStateException.class, () -> CdmRecall.verify(tampered, b.trade()));
        assertThrows(IllegalStateException.class, () -> CdmRecall.notice(b.trade(), b.hash(), 100_001, THU));
    }

    @Test
    void afterAPartialReturnTheRestIsStillRecallableAndARecallIsOverdueAfterItsDate() {
        var b = CdmLoan.book(CdmLoanTest.terms(false));
        var part = CdmLoan.returnOf(b.trade(), b.loan().getTerms(), 40_000, THU);
        var n = CdmRecall.notice(part.after(), part.hash(), 60_000, THU);
        assertEquals(0, n.notice().getQuantityOutstanding().compareTo(java.math.BigDecimal.valueOf(60_000)));
        assertFalse(CdmRecall.overdue(LocalDate.of(2026, 11, 16), LocalDate.of(2026, 11, 16)));
        assertTrue(CdmRecall.overdue(LocalDate.of(2026, 11, 16), LocalDate.of(2026, 11, 17)));
    }

    @Test
    void aWithdrawalNamesTheNotice() {
        var b = CdmLoan.book(CdmLoanTest.terms(true));
        var n = CdmRecall.notice(b.trade(), b.hash(), 100_000, THU);
        var w = CdmRecall.withdrawal(n.notice(), n.hash(), THU.plusDays(1));
        assertEquals(n.hash(), w.withdrawal().getNotice());
        assertNotEquals(n.hash(), w.hash());
    }
}
