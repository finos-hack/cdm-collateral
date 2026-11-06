package collateral;

import cdmx.collateral.margincall.MarginCallState;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** A call replacing a cancelled call, as the collateral service builds and checks it (task-csa-call-replacement). */
class CdmReplacementTest {
    private static final String OLD = "C-0A1B2C3D", NEW = "C-0E0F1A2B";

    private static MarginCallState withdrawn() {
        return CdmFold.fold(List.of(Cdm.issue(OLD, "BANK-B", 5_000_000, "Delivery").json, Cdm.withdraw("amount booked in error").json));
    }

    @Test
    void theReplacementNamesTheCancelledCallAndFolds() {
        Cdm repl = Cdm.issue(NEW, "BANK-B", 4_500_000, "Delivery", OLD);
        assertTrue(repl.replaces(withdrawn()));
        assertEquals(OLD, CdmFold.fold(List.of(repl.json)).getReplacesCall());
    }

    @Test
    void aCallThatIsNotCancelledOrNotNamedIsNotReplaced() {
        MarginCallState open = CdmFold.fold(List.of(Cdm.issue(OLD, "BANK-B", 5_000_000, "Delivery").json));
        assertFalse(Cdm.issue(NEW, "BANK-B", 4_500_000, "Delivery", OLD).replaces(open));
        assertFalse(Cdm.issue(NEW, "BANK-B", 4_500_000, "Delivery", "C-FFFFFFFF").replaces(withdrawn()));
        assertFalse(Cdm.issue(NEW, "BANK-B", 4_500_000, "Return", OLD).replaces(withdrawn()));
    }
}
