package cdmx;

import cdmx.collateral.proposal.CollateralProposal;
import cdmx.collateral.proposal.CollateralProposalDecision;
import cdmx.collateral.proposal.CollateralProposalStatusEnum;
import cdmx.collateral.proposal.functions.DecideCollateralProposal;
import cdmx.collateral.proposal.functions.ProposalCoversAgreedAmount;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static cdmx.Cdm.*;
import static cdmx.Data.*;
import static org.junit.jupiter.api.Assertions.*;

/** G2: collateral proposal. Port of tests/test_proposal.py. */
class ProposalTest {
    private final ProposalCoversAgreedAmount covers = fn(ProposalCoversAgreedAmount.class);
    private final DecideCollateralProposal decide = fn(DecideCollateralProposal.class);

    @Test
    void coversAgreedAmount() {
        assertTrue(covers.evaluate(proposal(proposalDoc()), amount(12_400_000, "USD")));
        assertFalse(covers.evaluate(proposal(proposalDoc("P-1", 11_000_000)), amount(12_400_000, "USD")));
    }

    @Test
    void currencyPrecondition() {
        assertTrue(rejected(() -> covers.evaluate(proposal(proposalDoc()), amount(1, "EUR"))).contains("currency of the agreed amount"));
    }

    @Test
    void acceptAndReject() {
        CollateralProposal acc = decide.evaluate(proposal(proposalDoc()), true, null);
        assertEquals(CollateralProposalStatusEnum.ACCEPTED, acc.getStatus());
        assertTrue(acc.getDecision().getAccepted());
        CollateralProposal rej = decide.evaluate(proposal(proposalDoc()), false, "tMMF over the 50% concentration limit");
        assertEquals(CollateralProposalStatusEnum.REJECTED, rej.getStatus());
        assertTrue(rej.getDecision().getReason().startsWith("tMMF"));
    }

    @Test
    void cannotDecideTwice() {
        CollateralProposal acc = decide.evaluate(proposal(proposalDoc()), true, null);
        assertTrue(rejected(() -> decide.evaluate(acc, false, "too late")).contains("waiting for a decision"));  // StillProposed
    }

    @Test
    void typeConditions() {
        assertEquals("", failedText(proposal(proposalDoc())));  // includes CDM's own conditions on the position
        assertTrue(failedText(proposal(proposalDoc("P-1", 12_400_094, "C-0001", "Accepted", 128_589))).contains("DecisionMatchesStatus"));
        assertEquals("", failedText(decide.evaluate(proposal(proposalDoc()), true, null)));
        CollateralProposalDecision noReason = load(CollateralProposalDecision.class, o("accepted", false));
        assertTrue(failedText(noReason).contains("ReasonForRejection"));
    }

    @Test
    void serialisationRoundtrip() throws Exception {
        CollateralProposal acc = decide.evaluate(proposal(proposalDoc()), true, null);
        String js = toJson(acc);
        assertTrue(js.contains("\"@type\":\"cdmx.collateral.proposal.CollateralProposal\""), js);
        CollateralProposal back = JSON.readValue(js, CollateralProposal.class);
        assertEquals(CollateralProposalStatusEnum.ACCEPTED, back.getStatus());
        assertEquals(0, new BigDecimal("12400094").compareTo(back.getValueAfterHaircuts().getValue()));
        assertEquals(acc, back);
    }
}
