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

    static final String RULEBOOK = "0x" + "44".repeat(32);

    /** The clearing of BANK-A's repo to BANK-B (task-ccp-clearing, wp-adr-ccp-clearing). */
    @Test
    void theSellerBuildsANovationWithALegForEachMemberAtTheBilateralPrices() {
        CdmRepo.Booking b = CdmRepo.book(CdmRepoTest.terms(98_400));
        var n = CdmCcp.novation(RULEBOOK, b.trade(), b.hash(), CdmCcp.CCP);
        assertTrue(CdmRuntime.failures(n.novation()).isEmpty());
        CdmRepo.Terms bilateral = CdmRepo.terms(b.trade()), s = CdmRepo.terms(n.sellerLeg()), u = CdmRepo.terms(n.buyerLeg());
        assertEquals(List.of("BANK-A", "BANK-C"), List.of(s.seller(), s.buyer()));
        assertEquals(List.of("BANK-C", "BANK-B"), List.of(u.seller(), u.buyer()));
        for (CdmRepo.Terms leg : List.of(s, u)) {
            assertEquals(bilateral.purchasePrice(), leg.purchasePrice());
            assertEquals(bilateral.quantity(), leg.quantity());
            assertEquals(bilateral.repurchaseDate(), leg.repurchaseDate());
        }
        assertEquals(CdmRepo.repurchase(b.trade()).settlement().getCashTransfer().getQuantity().getValue(),
                CdmRepo.repurchase(n.sellerLeg()).settlement().getCashTransfer().getQuantity().getValue());
        assertNotEquals(CdmRepo.purchase(n.sellerLeg()).hash(), CdmRepo.purchase(n.buyerLeg()).hash());
    }

    @Test
    void theBuyerAndTheCcpRebuildTheSameNovation() {
        CdmRepo.Booking b = CdmRepo.book(CdmRepoTest.terms(98_400));
        var n = CdmCcp.novation(RULEBOOK, b.trade(), b.hash(), CdmCcp.CCP);
        assertEquals(n.hash(), CdmCcp.verifyNovation(n.json(), b.trade(), RULEBOOK, b.hash(), CdmCcp.CCP).hash());
        var carried = CdmCcp.bilateralOf(CdmCcp.parseNovation(n.json()));
        assertEquals(n.hash(), CdmCcp.verifyNovation(n.json(), carried, RULEBOOK, b.hash(), CdmCcp.CCP).hash());
        assertThrows(IllegalStateException.class, () -> CdmCcp.verifyNovation(n.json(), b.trade(), "0x" + "66".repeat(32), b.hash(), CdmCcp.CCP));
        assertThrows(IllegalStateException.class, () -> CdmCcp.verifyNovation(n.json(), CdmRepo.book(CdmRepoTest.terms(50_000)).trade(), RULEBOOK, b.hash(), CdmCcp.CCP));
    }
}
