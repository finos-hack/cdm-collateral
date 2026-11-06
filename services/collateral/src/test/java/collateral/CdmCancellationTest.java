package collateral;

import cdmx.collateral.margincall.MarginCallState;
import cdmx.collateral.margincall.MarginCallStatusEnum;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** Cancellation steps as the collateral service builds them, folded as both parties fold them (task-csa-call-cancellation). */
class CdmCancellationTest {
    private static final String CALL = "C-0A1B2C3D";

    private static Cdm issue() {
        return Cdm.issue(CALL, "BANK-B", 5_000_000, "Delivery");
    }

    private static Cdm agree() {
        return Cdm.respond(CALL, "BANK-B", "AgreeinFull", 5_000_000, "Delivery", 50_814, "US912810TM60");
    }

    @Test
    void aWithdrawnCallFoldsToCancelled() {
        MarginCallState s = CdmFold.fold(List.of(issue().json, Cdm.withdraw("amount booked in error").json));
        assertEquals(MarginCallStatusEnum.CANCELLED, s.getStatus());
        assertEquals("amount booked in error", s.getWithdrawal().getReason());
    }

    @Test
    void anAcceptedRequestFoldsToCancelledAndARefusalDoesNot() {
        String req = Cdm.requestCancellation("SecuredParty", "superseded").json;
        MarginCallState refused = CdmFold.fold(List.of(issue().json, agree().json, req, Cdm.decideCancellation("Pledgor", false, "exposure stands").json));
        assertEquals(MarginCallStatusEnum.AGREED, refused.getStatus());
        MarginCallState cancelled = CdmFold.fold(List.of(issue().json, agree().json, req, Cdm.decideCancellation("Pledgor", false, "exposure stands").json,
            req, Cdm.decideCancellation("Pledgor", true, null).json));
        assertEquals(MarginCallStatusEnum.CANCELLED, cancelled.getStatus());
        assertEquals(2, cancelled.getCancellation().size());
    }

    @Test
    void theRequesterCannotDecideItsOwnRequest() {
        assertThrows(RuntimeException.class, () -> CdmFold.fold(List.of(issue().json, agree().json,
            Cdm.requestCancellation("SecuredParty", null).json, Cdm.decideCancellation("SecuredParty", true, null).json)));
    }
}
