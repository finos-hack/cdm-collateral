package collateral;

import cdm.base.math.FinancialUnitEnum;
import cdm.base.math.NonNegativeQuantitySchedule;
import cdm.base.math.QuantityChangeDirectionEnum;
import cdm.base.math.UnitType;
import cdm.base.staticdata.party.CounterpartyRoleEnum;
import cdm.event.common.BusinessEvent;
import cdm.event.common.Instruction;
import cdm.event.common.PrimitiveInstruction;
import cdm.event.common.QuantityChangeInstruction;
import cdm.event.common.TradeState;
import cdm.event.common.functions.Create_BusinessEvent;
import cdm.event.qualification.functions.Qualify_Execution;
import cdm.event.qualification.functions.Qualify_FullReturn;
import cdm.event.qualification.functions.Qualify_PartialTermination;
import cdm.event.qualification.functions.Qualify_Termination;
import cdm.observable.asset.PriceQuantity;
import cdmx.collateral.gmsla.GmslaLoan;
import cdmx.collateral.gmsla.GmslaLoanSettlement;
import cdmx.collateral.gmsla.GmslaReturnEnum;
import cdmx.collateral.gmsla.functions.GmslaLoanedQuantity;
import cdmx.collateral.gmsla.functions.GmslaRequiredCollateral;
import cdmx.collateral.gmsla.functions.GmslaReturnCollateral;
import cdmx.collateral.gmsla.functions.Qualify_GmslaReturn;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.rosetta.model.lib.records.Date;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static collateral.CdmRuntime.l;
import static collateral.CdmRuntime.o;

/**
 * A securities loan under the GMSLA as CDM data (task-gmsla-loan-delivery-return, wp-adr-gmsla-loan-delivery-return).
 * The lender's service builds CDM's execution BusinessEvent with Create_BusinessEvent in the shape the CDM check found
 * valid: one AssetPayout of trade type SecurityLending for the loaned securities, and the collateral in a collateral
 * portfolio position (an InterestRatePayout at the rebate rate for cash, an AssetPayout for securities). The booked
 * document is a cdm-ext GmslaLoan: the execution and the loan's own terms. The borrower's service rebuilds it and checks
 * the hash. Each return is Create_BusinessEvent over one quantity-change instruction; CDM's event leaves the collateral
 * unchanged, so this class sets the collateral the lender keeps on the after trade state. The lender is Party1 and the
 * borrower Party2. The delivery and each return are a cdm-ext GmslaLoanSettlement that both services build.
 */
public final class CdmLoan {
    /** What the lender enters, with the collateral computed from it. A cash loan states a rebate rate, a loan against
     *  securities a fee rate; rates and margin as decimals. collateralIsin is null for cash (tUSD). */
    public record Terms(String loanId, String lender, String borrower, String isin, long quantity, BigDecimal price,
                        String collateralIsin, long collateralAmount, BigDecimal margin, BigDecimal rebateRate,
                        BigDecimal feeRate, LocalDate tradeDate, LocalDate termDate) {
        public boolean cash() {
            return collateralIsin == null;
        }
    }

    /** The booked loan: the GmslaLoan document, its trade, its Rune JSON and hash. */
    public record Booking(GmslaLoan loan, TradeState trade, String json, String hash) {}

    /** A delivery or return settlement document, its JSON and hash, and (for a return) the quantity and collateral. */
    public record Settlement(GmslaLoanSettlement settlement, String json, String hash, long quantity, long collateralAmount) {
        /** The trade state after the settlement: the trade as delivered, or the return event's after state. */
        public TradeState after() {
            return settlement.getReturnEvent() == null ? settlement.getTrade() : settlement.getReturnEvent().getAfter().get(0);
        }
    }

    private CdmLoan() {}

    private static Map<String, Object> usd() {
        return o("currency", o("@data", "USD"));
    }

    private static Map<String, Object> date(LocalDate d) {
        return o("adjustableDate", o("unadjustedDate", d.toString(), "dateAdjustments", o("businessDayConvention", "NONE")));
    }

    private static Map<String, Object> cash() {
        return o("@type", "cdm.base.staticdata.asset.common.Cash",
                "identifier", l(o("identifier", o("@data", "USD"), "identifierType", "CurrencyCode")),
                "partyRole", o("partyReference", CdmRepo.party("US-FED"), "role", "Issuer"), "assetType", "Cash");
    }

    private static Map<String, Object> settlementTerms() {
        return o("settlementType", "Physical", "settlementCurrency", o("@data", "USD"),
                "transferSettlementType", "DeliveryVersusPayment",
                "securitySettlementCentre", "SecuritySettlementCentre", "cashSettlementCentre", "CashSettlementCentre");
    }

    /** The execution instruction for a loan (the shape the CDM check found valid). */
    static Map<String, Object> execution(Terms t) {
        Map<String, Object> lent = CdmRepo.security(t.isin());
        Map<String, Object> loanPayout = o("@type", "cdm.product.template.AssetPayout",
                "payerReceiver", o("payer", "Party1", "receiver", "Party2"),
                "priceQuantity", o("quantitySchedule", o("@ref:scoped", "quantity-1")),
                "assetLeg", l(o("settlementDate", date(t.tradeDate()), "deliveryMethod", "DeliveryVersusPayment")),
                "underlier", lent, "tradeType", "SecurityLending", "settlementTerms", settlementTerms());
        Map<String, Object> collateralPayout = t.cash()
                ? o("@type", "cdm.product.asset.InterestRatePayout",
                        "payerReceiver", o("payer", "Party1", "receiver", "Party2"),
                        "priceQuantity", o("quantitySchedule", o("@ref:scoped", "quantity-2")),
                        "rateSpecification", o("@type", "cdm.product.asset.FixedRateSpecification",
                                "rateSchedule", o("price", o("value", t.rebateRate(), "unit", usd(), "perUnitOf", usd(), "priceType", "InterestRate"))),
                        "dayCountFraction", o("@data", "ACT/360"))
                : o("@type", "cdm.product.template.AssetPayout",
                        "payerReceiver", o("payer", "Party2", "receiver", "Party1"),
                        "priceQuantity", o("quantitySchedule", o("@ref:scoped", "quantity-2")),
                        "assetLeg", l(o("settlementDate", date(t.tradeDate()), "deliveryMethod", "DeliveryVersusPayment")),
                        "underlier", CdmRepo.security(t.collateralIsin()), "settlementTerms", settlementTerms());
        Map<String, Object> position = o(
                "priceQuantity", l(o("quantity", o("@key:scoped", "quantity-2", "value", t.collateralAmount(),
                        "unit", t.cash() ? usd() : o("financialUnit", "Share")))),
                "product", o("@type", "cdm.product.template.TransferableProduct",
                        "asset", t.cash() ? cash() : CdmRepo.security(t.collateralIsin()),
                        "productPartyRole", "Party2",
                        "economicTerms", o("payout", l(collateralPayout))));
        Map<String, Object> portfolio = o("collateralPosition", l(position));
        if (!t.cash()) portfolio.put("portfolioIdentifier", o("issuer", o("@data", t.lender()),
                "assignedIdentifier", l(o("identifier", o("@data", t.loanId() + "-collateral")))));
        Map<String, Object> provisions = o("collateralType", t.cash() ? "Cash" : "NonCash",
                "eligibleCollateral", l(o(
                        "collateralCriteria", o("@type", "cdm.base.staticdata.asset.common.AssetIdentifier",
                                "identifier", o("@data", t.cash() ? "USD" : t.collateralIsin()),
                                "identifierType", t.cash() ? "CurrencyCode" : "ISIN"),
                        "treatment", o("isIncluded", true, "valuationTreatment", o("marginPercentage", t.margin())))));
        Map<String, Object> economicTerms = o("effectiveDate", date(t.tradeDate()));
        if (t.termDate() != null) economicTerms.put("terminationDate", date(t.termDate()));
        economicTerms.put("payout", l(loanPayout));
        economicTerms.put("collateral", o("collateralPortfolio", l(portfolio), "collateralProvisions", provisions));
        Map<String, Object> product = o("taxonomy", l(o("source", "ISDA", "value", o("name", o("@data", "SecurityLending")))),
                "economicTerms", economicTerms);
        return o("product", product,
                "priceQuantity", l(o(
                        "price", l(o("@key:scoped", "price-1", "value", t.price(), "unit", usd(),
                                "perUnitOf", o("financialUnit", "Share"), "priceType", "AssetPrice")),
                        "quantity", o("@key:scoped", "quantity-1", "value", t.quantity(), "unit", o("financialUnit", "Share")),
                        "observable", o("@key:scoped", "observable-1", "@data", lent))),
                "counterparty", l(o("role", "Party1", "partyReference", CdmRepo.party(t.lender())),
                        o("role", "Party2", "partyReference", CdmRepo.party(t.borrower()))),
                "parties", l(CdmRepo.party(t.lender()), CdmRepo.party(t.borrower())),
                "partyRoles", l(o("partyReference", CdmRepo.party(t.lender()), "role", "Lender"),
                        o("partyReference", CdmRepo.party(t.borrower()), "role", "Borrower")),
                "executionDetails", o("executionType", "OffFacility"),
                "tradeDate", o("@data", t.tradeDate().toString()),
                "tradeIdentifier", l(o("issuer", o("@data", t.lender()),
                        "assignedIdentifier", l(o("identifier", o("@data", t.loanId()))))));
    }

    private static Map<String, Object> loanTerms(Terms t) {
        Map<String, Object> m = o("loanId", t.loanId(), "margin", t.margin());
        if (t.rebateRate() != null) m.put("rebateRate", t.rebateRate());
        if (t.feeRate() != null) m.put("feeRate", t.feeRate());
        if (t.termDate() != null) m.put("termDate", t.termDate().toString());
        return m;
    }

    /** The collateral for a loan: cdm-ext GmslaRequiredCollateral (Market Value x margin / collateral price, rounded up). */
    public static long requiredCollateral(long quantity, BigDecimal price, BigDecimal margin, BigDecimal collateralPrice) {
        return CdmRuntime.fn(GmslaRequiredCollateral.class).evaluate(BigDecimal.valueOf(quantity), price, margin, collateralPrice).longValueExact();
    }

    /** The collateral redelivered on a return: cdm-ext GmslaReturnCollateral. */
    public static long returnCollateral(long held, long returned, long outstanding) {
        return CdmRuntime.fn(GmslaReturnCollateral.class).evaluate(BigDecimal.valueOf(held), BigDecimal.valueOf(returned),
                BigDecimal.valueOf(outstanding)).longValueExact();
    }

    private static BusinessEvent create(List<Instruction> instruction, Date eventDate) {
        return CdmRepo.resolved(BusinessEvent.class,
                CdmRuntime.fn(Create_BusinessEvent.class).evaluate(new ArrayList<>(instruction), null, eventDate, null));
    }

    private static Booking booking(GmslaLoan loan) {
        CdmRuntime.validate(loan);
        BusinessEvent ev = loan.getExecution();
        if (!CdmRuntime.fn(Qualify_Execution.class).evaluate(ev)) throw new IllegalStateException("the booked event is not an execution");
        TradeState ts = ev.getAfter().get(0);
        String json = CdmRuntime.toJson(loan);
        return new Booking(loan, ts, json, Cdm.keccakHex(json));
    }

    /** The lender books: CDM's execution business event for the terms and the loan's terms, validated. */
    public static Booking book(Terms t) {
        Instruction i = CdmRuntime.load(Instruction.class, o("primitiveInstruction", o("execution", execution(t))));
        BusinessEvent ev = create(List.of(i), Date.of(t.tradeDate()));
        GmslaLoan loan = CdmRuntime.load(GmslaLoan.class, o("execution", tree(ev), "terms", loanTerms(t)));
        return booking(loan);
    }

    /** The borrower's check of a booked document: it parses, CDM's Create_BusinessEvent over its own instruction and
     *  event date gives the same event, and the loan's terms agree with the trade. Returns the booking; throws otherwise. */
    public static Booking verify(String json) {
        GmslaLoan loan;
        try {
            loan = CdmRuntime.JSON.readValue(json, GmslaLoan.class);
        } catch (Exception e) {
            throw new IllegalStateException("not a GmslaLoan: " + e.getMessage(), e);
        }
        BusinessEvent ev = CdmRepo.resolved(BusinessEvent.class, loan.getExecution());
        if (ev.getInstruction() == null || ev.getInstruction().size() != 1 || ev.getInstruction().get(0).getPrimitiveInstruction().getExecution() == null)
            throw new IllegalStateException("the booked document is not one execution");
        BusinessEvent rebuilt = create(new ArrayList<>(ev.getInstruction()), ev.getEventDate());
        Booking again = booking(loan.toBuilder().setExecution(rebuilt).build());
        if (!again.hash().equalsIgnoreCase(Cdm.keccakHex(json)))
            throw new IllegalStateException("Create_BusinessEvent over the document's instruction gives a different loan");
        Terms t = terms(again.trade(), loan.getTerms());
        if (t.margin().compareTo(loan.getTerms().getMargin()) != 0) throw new IllegalStateException("the loan's margin is not the trade's");
        if (t.cash() != (loan.getTerms().getRebateRate() != null)) throw new IllegalStateException("a cash loan states a rebate rate, a loan against securities a fee rate");
        return again;
    }

    /** The terms as a trade state and the loan's own terms state them; collateralAmount is the collateral held. */
    public static Terms terms(TradeState ts, cdmx.collateral.gmsla.GmslaLoanTerms lt) {
        JsonNode t = CdmRuntime.JSON.valueToTree(ts).path("trade");
        JsonNode pq = t.path("tradeLot").path(0).path("priceQuantity").path(0);
        String lender = null, borrower = null;
        for (var c : ts.getTrade().getCounterparty()) {
            String name = c.getPartyReference().getValue().getName().getValue();
            if (c.getRole() == CounterpartyRoleEnum.PARTY_1) lender = name;
            else borrower = name;
        }
        JsonNode et = t.path("product").path("economicTerms");
        JsonNode position = et.path("collateral").path("collateralPortfolio").path(0).path("collateralPosition").path(0);
        JsonNode asset = position.path("product").path("asset");
        boolean cash = asset.toString().contains("CurrencyCode");
        String collateralIsin = cash ? null : firstIsin(asset);
        JsonNode treatment = et.path("collateral").path("collateralProvisions").path("eligibleCollateral").path(0).path("treatment").path("valuationTreatment");
        var term = ts.getTrade().getProduct().getEconomicTerms().getTerminationDate();
        return new Terms(
                t.path("tradeIdentifier").path(0).path("assignedIdentifier").path(0).path("identifier").path("@data").asText(),
                lender, borrower,
                firstIsin(et.path("payout").path(0)),
                CdmRuntime.fn(GmslaLoanedQuantity.class).evaluate(ts).longValueExact(),
                pq.path("price").path(0).path("value").decimalValue(),
                collateralIsin,
                position.path("priceQuantity").path(0).path("quantity").path("value").decimalValue().longValueExact(),
                treatment.path("marginPercentage").decimalValue(),
                lt == null ? null : lt.getRebateRate(), lt == null ? null : lt.getFeeRate(),
                LocalDate.parse(t.path("tradeDate").path("@data").asText(t.path("tradeDate").asText())),
                term == null ? null : term.getAdjustableDate().getUnadjustedDate().toLocalDate());
    }

    /** The first ISIN in a JSON subtree (an asset, or the loan's payout and its underlier). */
    static String firstIsin(JsonNode n) {
        if (n.isObject()) {
            if ("ISIN".equals(n.path("identifierType").asText())) return n.path("identifier").path("@data").asText(n.path("identifier").asText());
            for (var it = n.elements(); it.hasNext(); ) {
                String found = firstIsin(it.next());
                if (found != null) return found;
            }
        } else if (n.isArray()) {
            for (JsonNode c : n) {
                String found = firstIsin(c);
                if (found != null) return found;
            }
        }
        return null;
    }

    private static Object tree(Object cdm) {
        return CdmRuntime.JSON.convertValue(CdmRuntime.JSON.valueToTree(cdm), Map.class);
    }

    private static Map<String, Object> transfer(long value, Map<String, Object> unit, Map<String, Object> asset, String payer, String receiver, LocalDate date) {
        return o("quantity", o("value", value, "unit", unit), "asset", asset,
                "settlementDate", o("adjustedDate", o("@data", date.toString())),
                "payerReceiver", o("payerPartyReference", CdmRepo.party(payer), "receiverPartyReference", CdmRepo.party(receiver)),
                "transferType", "Principal");
    }

    private static Map<String, Object> collateralTransfer(Terms t, long amount, String payer, String receiver, LocalDate date) {
        return t.cash()
                ? transfer(amount, usd(), cash(), payer, receiver, date)
                : transfer(amount, o("financialUnit", "Share"), CdmRepo.security(t.collateralIsin()), payer, receiver, date);
    }

    private static Settlement settlement(Map<String, Object> doc, long quantity, long collateralAmount) {
        GmslaLoanSettlement s = CdmRuntime.load(GmslaLoanSettlement.class, doc);
        CdmRuntime.validate(s);
        String json = CdmRuntime.toJson(s);
        return new Settlement(s, json, Cdm.keccakHex(json), quantity, collateralAmount);
    }

    /** The delivery: the loaned securities from the lender and the collateral from the borrower, on the business date. */
    public static Settlement delivery(Booking b, LocalDate date) {
        Terms t = terms(b.trade(), b.loan().getTerms());
        return settlement(o("phase", "Delivery", "trade", tree(b.trade()), "terms", tree(b.loan().getTerms()),
                "securityTransfer", transfer(t.quantity(), o("financialUnit", "Share"), CdmRepo.security(t.isin()), t.lender(), t.borrower(), date),
                "collateralTransfer", collateralTransfer(t, t.collateralAmount(), t.borrower(), t.lender(), date)),
                t.quantity(), t.collateralAmount());
    }

    /** CDM's return event: Create_BusinessEvent over one quantity-change instruction (Decrease) on the trade in force.
     *  A full return sets the closed state's activityDate, which CDM's validation requires. The collateral position (and
     *  the collateral payout's quantity) is then set to the collateral the lender keeps: CDM's event leaves it unchanged. */
    static BusinessEvent returnEvent(TradeState before, long quantity, long collateralKept, LocalDate date) {
        Date d = Date.of(date);
        PriceQuantity change = PriceQuantity.builder().setQuantityValue(NonNegativeQuantitySchedule.builder()
                .setValue(BigDecimal.valueOf(quantity)).setUnit(UnitType.builder().setFinancialUnit(FinancialUnitEnum.SHARE)).build()).build();
        Instruction i = Instruction.builder().setBeforeValue(before).setPrimitiveInstruction(PrimitiveInstruction.builder()
                .setQuantityChange(QuantityChangeInstruction.builder().addChange(change).setDirection(QuantityChangeDirectionEnum.DECREASE))).build();
        var b = create(List.of(i), d).toBuilder();
        for (var after : b.getAfter())
            if (after.getState() != null && after.getState().getClosedState() != null) after.getState().getClosedState().setActivityDate(d);
        ObjectNode ev = CdmRuntime.JSON.valueToTree(b.build());
        for (JsonNode after : ev.path("after")) {
            JsonNode position = after.path("trade").path("product").path("economicTerms").path("collateral")
                    .path("collateralPortfolio").path(0).path("collateralPosition").path(0);
            setValue(position.path("priceQuantity").path(0).path("quantity"), collateralKept);
            for (JsonNode payout : position.path("product").path("economicTerms").path("payout"))
                for (JsonNode p : payout) setValue(p.path("priceQuantity").path("quantitySchedule"), collateralKept);
        }
        try {
            return CdmRuntime.JSON.treeToValue(ev, BusinessEvent.class);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /** Sets the value of a quantity, whether it is held inline or behind a "value" wrapper of a reference. */
    private static void setValue(JsonNode q, long value) {
        if (!(q instanceof ObjectNode o)) return;
        if (o.has("value") && o.get("value").isNumber()) o.put("value", value);
        else if (o.path("value") instanceof ObjectNode inner && inner.has("value")) inner.put("value", value);
    }

    /** The collateral held under a trade state: the collateral position's quantity. */
    public static long collateralHeld(TradeState ts) {
        return terms(ts, null).collateralAmount();
    }

    /** A return of `quantity` on the trade in force, on the date: the borrower returns the securities and the lender
     *  redelivers GmslaReturnCollateral of the collateral, with CDM's return event and Qualify_GmslaReturn. */
    public static Settlement returnOf(TradeState before, cdmx.collateral.gmsla.GmslaLoanTerms lt, long quantity, LocalDate date) {
        Terms t = terms(before, lt);
        if (quantity < 1 || quantity > t.quantity()) throw new IllegalArgumentException("the quantity returned is between 1 and " + t.quantity());
        long redelivered = returnCollateral(t.collateralAmount(), quantity, t.quantity());
        BusinessEvent ev = returnEvent(before, quantity, t.collateralAmount() - redelivered, date);
        CdmRuntime.validate(ev);
        GmslaReturnEnum q = CdmRuntime.fn(Qualify_GmslaReturn.class).evaluate(ev);
        if (q == null) throw new IllegalStateException("the return does not qualify as a GMSLA return");
        Map<String, Object> doc = o("phase", "Return", "trade", tree(before), "terms", tree(lt),
                "securityTransfer", transfer(quantity, o("financialUnit", "Share"), CdmRepo.security(t.isin()), t.borrower(), t.lender(), date),
                "returnEvent", tree(ev), "returnQualification", q.toString());
        if (redelivered > 0) doc.put("collateralTransfer", collateralTransfer(t, redelivered, t.lender(), t.borrower(), date));
        return settlement(doc, quantity, redelivered);
    }

    /** The other party's check of a return document: rebuilding it from its own trade, terms, quantity and date gives the
     *  same document. Returns the settlement; throws otherwise. */
    public static Settlement verifyReturn(String json) {
        GmslaLoanSettlement s;
        try {
            s = CdmRuntime.JSON.readValue(json, GmslaLoanSettlement.class);
        } catch (Exception e) {
            throw new IllegalStateException("not a GmslaLoanSettlement: " + e.getMessage(), e);
        }
        if (s.getReturnEvent() == null) throw new IllegalStateException("the document is not a return");
        Settlement again = returnOf(s.getTrade(), s.getTerms(), s.getSecurityTransfer().getQuantity().getValue().longValueExact(),
                s.getReturnEvent().getEventDate().toLocalDate());
        if (!again.hash().equalsIgnoreCase(Cdm.keccakHex(json))) throw new IllegalStateException("the return does not rebuild to the same document");
        return again;
    }

    /** CDM's own qualifications of a return event, recorded beside Qualify_GmslaReturn (defect D4). */
    public static List<String> cdmQualifications(BusinessEvent ev) {
        List<String> out = new ArrayList<>();
        if (CdmRuntime.fn(Qualify_FullReturn.class).evaluate(ev)) out.add("FullReturn");
        if (CdmRuntime.fn(Qualify_Termination.class).evaluate(ev)) out.add("Termination");
        if (CdmRuntime.fn(Qualify_PartialTermination.class).evaluate(ev)) out.add("PartialTermination");
        return out;
    }

    /** A view of a settlement for the console. */
    public static Map<String, Object> view(Settlement s) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("phase", s.settlement().getPhase().toString());
        m.put("quantity", String.valueOf(s.quantity()));
        m.put("collateralAmount", String.valueOf(s.collateralAmount()));
        if (s.settlement().getReturnQualification() != null) {
            m.put("qualification", s.settlement().getReturnQualification().toString());
            m.put("cdmQualifications", cdmQualifications(s.settlement().getReturnEvent()));
        }
        return m;
    }
}
