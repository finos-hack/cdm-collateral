package collateral;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** The IM CSA and its amendments (flow-agreement-amendment) as the collateral service builds, checks and folds them. */
class CdmAgreementTest {
    private static final String TUST = "US912810TM60";
    private static final String TMMF = "US9128100000";
    private static final LocalDate DAY = LocalDate.of(2026, 11, 6);

    static CdmAgreement.Terms baseline() {
        Map<String, Integer> h = new LinkedHashMap<>();
        h.put(TUST, 200);
        h.put(TMMF, 400);
        return CdmAgreement.baselineTerms("BANK-B", "BANK-A", h);
    }

    @Test
    void theBaselineIsTheCdmSampleWithThePrototypesPartiesAndMta() {
        CdmAgreement.Terms t = baseline();
        assertEquals(500_000, CdmAgreement.pledgorMtaUsd(t.agreement()));
        assertEquals(10_000, CdmAgreement.roundingUsd(t.agreement()));
        assertEquals("BANK-B", t.agreement().getContractualParty().get(0).getValue().getName().getValue());
        assertEquals(400, CdmAgreement.haircutBps(t.schedule(), TMMF));
        assertEquals(CdmAgreement.NO_HASH, t.hash());
    }

    @Test
    void bothPartiesFoldAnAgreedAmendmentToTheSameTerms() {
        CdmAgreement.Terms t = baseline();
        var p = CdmAgreement.propose(t, 250_000L, List.of(new CdmAgreement.Haircut(TMMF, true, 1000)), DAY);
        assertEquals(p.hash(), Cdm.keccakHex(p.json()));
        var m = CdmAgreement.verify(p.json(), baseline());
        CdmAgreement.Terms after = CdmAgreement.apply(t, m, p.hash());
        assertEquals(250_000, CdmAgreement.pledgorMtaUsd(after.agreement()));
        assertEquals(1000, CdmAgreement.haircutBps(after.schedule(), TMMF));
        assertEquals(200, CdmAgreement.haircutBps(after.schedule(), TUST));
        assertEquals(p.hash(), after.hash());
        assertEquals(1, after.amendments());
    }

    @Test
    void aHaircutOnlyAmendmentLeavesTheAgreementAndAnExcludedAssetHasNoHaircut() {
        CdmAgreement.Terms t = baseline();
        var p = CdmAgreement.propose(t, null, List.of(new CdmAgreement.Haircut(TUST, false, 0)), DAY);
        assertNull(p.amendment().getAgreementEvent());
        CdmAgreement.Terms after = CdmAgreement.apply(t, CdmAgreement.verify(p.json(), t), p.hash());
        assertEquals(t.agreement(), after.agreement());
        assertNull(CdmAgreement.haircutBps(after.schedule(), TUST));
    }

    @Test
    void anAmendmentOfOtherTermsOrATamperedOneIsRejected() {
        CdmAgreement.Terms t = baseline();
        var p = CdmAgreement.propose(t, null, List.of(new CdmAgreement.Haircut(TMMF, true, 1000)), DAY);
        CdmAgreement.Terms after = CdmAgreement.apply(t, CdmAgreement.verify(p.json(), t), p.hash());
        assertThrows(IllegalStateException.class, () -> CdmAgreement.verify(p.json(), after));  // replay on the amended terms
        // the schedule after no longer follows from the haircut change
        int at = p.json().lastIndexOf("0.1");
        String tampered = p.json().substring(0, at) + "0.01" + p.json().substring(at + 3);
        assertNotEquals(p.json(), tampered);
        assertThrows(RuntimeException.class, () -> CdmAgreement.verify(tampered, t));
    }
}
