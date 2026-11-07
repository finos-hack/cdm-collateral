package collateral;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** Settlement netting as the collateral service builds and checks it (flow-settlement-netting). */
class CdmNettingTest {
    private static final LocalDate DAY = LocalDate.of(2026, 11, 6);
    private static final List<CdmNetting.Item> ITEMS = List.of(
            new CdmNetting.Item("0xaa", "DeliveryAmount", "BANK-A", "BANK-B", 100_000),
            new CdmNetting.Item("0xbb", "ReturnAmount", "BANK-B", "BANK-A", 30_000),
            new CdmNetting.Item("0xcc", "InterestAmount", "BANK-B", "BANK-A", 412));

    @Test
    void buildsTheNetUnderTheAgreementElectionAndVerifiesIt() {
        CdmNetting n = CdmNetting.build("0x01", DAY, ITEMS);
        assertEquals(69_588, CdmInterest.usd(n.statement.getNetAmount()));
        assertEquals("BANK-A", CdmNetting.partyName(n.statement.getPayer()));
        assertEquals("BANK-B", CdmNetting.partyName(n.statement.getReceiver()));
        assertEquals(n.statement, CdmNetting.verify(n.json));
        assertEquals(n.hash, Cdm.keccakHex(n.json));
    }

    @Test
    void rejectsAStatementWhoseNetWasChanged() {
        CdmNetting n = CdmNetting.build("0x01", DAY, ITEMS);
        String tampered = n.json.replace("69588", "69000");
        assertNotEquals(n.json, tampered);
        assertThrows(IllegalStateException.class, () -> CdmNetting.verify(tampered));
    }

    @Test
    void aSettleStepNamesTheNetting() {
        Cdm s = Cdm.settle("P-0", "0x01");
        assertEquals("0x01", s.instruction.getSettle().getNettingIdentifier());
        Cdm r = Cdm.settleReturn(List.of(new java.util.LinkedHashMap<>(java.util.Map.of("isin", "US0000000USD", "units", 30_000L))), 30_000, "0x01");
        assertEquals("0x01", r.instruction.getSettle().getNettingIdentifier());
    }
}
