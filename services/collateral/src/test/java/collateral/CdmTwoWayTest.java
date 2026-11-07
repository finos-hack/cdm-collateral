package collateral;

import cdm.base.staticdata.party.PartyRoleEnum;
import cdm.event.common.MarginCallIssuance;
import cdmx.collateral.enforcement.CollateralReclaim;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** Two-way initial margin (wp-adr-two-way-im): call roles from the call, and the pledgor's reclaim record. */
class CdmTwoWayTest {
    private static final String TUST = "US912810TM60";
    private static final String TMMF = "US9128100000";

    private static String partyIn(MarginCallIssuance i, PartyRoleEnum role) {
        return i.getPartyRole().stream().filter(r -> r.getRole() == role).findFirst().orElseThrow()
                .getPartyReference().getValue().getPartyId().get(0).getIdentifier().getValue();
    }

    @Test
    void theCalledPartyOfADeliveryIsThePledgorOnEitherLeg() {
        MarginCallIssuance byB = Cdm.issue("C-1", "BANK-B", 1_000_000, "Delivery").instruction.getIssue().getIssuance();
        assertEquals("BANK-A", partyIn(byB, PartyRoleEnum.PLEDGOR));
        assertEquals("BANK-B", partyIn(byB, PartyRoleEnum.SECURED_PARTY));
        MarginCallIssuance byA = Cdm.issue("C-2", "BANK-A", 600_000, "Delivery").instruction.getIssue().getIssuance();
        assertEquals("BANK-B", partyIn(byA, PartyRoleEnum.PLEDGOR));
        assertEquals("BANK-A", partyIn(byA, PartyRoleEnum.SECURED_PARTY));
    }

    @Test
    void theCallingPartyOfAReturnIsThePledgor() {
        MarginCallIssuance byB = Cdm.issue("C-3", "BANK-B", 200_000, "Return").instruction.getIssue().getIssuance();
        assertEquals("BANK-B", partyIn(byB, PartyRoleEnum.PLEDGOR));
        assertEquals("BANK-A", partyIn(byB, PartyRoleEnum.SECURED_PARTY));
    }

    @Test
    void aReclaimReturnsTheWholeLegToThePledgor() {
        CdmReclaim r = CdmReclaim.build("0x" + "cd".repeat(32), "BANK-B", "BANK-A",
                List.of(Map.of("isin", TUST, "units", 40L), Map.of("isin", TMMF, "units", 10L)), 4_380);
        assertEquals("CollateralReclaimed", r.reclaim.getEventQualifier());
        assertEquals(2, r.reclaim.getTransfer().size());
        assertEquals(0, r.reclaim.getAfter().getCollateralBalance().get(0).getAmountBaseCurrency().getValue().signum());
        assertEquals("BANK-A", r.reclaim.getTransfer().get(0).getTransfer().getUnscheduledTransfer().getPayerReceiver()
                .getPayerPartyReference().getValue().getPartyId().get(0).getIdentifier().getValue());
        assertEquals(r.hash, Cdm.keccakHex(r.json));
        CollateralReclaim back = CdmReclaim.verify(r.json);
        assertEquals(r.reclaim, back);
    }
}
