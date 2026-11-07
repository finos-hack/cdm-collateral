package cdmx;

import cdm.base.staticdata.party.Party;
import cdm.event.common.TradeState;
import cdmx.collateral.reconciliation.*;
import cdmx.collateral.reconciliation.functions.ExtractTradeKeyTerms;
import cdmx.collateral.reconciliation.functions.ReconcilePortfolios;
import cdmx.collateral.reconciliation.functions.ReconcileWithLedger;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.DoubleNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.node.TextNode;
import org.junit.jupiter.api.Test;

import java.io.InputStream;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

import static cdmx.Cdm.*;
import static cdmx.Data.*;
import static org.junit.jupiter.api.Assertions.*;

/** G35: reconciliation of trade portfolios between the parties and of a party's records against the ledger (wp-adr-reconciliation-scope). */
class ReconciliationTest {
    private static final String SAMPLES = "ingest/output/fpml-confirmation-to-trade-state/fpml-5-10-products-rates/";
    /** CDM's two parties' views of one EUR vanilla swap, made for reconciliation. */
    private static final String PARTY_A_VIEW = SAMPLES + "EUR-vanilla-reconciliation-partyA-uti.json";
    private static final String PARTY_B_VIEW = SAMPLES + "EUR-vanilla-reconciliation-partyB-uti.json";
    private static final String OTHER_TRADE = SAMPLES + "cdm-xccy-swap-after-usi-uti.json";
    private static final String UTI = "UITD7895394";

    private final ReconcilePortfolios reconcile = fn(ReconcilePortfolios.class);
    private final ExtractTradeKeyTerms keyTerms = fn(ExtractTradeKeyTerms.class);
    private final ReconcileWithLedger withLedger = fn(ReconcileWithLedger.class);

    private static ObjectNode sample(String resource) {
        try (InputStream in = ReconciliationTest.class.getClassLoader().getResourceAsStream(resource)) {
            return (ObjectNode) JSON.readTree(in);
        } catch (Exception e) {
            throw new IllegalArgumentException(resource, e);
        }
    }

    /** A sample trade, optionally edited, with its references resolved (the counterparty's party). */
    private static TradeState trade(String resource, Consumer<ObjectNode> edit) {
        ObjectNode doc = sample(resource);
        edit.accept(doc);
        try {
            TradeState t = JSON.treeToValue(doc, TradeState.class);
            TradeState.TradeStateBuilder b = t.toBuilder();
            // The samples refer to their parties by external key (FpML href), which the reference resolver leaves alone.
            for (var c : b.getTrade().getCounterparty()) {
                String ref = c.getPartyReference().getExternalReference();
                for (Party p : t.getTrade().getParty())
                    if (p.getMeta() != null && ref != null && ref.equals(p.getMeta().getExternalKey())) c.getPartyReference().setValue(p);
            }
            return b.build();
        } catch (Exception e) {
            throw new IllegalArgumentException(e);
        }
    }

    private static TradeState trade(String resource) {
        return trade(resource, d -> {});
    }

    private static String uti(TradeState t) {
        return t.getTrade().getTradeIdentifier().get(0).getAssignedIdentifier().get(0).getIdentifier().getValue();
    }

    /** A snapshot by {@code party} of trades with {@code counterparty}: trade, then the party's valuation in EUR. */
    private static PortfolioSnapshot snapshot(String party, String counterparty, Object... tradeAndValue) {
        List<Object> exposures = new ArrayList<>();
        List<TradeState> trades = new ArrayList<>();
        for (int i = 0; i < tradeAndValue.length; i += 2) {
            TradeState t = (TradeState) tradeAndValue[i];
            trades.add(t);
            exposures.add(o("tradeIdentifier", ident(uti(t), party),
                "markToMarket", money((Number) tradeAndValue[i + 1], "EUR")));
        }
        PortfolioSnapshot s = load(PortfolioSnapshot.class, o(
            "nettingSet", o("nettingSetIdentifier", ident("ISDA-2002-A-B", party), "valuationParty", party(party),
                "counterparty", party(counterparty), "tradeExposure", exposures),
            "asOf", "2026-11-07T17:00:00Z"));
        return s.toBuilder().setTrade(trades).build();
    }

    private static cdm.observable.asset.Money eur(Number v) {
        return load(cdm.observable.asset.Money.class, money(v, "EUR"));
    }

    private static List<String> breakTypes(PortfolioReconciliation r) {
        List<String> out = new ArrayList<>();
        if (r.getReconciliationBreak() != null)
            for (ReconciliationBreak b : r.getReconciliationBreak()) out.add(b.getUti() + ":" + b.getBreakType());
        return out;
    }

    private static int cmp(String expected, BigDecimal actual) {
        return new BigDecimal(expected).compareTo(actual);
    }

    @Test
    void keyTermsOfTheSampleSwap() {
        TradeKeyTerms k = keyTerms.evaluate(trade(PARTY_A_VIEW));
        assertEquals(UTI, k.getUti());
        assertEquals("InterestRate_IRSwap_FixedFloat", k.getProduct());
        assertEquals(0, cmp("20000000", k.getNotional().getValue()));
        assertEquals("EUR", k.getNotional().getUnit().getCurrency().getValue());
        assertEquals("1994-12-14", k.getEffectiveDate().toString());
        assertEquals("1999-12-14", k.getTerminationDate().toString());
        assertEquals(0, cmp("0.06", k.getFixedRate()));
        assertEquals("EUR-LIBOR-BBA", k.getFloatingRateIndex());
        assertEquals("48750084UKLVTR22DS78", k.getFixedRatePayer());  // Party2 (Party B) pays the fixed leg
    }

    @Test
    void theTwoPartiesViewsOfTheSampleSwapReconcile() {
        // Each party values the swap from its own side: A is owed 250,000, so B owes 250,000.
        PortfolioReconciliation r = reconcile.evaluate(
            snapshot("BANK-A", "BANK-B", trade(PARTY_A_VIEW), 250_000),
            snapshot("BANK-B", "BANK-A", trade(PARTY_B_VIEW), -250_000), eur(1_000));
        assertTrue(r.getReconciled(), breakTypes(r).toString());
        assertEquals(1, r.getMatchedTradeCount());
        assertEquals(0, cmp("250000", r.getFirstExposure().getValue()));
        assertEquals(0, cmp("-250000", r.getSecondExposure().getValue()));
        assertEquals(0, cmp("0", r.getExposureDifference().getValue()));
        assertEquals("", failedText(r));
    }

    @Test
    void aValuationDifferenceWithinTheToleranceIsNotABreak() {
        PortfolioReconciliation r = reconcile.evaluate(
            snapshot("BANK-A", "BANK-B", trade(PARTY_A_VIEW), 250_000),
            snapshot("BANK-B", "BANK-A", trade(PARTY_B_VIEW), -249_200), eur(1_000));
        assertTrue(r.getReconciled());
        assertEquals(0, cmp("800", r.getExposureDifference().getValue()));
    }

    @Test
    void aValuationDifferenceAboveTheToleranceIsABreak() {
        PortfolioReconciliation r = reconcile.evaluate(
            snapshot("BANK-A", "BANK-B", trade(PARTY_A_VIEW), 250_000),
            snapshot("BANK-B", "BANK-A", trade(PARTY_B_VIEW), -230_000), eur(1_000));
        assertFalse(r.getReconciled());
        assertEquals(List.of(UTI + ":ValuationDiffers"), breakTypes(r));
        ReconciliationBreak b = r.getReconciliationBreak().get(0);
        assertEquals(0, cmp("20000", b.getValuationDifference().getValue()));
        assertEquals(0, cmp("250000", b.getFirstValuation().getValue()));
        assertEquals(0, cmp("-230000", b.getSecondValuation().getValue()));
        assertEquals(0, r.getMatchedTradeCount());
        assertEquals("", failedText(r));
    }

    @Test
    void differentKeyTermsAreABreakNamingTheTerms() {
        // B records a notional of 25,000,000 and a fixed rate of 6.25%.
        TradeState bView = trade(PARTY_B_VIEW, d -> {
            ArrayNode pq = (ArrayNode) d.at("/trade/tradeLot/0/priceQuantity");
            ((ObjectNode) pq.get(0).get("quantity")).set("value", DoubleNode.valueOf(25_000_000.0));
            ((ObjectNode) pq.get(1).get("price").get(0)).set("value", DoubleNode.valueOf(0.0625));
        });
        PortfolioReconciliation r = reconcile.evaluate(
            snapshot("BANK-A", "BANK-B", trade(PARTY_A_VIEW), 250_000),
            snapshot("BANK-B", "BANK-A", bView, -250_000), eur(1_000));
        assertEquals(List.of(UTI + ":EconomicTermsDiffer"), breakTypes(r));
        assertEquals(List.of("notional", "fixedRate"), r.getReconciliationBreak().get(0).getDifferingTerm());
        assertEquals("", failedText(r));
    }

    @Test
    void aSwappedPayerIsABreak() {
        // B records itself as the floating rate payer of the fixed leg: the direction differs.
        TradeState bView = trade(PARTY_B_VIEW, d -> {
            ObjectNode fixed = (ObjectNode) d.at("/trade/product/economicTerms/payout/1/payerReceiver");
            fixed.set("payer", TextNode.valueOf("Party1"));
            fixed.set("receiver", TextNode.valueOf("Party2"));
        });
        PortfolioReconciliation r = reconcile.evaluate(
            snapshot("BANK-A", "BANK-B", trade(PARTY_A_VIEW), 250_000),
            snapshot("BANK-B", "BANK-A", bView, -250_000), eur(1_000));
        assertEquals(List.of("fixedRatePayer"), r.getReconciliationBreak().get(0).getDifferingTerm());
    }

    @Test
    void aTradeOnOneSideOnlyIsABreak() {
        TradeState other = trade(OTHER_TRADE);
        PortfolioReconciliation r = reconcile.evaluate(
            snapshot("BANK-A", "BANK-B", trade(PARTY_A_VIEW), 250_000, other, 40_000),
            snapshot("BANK-B", "BANK-A", trade(PARTY_B_VIEW), -250_000), eur(1_000));
        assertEquals(List.of(uti(other) + ":MissingFromSecond"), breakTypes(r));
        assertEquals(1, r.getMatchedTradeCount());
        assertEquals(0, cmp("290000", r.getFirstExposure().getValue()));
        assertEquals(0, cmp("40000", r.getExposureDifference().getValue()));

        PortfolioReconciliation back = reconcile.evaluate(
            snapshot("BANK-B", "BANK-A", trade(PARTY_B_VIEW), -250_000),
            snapshot("BANK-A", "BANK-B", trade(PARTY_A_VIEW), 250_000, other, 40_000), eur(1_000));
        assertEquals(List.of(uti(other) + ":MissingFromFirst"), breakTypes(back));
        assertEquals("", failedText(back));
    }

    @Test
    void bothPartiesComputeTheSameResult() throws Exception {
        PortfolioSnapshot a = snapshot("BANK-A", "BANK-B", trade(PARTY_A_VIEW), 250_000, trade(OTHER_TRADE), 40_000);
        PortfolioSnapshot b = snapshot("BANK-B", "BANK-A", trade(PARTY_B_VIEW), -230_000);
        assertEquals(toJson(reconcile.evaluate(a, b, eur(1_000))), toJson(reconcile.evaluate(a, b, eur(1_000))));
        PortfolioReconciliation r = reconcile.evaluate(a, b, eur(1_000));
        assertEquals(r, JSON.readValue(toJson(r), PortfolioReconciliation.class));
    }

    @Test
    void preconditionsAndSnapshotConditions() {
        PortfolioSnapshot a = snapshot("BANK-A", "BANK-B", trade(PARTY_A_VIEW), 250_000);
        PortfolioSnapshot c = snapshot("BANK-C", "BANK-A", trade(PARTY_B_VIEW), -250_000);
        String m = rejected(() -> reconcile.evaluate(a, c, eur(1_000))); assertTrue(m.contains("two sides of one pair"), m);
        PortfolioSnapshot b = snapshot("BANK-B", "BANK-A", trade(PARTY_B_VIEW), -250_000);
        assertTrue(rejected(() -> reconcile.evaluate(a, b, eur(-1))).contains("not negative"));

        assertEquals("", failedText(a));
        PortfolioSnapshot unvalued = a.toBuilder().addTrade(trade(OTHER_TRADE)).build();
        assertTrue(failedText(unvalued).contains("ValuationForEachTrade"));
    }

    // ---- records against the ledger ----

    private static LedgerFact fact(String record, String attribute, String value) {
        return load(LedgerFact.class, o("recordIdentifier", record, "attribute", attribute, "factValue", value));
    }

    private static Party bank(String name) {
        return load(Party.class, party(name));
    }

    @Test
    void recordsThatMatchTheLedgerReconcile() {
        List<LedgerFact> facts = List.of(fact("0xc1", "state", "Settled"), fact("0xc1", "agreedAmount", "1200000"),
            fact("escrow/tUST", "pledgedUnits", "12245"));
        LedgerReconciliation r = withLedger.evaluate(bank("BANK-A"), bank("BANK-B"), facts, List.copyOf(facts));
        assertTrue(r.getReconciled());
        assertEquals(3, r.getCheckedFactCount());
        assertEquals("", failedText(r));
    }

    @Test
    void eachDisagreementWithTheLedgerIsABreak() {
        LedgerReconciliation r = withLedger.evaluate(bank("BANK-A"), bank("BANK-B"),
            List.of(fact("0xc1", "state", "Agreed"), fact("0xc2", "state", "Issued"), fact("escrow/tUST", "pledgedUnits", "12245")),
            List.of(fact("0xc1", "state", "Settled"), fact("escrow/tUST", "pledgedUnits", "12245"), fact("escrow/tMMF", "pledgedUnits", "500")));
        assertFalse(r.getReconciled());
        assertEquals(4, r.getCheckedFactCount());
        List<String> got = new ArrayList<>();
        for (LedgerBreak b : r.getLedgerBreak())
            got.add(b.getRecordIdentifier() + "/" + b.getAttribute() + ":" + b.getBreakType() + ":" + b.getRecordedValue() + ">" + b.getLedgerValue());
        assertEquals(List.of("0xc1/state:ValueDiffers:Agreed>Settled", "0xc2/state:MissingOnLedger:Issued>null",
            "escrow/tMMF/pledgedUnits:MissingFromRecords:null>500"), got);
        assertEquals("", failedText(r));
    }

    @Test
    void aFactIsStatedOncePerSide() {
        assertTrue(rejected(() -> withLedger.evaluate(bank("BANK-A"), bank("BANK-B"),
            List.of(fact("0xc1", "state", "Agreed"), fact("0xc1", "state", "Settled")), List.of())).contains("once"));
    }
}
