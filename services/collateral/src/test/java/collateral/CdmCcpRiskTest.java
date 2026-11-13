package collateral;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** The CCP's margin, default management and porting (task-ccp-margin, task-ccp-default, task-ccp-porting). */
class CdmCcpRiskTest {
    static final String RULEBOOK = CdmCcpTest.RULEBOOK;
    static final LocalDate DAY = LocalDate.of(2026, 11, 11);

    static CdmCcp.Novation cleared() {
        CdmRepo.Booking b = CdmRepo.book(CdmRepoTest.terms(98_400));
        return CdmCcp.novation(RULEBOOK, b.trade(), b.hash(), CdmCcp.CCP);
    }

    static CdmCcp.MarginLine line(CdmCcp.Novation n, String price, long previous) {
        return new CdmCcp.MarginLine("0x01", "BANK-A", "BANK-B", false, n.sellerLeg(), new BigDecimal(price), previous);
    }

    @Test
    void theMembersStatementsCarryOppositeVariationMarginAndEachItsInitialMargin() {
        CdmCcp.Novation n = cleared();
        var a = CdmCcp.marginStatement(RULEBOOK, CdmCcp.CCP, "BANK-A", DAY, CdmCcp.IM_RATE, List.of(line(n, "95", 0)), 98_400, 0);
        var b = CdmCcp.marginStatement(RULEBOOK, CdmCcp.CCP, "BANK-B", DAY, CdmCcp.IM_RATE, List.of(line(n, "95", 0)), 98_400, 0);
        assertTrue(CdmRuntime.failures(a.statement()).isEmpty());
        // The price fell: the seller A owes variation margin, which goes to B.
        assertTrue(a.vm() > 0);
        assertEquals(-a.vm(), b.vm());
        assertEquals(a.vm(), a.lineVm("0x01"));
        assertEquals(4_920, a.im());
        assertEquals(a.vm() + a.im(), a.net());
        assertEquals(List.of("VM", "NonRegIM"), a.statement().getCall().stream().map(c -> String.valueOf(c.getRegMarginType())).toList());
        assertEquals(List.of("NonRegIM"), b.statement().getCall().stream().map(c -> String.valueOf(c.getRegMarginType())).toList());
        // The member rebuilds the same statement; a change since the last round counts only the difference.
        assertEquals(a.hash(), CdmCcp.marginStatement(RULEBOOK, CdmCcp.CCP, "BANK-A", DAY, CdmCcp.IM_RATE, List.of(line(n, "95", 0)), 98_400, 0).hash());
        var again = CdmCcp.marginStatement(RULEBOOK, CdmCcp.CCP, "BANK-A", DAY, CdmCcp.IM_RATE, List.of(line(n, "95", a.vm())), 98_400, 4_920);
        assertEquals(0, again.vm());
        assertEquals(0, again.im());
        assertNull(again.statement().getCall());
        assertEquals(new BigDecimal("95"), CdmCcp.statedPrice(CdmCcp.parseMargin(a.json()), "0x01").stripTrailingZeros());
        assertEquals(DAY, CdmCcp.dateOfKey(String.valueOf(CdmCcp.dateKey(DAY))));
    }

    @Test
    void aRepurchasedRepoReturnsItsVariationMarginInFull() {
        CdmCcp.Novation n = cleared();
        var r = new CdmCcp.MarginLine("0x01", "BANK-A", "BANK-B", true, n.sellerLeg(), new BigDecimal("95"), 1_200);
        var a = CdmCcp.marginStatement(RULEBOOK, CdmCcp.CCP, "BANK-A", DAY, CdmCcp.IM_RATE, List.of(r), 0, 4_920);
        assertEquals(-1_200, a.vm());
        assertEquals(-4_920, a.im());
        assertNull(a.statement().getCall());
    }

    static CdmCcp.DefaultInput defaultOfA(CdmCcp.Novation n, String price, long vm) {
        return new CdmCcp.DefaultInput("0x01", true, n.sellerLeg(), n.buyerLeg(), "BANK-B", vm, new BigDecimal(price));
    }

    @Test
    void theWaterfallTakesTheDefaultersMarginThenItsContributionThenTheCcpsCapital() {
        CdmCcp.Novation n = cleared();
        var m = CdmCcp.defaultManagement(RULEBOOK, CdmCcp.CCP, "BANK-A", DAY, DAY, List.of(defaultOfA(n, "90", 0)),
                new CdmCcp.Resources(1_000, 2_000, 250_000, 500_000));
        assertTrue(CdmRuntime.failures(m.management()).isEmpty());
        var w = m.waterfall();
        long loss = w.getLoss().longValueExact();
        assertTrue(loss > 3_000, "the price fall is a loss on the seller's default: " + loss);
        assertEquals(1_000, w.getFromDefaulterInitialMargin().longValueExact());
        assertEquals(2_000, w.getFromDefaulterContribution().longValueExact());
        assertEquals(loss - 3_000, w.getFromCcpCapital().longValueExact());
        assertEquals(0, w.getFromMembersContribution().longValueExact());
        assertEquals(0, w.getReturnedToDefaulter().longValueExact());
        assertEquals(loss, (long) m.residuals().get("0x01"));
        assertEquals(m.hash(), CdmCcp.defaultManagement(RULEBOOK, CdmCcp.CCP, "BANK-A", DAY, DAY, List.of(defaultOfA(n, "90", 0)),
                new CdmCcp.Resources(1_000, 2_000, 250_000, 500_000)).hash());
        assertEquals(m.hash(), Cdm.keccakHex(CdmRuntime.toJson(CdmCcp.parseManagement(m.json()))));
    }

    @Test
    void aGainOnTheCloseOutGoesBackToTheDefaulterWithItsResources() {
        CdmCcp.Novation n = cleared();
        var m = CdmCcp.defaultManagement(RULEBOOK, CdmCcp.CCP, "BANK-A", DAY, DAY, List.of(defaultOfA(n, "110", 0)),
                new CdmCcp.Resources(1_000, 2_000, 250_000, 500_000));
        var w = m.waterfall();
        long loss = w.getLoss().longValueExact();
        assertTrue(loss < 0);
        assertEquals(0, w.getFromDefaulterInitialMargin().longValueExact());
        assertEquals(3_000 - loss, w.getReturnedToDefaulter().longValueExact());
    }

    @Test
    void theCcpAdmitsAMemberThatRebuildsTheAdmission() {
        var a = CdmCcp.admission(RULEBOOK, CdmCcp.CCP, "BANK-T", DAY);
        assertTrue(CdmRuntime.failures(a.admission()).isEmpty());
        assertEquals(CdmCcp.ADMITTED_SHARE, a.share());
        assertEquals("BANK-T", a.member());
        assertEquals(a.hash(), CdmCcp.verifyAdmission(a.json(), RULEBOOK, CdmCcp.CCP, "BANK-T").hash());
        assertThrows(IllegalStateException.class, () -> CdmCcp.verifyAdmission(a.json(), RULEBOOK, CdmCcp.CCP, "BANK-B"));
        assertThrows(IllegalStateException.class, () -> CdmCcp.verifyAdmission(a.json(), "0x" + "66".repeat(32), CdmCcp.CCP, "BANK-T"));
    }

    @Test
    void theSellerPortsItsLegToAnotherMemberAtTheFeedPrice() {
        CdmCcp.Novation n = cleared();
        var p = CdmCcp.porting(RULEBOOK, "0x01", CdmCcp.CCP, "BANK-A", "BANK-T", true, DAY, n.sellerLeg(), new BigDecimal("98.4"), 300);
        assertTrue(CdmRuntime.failures(p.porting()).isEmpty());
        CdmRepo.Terms t = CdmRepo.terms(p.newLeg());
        assertEquals(List.of("BANK-T", "BANK-C"), List.of(t.seller(), t.buyer()));
        assertEquals(CdmRepo.terms(n.sellerLeg()).quantity(), t.quantity());
        var x = p.porting();
        assertEquals(x.getMarketValue().subtract(x.getRepurchasePrice()).add(BigDecimal.valueOf(300)).longValueExact(), p.payment());
        assertEquals(p.hash(), CdmCcp.verifyPorting(p.json(), RULEBOOK, "0x01", CdmCcp.CCP, "BANK-A", "BANK-T", true, n.sellerLeg(), 300).hash());
        assertThrows(IllegalStateException.class, () -> CdmCcp.verifyPorting(p.json(), RULEBOOK, "0x01", CdmCcp.CCP, "BANK-A", "BANK-T", true, n.sellerLeg(), 0));
        assertThrows(IllegalStateException.class, () -> CdmCcp.portingEvent(n.sellerLeg(), "BANK-B", "BANK-T", DAY));
    }

    @Test
    void theBuyerPortsItsLegAndIsPaidTheRepurchasePriceLessTheMargin() {
        CdmCcp.Novation n = cleared();
        var p = CdmCcp.porting(RULEBOOK, "0x01", CdmCcp.CCP, "BANK-B", "BANK-T", false, DAY, n.buyerLeg(), new BigDecimal("98.4"), 300);
        CdmRepo.Terms t = CdmRepo.terms(p.newLeg());
        assertEquals(List.of("BANK-C", "BANK-T"), List.of(t.seller(), t.buyer()));
        assertEquals(p.porting().getRepurchasePrice().longValueExact() - 300, p.payment());
    }
}
