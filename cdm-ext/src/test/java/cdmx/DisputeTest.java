package cdmx;

import cdmx.collateral.dispute.Dispute;
import cdmx.collateral.dispute.DisputeResolutionMethodEnum;
import cdmx.collateral.dispute.DisputeStatusEnum;
import cdmx.collateral.dispute.DisputeSubjectEnum;
import cdmx.collateral.dispute.functions.Create_Dispute;
import cdmx.collateral.dispute.functions.ResolveDispute;
import cdmx.collateral.margincall.MarginCallState;
import org.junit.jupiter.api.Test;

import java.time.ZonedDateTime;

import static cdmx.Cdm.*;
import static cdmx.Data.*;
import static cdmx.EventTest.T0;
import static cdmx.EventTest.issued;
import static cdmx.ValuationTest.assertAmount;
import static cdmx.VariationMarginTest.bank;
import static org.junit.jupiter.api.Assertions.*;

/** Gap G3: the dispute record and its resolution, on the console's im-dispute scenario: BANK-B calls USD 12.4m, BANK-A
 *  agrees USD 11.9m and disputes USD 0.5m because its SIMM interest-rate delta sensitivities differ. */
class DisputeTest {
    private final Create_Dispute raise = fn(Create_Dispute.class);
    private final ResolveDispute resolve = fn(ResolveDispute.class);
    private static final ZonedDateTime DEADLINE = T0.plusDays(1);
    private static final String REASON = "SIMM IR delta sensitivities differ";

    static MarginCallState partiallyAgreed() {
        return issued(12_400_000, "Delivery", "BANK-B").apply("respond", responseDoc("PartiallyAgree", 11_900_000)).state();
    }

    private Dispute open() {
        return raise.evaluate(partiallyAgreed(), "D-1", bank("BANK-A"), DisputeSubjectEnum.AMOUNT, REASON, T0, DEADLINE);
    }

    @Test
    void imDisputeRecordsTheDisputedPartOfTheCall() {
        Dispute d = open();
        assertAmount(12_400_000, d.getCalledAmount());
        assertAmount(11_900_000, d.getAgreedAmount());
        assertAmount(500_000, d.getDisputedAmount());
        assertEquals("C-0001", d.getCallIdentifier().getAssignedIdentifier().get(0).getIdentifier().getValue());
        assertEquals(DisputeStatusEnum.OPEN, d.getStatus());
        assertEquals(REASON, d.getReason());
        assertEquals("", failedText(d));
    }

    @Test
    void anAgreedResolutionLeavesTheDifferenceDue() {
        Dispute r = resolve.evaluate(open(), DisputeResolutionMethodEnum.AGREEMENT, amount(12_150_000, "USD"), T0.plusHours(3));
        assertEquals(DisputeStatusEnum.RESOLVED, r.getStatus());
        assertAmount(12_150_000, r.getResolution().getResolvedAmount());
        assertAmount(250_000, r.getResolution().getAdditionalAmountDue());
        assertEquals("", failedText(r));
    }

    @Test
    void recalculationAfterTheResolutionTime() {
        Dispute r = resolve.evaluate(open(), DisputeResolutionMethodEnum.RECALCULATION, amount(12_400_000, "USD"), DEADLINE.plusHours(1));
        assertAmount(500_000, r.getResolution().getAdditionalAmountDue());
    }

    @Test
    void theDisputingPartyCanBeRightInFull() {
        assertAmount(0, resolve.evaluate(open(), DisputeResolutionMethodEnum.AGREEMENT, amount(11_900_000, "USD"), T0.plusHours(3))
            .getResolution().getAdditionalAmountDue());
    }

    @Test
    void noRecalculationBeforeTheResolutionTime() {
        assertTrue(rejected(() -> resolve.evaluate(open(), DisputeResolutionMethodEnum.RECALCULATION, amount(12_400_000, "USD"), T0.plusHours(3)))
            .contains("not agreed by the Resolution Time"));
    }

    @Test
    void noRecalculationWithoutAResolutionTime() {
        Dispute d = raise.evaluate(partiallyAgreed(), "D-1", bank("BANK-A"), DisputeSubjectEnum.AMOUNT, REASON, T0, null);
        assertTrue(rejected(() -> resolve.evaluate(d, DisputeResolutionMethodEnum.RECALCULATION, amount(12_400_000, "USD"), DEADLINE))
            .contains("not agreed by the Resolution Time"));
    }

    @Test
    void theResolvedAmountIsWithinTheDispute() {
        assertTrue(rejected(() -> resolve.evaluate(open(), DisputeResolutionMethodEnum.AGREEMENT, amount(12_500_000, "USD"), T0))
            .contains("between the agreed and the called amount"));
        assertTrue(rejected(() -> resolve.evaluate(open(), DisputeResolutionMethodEnum.AGREEMENT, amount(11_800_000, "USD"), T0))
            .contains("between the agreed and the called amount"));
    }

    @Test
    void aDisputeIsResolvedOnce() {
        Dispute r = resolve.evaluate(open(), DisputeResolutionMethodEnum.AGREEMENT, amount(12_150_000, "USD"), T0.plusHours(3));
        assertTrue(rejected(() -> resolve.evaluate(r, DisputeResolutionMethodEnum.AGREEMENT, amount(12_150_000, "USD"), T0.plusHours(4)))
            .contains("Only an open dispute"));
    }

    @Test
    void aCallAgreedInFullHasNoDispute() {
        MarginCallState agreed = issued(12_400_000, "Delivery", "BANK-B").apply("respond", responseDoc("AgreeinFull", 12_400_000)).state();
        assertTrue(rejected(() -> raise.evaluate(agreed, "D-1", bank("BANK-A"), DisputeSubjectEnum.AMOUNT, REASON, T0, DEADLINE))
            .contains("has a disputed amount"));
    }

    @Test
    void onlyAPartyToTheCallDisputes() {
        assertTrue(rejected(() -> raise.evaluate(partiallyAgreed(), "D-1", bank("BANK-C"), DisputeSubjectEnum.AMOUNT, REASON, T0, DEADLINE))
            .contains("one of the call's two parties"));
    }

    @Test
    void theDisputeSurvivesARuneJsonRoundTrip() throws Exception {
        Dispute r = resolve.evaluate(open(), DisputeResolutionMethodEnum.AGREEMENT, amount(12_150_000, "USD"), T0.plusHours(3));
        assertEquals(r, JSON.readValue(toJson(r), Dispute.class));
    }
}
