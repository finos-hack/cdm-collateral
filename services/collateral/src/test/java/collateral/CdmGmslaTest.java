package collateral;

import cdm.base.staticdata.party.CounterpartyRoleEnum;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** GMSLA terms in the service (wp-adr-gmsla-terms): both parties build the same baseline, an amendment verifies
 *  against the terms in force, and folding it gives the amended elections. */
class CdmGmslaTest {
    private static final LocalDate DAY = LocalDate.of(2026, 11, 11);

    @Test
    void bothPartiesBuildTheSameBaseline() {
        CdmGmsla.Terms a = CdmGmsla.baseline("BANK-A", "BANK-B");
        CdmGmsla.Terms b = CdmGmsla.baseline("BANK-A", "BANK-B");
        assertEquals(CdmRuntime.toJson(a.terms()), CdmRuntime.toJson(b.terms()));
        assertEquals(CdmAgreement.NO_HASH, a.hash());
        Map<String, Object> v = CdmGmsla.view(a.terms());
        assertEquals("USD", v.get("baseCurrency"));
        assertEquals("Aggregated", v.get("aggregation"));
        assertEquals("10:00 GBLO", v.get("notificationTime"));
        assertEquals("applies", v.get("nettingOfDeliveries"));
        assertEquals(Map.of("A", "does not apply", "B", "does not apply"), v.get("automaticEarlyTermination"));
        assertEquals(Map.of("A", "250000", "B", "250000"), v.get("mtaUsd"));
        assertEquals("1.02", v.get("defaultMargin"));
    }

    @Test
    void anAmendmentOfTheNotificationTimeVerifiesAndFolds() {
        CdmGmsla.Terms base = CdmGmsla.baseline("BANK-A", "BANK-B");
        CdmGmsla.Proposal p = CdmGmsla.propose(base, "11:00", CounterpartyRoleEnum.PARTY_1, null, null, DAY);
        assertEquals(List.of("NotificationTime"), CdmGmsla.changed(p.amendment()));
        CdmGmsla.Terms after = CdmGmsla.apply(base, CdmGmsla.verify(p.json(), base), p.hash());
        assertEquals("11:00", CdmGmsla.notificationTime(after.terms()));
        assertEquals(p.hash(), after.hash());
        assertEquals(1, after.amendments());

        CdmGmsla.Proposal back = CdmGmsla.propose(after, "10:00", CounterpartyRoleEnum.PARTY_1, null, null, DAY);
        CdmGmsla.Terms restored = CdmGmsla.apply(after, CdmGmsla.verify(back.json(), after), back.hash());
        assertEquals(base.terms(), restored.terms());
        assertThrows(IllegalStateException.class, () -> CdmGmsla.verify(back.json(), base)); // not the terms in force
    }

    @Test
    void theMinimumTransferAmountAndTheDefaultMarginAmendToo() {
        CdmGmsla.Terms base = CdmGmsla.baseline("BANK-A", "BANK-B");
        CdmGmsla.Proposal p = CdmGmsla.propose(base, null, CounterpartyRoleEnum.PARTY_2, 400_000L, new BigDecimal("1.05"), DAY);
        assertEquals(List.of("MinimumTransferAmount", "DefaultMargin"), CdmGmsla.changed(p.amendment()));
        CdmGmsla.Terms after = CdmGmsla.apply(base, CdmGmsla.verify(p.json(), base), p.hash());
        assertEquals(400_000, CdmGmsla.mtaUsd(after.terms(), CounterpartyRoleEnum.PARTY_2));
        assertEquals(250_000, CdmGmsla.mtaUsd(after.terms(), CounterpartyRoleEnum.PARTY_1));
    }

    @Test
    void aTamperedAmendmentIsRejectedAndNoChangeIsNoAmendment() {
        CdmGmsla.Terms base = CdmGmsla.baseline("BANK-A", "BANK-B");
        CdmGmsla.Proposal p = CdmGmsla.propose(base, "11:00", CounterpartyRoleEnum.PARTY_1, null, null, DAY);
        String tampered = p.json().replace("\"NotificationTime\"", "\"BaseCurrency\"");
        assertNotEquals(p.json(), tampered);
        assertThrows(RuntimeException.class, () -> CdmGmsla.verify(tampered, base));
        assertThrows(RuntimeException.class, () -> CdmGmsla.propose(base, "10:00", CounterpartyRoleEnum.PARTY_1, null, null, DAY));
    }
}
