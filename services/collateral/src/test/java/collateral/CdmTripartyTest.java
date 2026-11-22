package collateral;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** Triparty terms (task-triparty-terms-profile, wp-adr-triparty-terms-profile). */
class CdmTripartyTest {
    static final String UST = "US912810TM60", AGY = "US3137EAGY10", GMRA = "0x" + "ab".repeat(32);
    static final LocalDate EFFECTIVE = LocalDate.of(2026, 11, 12);

    static CdmTriparty.Terms terms() {
        return CdmTriparty.build("BANK-A", "BANK-B", CdmTriparty.AGENT, GMRA, EFFECTIVE, UST, AGY);
    }

    @Test
    void theGiverBuildsValidTermsWithTheBaselineProfile() {
        var t = terms();
        assertEquals("", String.join("; ", CdmRuntime.failures(t.terms()).stream().map(Object::toString).toList()));
        Map<String, Object> v = CdmTriparty.view(t.terms());
        assertEquals("BANK-T", v.get("agent"));
        assertEquals("2026-11-12", v.get("effectiveDate"));
        @SuppressWarnings("unchecked") List<Map<String, Object>> p = (List<Map<String, Object>>) v.get("profile");
        assertEquals(List.of(UST, AGY), p.stream().map(e -> e.get("isin")).toList());
        assertEquals(200, p.get(0).get("haircutBps"));
        assertEquals(300, p.get(1).get("haircutBps"));
        assertNull(p.get(0).get("concentrationLimit"));
        assertEquals("0.5", p.get(1).get("concentrationLimit"));
        assertEquals(200, CdmAgreement.haircutBps(t.terms().getProfile(), UST));
        assertNull(CdmAgreement.haircutBps(t.terms().getProfile(), "US9128100000"));
        assertEquals(t.hash(), terms().hash());
    }

    @Test
    void theReceiverAndTheAgentVerifyTheGiversDocumentAgainstTheirOwnBuild() {
        var t = terms();
        assertEquals(t.hash(), CdmTriparty.verify(t.json(), "BANK-A", "BANK-B", CdmTriparty.AGENT, UST, AGY).hash());
        assertThrows(IllegalStateException.class, () -> CdmTriparty.verify(t.json(), "BANK-B", "BANK-A", CdmTriparty.AGENT, UST, AGY));
        String other = t.json().replace("\"US3137EAGY10\"", "\"US9128100000\"");
        assertThrows(IllegalStateException.class, () -> CdmTriparty.verify(other, "BANK-A", "BANK-B", CdmTriparty.AGENT, UST, AGY));
        assertThrows(IllegalStateException.class, () -> CdmTriparty.verify("{}", "BANK-A", "BANK-B", CdmTriparty.AGENT, UST, AGY));
    }

    // task-authoritative-record-other-flows: the giver may add tMMF, a Registered token, to the profile.
    static final String MMF = "US9128100000";

    @Test
    void theProfileMayAddTMmfAtTheBaselineHaircut() {
        var t = CdmTriparty.build("BANK-A", "BANK-B", CdmTriparty.AGENT, GMRA, EFFECTIVE, UST, AGY, MMF);
        assertEquals("", String.join("; ", CdmRuntime.failures(t.terms()).stream().map(Object::toString).toList()));
        @SuppressWarnings("unchecked") List<Map<String, Object>> p = (List<Map<String, Object>>) CdmTriparty.view(t.terms()).get("profile");
        assertEquals(List.of(UST, AGY, MMF), p.stream().map(e -> e.get("isin")).toList());
        assertEquals(400, p.get(2).get("haircutBps"));
        assertNull(p.get(2).get("concentrationLimit"));
        assertNotEquals(terms().hash(), t.hash());
    }

    @Test
    void aPartyAcceptsTheTMmfProfileOnlyWhenItAdmitsTMmf() {
        var withMmf = CdmTriparty.build("BANK-A", "BANK-B", CdmTriparty.AGENT, GMRA, EFFECTIVE, UST, AGY, MMF);
        assertEquals(withMmf.hash(), CdmTriparty.verify(withMmf.json(), "BANK-A", "BANK-B", CdmTriparty.AGENT, UST, AGY, MMF).hash());
        assertThrows(IllegalStateException.class, () -> CdmTriparty.verify(withMmf.json(), "BANK-A", "BANK-B", CdmTriparty.AGENT, UST, AGY));
        // The baseline still verifies for a party that admits tMMF.
        assertEquals(terms().hash(), CdmTriparty.verify(terms().json(), "BANK-A", "BANK-B", CdmTriparty.AGENT, UST, AGY, MMF).hash());
    }

    @Test
    void termsNamingTwoPartiesFailValidation() {
        assertThrows(RuntimeException.class, () -> CdmTriparty.build("BANK-A", "BANK-A", CdmTriparty.AGENT, GMRA, EFFECTIVE, UST, AGY));
    }
}
