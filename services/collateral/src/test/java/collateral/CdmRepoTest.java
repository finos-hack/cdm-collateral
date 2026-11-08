package collateral;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.*;

/** A term repo in the service (wp-adr-repo-purchase-repurchase): the seller books it, the buyer's check rebuilds the
 *  same trade, and both build the same purchase and repurchase documents. */
class CdmRepoTest {
    private static final LocalDate DAY = LocalDate.of(2026, 11, 9);

    static CdmRepo.Terms terms(long purchasePrice) {
        BigDecimal price = new BigDecimal("98.4");
        BigDecimal ratio = new BigDecimal("1.02");
        long qty = CdmRepo.quantity(purchasePrice, ratio, price);
        return new CdmRepo.Terms("0xabc", "BANK-A", "BANK-B", "US912810TM60", qty, price, purchasePrice,
                new BigDecimal("0.045"), ratio, DAY, DAY, DAY.plusDays(7));
    }

    @Test
    void aRepriceReplacesTheTradeAndBothPartiesBuildTheSameEvent() {
        CdmRepo.Booking b = CdmRepo.book(terms(1_000_000));
        BigDecimal ratio = new BigDecimal("1.02");
        LocalDate day = DAY.plusDays(2);
        // 10,366 x 95 / 1.02 = 965,460.78; accrued 1,000,000 x 4.5% x 2 / 360 = 250
        CdmRepo.Repriced r = CdmRepo.reprice(b.trade(), new BigDecimal("95"), ratio, day);
        assertEquals(1_000_250 - 965_461, r.cashFromSeller());
        assertEquals(r.booking().hash(), CdmRepo.reprice(b.trade(), new BigDecimal("95"), ratio, day).booking().hash());

        CdmRepo.Terms t = CdmRepo.terms(r.booking().trade());
        assertEquals("0xabc", t.tradeId());
        assertEquals(965_461, t.purchasePrice());
        assertEquals(10_366, t.quantity());
        assertEquals(0, new BigDecimal("0.045").compareTo(t.rate()));
        assertEquals(0, new BigDecimal("95").compareTo(t.price()));
        assertEquals(day, t.purchaseDate());
        assertEquals(DAY.plusDays(7), t.repurchaseDate());
        // 965,461 x 4.5% x 5 / 360 = 603.41
        assertEquals(966_064, r.booking().repurchasePrice());
        assertTrue(CdmRepo.isReplacement(r.booking()));
        assertFalse(CdmRepo.isReplacement(b));
    }

    @Test
    void theRepriceDocumentRebuildsAndATamperedOneIsRejected() {
        CdmRepo.Booking b = CdmRepo.book(terms(1_000_000));
        CdmRepo.Repriced r = CdmRepo.reprice(b.trade(), new BigDecimal("95"), new BigDecimal("1.02"), DAY.plusDays(2));
        CdmRepo.Booking again = CdmRepo.verify(r.booking().json());
        assertEquals(r.booking().hash(), again.hash());
        assertEquals(r.booking().repurchasePrice(), again.repurchasePrice());
        String tampered = r.booking().json().replaceFirst("\"value\":965461", "\"value\":965000");
        assertNotEquals(r.booking().json(), tampered);
        assertThrows(IllegalStateException.class, () -> CdmRepo.verify(tampered));
    }

    @Test
    void aRepricedTradeRepurchasesAtItsNewPrice() {
        CdmRepo.Booking b = CdmRepo.book(terms(1_000_000));
        CdmRepo.Repriced r = CdmRepo.reprice(b.trade(), new BigDecimal("95"), new BigDecimal("1.02"), DAY.plusDays(2));
        CdmRepo.Settlement s = CdmRepo.repurchase(r.booking().trade());
        assertEquals(966_064, s.settlement().getCashTransfer().getQuantity().getValue().longValueExact());
        assertEquals(10_366, s.settlement().getSecurityTransfer().getQuantity().getValue().longValueExact());
    }

    @Test
    void anAdjustmentChangesTheQuantityAndKeepsThePurchasePrice() {
        CdmRepo.Booking b = CdmRepo.book(terms(1_000_000));
        BigDecimal ratio = new BigDecimal("1.02");
        LocalDate day = DAY.plusDays(2);
        // 1,020,000 / 95 = 10,736.84, up to 10,737; accrued 1,000,000 x 4.5% x 2 / 360 = 250
        CdmRepo.Adjusted a = CdmRepo.adjust(b.trade(), new BigDecimal("95"), ratio, day);
        assertEquals(10_737, a.newQuantity());
        assertEquals(250, a.accruedFromSeller());
        CdmRepo.Terms t = CdmRepo.terms(a.booking().trade());
        assertEquals("0xabc", t.tradeId());
        assertEquals(1_000_000, t.purchasePrice());
        assertEquals(10_737, t.quantity());
        assertEquals(0, new BigDecimal("0.045").compareTo(t.rate()));
        assertEquals(0, new BigDecimal("95").compareTo(t.price()));
        assertEquals(day, t.purchaseDate());
        assertEquals(DAY.plusDays(7), t.repurchaseDate());
        // 1,000,000 x 4.5% x 5 / 360 = 625
        assertEquals(1_000_625, a.booking().repurchasePrice());
        assertTrue(CdmRepo.isReplacement(a.booking()));
    }

    @Test
    void theAdjustmentDocumentRebuildsAndATamperedOneIsRejected() {
        CdmRepo.Booking b = CdmRepo.book(terms(1_000_000));
        CdmRepo.Adjusted a = CdmRepo.adjust(b.trade(), new BigDecimal("95"), new BigDecimal("1.02"), DAY.plusDays(2));
        assertEquals(a.booking().hash(), CdmRepo.verify(a.booking().json()).hash());
        String tampered = a.booking().json().replaceFirst("\"value\":10737", "\"value\":10000");
        assertNotEquals(a.booking().json(), tampered);
        assertThrows(IllegalStateException.class, () -> CdmRepo.verify(tampered));
    }

    @Test
    void aRisingPriceLowersTheQuantityAndAnAdjustedTradeRepurchases() {
        CdmRepo.Booking b = CdmRepo.book(terms(1_000_000));
        CdmRepo.Adjusted a = CdmRepo.adjust(b.trade(), new BigDecimal("102"), new BigDecimal("1.02"), DAY.plusDays(2));
        assertEquals(10_000, a.newQuantity());
        CdmRepo.Settlement s = CdmRepo.repurchase(a.booking().trade());
        assertEquals(1_000_625, s.settlement().getCashTransfer().getQuantity().getValue().longValueExact());
        assertEquals(10_000, s.settlement().getSecurityTransfer().getQuantity().getValue().longValueExact());
    }

    @Test
    void aRisingPriceMakesTheBuyerPay() {
        CdmRepo.Booking b = CdmRepo.book(terms(1_000_000));
        CdmRepo.Repriced r = CdmRepo.reprice(b.trade(), new BigDecimal("100"), new BigDecimal("1.02"), DAY.plusDays(2));
        // 10,366 x 100 / 1.02 = 1,016,274.51
        assertEquals(1_000_250 - 1_016_275, r.cashFromSeller());
    }

    @Test
    void theQuantityCoversTheMarginRatio() {
        assertEquals(10_366, CdmRepo.quantity(1_000_000, new BigDecimal("1.02"), new BigDecimal("98.4")));
        assertEquals(1_020, CdmRepo.quantity(1_000, new BigDecimal("1.02"), BigDecimal.ONE));
    }

    @Test
    void theBuyersCheckRebuildsTheSameTrade() {
        CdmRepo.Booking b = CdmRepo.book(terms(1_000_000));
        assertEquals(1_000_875, b.repurchasePrice()); // 1,000,000 x 4.5% x 7 / 360 = 875
        CdmRepo.Booking again = CdmRepo.verify(b.json());
        assertEquals(b.hash(), again.hash());
        assertEquals(CdmRepo.tradeHash(b.trade()), CdmRepo.tradeHash(again.trade()));
        CdmRepo.Terms t = CdmRepo.terms(again.trade());
        assertEquals(terms(1_000_000), t);
    }

    @Test
    void aChangedDocumentIsRejected() {
        CdmRepo.Booking b = CdmRepo.book(terms(1_000_000));
        // The Purchase Price in the instruction changed: Create_BusinessEvent over it gives another trade than the one
        // the document carries.
        String tampered = b.json().replaceFirst("\"value\":1000000", "\"value\":900000");
        assertNotEquals(b.json(), tampered);
        assertThrows(IllegalStateException.class, () -> CdmRepo.verify(tampered));
        assertThrows(IllegalStateException.class, () -> CdmRepo.verify("{\"not\":\"an event\"}"));
    }

    @Test
    void bothPartiesBuildTheSamePurchaseAndRepurchase() {
        CdmRepo.Booking seller = CdmRepo.book(terms(1_000_000));
        CdmRepo.Booking buyer = CdmRepo.verify(seller.json());
        CdmRepo.Settlement p1 = CdmRepo.purchase(seller.trade()), p2 = CdmRepo.purchase(buyer.trade());
        assertEquals(p1.hash(), p2.hash());
        assertEquals(0, new BigDecimal(1_000_000).compareTo(p1.settlement().getCashTransfer().getQuantity().getValue()));
        assertEquals("BANK-B", p1.settlement().getCashTransfer().getPayerReceiver().getPayerPartyReference().getValue().getName().getValue());
        CdmRepo.Settlement r1 = CdmRepo.repurchase(seller.trade()), r2 = CdmRepo.repurchase(buyer.trade());
        assertEquals(r1.hash(), r2.hash());
        assertNotEquals(p1.hash(), r1.hash());
        assertEquals(0, new BigDecimal(1_000_875).compareTo(r1.settlement().getCashTransfer().getQuantity().getValue()));
        assertEquals("BANK-A", r1.settlement().getCashTransfer().getPayerReceiver().getPayerPartyReference().getValue().getName().getValue());
        assertEquals("Repurchase", r1.settlement().getRepurchase().getIntent().toString());
    }
}
