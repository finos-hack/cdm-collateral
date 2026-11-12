package collateral;

import cdm.base.staticdata.party.CounterpartyRoleEnum;
import cdm.event.common.BusinessEvent;
import cdm.event.common.Instruction;
import cdm.event.common.TradeState;
import cdm.event.common.functions.Create_BusinessEvent;
import cdm.event.common.functions.ResolveRepurchaseTransferInstruction;
import cdmx.collateral.repo.RepoManufacturedIncome;
import cdmx.collateral.repo.RepoPairOffSettlement;
import cdmx.collateral.repo.RepoSettlement;
import cdmx.collateral.repo.functions.RepoAccruedPriceDifferential;
import cdmx.collateral.repo.functions.RepoAdjustmentInstruction;
import cdmx.collateral.repo.functions.RepoIsAdjustment;
import cdmx.collateral.repo.functions.RepoIsReprice;
import cdmx.collateral.repo.functions.RepoIsSubstitution;
import cdmx.collateral.repo.functions.RepoManufacturedIncomeAmount;
import cdmx.collateral.repo.functions.RepoPairOffEvent;
import cdmx.collateral.repo.functions.RepoPairOffMatches;
import cdmx.collateral.repo.functions.RepoPairOffNetAmount;
import cdmx.collateral.repo.functions.RepoIsBuySellBack;
import cdmx.collateral.repo.functions.BuySellBackSellBackPrice;
import cdmx.collateral.repo.functions.BuySellBackIncomeDeduction;
import cdmx.collateral.repo.BuySellBackIncome;
import cdmx.collateral.repo.functions.RepoPurchasePrice;
import cdmx.collateral.repo.functions.RepoPurchaseQuantity;
import cdmx.collateral.repo.functions.RepoRepriceCashDifference;
import cdmx.collateral.repo.functions.RepoRepricedPurchasePrice;
import cdmx.collateral.repo.functions.RepoRepurchasePrice;
import cdmx.collateral.repo.functions.RepoSubstitutionQuantity;
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
    /** A Transaction's terms; buySellBack sets CDM's trade type BuySellBack (wp-adr-repo-buy-sell-back). */
    public record Terms(String tradeId, String seller, String buyer, String isin, long quantity, BigDecimal price,
                        long purchasePrice, BigDecimal rate, BigDecimal marginRatio, LocalDate tradeDate,
                        LocalDate purchaseDate, LocalDate repurchaseDate, boolean buySellBack) {
        /** A repo. */
        public Terms(String tradeId, String seller, String buyer, String isin, long quantity, BigDecimal price,
                     long purchasePrice, BigDecimal rate, BigDecimal marginRatio, LocalDate tradeDate,
                     LocalDate purchaseDate, LocalDate repurchaseDate) {
            this(tradeId, seller, buyer, isin, quantity, price, purchasePrice, rate, marginRatio, tradeDate, purchaseDate, repurchaseDate, false);
        }
    }

    /** The booked trade: CDM's execution BusinessEvent, its trade, its Rune JSON and hash, and the Repurchase Price. */
    public record Booking(BusinessEvent event, TradeState trade, String json, String hash, long repurchasePrice) {}

    /** A repriced Transaction and the cash that settles the reprice, positive when the Seller pays the Buyer. */
    public record Repriced(Booking booking, long cashFromSeller) {}

    /** An adjusted Transaction, its new quantity and the accrued Price Differential the Seller pays the Buyer. */
    public record Adjusted(Booking booking, long newQuantity, long accruedFromSeller) {}

    /** A Transaction after a substitution and the substitute's quantity. */
    public record Substituted(Booking booking, long newQuantity) {}

    /** A Transaction after an interim interest payment and the amount the Seller pays the Buyer. */
    public record InterimPaid(Booking booking, long amount) {}

    /** A manufactured income document, its JSON and hash. */
    public record Income(RepoManufacturedIncome income, String json, String hash) {}

    /** The income on a buy/sell-back's securities (wp-adr-repo-buy-sell-back): the cdm-ext record, its Rune JSON and hash.
     *  The deduction lowers the Sell Back Price; no cash moves. */
    public record BuySellBackIncomeRecord(BuySellBackIncome income, String json, String hash, long deduction) {}

    /** A rolled repo: the new trade and the Price Differential the Seller pays on the roll date. */
    public record Rolled(Booking booking, long interest) {}

    /** A purchase or repurchase settlement document and its hash. */
    public record Settlement(RepoSettlement settlement, String json, String hash) {}

    /** The pair-off of two repos (wp-adr-repo-pair-off): the settlement document, and the net amount (the first repo's
     *  Repurchase Price less the second's; the repos in the order of their ids). */
    public record PairedOff(RepoPairOffSettlement settlement, String json, String hash, String first, String second, long netAmount) {}

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
        if (t.buySellBack()) assetPayout.put("tradeType", "BuySellBack");
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

    /** Book a prepared execution instruction: the triparty repo with one collateral position per allocated asset
     *  (CdmTriparty, wp-adr-triparty-trade-start). */
    static Booking bookExecution(Map<String, Object> execution, LocalDate tradeDate) {
        Instruction i = CdmRuntime.load(Instruction.class, o("primitiveInstruction", o("execution", execution)));
        return booking(create(List.of(i), Date.of(tradeDate)));
    }

    /** The collateral positions of a repo, ISIN to units, in the trade's order. A bilateral repo has one; an allocated
     *  triparty repo has one per allocated asset, each with its own quantity, and no security price quantity at trade
     *  level, so {@link #terms} does not read it (wp-adr-triparty-trade-start). */
    public static java.util.LinkedHashMap<String, Long> collateralPositions(TradeState ts) {
        java.util.LinkedHashMap<String, Long> out = new java.util.LinkedHashMap<>();
        JsonNode et = CdmRuntime.JSON.valueToTree(ts).path("trade").path("product").path("economicTerms");
        for (JsonNode portfolio : et.path("collateral").path("collateralPortfolio")) {
            for (JsonNode position : portfolio.path("collateralPosition")) {
                String isin = position.path("product").path("asset").path("identifier").path(0).path("identifier").path("@data").asText();
                JsonNode q = position.path("priceQuantity").path(0).path("quantity");
                out.merge(isin, (q.isArray() ? q.path(0) : q).path("value").decimalValue().longValueExact(), Long::sum);
            }
        }
        return out;
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
            throw new IllegalStateException("the booked document is not one execution or replacement");
        var primitive = ev.getInstruction().get(0).getPrimitiveInstruction();
        boolean interim = primitive.getTransfer() != null;
        boolean substitution = primitive.getQuantityChange() != null && primitive.getTermsChange() != null;
        if (primitive.getExecution() == null && primitive.getSplit() == null && !substitution && !interim)
            throw new IllegalStateException("the booked document is not one execution or replacement");
        BusinessEvent rebuilt = create(new ArrayList<>(ev.getInstruction()), ev.getEventDate());
        if (interim && !CdmRuntime.fn(cdm.event.qualification.functions.Qualify_CashTransfer.class).evaluate(rebuilt))
            throw new IllegalStateException("the document is not a cash transfer on the repo");
        if (substitution && !CdmRuntime.fn(RepoIsSubstitution.class).evaluate(rebuilt))
            throw new IllegalStateException("the document is not a substitution of the repo");
        if (primitive.getSplit() != null) {
            rebuilt = withActivityDate(rebuilt);
            if (!CdmRuntime.fn(RepoIsReprice.class).evaluate(rebuilt) && !CdmRuntime.fn(RepoIsAdjustment.class).evaluate(rebuilt)
                    && !CdmRuntime.fn(cdm.event.qualification.functions.Qualify_Roll.class).evaluate(rebuilt))
                throw new IllegalStateException("the document is not a reprice, an adjustment or a roll of the repo");
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
                // The collateral portfolio names the current security: CDM's quantity change keeps the lot's observable (defect D22).
                et.path("collateral").path("collateralPortfolio").path(0).path("collateralPosition").path(0).path("product").path("asset").path("identifier").path(0).path("identifier").path("@data").asText(),
                sec.path("quantity").path("value").decimalValue().longValueExact(),
                sec.path("price").path(0).path("value").decimalValue(),
                CdmRuntime.fn(RepoPurchasePrice.class).evaluate(ts).getValue().longValueExact(),
                cash.path("price").path(0).path("value").decimalValue(),
                treatment.path("marginPercentage").decimalValue(),
                LocalDate.parse(t.path("tradeDate").path("@data").asText(t.path("tradeDate").asText())),
                ts.getTrade().getProduct().getEconomicTerms().getEffectiveDate().getAdjustableDate().getUnadjustedDate().toLocalDate(),
                ts.getTrade().getProduct().getEconomicTerms().getTerminationDate().getAdjustableDate().getUnadjustedDate().toLocalDate(),
                isBuySellBack(ts));
    }

    /** Whether the Transaction is a buy/sell-back: cdm-ext RepoIsBuySellBack (CDM's Qualify_BuySellBack). */
    public static boolean isBuySellBack(TradeState ts) {
        return CdmRuntime.fn(RepoIsBuySellBack.class).evaluate(ts);
    }

    /** What the Seller pays at the repurchase: cdm-ext BuySellBackSellBackPrice, the Repurchase Price less the income
     *  deduction (zero for a repo). */
    public static long sellBackPrice(TradeState ts, long incomeDeduction) {
        return CdmRuntime.fn(BuySellBackSellBackPrice.class).evaluate(ts, BigDecimal.valueOf(incomeDeduction), CASH_PRECISION).longValueExact();
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
        return repurchase(ts, 0);
    }

    /** The repurchase of a buy/sell-back: the Seller pays the Sell Back Price, the Repurchase Price less the income deduction. */
    public static Settlement repurchase(TradeState ts, long incomeDeduction) {
        Terms t = terms(ts);
        long rp = sellBackPrice(ts, incomeDeduction);
        return settlement(o("phase", "Repurchase", "trade", tree(ts),
                "securityTransfer", transfer(t.quantity(), o("financialUnit", "Share"), security(t.isin()), t.buyer(), t.seller(), t.repurchaseDate()),
                "cashTransfer", transfer(rp, usd(), cash(), t.seller(), t.buyer(), t.repurchaseDate()),
                "repurchase", tree(repurchaseEvent(ts, t.repurchaseDate()))));
    }

    /** Whether two repos can pair off in full: cdm-ext RepoPairOffMatches. */
    public static boolean pairOffMatches(TradeState a, TradeState b) {
        return CdmRuntime.fn(RepoPairOffMatches.class).evaluate(a, b);
    }

    /** The pair-off of two offsetting repos on their common Repurchase Date (wp-adr-repo-pair-off, defect D24): cdm-ext's
     *  pair-off event, CDM's Repurchase event of each paired trade, and the net cash. The repos are taken in the order of
     *  their trade identifiers, so both parties build the same document from the two trades. The pair reference is issued
     *  by the Seller of the first repo and names both repos. The event is not run through the reference resolver: both
     *  trades use the same scoped keys, and resolving the whole event binds one trade's references to the other's values. */
    public static PairedOff pairOff(TradeState x, TradeState y, LocalDate date) {
        return pairOff(x, y, date, 0, 0);
    }

    /** The pair-off with each trade's buy/sell-back income deduction (zero for a repo): the net is the difference of the
     *  Sell Back Prices (wp-adr-repo-buy-sell-back). */
    public static PairedOff pairOff(TradeState x, TradeState y, LocalDate date, long deductionX, long deductionY) {
        boolean ordered = terms(x).tradeId().compareTo(terms(y).tradeId()) <= 0;
        TradeState a = ordered ? x : y, b = ordered ? y : x;
        long deductionA = ordered ? deductionX : deductionY, deductionB = ordered ? deductionY : deductionX;
        Terms ta = terms(a), tb = terms(b);
        if (!pairOffMatches(a, b)) throw new IllegalArgumentException("repos " + ta.tradeId() + " and " + tb.tradeId()
                + " do not offset: they need the same type, the same parties in opposite directions, security, quantity, currency and Repurchase Date");
        if (!date.equals(ta.repurchaseDate())) throw new IllegalArgumentException("a pair-off settles on the common Repurchase Date " + ta.repurchaseDate() + "; the date is " + date);
        var pairReference = CdmRuntime.load(cdm.base.staticdata.identifier.Identifier.class, o("issuer", o("@data", ta.seller()),
                "assignedIdentifier", l(o("identifier", o("@data", ta.tradeId() + "/" + tb.tradeId())))));
        BusinessEvent ev = CdmRuntime.fn(RepoPairOffEvent.class).evaluate(a, b, pairReference, Date.of(date));
        long net = CdmRuntime.fn(RepoPairOffNetAmount.class).evaluate(a, b, BigDecimal.valueOf(deductionA), BigDecimal.valueOf(deductionB), CASH_PRECISION).longValueExact();
        Map<String, Object> doc = new java.util.LinkedHashMap<>(o("pairOff", tree(ev),
                "repurchase", l(tree(repurchaseEvent(ev.getAfter().get(0), date)), tree(repurchaseEvent(ev.getAfter().get(1), date))),
                "netAmount", net));
        if (net > 0) doc.put("netCashTransfer", transfer(net, usd(), cash(), ta.seller(), ta.buyer(), date));
        if (net < 0) doc.put("netCashTransfer", transfer(-net, usd(), cash(), tb.seller(), tb.buyer(), date));
        RepoPairOffSettlement s = CdmRuntime.load(RepoPairOffSettlement.class, doc);
        CdmRuntime.validate(s);
        String json = CdmRuntime.toJson(s);
        return new PairedOff(s, json, Cdm.keccakHex(json), ta.tradeId(), tb.tradeId(), net);
    }

    /** CDM's Create_BusinessEvent leaves the closed state's activityDate empty, which CDM's validation requires; it is
     *  set to the event date. */
    private static BusinessEvent withActivityDate(BusinessEvent ev) {
        var b = ev.toBuilder();
        for (var after : b.getAfter())
            if (after.getState() != null && after.getState().getClosedState() != null) after.getState().getClosedState().setActivityDate(ev.getEventDate());
        return b.build();
    }

    private static cdm.base.datetime.AdjustableOrRelativeDate effective(LocalDate date) {
        return cdm.base.datetime.AdjustableOrRelativeDate.builder()
                .setAdjustableDate(cdm.base.datetime.AdjustableDate.builder().setUnadjustedDate(Date.of(date))
                        .setDateAdjustments(cdm.base.datetime.BusinessDayAdjustments.builder().setBusinessDayConvention(cdm.base.datetime.BusinessDayConventionEnum.NONE))).build();
    }

    /** CDM's reprice event: the trade is terminated and replaced by one with the new cash amount and security price,
     *  starting on the reprice date, with the same Repurchase Date and securities. */
    static BusinessEvent repriceEvent(TradeState ts, BigDecimal newPrice, long newPurchasePrice, LocalDate date) {
        var pi = CdmRuntime.fn(cdm.event.common.functions.Create_RepricePrimitiveInstruction.class).evaluate(ts, newPrice, BigDecimal.valueOf(newPurchasePrice), effective(date));
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

    /** The adjustment event, from cdm-ext RepoAdjustmentInstruction (defect D21): the trade is terminated and replaced by one with the new security quantity and price,
     *  starting on the adjustment date, with the same Purchase Price and Repurchase Date. */
    static BusinessEvent adjustmentEvent(TradeState ts, BigDecimal newPrice, long newQuantity, LocalDate date) {
        var pi = CdmRuntime.fn(RepoAdjustmentInstruction.class).evaluate(ts, newPrice, BigDecimal.valueOf(newQuantity), effective(date));
        Instruction i = Instruction.builder().setBeforeValue(ts).setPrimitiveInstruction(pi).build();
        return withActivityDate(create(List.of(i), Date.of(date)));
    }

    /** The adjustment of a Transaction at a security price (wp-adr-repo-adjustment): the new trade as a Booking whose
     *  document is CDM's adjustment event, the new quantity, and the accrued Price Differential the Seller pays the Buyer. */
    public static Adjusted adjust(TradeState ts, BigDecimal price, BigDecimal marginRatio, LocalDate date) {
        Terms t = terms(ts);
        long newQuantity = quantity(t.purchasePrice(), marginRatio, price);
        long accrued = CdmRuntime.fn(RepoAccruedPriceDifferential.class).evaluate(ts, Date.of(date), CASH_PRECISION).longValueExact();
        return new Adjusted(booking(adjustmentEvent(ts, price, newQuantity, date)), newQuantity, accrued);
    }

    /** The collateral portfolio with the substitute security and quantity in place of the current ones. */
    private static cdm.event.common.CollateralPortfolio substitutePortfolio(TradeState ts, String isin, long quantity) {
        var tree = (com.fasterxml.jackson.databind.node.ObjectNode) CdmRuntime.JSON.valueToTree(ts).path("trade").path("product").path("economicTerms").path("collateral").path("collateralPortfolio").path(0);
        var position = (com.fasterxml.jackson.databind.node.ObjectNode) tree.path("collateralPosition").path(0);
        ((com.fasterxml.jackson.databind.node.ObjectNode) position.path("priceQuantity").path(0).path("quantity")).put("value", quantity);
        var product = (com.fasterxml.jackson.databind.node.ObjectNode) position.path("product");
        product.set("asset", CdmRuntime.JSON.valueToTree(security(isin)));
        ((com.fasterxml.jackson.databind.node.ObjectNode) product.path("economicTerms").path("payout").path(0)).set("underlier", CdmRuntime.JSON.valueToTree(security(isin)));
        return CdmRuntime.load(cdm.event.common.CollateralPortfolio.class, CdmRuntime.JSON.convertValue(tree, Map.class));
    }

    /** CDM's substitution event. The effective date stays the trade's, so the accrual does not restart and the Repurchase
     *  Price does not change (wp-adr-repo-substitution); the event date is the substitution date. */
    static BusinessEvent substitutionEvent(TradeState ts, String isin, long newQuantity, BigDecimal newPrice, LocalDate date) {
        var change = CdmRuntime.load(cdm.observable.asset.PriceQuantity.class, o(
                "price", l(o("value", newPrice, "unit", usd(), "perUnitOf", o("financialUnit", "Share"), "priceType", "AssetPrice")),
                "quantity", o("value", newQuantity, "unit", o("financialUnit", "Share"))));
        var pi = CdmRuntime.fn(cdm.event.common.functions.Create_SubstitutionPrimitiveInstruction.class)
                .evaluate(ts, effective(terms(ts).purchaseDate()), substitutePortfolio(ts, isin, newQuantity), List.of(change));
        Instruction i = Instruction.builder().setBeforeValue(ts).setPrimitiveInstruction(pi).build();
        return create(List.of(i), Date.of(date));
    }

    /** The substitution of all the securities of a Transaction (wp-adr-repo-substitution): the substitute's quantity has at
     *  least the Market Value of the securities replaced, at the two feed prices. */
    public static Substituted substitute(TradeState ts, String isin, BigDecimal price, BigDecimal substitutePrice, LocalDate date) {
        Terms t = terms(ts);
        if (t.isin().equals(isin)) throw new IllegalArgumentException("the substitute is the current security");
        long newQuantity = CdmRuntime.fn(RepoSubstitutionQuantity.class).evaluate(BigDecimal.valueOf(t.quantity()), price, substitutePrice).longValueExact();
        return new Substituted(booking(substitutionEvent(ts, isin, newQuantity, substitutePrice, date)), newQuantity);
    }

    /** The interim interest payment (wp-adr-repo-income): CDM's on-demand interest payment of the Price Differential
     *  accrued to the date, less earlier interim payments. The payment goes into the transfer history, which is deducted
     *  from the Price Differential, so the Repurchase Price falls by the amount. */
    public static InterimPaid interimInterest(TradeState ts, LocalDate date) {
        if (isBuySellBack(ts)) throw new IllegalStateException("a buy/sell-back has no interim interest: its forward price is fixed at trade");
        long amount = CdmRuntime.fn(RepoAccruedPriceDifferential.class).evaluate(ts, Date.of(date), CASH_PRECISION).longValueExact();
        if (amount <= 0) throw new IllegalStateException("no Price Differential has accrued to " + date);
        var money = CdmRuntime.load(cdm.observable.asset.Money.class, o("value", amount, "unit", usd()));
        var settlementDate = CdmRuntime.load(cdm.product.common.settlement.SettlementDate.class,
                o("adjustableOrRelativeDate", o("adjustedDate", o("@data", date.toString()))));
        var pi = CdmRuntime.fn(cdm.event.common.functions.Create_OnDemandInterestPaymentPrimitiveInstruction.class).evaluate(ts, money, settlementDate);
        Instruction i = Instruction.builder().setBeforeValue(ts).setPrimitiveInstruction(pi).build();
        return new InterimPaid(booking(create(List.of(i), Date.of(date))), amount);
    }

    /** The manufactured income document for a Transaction (wp-adr-repo-income): the Buyer pays the Seller. */
    public static Income income(String repoId, String tradeHash, TradeState ts, BigDecimal incomePerUnit, LocalDate incomeDate) {
        Terms t = terms(ts);
        if (t.buySellBack()) throw new IllegalStateException("a buy/sell-back pays no manufactured income: the income lowers its Sell Back Price");
        if (incomeDate.isBefore(t.purchaseDate()) || !incomeDate.isBefore(t.repurchaseDate()))
            throw new IllegalArgumentException("the income date is outside the Transaction's term");
        BigDecimal amount = CdmRuntime.fn(RepoManufacturedIncomeAmount.class).evaluate(BigDecimal.valueOf(t.quantity()), incomePerUnit, CASH_PRECISION);
        RepoManufacturedIncome doc = CdmRuntime.load(RepoManufacturedIncome.class, o("repoId", repoId, "tradeHash", tradeHash, "security", t.isin(),
                "quantity", t.quantity(), "incomePerUnit", incomePerUnit, "incomeDate", incomeDate.toString(), "amount", amount, "payer", t.buyer(), "receiver", t.seller()));
        CdmRuntime.validate(doc);
        String json = CdmRuntime.toJson(doc);
        return new Income(doc, json, Cdm.keccakHex(json));
    }

    /** The Seller's check of a requested income: the same document follows from its inputs over the trade this service holds. */
    public static Income verifyIncome(String json, String repoId, String tradeHash, TradeState ts) {
        RepoManufacturedIncome doc;
        try {
            doc = CdmRuntime.JSON.readValue(json, RepoManufacturedIncome.class);
        } catch (Exception e) {
            throw new IllegalStateException("not a RepoManufacturedIncome: " + e.getMessage(), e);
        }
        Income again = income(repoId, tradeHash, ts, doc.getIncomePerUnit(), doc.getIncomeDate().toLocalDate());
        if (!again.hash().equalsIgnoreCase(Cdm.keccakHex(json))) throw new IllegalStateException("the income document does not follow from its inputs over this trade");
        return again;
    }

    /** The income on a buy/sell-back's securities (wp-adr-repo-buy-sell-back): the Buyer keeps it, and the Sell Back
     *  Price falls by the cdm-ext BuySellBackIncomeDeduction, the income plus interest to the Repurchase Date. */
    public static BuySellBackIncomeRecord buySellBackIncome(String repoId, String tradeHash, TradeState ts, BigDecimal incomePerUnit, LocalDate incomeDate) {
        Terms t = terms(ts);
        if (!t.buySellBack()) throw new IllegalStateException("a repo pays manufactured income");
        if (incomeDate.isBefore(t.purchaseDate()) || !incomeDate.isBefore(t.repurchaseDate()))
            throw new IllegalArgumentException("the income date is outside the Transaction's term");
        BigDecimal amount = CdmRuntime.fn(RepoManufacturedIncomeAmount.class).evaluate(BigDecimal.valueOf(t.quantity()), incomePerUnit, CASH_PRECISION);
        BigDecimal deduction = CdmRuntime.fn(BuySellBackIncomeDeduction.class).evaluate(ts, amount, Date.of(incomeDate), CASH_PRECISION);
        BuySellBackIncome doc = CdmRuntime.load(BuySellBackIncome.class, o("repoId", repoId, "tradeHash", tradeHash, "security", t.isin(),
                "quantity", t.quantity(), "incomePerUnit", incomePerUnit, "incomeDate", incomeDate.toString(), "incomeAmount", amount,
                "deduction", deduction, "buyer", t.buyer(), "seller", t.seller()));
        CdmRuntime.validate(doc);
        String json = CdmRuntime.toJson(doc);
        return new BuySellBackIncomeRecord(doc, json, Cdm.keccakHex(json), deduction.longValueExact());
    }

    /** The Seller's check of a buy/sell-back income: the same record follows from its inputs over the trade this service holds. */
    public static BuySellBackIncomeRecord verifyBuySellBackIncome(String json, String repoId, String tradeHash, TradeState ts) {
        BuySellBackIncome doc;
        try {
            doc = CdmRuntime.JSON.readValue(json, BuySellBackIncome.class);
        } catch (Exception e) {
            throw new IllegalStateException("not a BuySellBackIncome: " + e.getMessage(), e);
        }
        BuySellBackIncomeRecord again = buySellBackIncome(repoId, tradeHash, ts, doc.getIncomePerUnit(), doc.getIncomeDate().toLocalDate());
        if (!again.hash().equalsIgnoreCase(Cdm.keccakHex(json))) throw new IllegalStateException("the income record does not follow from its inputs over this trade");
        return again;
    }

    /** CDM's roll event on the Repurchase Date: the trade is closed and replaced by one starting on that date, with the
     *  new Repurchase Date and repo rate and the same securities and Purchase Price. */
    static BusinessEvent rollEvent(TradeState ts, LocalDate newRepurchaseDate, BigDecimal rate) {
        LocalDate rollDate = terms(ts).repurchaseDate();
        List<cdm.observable.asset.PriceQuantity> change = new ArrayList<>();
        for (var pq : ts.getTrade().getTradeLot().get(0).getPriceQuantity()) {
            var node = (com.fasterxml.jackson.databind.node.ObjectNode) CdmRuntime.JSON.valueToTree(pq);
            if (!node.has("observable")) ((com.fasterxml.jackson.databind.node.ObjectNode) node.path("price").path(0)).put("value", rate);
            change.add(CdmRuntime.load(cdm.observable.asset.PriceQuantity.class, CdmRuntime.JSON.convertValue(node, Map.class)));
        }
        var pi = CdmRuntime.fn(cdm.event.common.functions.Create_RollPrimitiveInstruction.class).evaluate(ts, effective(rollDate), effective(newRepurchaseDate), change);
        Instruction i = Instruction.builder().setBeforeValue(ts).setPrimitiveInstruction(pi).build();
        return withActivityDate(create(List.of(i), Date.of(rollDate)));
    }

    /** The roll of a Transaction on its Repurchase Date (wp-adr-repo-roll). The Seller pays the Price Differential to that
     *  date, net of interim interest, and the Purchase Price does not change. The rate is normalised so the agreeing party
     *  builds the same document from the rate read back from it. */
    public static Rolled roll(TradeState ts, LocalDate newRepurchaseDate, BigDecimal rate) {
        Terms t = terms(ts);
        if (!newRepurchaseDate.isAfter(t.repurchaseDate())) throw new IllegalArgumentException("the new Repurchase Date is not after the current one");
        if (rate.signum() <= 0) throw new IllegalArgumentException("the repo rate is not positive");
        long interest = CdmRuntime.fn(RepoAccruedPriceDifferential.class).evaluate(ts, Date.of(t.repurchaseDate()), CASH_PRECISION).longValueExact();
        return new Rolled(booking(rollEvent(ts, newRepurchaseDate, rate.stripTrailingZeros())), interest);
    }

    /** Whether a booking's document replaced the trade first booked: a reprice, an adjustment, a substitution or a roll. */
    public static boolean isReplacement(Booking b) {
        return b.event().getInstruction().get(0).getPrimitiveInstruction().getExecution() == null;
    }

    /** The hash of the trade alone, so the two services can compare the TradeState they hold. */
    public static String tradeHash(TradeState ts) {
        return Cdm.keccakHex(CdmRuntime.toJson(ts));
    }
}
