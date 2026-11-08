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
