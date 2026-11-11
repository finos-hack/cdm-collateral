package cdmx;

import cdmx.collateral.gmsla.GmslaRecallNotice;
import cdmx.collateral.gmsla.GmslaRecallWithdrawal;
import cdmx.collateral.gmsla.functions.GmslaRecallOverdue;
import cdmx.collateral.gmsla.functions.GmslaRecallRemaining;
import cdmx.collateral.gmsla.functions.GmslaRecallSettlementDate;
import com.rosetta.model.lib.records.Date;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.Map;

import static cdmx.Cdm.*;
import static org.junit.jupiter.api.Assertions.*;

/** The rules of a recall of loaned securities (task-gmsla-recall, wp-adr-gmsla-recall). The loan's RecallProvision and
 *  the notice built from the chain are tested in the collateral service (CdmRecallTest). */
class GmslaRecallTest {
    static Date d(String s) {
        return Date.parse(s);
    }

    static Date due(String notice, int offset) {
        return fn(GmslaRecallSettlementDate.class).evaluate(d(notice), offset);
    }

    @Test
    void theIntendedSettlementDateSkipsWeekends() {
        assertEquals(d("2026-11-13"), due("2026-11-11", 2)); // Wednesday -> Friday
        assertEquals(d("2026-11-16"), due("2026-11-12", 2)); // Thursday -> Monday
        assertEquals(d("2026-11-17"), due("2026-11-13", 2)); // Friday -> Tuesday
        assertEquals(d("2026-11-16"), due("2026-11-14", 1)); // Saturday -> Monday
        rejected(() -> due("2026-11-11", 0));
    }

    @Test
    void aRecallIsOverdueAfterItsDateAndAReturnReducesIt() {
        assertFalse(fn(GmslaRecallOverdue.class).evaluate(d("2026-11-13"), d("2026-11-13")));
        assertTrue(fn(GmslaRecallOverdue.class).evaluate(d("2026-11-13"), d("2026-11-16")));
        assertEquals(0, fn(GmslaRecallRemaining.class).evaluate(new BigDecimal(40), new BigDecimal(30)).compareTo(BigDecimal.TEN));
        assertEquals(0, fn(GmslaRecallRemaining.class).evaluate(new BigDecimal(40), new BigDecimal(40)).compareTo(BigDecimal.ZERO));
        assertEquals(0, fn(GmslaRecallRemaining.class).evaluate(new BigDecimal(40), new BigDecimal(60)).compareTo(BigDecimal.ZERO));
    }

    static Map<String, Object> notice(long quantity, String date, String due) {
        return o("loanId", "L1", "tradeHash", "0x01", "lender", "BANK-A", "borrower", "BANK-B", "security", "US9128100000",
                "quantityOutstanding", 100000, "quantity", quantity, "noticeDate", date, "settlementOffset", 2, "intendedSettlementDate", due);
    }

    @Test
    void aNoticeRecallsAllOrPartAndStatesItsDateFromTheOffset() {
        assertEquals("", failedText(load(GmslaRecallNotice.class, notice(40000, "2026-11-11", "2026-11-13"))));
        assertEquals("", failedText(load(GmslaRecallNotice.class, notice(100000, "2026-11-12", "2026-11-16"))));
        assertTrue(failedText(load(GmslaRecallNotice.class, notice(100001, "2026-11-11", "2026-11-13"))).contains("PartOrAll"));
        assertTrue(failedText(load(GmslaRecallNotice.class, notice(0, "2026-11-11", "2026-11-13"))).contains("PartOrAll"));
        assertTrue(failedText(load(GmslaRecallNotice.class, notice(40000, "2026-11-12", "2026-11-14"))).contains("SettlementDate"));
    }

    @Test
    void aWithdrawalNamesTheNotice() {
        assertEquals("", failedText(load(GmslaRecallWithdrawal.class, o("loanId", "L1", "notice", "0xab", "lender", "BANK-A", "borrower", "BANK-B", "withdrawalDate", "2026-11-12"))));
        assertTrue(failedText(load(GmslaRecallWithdrawal.class, o("loanId", "L1", "lender", "BANK-A", "borrower", "BANK-B", "withdrawalDate", "2026-11-12"))).contains("notice"));
    }
}
