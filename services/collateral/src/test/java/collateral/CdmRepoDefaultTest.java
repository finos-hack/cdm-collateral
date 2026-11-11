package collateral;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** A GMRA default close-out in the service (wp-adr-repo-default-close-out): both parties build the same statement from
 *  the same trades and prices, and the balance follows the set-off. */
class CdmRepoDefaultTest {
    private static final LocalDate EOD = LocalDate.of(2026, 11, 12);
    private static final BigDecimal PRICE = new BigDecimal("98.4");

    static CdmRepoDefault.TxInput tx(CdmRepo.Terms t) {
        return new CdmRepoDefault.TxInput(t.tradeId(), CdmRepo.book(t).trade(), 0, PRICE);
    }

    static CdmRepoDefault.Notice notice() {
        return CdmRepoDefault.notice("BANK-A", "BANK-B", EOD, EOD, true);
    }

    @Test
    void theDefaultingBuyerPaysTheExcessOfTheSecuritiesAndBothPartiesBuildTheSameStatement() {
        var one = List.of(tx(CdmRepoTest.terms(1_000_000)));   // BANK-A sells to BANK-B at 4.5%
        CdmRepoDefault.Statement a = CdmRepoDefault.statement(notice().notice(), "USD", EOD, one, List.of());
        CdmRepoDefault.Statement b = CdmRepoDefault.statement(CdmRepoDefault.parse(a.json()).getNotice(), "USD", EOD,
                List.of(tx(CdmRepoTest.terms(1_000_000))), List.of());
        assertEquals(a.hash(), b.hash());
        // 10,366 x 98.4 = 1,020,014 owed by BANK-B; 1,000,375 owed to it
        assertEquals(19_639, a.balance());
        assertEquals("BANK-B", a.payer());
        assertNull(a.statement().getTransactionValue().get(0).getTermination().getIntent());
        assertEquals(List.of(), CdmRepoDefault.settledCalls(CdmRepoDefault.parse(a.json())));
    }

    @Test
    void marginHeldAndAReverseRepoTurnThePayer() {
        var txs = List.of(tx(CdmRepoTest.terms(1_000_000)), tx(CdmRepoTest.reverse("0xdef", "0.05")));
        var margin = List.of(new CdmRepoDefault.MarginInput("BANK-A", "BANK-B", "USD", true, 5_000, BigDecimal.ONE, List.of("0xcall")));
        CdmRepoDefault.Statement s = CdmRepoDefault.statement(notice().notice(), "USD", EOD, txs, margin);
        assertEquals(4_958, s.balance());
        assertEquals("BANK-A", s.payer());
        assertEquals(List.of("0xcall"), CdmRepoDefault.settledCalls(s.statement()));
    }

    @Test
    void aBuySellBackEntersAtItsSellBackPrice() {
        CdmRepo.Terms t = CdmRepoTest.terms(1_000_000);
        CdmRepo.Terms bsb = new CdmRepo.Terms(t.tradeId(), t.seller(), t.buyer(), t.isin(), t.quantity(), t.price(), t.purchasePrice(),
                t.rate(), t.marginRatio(), t.tradeDate(), t.purchaseDate(), t.repurchaseDate(), true);
        var s = CdmRepoDefault.statement(notice().notice(), "USD", EOD,
                List.of(new CdmRepoDefault.TxInput(t.tradeId(), CdmRepo.book(bsb).trade(), 5_186, PRICE)), List.of());
        assertEquals(0, new BigDecimal(995_189).compareTo(s.statement().getTransactionValue().get(0).getRepurchasePrice()));
        assertEquals(19_639 + 5_186, s.balance());
    }

    @Test
    void automaticEarlyTerminationIsOnTheDefaultDate() {
        assertThrows(RuntimeException.class, () -> CdmRepoDefault.notice("BANK-A", "BANK-B", EOD, EOD.plusDays(1), true));
        assertEquals(EOD.plusDays(1), CdmRepoDefault.notice("BANK-A", "BANK-B", EOD, EOD.plusDays(1), false).notice().getEarlyTerminationDate().toLocalDate());
    }
}
