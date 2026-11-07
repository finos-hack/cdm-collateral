package collateral;

import cdm.base.staticdata.party.Party;
import cdm.event.common.TradeState;
import cdm.observable.asset.Money;
import cdmx.collateral.margincall.MarginCallState;
import cdmx.collateral.reconciliation.LedgerBreak;
import cdmx.collateral.reconciliation.LedgerFact;
import cdmx.collateral.reconciliation.LedgerReconciliation;
import cdmx.collateral.reconciliation.PortfolioReconciliation;
import cdmx.collateral.reconciliation.PortfolioSnapshot;
import cdmx.collateral.reconciliation.ReconciliationBreak;
import cdmx.collateral.reconciliation.functions.ReconcilePortfolios;
import cdmx.collateral.reconciliation.functions.ReconcileWithLedger;
import com.fasterxml.jackson.databind.JsonNode;

import java.io.InputStream;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static collateral.CdmRuntime.l;
import static collateral.CdmRuntime.o;

/**
 * Reconciliation for flow-reconciliation (cdm-ext {@code cdmx.collateral.reconciliation}, task-csa-reconciliation,
 * wp-adr-reconciliation-scope). Two parts:
 * <ul>
 *   <li>Trade portfolios between the parties: each party's trades are CDM 7.7.0 sample {@code TradeState}s with the
 *   party's valuation (resources {@code reconciliation/<node>.json}). A {@code PortfolioSnapshot} is exchanged service
 *   to service as Rune JSON; only its hash goes on-chain. Both parties run {@code ReconcilePortfolios} on the same two
 *   parsed snapshots, first the initiating party's, so both get the same result and the same result hash.</li>
 *   <li>Records against the ledger: the facts the party's stored CDM {@code MarginCallState}s state about the pair's
 *   calls (status, called amount, agreed amount) against the same facts read from the contract.</li>
 * </ul>
 */
public final class CdmReconciliation {
    public static final String CURRENCY = "USD";

    private CdmReconciliation() {}

    /** One seeded trade: the CDM sample resource and the party's valuation in USD from its own side. */
    public record SeedTrade(String resource, BigDecimal valuationUsd) {}

    /** A party's seeded trade population with its counterparty and the valuation tolerance it applies. */
    public record Seed(List<SeedTrade> trades, BigDecimal toleranceUsd) {}

    public static Seed seed(String node) {
        try (InputStream in = CdmReconciliation.class.getResourceAsStream("/reconciliation/" + node + ".json")) {
            if (in == null) return new Seed(List.of(), BigDecimal.valueOf(10_000));
            JsonNode n = Config.MAPPER.readTree(in);
            List<SeedTrade> trades = new ArrayList<>();
            for (JsonNode t : n.get("trades")) trades.add(new SeedTrade(t.get("resource").asText(), t.get("valuationUsd").decimalValue()));
            return new Seed(trades, n.get("valuationToleranceUsd").decimalValue());
        } catch (Exception e) {
            throw new IllegalStateException("reconciliation seed for " + node + " unreadable: " + e.getMessage(), e);
        }
    }

    /**
     * A CDM sample trade with its counterparty party references resolved. The samples refer to their parties by FpML
     * external key, which CDM's reference resolver leaves alone; ExtractTradeKeyTerms reads the fixed rate payer's LEI
     * through the reference.
     */
    public static TradeState trade(String resource) {
        try (InputStream in = TradeState.class.getClassLoader().getResourceAsStream(resource)) {
            if (in == null) throw new IllegalArgumentException("CDM sample not on the classpath: " + resource);
            TradeState t = CdmRuntime.JSON.readValue(in, TradeState.class);
            TradeState.TradeStateBuilder b = t.toBuilder();
            for (var c : b.getTrade().getCounterparty()) {
                String ref = c.getPartyReference().getExternalReference();
                for (Party p : t.getTrade().getParty())
                    if (p.getMeta() != null && ref != null && ref.equals(p.getMeta().getExternalKey())) c.getPartyReference().setValue(p);
            }
            return b.build();
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalArgumentException("CDM sample unreadable: " + resource + ": " + e.getMessage(), e);
        }
    }

    static String uti(TradeState t) {
        for (var id : t.getTrade().getTradeIdentifier())
            if (id.getIdentifierType() != null && id.getIdentifierType().name().equals("UNIQUE_TRANSACTION_IDENTIFIER"))
                return id.getAssignedIdentifier().get(0).getIdentifier().getValue();
        throw new IllegalArgumentException("trade has no UTI");
    }

    static Map<String, Object> party(String bankName) {
        return o("partyId", l(o("identifier", o("@data", bankName))));
    }

    private static Map<String, Object> money(BigDecimal v) {
        return o("value", v, "unit", o("currency", o("@data", CURRENCY)));
    }

    /** The snapshot of a party's seeded trades with a counterparty, as Rune JSON. */
    public static String snapshotJson(String bankName, String counterpartyBank, Seed seed, Instant asOf) {
        List<Object> exposures = new ArrayList<>();
        List<TradeState> trades = new ArrayList<>();
        for (SeedTrade s : seed.trades()) {
            TradeState t = trade(s.resource());
            trades.add(t);
            exposures.add(o("tradeIdentifier", o("issuer", o("@data", bankName), "assignedIdentifier", l(o("identifier", o("@data", uti(t))))),
                    "markToMarket", money(s.valuationUsd())));
        }
        PortfolioSnapshot snap = CdmRuntime.load(PortfolioSnapshot.class, o(
                "nettingSet", o("nettingSetIdentifier", o("issuer", o("@data", bankName), "assignedIdentifier", l(o("identifier", o("@data", "ISDA-2002-A-B")))),
                        "valuationParty", party(bankName), "counterparty", party(counterpartyBank), "tradeExposure", exposures),
                "asOf", asOf.truncatedTo(ChronoUnit.SECONDS).toString()));
        snap = snap.toBuilder().setTrade(trades).build();
        checkSnapshot(snap);
        return CdmRuntime.toJson(snap);
    }

    /** Parse a snapshot and check the extension's condition on it (the sample trades are not revalidated here). */
    public static PortfolioSnapshot parseSnapshot(String json) {
        try {
            PortfolioSnapshot s = CdmRuntime.JSON.readValue(json, PortfolioSnapshot.class);
            checkSnapshot(s);
            return s;
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalArgumentException("snapshot unreadable: " + e.getMessage(), e);
        }
    }

    private static void checkSnapshot(PortfolioSnapshot s) {
        for (String f : CdmRuntime.failures(s))
            if (f.contains("ValuationForEachTrade")) throw new IllegalArgumentException("snapshot: " + f);
    }

    /** Reconcile the initiating party's snapshot (first) with the other party's (second), both as Rune JSON. */
    public static PortfolioReconciliation reconcile(String firstJson, String secondJson, BigDecimal toleranceUsd) {
        PortfolioReconciliation r = CdmRuntime.fn(ReconcilePortfolios.class).evaluate(parseSnapshot(firstJson), parseSnapshot(secondJson),
                CdmRuntime.load(Money.class, money(toleranceUsd)));
        CdmRuntime.validate(r);
        return r;
    }

    public static int breakCount(PortfolioReconciliation r) {
        return r.getReconciliationBreak() == null ? 0 : r.getReconciliationBreak().size();
    }

    private static String plain(BigDecimal v) {
        return v == null ? null : v.stripTrailingZeros().toPlainString();
    }

    private static String name(Party p) {
        return p.getPartyId().get(0).getIdentifier().getValue();
    }

    /** The console's view of a portfolio reconciliation. */
    public static Map<String, Object> view(PortfolioReconciliation r) {
        List<Map<String, Object>> breaks = new ArrayList<>();
        if (r.getReconciliationBreak() != null)
            for (ReconciliationBreak b : r.getReconciliationBreak()) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("uti", b.getUti());
                m.put("type", b.getBreakType().toDisplayString());
                m.put("terms", b.getDifferingTerm() == null ? List.of() : b.getDifferingTerm());
                m.put("firstValuationUsd", b.getFirstValuation() == null ? null : plain(b.getFirstValuation().getValue()));
                m.put("secondValuationUsd", b.getSecondValuation() == null ? null : plain(b.getSecondValuation().getValue()));
                m.put("differenceUsd", b.getValuationDifference() == null ? null : plain(b.getValuationDifference().getValue()));
                breaks.add(m);
            }
        Map<String, Object> v = new LinkedHashMap<>();
        v.put("firstParty", name(r.getFirstParty()));
        v.put("secondParty", name(r.getSecondParty()));
        v.put("reconciled", r.getReconciled());
        v.put("matchedTrades", r.getMatchedTradeCount());
        v.put("breaks", breaks);
        v.put("firstExposureUsd", plain(r.getFirstExposure().getValue()));
        v.put("secondExposureUsd", plain(r.getSecondExposure().getValue()));
        v.put("exposureDifferenceUsd", plain(r.getExposureDifference().getValue()));
        v.put("toleranceUsd", plain(r.getValuationTolerance().getValue()));
        return v;
    }

    // ---- records against the ledger ----

    public static LedgerFact fact(String record, String attribute, String value) {
        return CdmRuntime.load(LedgerFact.class, o("recordIdentifier", record, "attribute", attribute, "factValue", value));
    }

    /** CDM MarginCallStatusEnum names for the contract's call states (CollateralTypes.sol CallState). */
    private static final String[] LEDGER_STATUS = {"None", "Issued", "Agreed", "PartiallyAgreed", "Disputed", "Settled", "Settled", "Cancelled"};

    /** An amount stated in whole USD as the canonical fact value. */
    private static String usd(BigDecimal v) {
        return v.stripTrailingZeros().toPlainString();
    }

    /** The agreed amount is a fact once a call is answered; a cancelled call states it only when it is above zero. */
    private static boolean statesAgreed(String status, BigDecimal agreed) {
        return !status.equals("Issued") && (!status.equals("Cancelled") || agreed.signum() > 0);
    }

    /** The facts a stored MarginCallState states about its call. */
    public static List<LedgerFact> recordedFacts(String callId, MarginCallState st) {
        List<LedgerFact> out = new ArrayList<>();
        String status = st.getStatus().toDisplayString();
        out.add(fact(callId, "status", status));
        out.add(fact(callId, "calledAmount", usd(st.getIssuance().getCallAmountInBaseCurrency().getValue())));
        BigDecimal agreed = st.getAgreedAmount() == null ? BigDecimal.ZERO : st.getAgreedAmount().getValue();
        if (st.getAgreedAmount() != null && statesAgreed(status, agreed)) out.add(fact(callId, "agreedAmount", usd(agreed)));
        return out;
    }

    /** The facts the contract states about a call ({@code /calls/{id}} as the gateway returns it). */
    public static List<LedgerFact> ledgerFacts(String callId, JsonNode call, BigInteger priceScale) {
        List<LedgerFact> out = new ArrayList<>();
        int state = call.get("state").asInt();
        String status = state >= 0 && state < LEDGER_STATUS.length ? LEDGER_STATUS[state] : String.valueOf(state);
        out.add(fact(callId, "status", status));
        BigDecimal scale = new BigDecimal(priceScale);
        out.add(fact(callId, "calledAmount", usd(new BigDecimal(call.get("amount").asText()).divide(scale))));
        BigDecimal agreed = new BigDecimal(call.get("agreed").asText()).divide(scale);
        if (statesAgreed(status, agreed)) out.add(fact(callId, "agreedAmount", usd(agreed)));
        return out;
    }

    /** Java enum constant (e.g. PARTIALLY_AGREED) to the Rune enum name (PartiallyAgreed). */
    static String toStatusName(String javaName) {
        StringBuilder b = new StringBuilder();
        for (String part : javaName.split("_")) b.append(part.charAt(0)).append(part.substring(1).toLowerCase());
        return b.toString();
    }

    public static LedgerReconciliation withLedger(String bankName, String counterpartyBank, List<LedgerFact> recorded, List<LedgerFact> onLedger) {
        LedgerReconciliation r = CdmRuntime.fn(ReconcileWithLedger.class).evaluate(
                CdmRuntime.load(Party.class, party(bankName)), CdmRuntime.load(Party.class, party(counterpartyBank)), recorded, onLedger);
        CdmRuntime.validate(r);
        return r;
    }

    public static Map<String, Object> view(LedgerReconciliation r) {
        List<Map<String, Object>> breaks = new ArrayList<>();
        if (r.getLedgerBreak() != null)
            for (LedgerBreak b : r.getLedgerBreak()) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("record", b.getRecordIdentifier());
                m.put("attribute", b.getAttribute());
                m.put("type", b.getBreakType().toDisplayString());
                m.put("recorded", b.getRecordedValue());
                m.put("ledger", b.getLedgerValue());
                breaks.add(m);
            }
        Map<String, Object> v = new LinkedHashMap<>();
        v.put("party", name(r.getParty()));
        v.put("counterparty", name(r.getCounterparty()));
        v.put("reconciled", r.getReconciled());
        v.put("checkedFacts", r.getCheckedFactCount());
        v.put("breaks", breaks);
        return v;
    }
}
