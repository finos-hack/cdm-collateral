package collateral;

import cdm.base.staticdata.party.CounterpartyRoleEnum;
import cdm.event.common.BusinessEvent;
import cdm.event.common.Instruction;
import cdm.event.common.TradeState;
import cdm.event.common.functions.Create_BusinessEvent;
import cdm.event.common.functions.ResolveRepurchaseTransferInstruction;
import cdmx.collateral.repo.RepoSettlement;
import cdmx.collateral.repo.functions.RepoIsReprice;
import cdmx.collateral.repo.functions.RepoPurchasePrice;
import cdmx.collateral.repo.functions.RepoPurchaseQuantity;
import cdmx.collateral.repo.functions.RepoRepriceCashDifference;
import cdmx.collateral.repo.functions.RepoRepricedPurchasePrice;
import cdmx.collateral.repo.functions.RepoRepurchasePrice;
import com.fasterxml.jackson.databind.JsonNode;
import com.regnosys.rosetta.common.hashing.ReferenceConfig;
import com.regnosys.rosetta.common.hashing.ReferenceResolverProcessStep;
import com.rosetta.model.lib.RosettaModelObject;
import com.rosetta.model.lib.records.Date;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static collateral.CdmRuntime.l;
import static collateral.CdmRuntime.o;

/**
 * A term repo between the two parties as CDM data (task-repo-purchase-repurchase, wp-adr-repo-purchase-repurchase).
 * The seller's service builds the trade with CDM's Create_BusinessEvent from an execution instruction shaped like CDM's
 * repo-execution-func-input.json; the buyer's service rebuilds it from the instruction in the booked document and
 * checks it is the same. The seller is Party1 and the buyer Party2. The Repurchase Price is cdm-ext's
 * RepoRepurchasePrice over the trade, which calls CDM's FixedAmount. The purchase and the repurchase are each a cdm-ext
 * RepoSettlement document that both services build from the trade, so both instruct the same hash.
 */
public final class CdmRepo {
    /** The cash token's decimals: tUSD has none. */
    static final int CASH_PRECISION = 0;

    /** What the seller enters, with the quantity computed from it, and the parties. Rate and Margin Ratio as decimals. */
    public record Terms(String tradeId, String seller, String buyer, String isin, long quantity, BigDecimal price,
                        long purchasePrice, BigDecimal rate, BigDecimal marginRatio, LocalDate tradeDate,
                        LocalDate purchaseDate, LocalDate repurchaseDate) {}

    /** The booked trade: CDM's execution BusinessEvent, its trade, its Rune JSON and hash, and the Repurchase Price. */
    public record Booking(BusinessEvent event, TradeState trade, String json, String hash, long repurchasePrice) {}

    /** A repriced Transaction and the cash that settles the reprice, positive when the Seller pays the Buyer. */
    public record Repriced(Booking booking, long cashFromSeller) {}

    /** A purchase or repurchase settlement document and its hash. */
    public record Settlement(RepoSettlement settlement, String json, String hash) {}

    private CdmRepo() {}

    static Map<String, Object> party(String name) {
        return o("partyId", l(o("identifier", o("@data", name))), "name", o("@data", name));
    }

    static Map<String, Object> security(String isin) {
        return o("@type", "cdm.base.staticdata.asset.common.Security",
                "identifier", l(o("identifier", o("@data", isin), "identifierType", "ISIN")),
                "partyRole", o("partyReference", party(issuerOf(isin)), "role", "Issuer"),
                "securityType", "Debt", "assetType", "Security");
    }

    static String issuerOf(String isin) {
        return isin.startsWith("US912810") && !isin.equals("US9128100000") ? "US-TREASURY" : "FUND-ISSUER";
    }

    private static Map<String, Object> usd() {
        return o("currency", o("@data", "USD"));
    }

    private static Map<String, Object> date(LocalDate d) {
        return o("adjustableDate", o("unadjustedDate", d.toString(), "dateAdjustments", o("businessDayConvention", "NONE")));
    }

    /** The execution instruction (the shape of CDM's repo-execution-func-input.json, with what CDM 7.7.0 requires). */
    static Map<String, Object> execution(Terms t) {
        Map<String, Object> assetPayout = o("@type", "cdm.product.template.AssetPayout",
                "payerReceiver", o("payer", "Party2", "receiver", "Party1"),
                "priceQuantity", o("quantitySchedule", o("@ref:scoped", "quantity-2")),
                "assetLeg", l(o("settlementDate", date(t.purchaseDate()), "deliveryMethod", "DeliveryVersusPayment"),
                        o("settlementDate", date(t.repurchaseDate()), "deliveryMethod", "DeliveryVersusPayment")),
                "underlier", security(t.isin()),
                "settlementTerms", o("settlementType", "Physical", "settlementCurrency", o("@data", "USD"),
                        "transferSettlementType", "DeliveryVersusPayment",
                        "securitySettlementCentre", "SecuritySettlementCentre", "cashSettlementCentre", "CashSettlementCentre"));
        Map<String, Object> product = o(
                "taxonomy", l(o("source", "CFI", "value", o("name", o("@data", "LRSTXD")))),
                "economicTerms", o(
                        "effectiveDate", date(t.purchaseDate()),
                        "terminationDate", date(t.repurchaseDate()),
                        "payout", l(o("@type", "cdm.product.asset.InterestRatePayout",
                                "payerReceiver", o("payer", "Party1", "receiver", "Party2"),
                                "priceQuantity", o("quantitySchedule", o("@ref:scoped", "quantity-1")),
                                "principalPayment", o("initialPayment", true, "finalPayment", true, "intermediatePayment", false),
                                "rateSpecification", o("@type", "cdm.product.asset.FixedRateSpecification",
                                        "rateSchedule", o("price", o("@ref:scoped", "price-1"))),
                                "dayCountFraction", o("@data", "ACT/360"))),
                        "collateral", o(
                                "collateralPortfolio", l(o("collateralPosition", l(o(
                                        "priceQuantity", l(o("quantity", o("value", t.quantity(), "unit", o("financialUnit", "Share")))),
                                        "product", o("@type", "cdm.product.template.TransferableProduct",
                                                "asset", security(t.isin()),
                                                "productPartyRole", "Party1",
                                                "economicTerms", o("payout", l(assetPayout))))))),
                                "collateralProvisions", o("collateralType", "NonCash",
                                        "eligibleCollateral", l(o(
                                                "collateralCriteria", o("@type", "cdm.base.staticdata.asset.common.AssetIdentifier",
                                                        "identifier", o("@data", t.isin()), "identifierType", "ISIN"),
                                                "treatment", o("isIncluded", true,
                                                        "valuationTreatment", o("marginPercentage", t.marginRatio()))))))));
        return o("product", product,
                "priceQuantity", l(
                        o("price", l(o("@key:scoped", "price-1", "value", t.rate(), "unit", usd(), "perUnitOf", usd(), "priceType", "InterestRate")),
                                "quantity", o("@key:scoped", "quantity-1", "value", t.purchasePrice(), "unit", usd())),
                        o("price", l(o("@key:scoped", "price-2", "value", t.price(), "unit", usd(), "perUnitOf", o("financialUnit", "Share"), "priceType", "AssetPrice")),
                                "quantity", o("@key:scoped", "quantity-2", "value", t.quantity(), "unit", o("financialUnit", "Share")),
                                "observable", o("@key:scoped", "observable-1", "@data", security(t.isin())))),
                "counterparty", l(o("role", "Party1", "partyReference", party(t.seller())), o("role", "Party2", "partyReference", party(t.buyer()))),
                "parties", l(party(t.seller()), party(t.buyer())),
                "partyRoles", l(o("partyReference", party(t.seller()), "role", "Seller"), o("partyReference", party(t.buyer()), "role", "Buyer")),
                "executionDetails", o("executionType", "OffFacility"),
                "tradeDate", o("@data", t.tradeDate().toString()),
                "tradeIdentifier", l(o("issuer", o("@data", t.seller()), "assignedIdentifier", l(o("identifier", o("@data", t.tradeId()))))));
    }

    @SuppressWarnings("unchecked")
    static <T extends RosettaModelObject> T resolved(Class<T> type, T value) {
        var b = value.toBuilder();
        new ReferenceResolverProcessStep(ReferenceConfig.noScopeOrExcludedPaths()).runProcessStep(type, b);
        return (T) b.build();
    }

    /** The quantity for a Purchase Price: cdm-ext RepoPurchaseQuantity (Purchase Price x Margin Ratio / price, rounded up). */
    public static long quantity(long purchasePrice, BigDecimal marginRatio, BigDecimal price) {
        return CdmRuntime.fn(RepoPurchaseQuantity.class).evaluate(BigDecimal.valueOf(purchasePrice), marginRatio, price).longValueExact();
    }

    private static BusinessEvent create(List<Instruction> instruction, Date eventDate) {
        return resolved(BusinessEvent.class, CdmRuntime.fn(Create_BusinessEvent.class).evaluate(new ArrayList<>(instruction), null, eventDate, null));
    }

    private static Booking booking(BusinessEvent ev) {
        CdmRuntime.validate(ev);
        TradeState ts = ev.getAfter().stream().filter(s -> s.getState() == null || s.getState().getClosedState() == null).findFirst()
                .orElseThrow(() -> new IllegalStateException("the event leaves no open trade"));
        String json = CdmRuntime.toJson(ev);
        long rp = CdmRuntime.fn(RepoRepurchasePrice.class).evaluate(ts, CASH_PRECISION).getValue().longValueExact();
        return new Booking(ev, ts, json, Cdm.keccakHex(json), rp);
    }

    /** The seller books: CDM's execution business event for the terms, validated. */
    public static Booking book(Terms t) {
        Instruction i = CdmRuntime.load(Instruction.class, o("primitiveInstruction", o("execution", execution(t))));
        return booking(create(List.of(i), Date.of(t.tradeDate())));
    }

    /** The buyer's check of a booked document: it parses, and CDM's Create_BusinessEvent over its own instruction and
     *  event date gives the same event (so the same hash). Returns the booking; throws otherwise. */
    public static Booking verify(String json) {
        BusinessEvent ev;
        try {
            ev = resolved(BusinessEvent.class, CdmRuntime.JSON.readValue(json, BusinessEvent.class));
        } catch (Exception e) {
            throw new IllegalStateException("not a BusinessEvent: " + e.getMessage(), e);
        }
        if (ev.getInstruction() == null || ev.getInstruction().size() != 1 || ev.getInstruction().get(0).getPrimitiveInstruction() == null)
            throw new IllegalStateException("the booked document is not one execution or reprice");
        var primitive = ev.getInstruction().get(0).getPrimitiveInstruction();
        if (primitive.getExecution() == null && primitive.getSplit() == null)
            throw new IllegalStateException("the booked document is not one execution or reprice");
        BusinessEvent rebuilt = create(new ArrayList<>(ev.getInstruction()), ev.getEventDate());
        if (primitive.getSplit() != null) {
            rebuilt = withActivityDate(rebuilt);
            if (!CdmRuntime.fn(RepoIsReprice.class).evaluate(rebuilt)) throw new IllegalStateException("the document is not a reprice of the repo");
        }
        Booking again = booking(rebuilt);
        if (!again.hash().equalsIgnoreCase(Cdm.keccakHex(json)))
            throw new IllegalStateException("Create_BusinessEvent over the document's instruction gives a different trade");
        return again;
    }

    /** The terms as the trade states them. */
    public static Terms terms(TradeState ts) {
        JsonNode t = CdmRuntime.JSON.valueToTree(ts).path("trade");
        JsonNode cash = null, sec = null;
        for (JsonNode pq : t.path("tradeLot").path(0).path("priceQuantity")) {
            if (pq.has("observable")) sec = pq;
            else cash = pq;
        }
        if (cash == null || sec == null) throw new IllegalStateException("the trade has no cash and security price quantities");
        String seller = null, buyer = null;
        for (var c : ts.getTrade().getCounterparty()) {
            String name = c.getPartyReference().getValue().getName().getValue();
            if (c.getRole() == CounterpartyRoleEnum.PARTY_1) seller = name;
            else buyer = name;
        }
        JsonNode et = t.path("product").path("economicTerms");
        JsonNode treatment = et.path("collateral").path("collateralProvisions").path("eligibleCollateral").path(0).path("treatment").path("valuationTreatment");
        return new Terms(
                t.path("tradeIdentifier").path(0).path("assignedIdentifier").path(0).path("identifier").path("@data").asText(),
                seller, buyer,
                sec.path("observable").path("@data").path("identifier").path(0).path("identifier").path("@data").asText(),
                sec.path("quantity").path("value").decimalValue().longValueExact(),
                sec.path("price").path(0).path("value").decimalValue(),
                CdmRuntime.fn(RepoPurchasePrice.class).evaluate(ts).getValue().longValueExact(),
                cash.path("price").path(0).path("value").decimalValue(),
                treatment.path("marginPercentage").decimalValue(),
                LocalDate.parse(t.path("tradeDate").path("@data").asText(t.path("tradeDate").asText())),
                ts.getTrade().getProduct().getEconomicTerms().getEffectiveDate().getAdjustableDate().getUnadjustedDate().toLocalDate(),
                ts.getTrade().getProduct().getEconomicTerms().getTerminationDate().getAdjustableDate().getUnadjustedDate().toLocalDate());
    }

    private static Map<String, Object> transfer(Number value, Map<String, Object> unit, Map<String, Object> asset, String payer, String receiver, LocalDate date) {
        return o("quantity", o("value", value, "unit", unit), "asset", asset,
                "settlementDate", o("adjustedDate", o("@data", date.toString())),
                "payerReceiver", o("payerPartyReference", party(payer), "receiverPartyReference", party(receiver)),
                "transferType", "Principal");
    }

    private static Map<String, Object> cash() {
        return o("@type", "cdm.base.staticdata.asset.common.Cash",
                "identifier", l(o("identifier", o("@data", "USD"), "identifierType", "CurrencyCode")), "assetType", "Cash");
    }

    private static Settlement settlement(Map<String, Object> doc) {
        RepoSettlement s = CdmRuntime.load(RepoSettlement.class, doc);
        CdmRuntime.validate(s);
        String json = CdmRuntime.toJson(s);
        return new Settlement(s, json, Cdm.keccakHex(json));
    }

    private static Object tree(Object cdm) {
        return CdmRuntime.JSON.convertValue(CdmRuntime.JSON.valueToTree(cdm), Map.class);
    }

    /** The purchase: the securities from the seller and the Purchase Price from the buyer, on the Purchase Date. */
    public static Settlement purchase(TradeState ts) {
        Terms t = terms(ts);
        return settlement(o("phase", "Purchase", "trade", tree(ts),
                "securityTransfer", transfer(t.quantity(), o("financialUnit", "Share"), security(t.isin()), t.seller(), t.buyer(), t.purchaseDate()),
                "cashTransfer", transfer(t.purchasePrice(), usd(), cash(), t.buyer(), t.seller(), t.purchaseDate())));
    }

    /** CDM's Repurchase business event on the Repurchase Date. CDM's Create_BusinessEvent leaves the closed state's
     *  activityDate empty, which CDM's validation requires; it is set to the event date. */
    static BusinessEvent repurchaseEvent(TradeState ts, LocalDate date) {
        Date d = Date.of(date);
        var ri = CdmRuntime.fn(ResolveRepurchaseTransferInstruction.class).evaluate(ts, d);
        var b = CdmRuntime.fn(Create_BusinessEvent.class).evaluate(new ArrayList<>(ri.getInstruction()), ri.getIntent(), d, null).toBuilder();
        b.getAfter().get(0).getState().getClosedState().setActivityDate(d);
        return b.build();
    }

    /** The repurchase: equivalent securities from the buyer and the Repurchase Price from the seller, on the Repurchase
     *  Date, with CDM's Repurchase event. */
    public static Settlement repurchase(TradeState ts) {
        Terms t = terms(ts);
        long rp = CdmRuntime.fn(RepoRepurchasePrice.class).evaluate(ts, CASH_PRECISION).getValue().longValueExact();
        return settlement(o("phase", "Repurchase", "trade", tree(ts),
                "securityTransfer", transfer(t.quantity(), o("financialUnit", "Share"), security(t.isin()), t.buyer(), t.seller(), t.repurchaseDate()),
                "cashTransfer", transfer(rp, usd(), cash(), t.seller(), t.buyer(), t.repurchaseDate()),
                "repurchase", tree(repurchaseEvent(ts, t.repurchaseDate()))));
    }

    /** CDM's Create_BusinessEvent leaves the closed state's activityDate empty, which CDM's validation requires; it is
     *  set to the event date. */
    private static BusinessEvent withActivityDate(BusinessEvent ev) {
        var b = ev.toBuilder();
        for (var after : b.getAfter())
            if (after.getState() != null && after.getState().getClosedState() != null) after.getState().getClosedState().setActivityDate(ev.getEventDate());
        return b.build();
    }

    /** CDM's reprice event: the trade is terminated and replaced by one with the new cash amount and security price,
     *  starting on the reprice date, with the same Repurchase Date and securities. */
    static BusinessEvent repriceEvent(TradeState ts, BigDecimal newPrice, long newPurchasePrice, LocalDate date) {
        var when = cdm.base.datetime.AdjustableOrRelativeDate.builder()
                .setAdjustableDate(cdm.base.datetime.AdjustableDate.builder().setUnadjustedDate(Date.of(date))
                        .setDateAdjustments(cdm.base.datetime.BusinessDayAdjustments.builder().setBusinessDayConvention(cdm.base.datetime.BusinessDayConventionEnum.NONE))).build();
        var pi = CdmRuntime.fn(cdm.event.common.functions.Create_RepricePrimitiveInstruction.class).evaluate(ts, newPrice, BigDecimal.valueOf(newPurchasePrice), when);
        Instruction i = Instruction.builder().setBeforeValue(ts).setPrimitiveInstruction(pi).build();
        return withActivityDate(create(List.of(i), Date.of(date)));
    }

    /** The reprice of a Transaction at a security price (wp-adr-repo-reprice): the new trade as a Booking whose document
     *  is CDM's reprice event, and the cash that settles it, positive when the Seller pays the Buyer. */
    public static Repriced reprice(TradeState ts, BigDecimal price, BigDecimal marginRatio, LocalDate date) {
        Terms t = terms(ts);
        long newPurchasePrice = CdmRuntime.fn(RepoRepricedPurchasePrice.class)
                .evaluate(BigDecimal.valueOf(t.quantity()), price, marginRatio, CASH_PRECISION).longValueExact();
        long cash = CdmRuntime.fn(RepoRepriceCashDifference.class)
                .evaluate(ts, Date.of(date), BigDecimal.valueOf(newPurchasePrice), CASH_PRECISION).longValueExact();
        return new Repriced(booking(repriceEvent(ts, price, newPurchasePrice, date)), cash);
    }

    /** Whether a booking's document is a reprice event, which replaced the trade first booked. */
    public static boolean isReprice(Booking b) {
        return b.event().getInstruction().get(0).getPrimitiveInstruction().getSplit() != null;
    }

    /** The hash of the trade alone, so the two services can compare the TradeState they hold. */
    public static String tradeHash(TradeState ts) {
        return Cdm.keccakHex(CdmRuntime.toJson(ts));
    }
}
