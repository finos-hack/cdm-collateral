package cdmx;

import cdmx.collateral.margincall.CancellationStatusEnum;
import cdmx.collateral.margincall.MarginCallStatusEnum;
import cdmx.collateral.margincall.MarginCallStepEnum;
import cdmx.collateral.proposal.CollateralProposalStatusEnum;
import org.junit.jupiter.api.Test;

import java.util.List;

import static cdmx.Cdm.*;
import static cdmx.Data.*;
import static cdmx.MarginCallTest.issued;
import static cdmx.MarginCallTest.returnCall;
import static org.junit.jupiter.api.Assertions.*;

/**
 * Margin call cancellation (task-csa-call-cancellation; ISO 20022 colr.005 and colr.006). The rules are the project
 * owner's assumptions of 2026-11-06, to be confirmed in task-sme-call-cancellation-rules: the calling party withdraws an
 * unanswered call alone; an answered call that is not settled is cancelled on one party's request and the other's
 * acceptance; a proposal not yet delivered is then void.
 */
class CancellationTest {
    static Object request(String by) {
        return o("requestedBy", by, "reason", "call amount booked in error");
    }

    static Object decision(String by, boolean accept) {
        return accept ? o("decidedBy", by, "accept", true) : o("decidedBy", by, "accept", false, "reason", "the exposure stands");
    }

    @Test
    void theCallingPartyWithdrawsAnUnansweredCall() {
        var c = issued().apply("withdraw", o("reason", "wrong portfolio"));
        assertEquals(MarginCallStatusEnum.CANCELLED, c.state.getStatus());
        assertEquals("wrong portfolio", c.state.getWithdrawal().getReason());
        assertNull(c.next());
        assertEquals(MarginCallStepEnum.WITHDRAW_CALL, c.state.getStepRecord().get(1).getStep());
        assertEquals("", failedText(c.state));
        assertTrue(rejected(() -> c.apply("respond", responseDoc("AgreeinFull", 12_400_000))).contains("Only the step"));
    }

    @Test
    void anAnsweredCallCannotBeWithdrawn() {
        var c = issued().apply("respond", responseDoc("AgreeinFull", 12_400_000));
        assertTrue(rejected(() -> c.apply("withdraw", o("reason", "late"))).contains("Only the step"));
    }

    @Test
    void anUnansweredCallTakesNoCancellationRequest() {
        assertTrue(rejected(() -> issued().apply("requestCancellation", request("SecuredParty"))).contains("Only the step"));
    }

    @Test
    void anAcceptedCancellationVoidsAProposalNotYetDelivered() {
        var c = issued().apply("respond", responseDoc("AgreeinFull", 12_400_000)).apply("propose", proposalDoc())
            .apply("decide", o("proposalId", "P-1", "accept", true));
        c.apply("requestCancellation", request("SecuredParty"));
        assertEquals(MarginCallStatusEnum.AGREED, c.state.getStatus());
        assertEquals(MarginCallStepEnum.DECIDE_CANCELLATION, c.next());
        assertTrue(rejected(() -> c.apply("settle", o("proposalId", "P-1"))).contains("Only the step"));  // blocked while pending
        c.apply("decideCancellation", decision("Pledgor", true));
        assertEquals(MarginCallStatusEnum.CANCELLED, c.state.getStatus());
        assertEquals(CollateralProposalStatusEnum.CANCELLED, c.state.getProposal().get(0).getStatus());
        assertTrue(c.state.getProposal().get(0).getDecision().getAccepted());  // the decision it had is kept
        assertEquals(CancellationStatusEnum.ACCEPTED, c.state.getCancellation().get(0).getStatus());
        assertNull(c.next());
        assertEquals("", failedText(c.state));
    }

    @Test
    void aRefusedCancellationLeavesTheCallWhereItWas() {
        var c = issued().apply("respond", responseDoc("AgreeinFull", 12_400_000)).apply("propose", proposalDoc());
        c.apply("requestCancellation", request("Pledgor")).apply("decideCancellation", decision("SecuredParty", false));
        assertEquals(MarginCallStatusEnum.AGREED, c.state.getStatus());
        assertEquals(CancellationStatusEnum.REFUSED, c.state.getCancellation().get(0).getStatus());
        assertEquals("the exposure stands", c.state.getCancellation().get(0).getDecisionReason());
        assertEquals(MarginCallStepEnum.DECIDE_PROPOSAL, c.next());
        assertEquals(CollateralProposalStatusEnum.PROPOSED, c.state.getProposal().get(0).getStatus());
        // a second request after a refusal
        c.apply("requestCancellation", request("Pledgor")).apply("decideCancellation", decision("SecuredParty", true));
        assertEquals(MarginCallStatusEnum.CANCELLED, c.state.getStatus());
        assertEquals(2, c.state.getCancellation().size());
    }

    @Test
    void theRequesterCannotDecideItsOwnRequest() {
        var c = issued().apply("respond", responseDoc("AgreeinFull", 12_400_000)).apply("requestCancellation", request("SecuredParty"));
        assertTrue(rejected(() -> c.apply("decideCancellation", decision("SecuredParty", true))).contains("did not request"));
    }

    @Test
    void oneRequestAtATime() {
        var c = issued().apply("respond", responseDoc("AgreeinFull", 12_400_000)).apply("requestCancellation", request("SecuredParty"));
        assertTrue(rejected(() -> c.apply("requestCancellation", request("Pledgor"))).contains("Only the step"));
    }

    @Test
    void aWhollyDisputedCallCanBeCancelled() {
        var c = issued().apply("respond", responseDoc("Dispute", 0));
        assertNull(c.next());
        c.apply("requestCancellation", request("SecuredParty")).apply("decideCancellation", decision("Pledgor", true));
        assertEquals(MarginCallStatusEnum.CANCELLED, c.state.getStatus());
    }

    @Test
    void aSettledCallCannotBeCancelled() {
        var c = returnCall().apply("settle", o("releasedValue", money(4_300_000)));
        assertTrue(rejected(() -> c.apply("requestCancellation", request("Pledgor"))).contains("Only the step"));
    }

    @Test
    void cancellationEventsAreQualified() {
        var e = new EventTest.Events().apply("issue", o("issuance", issuanceDoc(12_400_000, "BANK-B"), "direction", "Delivery"))
            .apply("respond", responseDoc("PartiallyAgree", 11_900_000, "Delivery", 12_395_834))
            .apply("requestCancellation", request("Pledgor"))
            .apply("decideCancellation", decision("SecuredParty", false))
            .apply("requestCancellation", request("SecuredParty"))
            .apply("decideCancellation", decision("Pledgor", true));
        assertEquals(List.of("MarginCallIssued", "MarginCallPartiallyAgreed", "MarginCallCancellationRequested",
            "MarginCallCancellationRefused", "MarginCallCancellationRequested", "MarginCallCancelled"), e.qualifiers());
        var w = new EventTest.Events().apply("issue", o("issuance", issuanceDoc(12_400_000, "BANK-B"), "direction", "Delivery"))
            .apply("withdraw", o("reason", "booked in error"));
        assertEquals("MarginCallCancelled", w.last().getEventQualifier());
        assertNull(w.last().getTransfer());  // nothing moves
    }

    @Test
    void aCancelledStateSurvivesARuneJsonRoundTrip() throws Exception {
        var c = issued().apply("respond", responseDoc("AgreeinFull", 12_400_000)).apply("propose", proposalDoc())
            .apply("requestCancellation", request("SecuredParty")).apply("decideCancellation", decision("Pledgor", true));
        assertEquals(c.state, JSON.readValue(toJson(c.state), cdmx.collateral.margincall.MarginCallState.class));
    }
}
