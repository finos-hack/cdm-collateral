package cdmx;

import cdm.event.common.CollateralPortfolio;
import cdm.event.common.TransferState;
import cdm.event.common.TransferStatusEnum;
import cdm.event.common.UnscheduledTransfer;
import cdm.legaldocumentation.csa.SecurityAgreementElections;
import cdmx.collateral.closeout.CollateralArrangementEnum;
import cdmx.collateral.closeout.functions.CloseOutNetting;
import cdmx.collateral.enforcement.CollateralEnforcement;
import cdmx.collateral.enforcement.DefaultNotice;
import cdmx.collateral.enforcement.EnforcementInstruction;
import cdmx.collateral.enforcement.functions.Create_CollateralEnforcement;
import cdmx.collateral.portfolio.functions.ApplyCollateralEvent;
import com.rosetta.model.lib.records.Date;
import org.junit.jupiter.api.Test;

import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Map;

import static cdmx.Cdm.*;
import static cdmx.CloseOutTest.trades;
import static cdmx.Data.*;
import static cdmx.PortfolioTest.balance;
import static cdmx.PortfolioTest.delivered;
import static cdmx.PortfolioTest.holdings;
import static cdmx.ValuationTest.assertAmount;
import static cdmx.VariationMarginTest.bank;
import static org.junit.jupiter.api.Assertions.*;

/** Gap G14: enforcement against segregated initial margin, on the console's im-default scenario. BANK-A posted
 *  128,589 tUST (USD 12,400,094 after haircuts) to BANK-B, failed to pay, and BANK-B enforces. Amounts invented. */
class EnforcementTest {
    private final Create_CollateralEnforcement enforce = fn(Create_CollateralEnforcement.class);
    private static final Date NOTICE = Date.of(2026, 10, 20);
    private static final Date ENFORCED = Date.of(2026, 10, 21);
    private static final ZonedDateTime T = ZonedDateTime.of(2026, 10, 21, 9, 0, 0, 0, ZoneOffset.UTC);

    static CollateralPortfolio held() {
        return fn(ApplyCollateralEvent.class).evaluate(null, delivered());
    }

    static Map<String, Object> noticeDoc(String defaulting, String nonDefaulting, String event, Date etd) {
        Map<String, Object> n = o("defaultingParty", party(defaulting), "nonDefaultingParty", party(nonDefaulting),
            "eventOfDefault", event, "noticeDate", NOTICE.toString());
        if (etd != null) n.put("earlyTerminationDate", etd.toString());
        return n;
    }

    static Map<String, Object> noticeDoc() {
        return noticeDoc("BANK-A", "BANK-B", "FailureToPayOrDeliver", NOTICE);
    }

    static EnforcementInstruction instruction(Map<String, Object> notice, boolean control, Number units,
                                              Number valueAfterHaircuts, Number realised) {
        return load(EnforcementInstruction.class, o("notice", notice, "exclusiveControl", control,
            "enforcedCollateral", l(position(units)), "enforcedValue", money(valueAfterHaircuts),
            "realisedValue", money(realised)));
    }

    /** All 128,589 tUST, realised at 98.40: USD 12,653,158. */
    static EnforcementInstruction imDefault() {
        return instruction(noticeDoc(), true, 128_589, 12_400_094, 12_653_158);
    }

    static SecurityAgreementElections elections(boolean earlyTermination, boolean failureToPay) {
        return load(SecurityAgreementElections.class,
            o("enforcementEvent", o("earlyTerminationDate", earlyTermination, "failureToPay", failureToPay)));
    }

    private CollateralEnforcement run(SecurityAgreementElections elections, EnforcementInstruction instruction) {
        return enforce.evaluate(held(), elections, "E-1", ENFORCED, T, instruction);
    }

    @Test
    void imDefaultMovesTheSegregatedCollateralToTheSecuredParty() {
        CollateralEnforcement e = run(null, imDefault());
        assertEquals(Map.of(), holdings(e.getAfter()));
        assertEquals("0", balance(e.getAfter()));
        assertEquals("12400094", balance(e.getBefore()));
        assertEquals(1, e.getTransfer().size());
        TransferState t = e.getTransfer().get(0);
        UnscheduledTransfer u = t.getTransfer().getUnscheduledTransfer();
        assertEquals(TransferStatusEnum.SETTLED, t.getTransferStatus());
        assertEquals(0, u.getQuantity().getValue().compareTo(new java.math.BigDecimal(128_589)));
        assertEquals("BANK-A", u.getPayerReceiver().getPayerPartyReference().getValue().getPartyId().get(0).getIdentifier().getValue());
        assertEquals("BANK-B", u.getPayerReceiver().getReceiverPartyReference().getValue().getPartyId().get(0).getIdentifier().getValue());
        assertEquals(ENFORCED, u.getSettlementDate().getAdjustedDate().getValue());
        assertEquals("CollateralEnforced", e.getEventQualifier());
        assertEquals("", failedText(e));  // CDM's conditions on the portfolios and transfers
    }

    @Test
    void theRealisedValueIsAppliedInTheCloseOut() {  // G15: close-out amount USD 11.7m, surplus owed back to BANK-A
        CollateralEnforcement e = run(null, imDefault());
        assertAmount(-953_158, fn(CloseOutNetting.class).evaluate(bank("BANK-B"), bank("BANK-A"),
            CollateralArrangementEnum.SECURITY_INTEREST, trades("IRS-1", 11_700_000), List.of(),
            e.getInstruction().getRealisedValue(), "USD").getAmountPayable());
    }

    @Test
    void aPartialEnforcementLeavesTheRestSegregated() {
        CollateralEnforcement e = run(null, instruction(noticeDoc(), true, 44_000, 4_243_000, 4_329_600));
        assertEquals(Map.of("XS0000TUST01", "84589"), holdings(e.getAfter()));
        assertEquals("8157094", balance(e.getAfter()));
        assertEquals("", failedText(e));
    }

    @Test
    void noEnforcementWithoutAnEarlyTerminationDate() {
        EnforcementInstruction i = instruction(noticeDoc("BANK-A", "BANK-B", "FailureToPayOrDeliver", null), true,
            128_589, 12_400_094, 12_653_158);
        assertTrue(rejected(() -> run(null, i)).contains("Enforcement Event has occurred"));
    }

    @Test
    void noEnforcementBeforeTheEarlyTerminationDate() {
        EnforcementInstruction i = instruction(noticeDoc("BANK-A", "BANK-B", "FailureToPayOrDeliver", Date.of(2026, 10, 23)),
            true, 128_589, 12_400_094, 12_653_158);
        assertTrue(rejected(() -> run(elections(true, false), i)).contains("Enforcement Event has occurred"));
    }

    @Test
    void theFailureToPayElectionAllowsEnforcementOnTheNotice() {
        EnforcementInstruction i = instruction(noticeDoc("BANK-A", "BANK-B", "FailureToPayOrDeliver", null), true,
            128_589, 12_400_094, 12_653_158);
        assertEquals("CollateralEnforced", run(elections(false, true), i).getEventQualifier());
    }

    @Test
    void theFailureToPayElectionDoesNotCoverOtherEventsOfDefault() {
        EnforcementInstruction i = instruction(noticeDoc("BANK-A", "BANK-B", "CrossDefault", null), true,
            128_589, 12_400_094, 12_653_158);
        assertTrue(rejected(() -> run(elections(false, true), i)).contains("Enforcement Event has occurred"));
    }

    @Test
    void onlyThePledgorsDefaultAllowsEnforcement() {
        EnforcementInstruction i = instruction(noticeDoc("BANK-C", "BANK-B", "FailureToPayOrDeliver", NOTICE), true,
            128_589, 12_400_094, 12_653_158);
        assertTrue(rejected(() -> run(null, i)).contains("Defaulting Party is the pledgor"));
    }

    @Test
    void onlyTheSecuredPartyEnforces() {
        EnforcementInstruction i = instruction(noticeDoc("BANK-A", "BANK-C", "FailureToPayOrDeliver", NOTICE), true,
            128_589, 12_400_094, 12_653_158);
        assertTrue(rejected(() -> run(null, i)).contains("Only the secured party"));
    }

    @Test
    void enforcementNeedsExclusiveControl() {
        assertTrue(rejected(() -> run(null, instruction(noticeDoc(), false, 128_589, 12_400_094, 12_653_158)))
            .contains("exclusive control"));
    }

    @Test
    void noMoreThanIsHeldCanBeTaken() {
        assertTrue(rejected(() -> run(null, instruction(noticeDoc(), true, 130_000, 12_400_094, 12_653_158)))
            .contains("no more of an asset than is held"));
    }

    @Test
    void theValueTakenIsWithinTheBalance() {
        assertTrue(rejected(() -> run(null, instruction(noticeDoc(), true, 128_589, 12_500_000, 12_653_158)))
            .contains("not more than the balance"));
    }

    @Test
    void anEarlyTerminationDateIsNotBeforeTheNotice() {
        DefaultNotice n = load(DefaultNotice.class,
            noticeDoc("BANK-A", "BANK-B", "FailureToPayOrDeliver", Date.of(2026, 10, 19)));
        assertTrue(failedText(n).contains("EarlyTerminationOnOrAfterNotice"));
    }

    @Test
    void theEnforcementSurvivesARuneJsonRoundTrip() throws Exception {
        CollateralEnforcement e = run(null, imDefault());
        assertEquals(e, JSON.readValue(toJson(e), CollateralEnforcement.class));
    }
}
