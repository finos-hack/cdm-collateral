package collateral;

import cdm.event.common.BillingRecord;
import cdm.event.common.BusinessEvent;
import cdm.event.common.Instruction;
import cdm.event.common.PrimitiveInstruction;
import cdm.event.common.TradeState;
import cdm.event.common.TransferInstruction;
import cdm.event.common.functions.Create_BusinessEvent;
import cdm.event.qualification.functions.Qualify_CashTransfer;
import cdm.product.asset.InterestRatePayout;
import cdm.product.asset.functions.FixedAmount;
import cdm.product.common.schedule.functions.CalculationPeriodRange;
import cdmx.collateral.gmsla.GmslaLoanInvoice;
import cdmx.collateral.gmsla.GmslaLoanTerms;
import cdmx.collateral.gmsla.functions.GmslaInvoiceTotal;
import com.fasterxml.jackson.databind.JsonNode;
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
 * The invoice of a loan's rate for a period (task-gmsla-rebate, wp-adr-gmsla-rebate). The period runs from the
 * billed-through date (or the delivery date) to the business date (or the return date of a returned loan); the start
 * day accrues and the end day does not. It is split at each date the trade in force changed (a settled return), and
 * each part accrues CDM's FixedAmount over the collateral's InterestRatePayout with the cash held as the notional
 * (CDM's invoice gives no amount on a loan, defect D27). The total is cdm-ext GmslaInvoiceTotal. The document is
 * cdm-ext GmslaLoanInvoice: CDM's SecurityLendingInvoice with the records' amounts and CDM's billing summary, and CDM's
 * payment event (a transfer of type InterestReturn, qualified CashTransfer). Row 17 bills the rebate on cash
 * collateral: the borrower bills, the lender pays, on the cash held. Row 18 bills the lending fee on non-cash collateral
 * (wp-adr-gmsla-lending-fee): the lender bills, the borrower pays, on the loaned quantity outstanding x the loaned
 * security's feed price on the billing date (one price per invoice), over a fee InterestRatePayout built from the fee
 * rate in GmslaLoanTerms (fixed, ACT/360); the booked trade is unchanged.
 */
public final class CdmLoanInvoice {
    private CdmLoanInvoice() {}

    /** The trade in force from `date` on: the booked trade from the delivery date, each settled return's from its date. */
    public record Change(LocalDate date, TradeState trade) {}

    /** An invoice document: the amount and the period end, which the biller anchors with the hash. */
    public record Invoice(GmslaLoanInvoice doc, String json, String hash, BigDecimal amount, LocalDate periodEnd) {
        /** The amount in the cash token's units (tUSD has no decimals: the amount is whole dollars). */
        public long onChainAmount() {
            return amount.movePointRight(CdmRepo.CASH_PRECISION).longValueExact();
        }
    }

    static InterestRatePayout rebatePayout(TradeState ts) {
        JsonNode p = CdmRuntime.JSON.valueToTree(ts).path("trade").path("product").path("economicTerms").path("collateral")
                .path("collateralPortfolio").path(0).path("collateralPosition").path(0).path("product").path("economicTerms").path("payout").path(0);
        try {
            return CdmRuntime.JSON.treeToValue(p, InterestRatePayout.class);
        } catch (Exception e) {
            throw new IllegalStateException("the loan has no rebate payout: " + e.getMessage(), e);
        }
    }

    /** The trade in force on `day`: the last change on or before it. */
    static TradeState inForce(List<Change> timeline, LocalDate day) {
        TradeState ts = null;
        for (Change c : timeline) if (!c.date().isAfter(day)) ts = c.trade();
        if (ts == null) throw new IllegalArgumentException("the loan is not delivered on " + day);
        return ts;
    }

    private static Map<String, Object> cashTransfer(Object value, String payer, String receiver, LocalDate date) {
        return o("@type", "cdm.event.common.ScheduledTransfer",
                "quantity", o("value", value, "unit", o("currency", o("@data", "USD"))),
                "asset", o("@type", "cdm.base.staticdata.asset.common.Cash",
                        "identifier", l(o("identifier", o("@data", "USD"), "identifierType", "CurrencyCode")),
                        "partyRole", o("partyReference", CdmRepo.party("US-FED"), "role", "Issuer"), "assetType", "Cash"),
                "settlementDate", o("adjustedDate", o("@data", date.toString())),
                "payerReceiver", o("payerPartyReference", CdmRepo.party(payer), "receiverPartyReference", CdmRepo.party(receiver)),
                "transferType", "InterestReturn");
    }

    /** The fee payout the invoice accrues over: the borrower pays the lender the fee rate, fixed, ACT/360. */
    static InterestRatePayout feePayout(BigDecimal rate) {
        Map<String, Object> usd = o("currency", o("@data", "USD"));
        return CdmRuntime.load(InterestRatePayout.class, o("payerReceiver", o("payer", "Party2", "receiver", "Party1"),
                "rateSpecification", o("@type", "cdm.product.asset.FixedRateSpecification",
                        "rateSchedule", o("price", o("value", rate, "unit", usd, "perUnitOf", usd, "priceType", "InterestRate"))),
                "dayCountFraction", o("@data", "ACT/360")));
    }

    /** The rebate invoice of a cash loan for [start, end), over its timeline (sorted by date, the first the delivery). */
    public static Invoice rebate(List<Change> timeline, GmslaLoanTerms lt, LocalDate start, LocalDate end) {
        if (lt.getRebateRate() == null) throw new IllegalArgumentException("only a loan against cash collateral has a rebate");
        if (lt.getRebateRate().signum() < 0) throw new IllegalArgumentException("a negative rebate rate is not supported");
        return invoice(timeline, lt, start, end, null);
    }

    /** The fee invoice of a loan against securities for [start, end), at the loaned security's `price` on the billing date. */
    public static Invoice fee(List<Change> timeline, GmslaLoanTerms lt, LocalDate start, LocalDate end, BigDecimal price) {
        if (lt.getFeeRate() == null) throw new IllegalArgumentException("only a loan against non-cash collateral has a lending fee");
        if (lt.getFeeRate().signum() < 0) throw new IllegalArgumentException("a negative fee rate is not supported");
        if (price == null || price.signum() <= 0) throw new IllegalArgumentException("the fee needs the loaned security's price");
        return invoice(timeline, lt, start, end, price.stripTrailingZeros());
    }

    private static Invoice invoice(List<Change> timeline, GmslaLoanTerms lt, LocalDate start, LocalDate end, BigDecimal price) {
        boolean fee = price != null;
        if (!end.isAfter(start)) throw new IllegalArgumentException("nothing to bill: the period " + start + " to " + end + " has no day");
        CdmLoan.Terms t0 = CdmLoan.terms(inForce(timeline, start), lt);
        String lender = t0.lender(), borrower = t0.borrower();
        // The rate's payer and receiver: the lender pays the rebate, the borrower pays the fee. The receiver bills.
        String payer = fee ? borrower : lender, receiver = fee ? lender : borrower;
        InterestRatePayout feeIrp = fee ? feePayout(lt.getFeeRate()) : null;
        // The period's parts: split at each change after the start and before the end.
        // A change splits the period only when what the rate applies to changes: the cash held for a rebate, the loaned
        // quantity for a fee (a substitution changes neither).
        java.util.function.ToLongFunction<TradeState> basis = ts -> fee ? CdmLoan.terms(ts, lt).quantity() : CdmLoan.collateralHeld(ts);
        List<LocalDate> bounds = new ArrayList<>(List.of(start));
        long held = basis.applyAsLong(inForce(timeline, start));
        for (Change c : timeline) {
            if (!c.date().isAfter(start) || !c.date().isBefore(end)) continue;
            long now = basis.applyAsLong(c.trade());
            if (now != held && !c.date().equals(bounds.get(bounds.size() - 1))) bounds.add(c.date());
            held = now;
        }
        bounds.add(end);
        List<Map<String, Object>> periods = new ArrayList<>();
        List<BigDecimal> accruals = new ArrayList<>();
        List<BillingRecord> records = new ArrayList<>();
        for (int i = 0; i + 1 < bounds.size(); i++) {
            LocalDate a = bounds.get(i), b = bounds.get(i + 1);
            TradeState ts = inForce(timeline, a);
            long quantity = CdmLoan.terms(ts, lt).quantity();
            BigDecimal notional = fee ? price.multiply(BigDecimal.valueOf(quantity)).stripTrailingZeros() : BigDecimal.valueOf(CdmLoan.collateralHeld(ts));
            var range = CdmRuntime.fn(CalculationPeriodRange.class).evaluate(Date.of(a), Date.of(b), null);
            BigDecimal accrual = CdmRuntime.fn(FixedAmount.class).evaluate(fee ? feeIrp : rebatePayout(ts), notional, Date.of(b), range)
                    .setScale(10, java.math.RoundingMode.HALF_UP).stripTrailingZeros();
            accruals.add(accrual);
            Map<String, Object> part = o("startDate", a.toString(), "endDate", b.toString(), "notional", notional, "accrual", accrual);
            if (fee) part.put("quantity", quantity);
            periods.add(part);
            var rb = CdmRuntime.load(BillingRecord.class, o("recordTransfer", cashTransfer(accrual, payer, receiver, end),
                    "recordStartDate", a.toString(), "recordEndDate", b.toString())).toBuilder();
            rb.setTradeStateValue(ts);
            records.add(rb.build());
        }
        BigDecimal amount = CdmRuntime.fn(GmslaInvoiceTotal.class).evaluate(accruals, CdmRepo.CASH_PRECISION);
        if (amount.signum() <= 0) throw new IllegalStateException("the " + (fee ? "fee" : "rebate") + " for " + start + " to " + end + " rounds to zero");
        // CDM's Create_BillingSummary is a codeImplementation function with no implementation in CDM 7.7.0: it returns
        // nothing (part of D27). The summary is built as its comment describes: the records' total, ParentTotal.
        var summary = CdmRuntime.load(cdm.event.common.BillingSummary.class, o(
                "summaryTransfer", cashTransfer(amount, payer, receiver, end), "summaryAmountType", "ParentTotal"));
        var inv = CdmRuntime.load(cdm.event.common.SecurityLendingInvoice.class, o(
                "sendingParty", CdmRepo.party(receiver), "receivingParty", CdmRepo.party(payer),
                "billingStartDate", start.toString(), "billingEndDate", end.toString())).toBuilder();
        inv.addBillingRecord(records);
        inv.addBillingSummary(summary);
        TradeState last = inForce(timeline, end.minusDays(1));
        TransferInstruction ti = CdmRuntime.load(TransferInstruction.class, o("transferState", l(o("transfer",
                cashTransfer(amount, payer, receiver, end)))));
        Instruction ins = Instruction.builder().setBeforeValue(last).setPrimitiveInstruction(PrimitiveInstruction.builder().setTransfer(ti)).build();
        BusinessEvent ev = CdmRepo.resolved(BusinessEvent.class,
                CdmRuntime.fn(Create_BusinessEvent.class).evaluate(new ArrayList<>(List.of(ins)), null, Date.of(end), null));
        if (!CdmRuntime.fn(Qualify_CashTransfer.class).evaluate(ev)) throw new IllegalStateException("the payment does not qualify as a cash transfer");
        Map<String, Object> doc = o("loanId", t0.loanId(), "rateType", fee ? "Fee" : "Rebate", "rate", fee ? lt.getFeeRate() : lt.getRebateRate());
        if (fee) doc.put("price", price);
        doc.putAll(o("periodStart", start.toString(), "periodEnd", end.toString(), "period", periods, "precision", CdmRepo.CASH_PRECISION, "amount", amount,
                "invoice", CdmLoan.tree(inv.build()), "paymentEvent", CdmLoan.tree(ev)));
        GmslaLoanInvoice g = CdmRuntime.load(GmslaLoanInvoice.class, doc);
        CdmRuntime.validate(g);
        String json = CdmRuntime.toJson(g);
        return new Invoice(g, json, Cdm.keccakHex(json), amount, end);
    }

    /** The payer's check: rebuilding the invoice over its own timeline, the loan's terms and the document's period gives
     *  the same document. The caller checks the period against the chain and its business date. */
    public static Invoice verify(String json, List<Change> timeline, GmslaLoanTerms lt) {
        GmslaLoanInvoice g;
        try {
            g = CdmRuntime.JSON.readValue(json, GmslaLoanInvoice.class);
        } catch (Exception e) {
            throw new IllegalStateException("not a GmslaLoanInvoice: " + e.getMessage(), e);
        }
        LocalDate start = g.getPeriodStart().toLocalDate(), end = g.getPeriodEnd().toLocalDate();
        Invoice again = g.getRateType() == cdmx.collateral.gmsla.GmslaRateTypeEnum.FEE
                ? fee(timeline, lt, start, end, g.getPrice()) : rebate(timeline, lt, start, end);
        if (!again.hash().equalsIgnoreCase(Cdm.keccakHex(json))) throw new IllegalStateException("the invoice does not rebuild to the same document");
        return again;
    }

    /** A view of an invoice for the console. */
    public static Map<String, Object> view(Invoice inv) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("rateType", inv.doc().getRateType().toString());
        if (inv.doc().getPrice() != null) m.put("price", inv.doc().getPrice().toPlainString());
        m.put("periodStart", inv.doc().getPeriodStart().toString());
        m.put("periodEnd", inv.doc().getPeriodEnd().toString());
        m.put("amount", inv.amount().toPlainString());
        m.put("onChainAmount", String.valueOf(inv.onChainAmount()));
        List<Map<String, Object>> ps = new ArrayList<>();
        for (var p : inv.doc().getPeriod()) {
            Map<String, Object> x = new LinkedHashMap<>(Map.of("startDate", p.getStartDate().toString(), "endDate", p.getEndDate().toString(),
                    "notional", p.getNotional().toPlainString(), "accrual", p.getAccrual().toPlainString()));
            if (p.getQuantity() != null) x.put("quantity", p.getQuantity().toPlainString());
            ps.add(x);
        }
        m.put("periods", ps);
        return m;
    }
}
