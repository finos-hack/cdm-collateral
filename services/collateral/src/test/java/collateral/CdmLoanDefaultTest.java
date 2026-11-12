package collateral;

import cdm.event.qualification.functions.Qualify_Termination;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** A GMSLA default close-out (task-gmsla-default-close-out, wp-adr-gmsla-default-close-out). */
class CdmLoanDefaultTest {
    static final LocalDate DELIVERED = CdmLoanInvoiceTest.DELIVERED, ETD = LocalDate.of(2026, 11, 21);

    static CdmLoanDefault.LoanInput input(CdmLoan.Booking b, String id, LocalDate unbilledFrom, String price, String collateralPrice) {
        return new CdmLoanDefault.LoanInput(id, b.trade(), b.loan().getTerms(), List.of(new CdmLoanInvoice.Change(DELIVERED, b.trade())),
                unbilledFrom, new BigDecimal(price), new BigDecimal(collateralPrice));
    }

    /** BANK-B (not in default) closes out on 2026-11-21 BANK-A's two loans to it: 100,000 tMMF against 1,037 tUST at a
     *  0.5% fee, and 100,000 tMMF against 102,000 tUSD at a 4% rebate; BANK-B holds 500 tUSD of GMSLA margin. */
    static CdmLoanDefault.Statement statement() {
        CdmLoan.Booking ust = CdmLoan.book(CdmLoanTest.terms(false)), cash = CdmLoan.book(CdmLoanTest.terms(true));
        var n = CdmLoanDefault.notice("BANK-B", "BANK-A", ETD, ETD, false);
        return CdmLoanDefault.statement(n.notice(), "USD", ETD,
                List.of(input(ust, "0xloan-ust", DELIVERED, "1.1", "100"), input(cash, "0xloan-cash", DELIVERED, "1", "1")),
                List.of(new CdmLoanDefault.MarginInput("BANK-B", "BANK-A", "USD", true, 500, BigDecimal.ONE, List.of("0xcall"))));
    }

    @Test
    void everyLoanIsValuedAtTheTerminationDateAndSetOffIntoOneBalance() {
        var s = statement();
        var ust = s.statement().getLoanValue().get(0);
        // 100,000 x 1.1 owed to the lender; 1,037 tUST x 100 owed back; fee 110,000 x 0.5% x 10/360 = 15.28, rounded.
        assertEquals(0, new BigDecimal("110000").compareTo(ust.getDefaultMarketValue()));
        assertEquals(0, new BigDecimal("103700").compareTo(ust.getCollateralValue()));
        assertEquals(0, new BigDecimal("15").compareTo(ust.getAccruedAmount()));
        assertEquals("Fee", ust.getAccrual().getRateType().toString());
        assertTrue(CdmRuntime.fn(Qualify_Termination.class).evaluate(ust.getTermination()));
        var cash = s.statement().getLoanValue().get(1);
        // 100,000 owed to the lender, 102,000 cash owed back, rebate 102,000 x 4% x 10/360 = 113.33 owed by the lender.
        assertEquals(0, new BigDecimal("113").compareTo(cash.getAccruedAmount()));
        // From B's side: -(110,000 - 103,700 + 15) - (100,000 - 102,000 - 113) - 500 = -4,702: B pays A.
        assertEquals(0, new BigDecimal("-4702").compareTo(s.statement().getNetAmount()));
        assertEquals(4702, s.balance());
        assertEquals("BANK-B", s.payer());
        assertEquals(List.of("0xcall"), CdmLoanDefault.settledCalls(s.statement()));
        assertEquals("", String.join("; ", CdmRuntime.failures(s.statement()).stream().map(Object::toString).toList()));
        // The same inputs rebuild the same statement; the parsed document too.
        assertEquals(s.hash(), statement().hash());
        assertEquals(s.json(), CdmRuntime.toJson(CdmLoanDefault.parse(s.json())));
    }

    @Test
    void onlyTheUnbilledDaysAccrueAndNoAccrualWhenAllIsBilled() {
        CdmLoan.Booking ust = CdmLoan.book(CdmLoanTest.terms(false));
        var n = CdmLoanDefault.notice("BANK-B", "BANK-A", ETD, ETD, false);
        var part = CdmLoanDefault.statement(n.notice(), "USD", ETD, List.of(input(ust, "0xloan-ust", LocalDate.of(2026, 11, 16), "1.1", "100")), List.of());
        assertEquals(0, new BigDecimal("8").compareTo(part.statement().getLoanValue().get(0).getAccruedAmount())); // 7.64
        var none = CdmLoanDefault.statement(n.notice(), "USD", ETD, List.of(input(ust, "0xloan-ust", ETD, "1.1", "100")), List.of());
        assertNull(none.statement().getLoanValue().get(0).getAccrual());
        // From B's side: -(110,000 - 103,700) = -6,300.
        assertEquals(6300, none.balance());
        assertEquals("", String.join("; ", CdmRuntime.failures(none.statement()).stream().map(Object::toString).toList()));
    }

    @Test
    void theNoticeAndTheStatementRefuseWhatTheGmslaDoesNotAllow() {
        assertThrows(RuntimeException.class, () -> CdmLoanDefault.notice("BANK-B", "BANK-B", ETD, ETD, false));
        assertThrows(RuntimeException.class, () -> CdmLoanDefault.notice("BANK-B", "BANK-A", ETD, ETD.plusDays(1), true));
        var n = CdmLoanDefault.notice("BANK-B", "BANK-A", ETD, ETD, false);
        assertThrows(IllegalArgumentException.class, () -> CdmLoanDefault.statement(n.notice(), "USD", ETD, List.of(), List.of()));
        CdmLoan.Booking cash = CdmLoan.book(CdmLoanTest.terms(true));
        assertThrows(IllegalArgumentException.class, () -> CdmLoanDefault.statement(n.notice(), "USD", ETD,
                List.of(input(cash, "0xloan-cash", DELIVERED, "1", "1.01")), List.of()));
    }

    @Test
    void theCounterpartyRebuildsTheSameStatementFromTheParsedDocumentAndItsOwnBookings() {
        var s = statement();
        var parsed = CdmLoanDefault.parse(s.json());
        CdmLoan.Booking ust = CdmLoan.verify(CdmLoan.book(CdmLoanTest.terms(false)).json()), cash = CdmLoan.verify(CdmLoan.book(CdmLoanTest.terms(true)).json());
        BigDecimal[] pu = CdmLoanDefault.statedPrices(parsed, "0xloan-ust"), pc = CdmLoanDefault.statedPrices(parsed, "0xloan-cash");
        var again = CdmLoanDefault.statement(parsed.getNotice(), parsed.getBaseCurrency(), parsed.getValuationDate().toLocalDate(),
                List.of(new CdmLoanDefault.LoanInput("0xloan-ust", ust.trade(), ust.loan().getTerms(), List.of(new CdmLoanInvoice.Change(DELIVERED, ust.trade())), DELIVERED, pu[0], pu[1]),
                        new CdmLoanDefault.LoanInput("0xloan-cash", cash.trade(), cash.loan().getTerms(), List.of(new CdmLoanInvoice.Change(DELIVERED, cash.trade())), DELIVERED, pc[0], pc[1])),
                List.of(new CdmLoanDefault.MarginInput("BANK-B", "BANK-A", "USD", true, 500, BigDecimal.ONE, List.of("0xcall"))));
        assertEquals(s.json(), again.json());
    }
}
