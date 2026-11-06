package cdmx;

import cdmx.collateral.margincall.IssueCallInstruction;
import cdmx.collateral.margincall.MarginCallStatusEnum;
import cdmx.collateral.margincall.functions.ReplacementAllowed;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static cdmx.Cdm.*;
import static cdmx.Data.*;
import static cdmx.MarginCallTest.Call;
import static cdmx.MarginCallTest.issued;
import static org.junit.jupiter.api.Assertions.*;

/**
 * A call that replaces a cancelled call (task-csa-call-replacement): the new call's IssueCall step names the cancelled
 * call, and ReplacementAllowed checks it against that call's state. The rules are the project owner's choice of
 * 2026-11-06 to link a corrected call to the call it replaces, with details that are assumptions awaiting a business
 * SME (task-sme-call-cancellation-rules, question 5).
 */
class ReplacementTest {
    static Map<String, Object> replacementDoc(String id, Number amount, String replaces) {
        Map<String, Object> issuance = callBase(id, "BANK-B");
        issuance.put("callAmountInBaseCurrency", money(amount));
        return o("issuance", issuance, "direction", "Delivery", "replacesCall", replaces);
    }

    static Call withdrawn() {
        return issued().apply("withdraw", o("reason", "call amount booked in error"));
    }

    static boolean allowed(Map<String, Object> issue, Call replaced) {
        return fn(ReplacementAllowed.class).evaluate(load(IssueCallInstruction.class, issue), replaced.state);
    }

    @Test
    void aReplacementCarriesTheCallItReplaces() {
        var c = new Call().apply("issue", replacementDoc("C-0002", 11_900_000, "C-0001"));
        assertEquals(MarginCallStatusEnum.ISSUED, c.state.getStatus());
        assertEquals("C-0001", c.state.getReplacesCall());
        assertEquals("", failedText(c.state));
        c.apply("respond", responseDoc("AgreeinFull", 11_900_000));
        assertEquals("C-0001", c.state.getReplacesCall());
    }

    @Test
    void aCancelledCallMayBeReplaced() {
        assertTrue(allowed(replacementDoc("C-0002", 11_900_000, "C-0001"), withdrawn()));
    }

    @Test
    void aCallThatIsNotCancelledMayNotBeReplaced() {
        assertFalse(allowed(replacementDoc("C-0002", 11_900_000, "C-0001"), issued()));
    }

    @Test
    void theReplacementNamesTheCancelledCall() {
        assertFalse(allowed(replacementDoc("C-0002", 11_900_000, "C-0009"), withdrawn()));
    }

    @Test
    void theReplacementHasTheSameDirectionAndParties() {
        Map<String, Object> ret = replacementDoc("C-0002", 11_900_000, "C-0001");
        ret.put("direction", "Return");
        assertFalse(allowed(ret, withdrawn()));

        Map<String, Object> other = replacementDoc("C-0002", 11_900_000, "C-0001");
        @SuppressWarnings("unchecked") Map<String, Object> issuance = (Map<String, Object>) other.get("issuance");
        issuance.put("partyRole", l(o("partyReference", party("BANK-C"), "role", "Pledgor"),
                                    o("partyReference", party("BANK-B"), "role", "SecuredParty")));
        assertFalse(allowed(other, withdrawn()));
    }

    @Test
    void aCallDoesNotReplaceItself() {
        var issue = load(IssueCallInstruction.class, replacementDoc("C-0001", 11_900_000, "C-0001"));
        assertTrue(failedText(issue).contains("NotItsOwnReplacement"), failedText(issue));
    }
}
