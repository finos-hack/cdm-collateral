package collateral;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** The aggregated GMSLA mark and its call (task-gmsla-marking, wp-adr-gmsla-marking). */
class CdmGmslaMarkTest {
    static final LocalDate DAY = LocalDate.of(2026, 11, 11);

    static CdmGmslaMark.LoanInput loan(String id, String lender, String borrower, long qty, String price, long cash) {
        return new CdmGmslaMark.LoanInput(id, "0x01", lender, borrower, "US0000000MMF", qty, new BigDecimal(price), new BigDecimal("1.02"),
                "USD", cash, BigDecimal.ONE);
    }

    @Test
    void theLenderCallsTheShortfallAndTheBorrowerRebuildsTheSameStatement() {
        var loans = List.of(loan("L1", "BANK-A", "BANK-B", 5_000_000, "1.1", 5_100_000));
        var a = CdmGmslaMark.build("BANK-A", "BANK-B", DAY, "USD", loans, BigDecimal.ZERO, 250_000);
        assertEquals(510_000, CdmGmslaMark.callAmount(a.statement()));
        // The borrower states it for the lender from its own view, with the loans in another order: the same hash.
        var again = CdmGmslaMark.build("BANK-A", "BANK-B", DAY, "USD", List.of(loans.get(0)), BigDecimal.ZERO, 250_000);
        assertEquals(a.hash(), again.hash());
        assertEquals(510_000, CdmGmslaMark.callAmount(CdmGmslaMark.verify(a.json())));
        // Stated for the borrower: nothing to call. At another price or date the hash differs.
        assertEquals(0, CdmGmslaMark.callAmount(CdmGmslaMark.build("BANK-B", "BANK-A", DAY, "USD", loans, BigDecimal.ZERO, 250_000).statement()));
        assertNotEquals(a.hash(), CdmGmslaMark.build("BANK-A", "BANK-B", DAY.plusDays(1), "USD", loans, BigDecimal.ZERO, 250_000).hash());
    }

    @Test
    void marginHeldCountsInTheNextMarkAndTheBorrowerCallsTheExcessBack() {
        var restored = List.of(loan("L1", "BANK-A", "BANK-B", 5_000_000, "1", 5_100_000));
        assertEquals(0, CdmGmslaMark.callAmount(CdmGmslaMark.build("BANK-A", "BANK-B", DAY, "USD", restored, new BigDecimal(510_000), 250_000).statement()));
        var b = CdmGmslaMark.build("BANK-B", "BANK-A", DAY, "USD", restored, new BigDecimal(-510_000), 250_000);
        assertEquals(510_000, CdmGmslaMark.callAmount(b.statement()));
        var rows = (List<?>) CdmGmslaMark.view(b.statement()).get("loans");
        assertEquals("borrower", ((java.util.Map<?, ?>) rows.get(0)).get("role"));
        assertEquals("510000.00", CdmGmslaMark.view(b.statement()).get("netExposureUsd"));
    }

    @Test
    void withNoOpenLoanOnlyTheMarginHeldCounts() {
        var s = CdmGmslaMark.build("BANK-B", "BANK-A", DAY, "USD", List.of(), new BigDecimal(-300_000), 250_000);
        assertEquals(300_000, CdmGmslaMark.callAmount(s.statement()));
        assertEquals(List.of(), CdmGmslaMark.view(s.statement()).get("loans"));
    }

    @Test
    void aTamperedStatementIsRejected() {
        var a = CdmGmslaMark.build("BANK-A", "BANK-B", DAY, "USD", List.of(loan("L1", "BANK-A", "BANK-B", 5_000_000, "1.1", 5_100_000)), BigDecimal.ZERO, 250_000);
        String tampered = a.json().replace("\"callAmount\":510000", "\"callAmount\":600000");
        assertNotEquals(a.json(), tampered);
        assertThrows(IllegalStateException.class, () -> CdmGmslaMark.verify(tampered));
    }

    @Test
    void aGmslaIssuanceNamesTheGmslaAndCarriesTheStatementHash() {
        String doc = Cdm.issueGmsla("C-1", "BANK-A", 510_000, "0xabc").json;
        assertEquals("GMSLA", CdmGmslaMark.agreementOf(doc));
        assertEquals("0xabc", CdmGmslaMark.markStatementOf(doc));
        assertFalse(CdmRepoMargin.isGmraIssue(doc));
        assertEquals("GMRA", CdmGmslaMark.agreementOf(Cdm.issue("C-1", "BANK-A", 300_000, "Delivery", null, "VM", true).json));
        assertNull(CdmGmslaMark.agreementOf(Cdm.issue("C-1", "BANK-A", 300_000, "Delivery", null, "VM").json));
        assertNull(CdmGmslaMark.markStatementOf(Cdm.issue("C-1", "BANK-A", 300_000, "Delivery", null, "VM").json));
    }
}
