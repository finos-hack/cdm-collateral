package collateral;

import cdm.event.qualification.functions.Qualify_CashTransfer;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** The rebate invoice of a cash loan (task-gmsla-rebate, wp-adr-gmsla-rebate). */
class CdmLoanInvoiceTest {
    static final LocalDate DELIVERED = LocalDate.of(2026, 11, 11), RETURNED = LocalDate.of(2026, 11, 26);

    /** A cash loan of 100,000 tMMF against 102,000 tUSD at 4%, and 40,000 returned on 2026-11-26 (61,200 kept). */
    static List<CdmLoanInvoice.Change> timeline(CdmLoan.Booking b) {
        var r = CdmLoan.returnOf(b.trade(), b.loan().getTerms(), 40_000, RETURNED);
        return List.of(new CdmLoanInvoice.Change(DELIVERED, b.trade()), new CdmLoanInvoice.Change(RETURNED, r.after()));
    }

    @Test
    void theRebateAccruesOnTheCashHeldInEachPartOfThePeriod() {
        CdmLoan.Booking b = CdmLoan.book(CdmLoanTest.terms(true));
        var inv = CdmLoanInvoice.rebate(timeline(b), b.loan().getTerms(), DELIVERED, LocalDate.of(2026, 12, 11));
        // 102,000 x 4% x 15/360 = 170 and 61,200 x 4% x 15/360 = 102.
        assertEquals(2, inv.doc().getPeriod().size());
        assertEquals(0, new BigDecimal("170").compareTo(inv.doc().getPeriod().get(0).getAccrual()));
        assertEquals(0, new BigDecimal("102").compareTo(inv.doc().getPeriod().get(1).getAccrual()));
        assertEquals(0, new BigDecimal("272").compareTo(inv.amount()));
        assertEquals(272, inv.onChainAmount());
        assertEquals(2, inv.doc().getInvoice().getBillingRecord().size());
        assertTrue(CdmRuntime.fn(Qualify_CashTransfer.class).evaluate(inv.doc().getPaymentEvent()));
        assertEquals("", String.join("; ", CdmRuntime.failures(inv.doc()).stream().map(Object::toString).toList()));
    }

    @Test
    void theNextInvoiceStartsAtTheBilledThroughDateAndAccruesOnTheCashKept() {
        CdmLoan.Booking b = CdmLoan.book(CdmLoanTest.terms(true));
        var inv = CdmLoanInvoice.rebate(timeline(b), b.loan().getTerms(), LocalDate.of(2026, 12, 11), LocalDate.of(2026, 12, 21));
        assertEquals(1, inv.doc().getPeriod().size());
        assertEquals(68, inv.onChainAmount()); // 61,200 x 4% x 10/360
    }

    @Test
    void thePayerRebuildsTheSameInvoiceAndRefusesATamperedOne() {
        CdmLoan.Booking b = CdmLoan.book(CdmLoanTest.terms(true));
        var tl = timeline(b);
        var inv = CdmLoanInvoice.rebate(tl, b.loan().getTerms(), DELIVERED, LocalDate.of(2026, 12, 11));
        assertEquals(inv.hash(), CdmLoanInvoice.verify(inv.json(), tl, b.loan().getTerms()).hash());
        String more = inv.json().replaceFirst("\"amount\"\\s*:\\s*272", "\"amount\":300");
        assertNotEquals(inv.json(), more);
        assertThrows(RuntimeException.class, () -> CdmLoanInvoice.verify(more, tl, b.loan().getTerms()));
        // Over a timeline without the return, the same period rebuilds to another invoice.
        assertThrows(RuntimeException.class, () -> CdmLoanInvoice.verify(inv.json(), List.of(tl.get(0)), b.loan().getTerms()));
    }

    /** A loan of 100,000 tMMF against 1,037 tUST at a 0.5% fee; 40,000 returned on 2026-11-26. */
    static List<CdmLoanInvoice.Change> ustTimeline(CdmLoan.Booking b) {
        var r = CdmLoan.returnOf(b.trade(), b.loan().getTerms(), 40_000, RETURNED);
        return List.of(new CdmLoanInvoice.Change(DELIVERED, b.trade()), new CdmLoanInvoice.Change(RETURNED, r.after()));
    }

    @Test
    void theLenderBillsTheFeeOnTheMarketValueOfTheQuantityOutstandingAtTheBillingDatePrice() {
        CdmLoan.Booking b = CdmLoan.book(CdmLoanTest.terms(false));
        var inv = CdmLoanInvoice.fee(ustTimeline(b), b.loan().getTerms(), DELIVERED, LocalDate.of(2026, 12, 11), new BigDecimal("1.1"));
        // 110,000 x 0.5% x 15/360 = 22.92 and 66,000 x 0.5% x 15/360 = 13.75: 36.67, rounded to 37.
        assertEquals("Fee", inv.doc().getRateType().toString());
        assertEquals(2, inv.doc().getPeriod().size());
        assertEquals(0, new BigDecimal("110000").compareTo(inv.doc().getPeriod().get(0).getNotional()));
        assertEquals(0, new BigDecimal("60000").compareTo(inv.doc().getPeriod().get(1).getQuantity()));
        assertEquals(37, inv.onChainAmount());
        // The borrower pays the lender; the lender sends the invoice.
        var transfer = CdmRuntime.JSON.valueToTree(inv.doc().getPaymentEvent()).toString();
        assertTrue(CdmRuntime.fn(Qualify_CashTransfer.class).evaluate(inv.doc().getPaymentEvent()));
        assertEquals("BANK-A", inv.doc().getInvoice().getSendingParty().getName().getValue());
        assertTrue(transfer.contains("BANK-B"), transfer);
        assertEquals("", String.join("; ", CdmRuntime.failures(inv.doc()).stream().map(Object::toString).toList()));
        // The borrower rebuilds it; at another price, or as a rebate, it does not.
        assertEquals(inv.hash(), CdmLoanInvoice.verify(inv.json(), ustTimeline(b), b.loan().getTerms()).hash());
        assertNotEquals(inv.hash(), CdmLoanInvoice.fee(ustTimeline(b), b.loan().getTerms(), DELIVERED, LocalDate.of(2026, 12, 11), BigDecimal.ONE).hash());
        assertThrows(IllegalArgumentException.class, () -> CdmLoanInvoice.rebate(ustTimeline(b), b.loan().getTerms(), DELIVERED, RETURNED));
    }

    @Test
    void aSubstitutionDoesNotSplitTheFee() {
        CdmLoan.Booking b = CdmLoan.book(CdmLoanTest.terms(false));
        var s = CdmLoanSubstitution.substitute(b.trade(), b.loan().getTerms(), CdmLoanSubstitutionTest.TAGY, BigDecimal.ONE, new BigDecimal("99.2"), RETURNED);
        var tl = List.of(new CdmLoanInvoice.Change(DELIVERED, b.trade()), new CdmLoanInvoice.Change(RETURNED, s.after()));
        var inv = CdmLoanInvoice.fee(tl, b.loan().getTerms(), DELIVERED, LocalDate.of(2026, 12, 11), BigDecimal.ONE);
        assertEquals(1, inv.doc().getPeriod().size());
        assertEquals(42, inv.onChainAmount()); // 100,000 x 0.5% x 30/360 = 41.67
    }

    @Test
    void aReturnedLoanIsBilledToItsReturnDateAndALoanAgainstSecuritiesHasNoRebate() {
        CdmLoan.Booking b = CdmLoan.book(CdmLoanTest.terms(true));
        var full = CdmLoan.returnOf(b.trade(), b.loan().getTerms(), 100_000, RETURNED);
        var tl = List.of(new CdmLoanInvoice.Change(DELIVERED, b.trade()), new CdmLoanInvoice.Change(RETURNED, full.after()));
        var inv = CdmLoanInvoice.rebate(tl, b.loan().getTerms(), DELIVERED, RETURNED);
        assertEquals(170, inv.onChainAmount());
        CdmLoan.Booking ust = CdmLoan.book(CdmLoanTest.terms(false));
        assertThrows(IllegalArgumentException.class, () -> CdmLoanInvoice.rebate(List.of(new CdmLoanInvoice.Change(DELIVERED, ust.trade())),
                ust.loan().getTerms(), DELIVERED, RETURNED));
        assertThrows(IllegalArgumentException.class, () -> CdmLoanInvoice.rebate(tl, b.loan().getTerms(), RETURNED, RETURNED));
    }
}
