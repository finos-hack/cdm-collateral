package collateral;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** The CCP rulebook (task-ccp-membership, wp-adr-ccp-membership). */
class CdmCcpTest {
    static final LocalDate EFFECTIVE = LocalDate.of(2026, 11, 12);
    static final List<String> MEMBERS = List.of("BANK-A", "BANK-B");

    @Test
    void theCcpBuildsAValidRulebookWithEqualShares() {
        var r = CdmCcp.build(CdmCcp.CCP, MEMBERS, EFFECTIVE);
        assertTrue(CdmRuntime.failures(r.rulebook()).isEmpty());
        assertEquals(Map.of("BANK-A", 500_000L, "BANK-B", 500_000L), r.shares());
        assertEquals(250_000L, r.capital());
        Map<String, Object> v = CdmCcp.view(r.rulebook());
        assertEquals("BANK-C", v.get("ccp"));
        assertEquals("ClearingOrganization", v.get("role"));
        assertEquals("0.05", v.get("initialMarginRate"));
        assertEquals(1, v.get("variationMarginPeriodDays"));
        assertEquals(1_000_000L, v.get("defaultFund"));
        assertEquals(r.hash(), CdmCcp.build(CdmCcp.CCP, MEMBERS, EFFECTIVE).hash());
    }

    @Test
    void aMemberVerifiesThePublishedRulebookAgainstItsOwnBuild() {
        var r = CdmCcp.build(CdmCcp.CCP, MEMBERS, EFFECTIVE);
        assertEquals(r.hash(), CdmCcp.verify(r.json(), CdmCcp.CCP, MEMBERS).hash());
        assertThrows(IllegalStateException.class, () -> CdmCcp.verify(r.json(), "BANK-X", MEMBERS));
        assertThrows(IllegalStateException.class, () -> CdmCcp.verify(r.json(), CdmCcp.CCP, List.of("BANK-B", "BANK-A")));
        String changed = r.json().replace("0.05", "0.04");
        assertThrows(IllegalStateException.class, () -> CdmCcp.verify(changed, CdmCcp.CCP, MEMBERS));
    }
}
