package cdmx;

import cdm.product.collateral.CollateralInterestHandlingParameters;
import cdmx.collateral.netting.SettlementNettingStatement;
import cdmx.collateral.netting.SettlementObligation;
import cdmx.collateral.netting.functions.Create_SettlementNetting;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static cdmx.Cdm.*;
import static cdmx.Data.*;
import static cdmx.ValuationTest.assertAmount;
import static org.junit.jupiter.api.Assertions.*;

/**
 * Settlement netting (task-csa-settlement-netting): variation margin deliveries and returns and Interest Amounts due
 * between BANK-A and BANK-B on one day in USD settle as one net transfer. The scope is the project owner's choice of
 * 2026-11-06; the rules are assumptions awaiting a business SME (task-sme-settlement-netting-rules). Amounts invented.
 */
class NettingTest {
    private final Create_SettlementNetting netting = fn(Create_SettlementNetting.class);
    private static final String DAY = "2026-11-06";

    static SettlementObligation obligation(String ref, String type, String payer, String receiver, Number amount,
                                           String ccy, String date) {
        return load(SettlementObligation.class, o("reference", ref, "obligationType", type, "payer", party(payer),
            "receiver", party(receiver), "amount", money(amount, ccy), "settlementDate", date));
    }

    static SettlementObligation obligation(String ref, String type, String payer, String receiver, Number amount) {
        return obligation(ref, type, payer, receiver, amount, "USD", DAY);
    }

    static CollateralInterestHandlingParameters handling(boolean netWithCalls) {
        Map<String, Object> h = InterestTest.handling("Transfer");
        h.put("netInterestWithMarginCalls", netWithCalls);
        return load(CollateralInterestHandlingParameters.class, h);
    }

    private SettlementNettingStatement run(CollateralInterestHandlingParameters h, SettlementObligation... xs) {
        return netting.evaluate("N-0001", List.of(xs), h);
    }

    private static String id(cdm.base.staticdata.party.Party p) {
        return p.getPartyId().get(0).getIdentifier().getValue();
    }

    @Test
    void aDeliveryAndAReturnNetToOneTransfer() {
        var s = run(null,
            obligation("C-0001", "DeliveryAmount", "BANK-A", "BANK-B", 100_000),
            obligation("C-0002", "ReturnAmount", "BANK-B", "BANK-A", 30_000));
        assertAmount(70_000, s.getNetAmount());
        assertEquals("BANK-A", id(s.getPayer()));
        assertEquals("BANK-B", id(s.getReceiver()));
        assertEquals(2, s.getObligations().size());
        assertEquals(DAY, s.getSettlementDate().toString());
        assertEquals("", failedText(s));
    }

    @Test
    void theLargerSideMayBeEitherParty() {
        var s = run(null,
            obligation("C-0001", "DeliveryAmount", "BANK-A", "BANK-B", 20_000),
            obligation("C-0002", "ReturnAmount", "BANK-B", "BANK-A", 30_000));
        assertAmount(10_000, s.getNetAmount());
        assertEquals("BANK-B", id(s.getPayer()));
        assertEquals("BANK-A", id(s.getReceiver()));
    }

    @Test
    void anInterestAmountNetsUnderTheElection() {
        var s = run(handling(true),
            obligation("C-0001", "DeliveryAmount", "BANK-A", "BANK-B", 100_000),
            obligation("C-0002", "ReturnAmount", "BANK-B", "BANK-A", 30_000),
            obligation("I-0001", "InterestAmount", "BANK-B", "BANK-A", 1_234.56));
        assertAmount(68_765.44, s.getNetAmount());
        assertEquals("BANK-A", id(s.getPayer()));
        assertEquals("", failedText(s));
    }

    @Test
    void movementsThatOffsetExactlyTransferNothing() {
        var s = run(null,
            obligation("C-0001", "DeliveryAmount", "BANK-A", "BANK-B", 30_000),
            obligation("C-0002", "ReturnAmount", "BANK-B", "BANK-A", 30_000));
        assertAmount(0, s.getNetAmount());
        assertNull(s.getPayer());
        assertNull(s.getReceiver());
        assertEquals("", failedText(s));
    }

    @Test
    void anInterestAmountNeedsTheElection() {
        var d = obligation("C-0001", "DeliveryAmount", "BANK-A", "BANK-B", 100_000);
        var i = obligation("I-0001", "InterestAmount", "BANK-B", "BANK-A", 1_000);
        assertTrue(rejected(() -> run(handling(false), d, i)).contains("netInterestWithMarginCalls"));
        assertTrue(rejected(() -> run(null, d, i)).contains("netInterestWithMarginCalls"));
    }

    @Test
    void interestAmountsAloneDoNotNet() {
        assertTrue(rejected(() -> run(handling(true),
            obligation("I-0001", "InterestAmount", "BANK-B", "BANK-A", 1_000),
            obligation("I-0002", "InterestAmount", "BANK-A", "BANK-B", 400))).contains("margin delivery or return"));
    }

    @Test
    void movementsOnDifferentDaysDoNotNet() {
        assertTrue(rejected(() -> run(null,
            obligation("C-0001", "DeliveryAmount", "BANK-A", "BANK-B", 100_000),
            obligation("C-0002", "ReturnAmount", "BANK-B", "BANK-A", 30_000, "USD", "2026-11-09"))).contains("same settlement date"));
    }

    @Test
    void movementsInDifferentCurrenciesDoNotNet() {
        assertTrue(rejected(() -> run(null,
            obligation("C-0001", "DeliveryAmount", "BANK-A", "BANK-B", 100_000),
            obligation("C-0002", "ReturnAmount", "BANK-B", "BANK-A", 30_000, "EUR", DAY))).contains("same currency"));
    }

    @Test
    void movementsWithAThirdPartyDoNotNet() {
        assertTrue(rejected(() -> run(null,
            obligation("C-0001", "DeliveryAmount", "BANK-A", "BANK-B", 100_000),
            obligation("C-0002", "ReturnAmount", "BANK-C", "BANK-A", 30_000))).contains("same two parties"));
    }

    @Test
    void aCallIsNettedOnce() {
        assertTrue(rejected(() -> run(null,
            obligation("C-0001", "DeliveryAmount", "BANK-A", "BANK-B", 100_000),
            obligation("C-0001", "ReturnAmount", "BANK-B", "BANK-A", 30_000))).contains("netted once"));
    }

    @Test
    void anObligationIsPositiveAndBetweenTwoParties() {
        assertTrue(failedText(obligation("C-0001", "DeliveryAmount", "BANK-A", "BANK-B", 0)).contains("Positive"));
        assertTrue(failedText(obligation("C-0001", "DeliveryAmount", "BANK-A", "BANK-A", 10)).contains("TwoParties"));
    }

    @Test
    void aSettleCallStepNamesTheNetting() {
        var c = MarginCallTest.issued()
            .apply("respond", responseDoc("AgreeinFull", 12_400_000))
            .apply("propose", proposalDoc())
            .apply("decide", o("proposalId", "P-1", "accept", true));
        c.apply("settle", o("proposalId", "P-1", "nettingIdentifier", "N-0001"));
        assertEquals(cdmx.collateral.margincall.MarginCallStatusEnum.SETTLED, c.state.getStatus());
        assertEquals("", failedText(c.state));
    }
}
