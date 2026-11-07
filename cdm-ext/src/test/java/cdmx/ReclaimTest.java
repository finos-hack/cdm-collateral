package cdmx;

import cdm.event.common.TransferState;
import cdm.event.common.UnscheduledTransfer;
import cdmx.collateral.enforcement.CollateralReclaim;
import cdmx.collateral.enforcement.ReclaimInstruction;
import cdmx.collateral.enforcement.functions.Create_CollateralReclaim;
import com.rosetta.model.lib.records.Date;
import org.junit.jupiter.api.Test;

import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.Map;

import static cdmx.Cdm.*;
import static cdmx.Data.*;
import static cdmx.EnforcementTest.held;
import static cdmx.EnforcementTest.noticeDoc;
import static cdmx.PortfolioTest.balance;
import static cdmx.PortfolioTest.holdings;
import static org.junit.jupiter.api.Assertions.*;

/** Two-way initial margin (wp-adr-two-way-im): BANK-A posted 128,589 tUST (USD 12,400,094 after haircuts) to BANK-B,
 *  BANK-B defaults, and BANK-A takes its collateral back. Amounts invented. */
class ReclaimTest {
    private final Create_CollateralReclaim reclaim = fn(Create_CollateralReclaim.class);
    private static final Date NOTICE = Date.of(2026, 10, 20);
    private static final Date RECLAIMED = Date.of(2026, 10, 21);
    private static final ZonedDateTime T = ZonedDateTime.of(2026, 10, 21, 9, 0, 0, 0, ZoneOffset.UTC);

    static ReclaimInstruction instruction(String defaulting, String nonDefaulting, Number units, Number value) {
        return load(ReclaimInstruction.class, o("notice", noticeDoc(defaulting, nonDefaulting, "FailureToPayOrDeliver", NOTICE),
            "reclaimedCollateral", l(position(units)), "reclaimedValue", money(value)));
    }

    private CollateralReclaim run(ReclaimInstruction instruction) {
        return reclaim.evaluate(held(), "R-1", RECLAIMED, T, instruction);
    }

    @Test
    void theSecuredPartysDefaultReturnsTheWholePortfolioToThePledgor() {
        CollateralReclaim r = run(instruction("BANK-B", "BANK-A", 128_589, 12_400_094));
        assertEquals(Map.of(), holdings(r.getAfter()));
        assertEquals("0", balance(r.getAfter()));
        assertEquals("12400094", balance(r.getBefore()));
        assertEquals(1, r.getTransfer().size());
        TransferState t = r.getTransfer().get(0);
        UnscheduledTransfer u = t.getTransfer().getUnscheduledTransfer();
        assertEquals("BANK-B", u.getPayerReceiver().getPayerPartyReference().getValue().getPartyId().get(0).getIdentifier().getValue());
        assertEquals("BANK-A", u.getPayerReceiver().getReceiverPartyReference().getValue().getPartyId().get(0).getIdentifier().getValue());
        assertEquals(RECLAIMED, u.getSettlementDate().getAdjustedDate().getValue());
        assertEquals("CollateralReclaimed", r.getEventQualifier());
        assertEquals("", failedText(r));
    }

    @Test
    void onlyTheSecuredPartysDefaultAllowsAReclaim() {
        assertTrue(rejected(() -> run(instruction("BANK-A", "BANK-B", 128_589, 12_400_094)))
            .contains("Defaulting Party is the secured party"));
    }

    @Test
    void onlyThePledgorReclaims() {
        assertTrue(rejected(() -> run(instruction("BANK-B", "BANK-C", 128_589, 12_400_094)))
            .contains("Only the pledgor"));
    }

    @Test
    void aReclaimReturnsEveryPositionInFull() {
        assertTrue(rejected(() -> run(instruction("BANK-B", "BANK-A", 100_000, 12_400_094)))
            .contains("returned in full"));
    }

    @Test
    void theValueReturnedIsTheBalance() {
        assertTrue(rejected(() -> run(instruction("BANK-B", "BANK-A", 128_589, 12_000_000)))
            .contains("value returned is the balance"));
    }

    @Test
    void theReclaimSurvivesARuneJsonRoundTrip() throws Exception {
        CollateralReclaim r = run(instruction("BANK-B", "BANK-A", 128_589, 12_400_094));
        assertEquals(r, JSON.readValue(toJson(r), CollateralReclaim.class));
    }
}
