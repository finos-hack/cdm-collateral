package collateral;

import cdm.base.staticdata.party.CounterpartyRoleEnum;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** GMRA terms in the service (wp-adr-repo-gmra-terms): both parties build the same baseline, an amendment verifies
 *  against the terms in force, and folding it gives the amended elections. */
class CdmGmraTest {
    private static final LocalDate DAY = LocalDate.of(2026, 11, 7);

    @Test
    void bothPartiesBuildTheSameBaseline() {
        CdmGmra.Terms a = CdmGmra.baseline("BANK-A", "BANK-B");
        CdmGmra.Terms b = CdmGmra.baseline("BANK-A", "BANK-B");
        assertEquals(CdmRuntime.toJson(a.terms()), CdmRuntime.toJson(b.terms()));
        assertEquals(CdmAgreement.NO_HASH, a.hash());
        Map<String, Object> v = CdmGmra.view(a.terms().getElections());
        assertEquals(Map.of("A", "250000", "B", "250000"), v.get("mtaUsd"));
        assertEquals("1.02", v.get("defaultMarginRatio"));
        assertEquals("USD-SOFR", v.get("netMarginInterest"));
    }

    @Test
    void anAmendmentVerifiesAndFoldsToTheNewElections() {
        CdmGmra.Terms base = CdmGmra.baseline("BANK-A", "BANK-B");
        CdmGmra.Proposal p = CdmGmra.propose(base, CounterpartyRoleEnum.PARTY_2, 400_000L, null, DAY);
        assertEquals(List.of("MinimumTransferAmount"), CdmGmra.changed(p.amendment()));
        CdmGmra.Terms after = CdmGmra.apply(base, CdmGmra.verify(p.json(), base), p.hash());
        assertEquals(400_000, CdmGmra.mtaUsd(after.terms().getElections(), CounterpartyRoleEnum.PARTY_2));
        assertEquals(250_000, CdmGmra.mtaUsd(after.terms().getElections(), CounterpartyRoleEnum.PARTY_1));
        assertEquals(p.hash(), after.hash());
        assertEquals(1, after.amendments());

        CdmGmra.Proposal r = CdmGmra.propose(after, CounterpartyRoleEnum.PARTY_1, null, new BigDecimal("1.05"), DAY);
        assertEquals(List.of("DefaultMarginRatio"), CdmGmra.changed(r.amendment()));
        assertThrows(IllegalStateException.class, () -> CdmGmra.verify(r.json(), base)); // not the terms in force
    }

    @Test
    void aTamperedAmendmentIsRejected() {
        CdmGmra.Terms base = CdmGmra.baseline("BANK-A", "BANK-B");
        CdmGmra.Proposal p = CdmGmra.propose(base, CounterpartyRoleEnum.PARTY_2, 400_000L, null, DAY);
        // A document whose named changes do not match its elections: re-running Create_GmraTermsAmendment disagrees.
        // (A consistent edit, such as another amount, is caught by the on-chain hash instead.)
        String tampered = p.json().replace("\"MinimumTransferAmount\"", "\"DefaultMarginRatio\"");
        assertNotEquals(p.json(), tampered);
        assertThrows(RuntimeException.class, () -> CdmGmra.verify(tampered, base));
    }

    @Test
    void noChangeIsNoAmendment() {
        CdmGmra.Terms base = CdmGmra.baseline("BANK-A", "BANK-B");
        assertThrows(RuntimeException.class, () -> CdmGmra.propose(base, CounterpartyRoleEnum.PARTY_1, 250_000L, null, DAY));
    }
}
