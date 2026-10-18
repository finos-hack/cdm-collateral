package cdmx;

import cdmx.collateral.margincall.MarginCallState;
import cdmx.collateral.margincall.MarginCallStatusEnum;
import cdmx.collateral.margincall.MarginCallStepEnum;
import cdmx.collateral.margincall.MarginCallStepRecord;
import cdmx.collateral.margincall.functions.Create_MarginCallState;
import cdmx.collateral.margincall.functions.NextMarginCallStep;
import cdmx.collateral.proposal.CollateralProposalStatusEnum;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.math.BigDecimal;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.stream.Collectors;

import static cdmx.Cdm.*;
import static cdmx.Data.*;
import static org.junit.jupiter.api.Assertions.*;

/** Margin call lifecycle (G1, G3, G4, G6), following the console scenarios. */
class MarginCallTest {
    static final ZonedDateTime T0 = ZonedDateTime.of(2026, 10, 16, 9, 0, 0, 0, ZoneOffset.UTC);

    /** Applies steps in order and keeps the state, as a workflow service would. */
    static class Call {
        MarginCallState state;
        int n;

        Call apply(String step, Object value) {
            n++;
            state = fn(Create_MarginCallState.class).evaluate(state, "S-" + n, T0.plusMinutes(n), instruction(step, value));
            return this;
        }

        MarginCallStepEnum next() {
            return fn(NextMarginCallStep.class).evaluate(state);
        }
    }

    static Call issued(Number amount, String direction, String caller) {
        return new Call().apply("issue", o("issuance", issuanceDoc(amount, caller), "direction", direction));
    }

    static Call issued() {
        return issued(12_400_000, "Delivery", "BANK-B");
    }

    static Call returnCall() {
        return issued(4_300_000, "Return", "BANK-A").apply("respond", responseDoc("AgreeinFull", 4_300_000, "Return", 128_589));
    }

    static boolean is(BigDecimal v, long expected) {
        return v.compareTo(BigDecimal.valueOf(expected)) == 0;
    }

    @Test
    void fullAgreementProposalAndSettlement() {  // console scenario im-call
        Call c = issued();
        assertEquals(MarginCallStatusEnum.ISSUED, c.state.getStatus());
        assertEquals(MarginCallStepEnum.RESPOND_TO_CALL, c.next());
        c.apply("respond", responseDoc("AgreeinFull", 12_400_000));
        assertEquals(MarginCallStatusEnum.AGREED, c.state.getStatus());
        assertTrue(is(c.state.getDisputedAmount().getValue(), 0));
        assertEquals(MarginCallStepEnum.PROPOSE_COLLATERAL, c.next());
        c.apply("propose", proposalDoc());
        assertEquals(MarginCallStepEnum.DECIDE_PROPOSAL, c.next());
        c.apply("decide", o("proposalId", "P-1", "accept", true));
        assertEquals(CollateralProposalStatusEnum.ACCEPTED, c.state.getProposal().get(0).getStatus());
        assertEquals(MarginCallStepEnum.SETTLE_CALL, c.next());
        c.apply("settle", o("proposalId", "P-1"));
        assertEquals(MarginCallStatusEnum.SETTLED, c.state.getStatus());
        assertNull(c.next());
        List<MarginCallStepEnum> steps = c.state.getStepRecord().stream().map(MarginCallStepRecord::getStep).collect(Collectors.toList());
        assertEquals(List.of(MarginCallStepEnum.ISSUE_CALL, MarginCallStepEnum.RESPOND_TO_CALL, MarginCallStepEnum.PROPOSE_COLLATERAL,
            MarginCallStepEnum.DECIDE_PROPOSAL, MarginCallStepEnum.SETTLE_CALL), steps);
        assertEquals("", failedText(c.state));  // all conditions, CDM's included
    }

    @Test
    void partialAgreementRejectedThenAcceptedProposal() {  // console scenario im-dispute
        Call c = issued().apply("respond", responseDoc("PartiallyAgree", 11_900_000, "Delivery", 12_395_834));
        assertEquals(MarginCallStatusEnum.PARTIALLY_AGREED, c.state.getStatus());
        assertTrue(is(c.state.getAgreedAmount().getValue(), 11_900_000));
        assertTrue(is(c.state.getDisputedAmount().getValue(), 500_000));
        c.apply("propose", proposalDoc("P-1", 11_900_001, "C-0001", "Proposed", 12_395_834));
        c.apply("decide", o("proposalId", "P-1", "accept", false, "reason", "tMMF over the 50% concentration limit"));
        assertEquals(CollateralProposalStatusEnum.REJECTED, c.state.getProposal().get(0).getStatus());
        assertEquals(MarginCallStepEnum.PROPOSE_COLLATERAL, c.next());
        c.apply("propose", proposalDoc("P-2", 11_902_934));
        c.apply("decide", o("proposalId", "P-2", "accept", true)).apply("settle", o("proposalId", "P-2"));
        assertEquals(MarginCallStatusEnum.SETTLED, c.state.getStatus());
        assertTrue(is(c.state.getDisputedAmount().getValue(), 500_000));
    }

    @Test
    void returnCallReleasedWithoutProposal() {  // console scenario im-return
        Call c = returnCall();
        assertEquals(MarginCallStepEnum.SETTLE_CALL, c.next());
        assertTrue(rejected(() -> c.apply("propose", proposalDoc("P-1", 4_300_000))).contains("Only the step the call waits for"));
        c.apply("settle", o("releasedValue", money(4_299_999)));
        assertEquals(MarginCallStatusEnum.SETTLED, c.state.getStatus());
    }

    @Test
    void returnCannotReleaseMoreThanAgreed() {
        Call c = returnCall();
        assertTrue(rejected(() -> c.apply("settle", o("releasedValue", money(4_400_000)))).contains("no more than the agreed amount"));
    }

    @Test
    void whollyDisputedCallWaitsForNothing() {
        Call c = issued().apply("respond", responseDoc("Dispute", 0));
        assertEquals(MarginCallStatusEnum.DISPUTED, c.state.getStatus());
        assertTrue(is(c.state.getDisputedAmount().getValue(), 12_400_000));
        assertNull(c.next());
    }

    @ParameterizedTest
    @CsvSource({"AgreeinFull,11900000", "Dispute,1", "PartiallyAgree,12400000"})
    void responseTypeMustMatchAmount(String kind, long agreed) {
        assertTrue(rejected(() -> issued().apply("respond", responseDoc(kind, agreed))).contains("Full agreement agrees the whole call"));
    }

    @Test
    void stepsOutOfOrderAreRejected() {
        assertTrue(rejected(() -> new Call().apply("respond", responseDoc("AgreeinFull", 12_400_000))).contains("Only the step"));
        Call c = issued().apply("respond", responseDoc("AgreeinFull", 12_400_000)).apply("propose", proposalDoc());
        assertTrue(rejected(() -> c.apply("settle", o("proposalId", "P-1"))).contains("Only the step"));  // P-1 not yet accepted
    }

    @Test
    void settlementMustCoverAgreedAmount() {
        Call c = issued().apply("respond", responseDoc("AgreeinFull", 12_400_000)).apply("propose", proposalDoc("P-1", 12_000_000));
        c.apply("decide", o("proposalId", "P-1", "accept", true));
        assertTrue(rejected(() -> c.apply("settle", o("proposalId", "P-1"))).contains("covers the agreed amount"));
    }

    @Test
    void proposalMustAnswerThisCall() {
        Call c = issued().apply("respond", responseDoc("AgreeinFull", 12_400_000));
        assertTrue(rejected(() -> c.apply("propose", proposalDoc("P-1", 12_400_094, "C-0099", "Proposed", 128_589))).contains("answers this call"));
    }

    @Test
    void previousStateIsNotModified() {
        Call c = issued().apply("respond", responseDoc("AgreeinFull", 12_400_000)).apply("propose", proposalDoc());
        MarginCallState before = c.state;
        String snapshot = toJson(before);
        c.apply("decide", o("proposalId", "P-1", "accept", true)).apply("settle", o("proposalId", "P-1"));
        assertEquals(snapshot, toJson(before));
        assertEquals(MarginCallStatusEnum.AGREED, before.getStatus());
        assertEquals(CollateralProposalStatusEnum.PROPOSED, before.getProposal().get(0).getStatus());
        assertEquals(3, before.getStepRecord().size());
    }
}
