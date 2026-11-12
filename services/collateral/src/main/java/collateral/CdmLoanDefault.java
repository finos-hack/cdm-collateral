package collateral;

import cdm.event.common.TradeState;
import cdmx.collateral.gmsla.GmslaCloseOutStatement;
import cdmx.collateral.gmsla.GmslaDefaultHeldMargin;
import cdmx.collateral.gmsla.GmslaDefaultLoanValue;
import cdmx.collateral.gmsla.GmslaDefaultNotice;
import cdmx.collateral.gmsla.GmslaLoanTerms;
import cdmx.collateral.gmsla.functions.GmslaCloseOutNetAmount;
import cdmx.collateral.repo.functions.GmraDefaultMarketValue;
import com.rosetta.model.lib.records.Date;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/** A GMSLA default close-out (wp-adr-gmsla-default-close-out, GMSLA 2010 paragraph 11): the Default Notice, CDM's
 *  termination event per delivered loan, the Default Market Values of the loaned securities and of the collateral held,
 *  the rate accrued and not yet paid, the margin held under the pair's GMSLA calls, and one net balance in the Base
 *  Currency. The non-defaulting party's service builds the statement; the other party's service rebuilds it from its
 *  own loan documents, the chain's billed-through dates and margin, and the prices the statement states. */
final class CdmLoanDefault {
    private CdmLoanDefault() {}

    /** One loan to close out: its trade in force, terms and timeline (CdmLoanInvoice), the first day not yet billed
     *  (the billed-through date or the delivery), and the oracle prices of the loaned security and the collateral (1 for
     *  cash) on the Early Termination Date. */
    record LoanInput(String loanId, TradeState trade, GmslaLoanTerms terms, List<CdmLoanInvoice.Change> timeline,
                     LocalDate unbilledFrom, BigDecimal price, BigDecimal collateralPrice) {}

    /** Margin one party holds from the other, net per asset, with the GMSLA calls it was transferred under. */
    record MarginInput(String holder, String giver, String asset, boolean cash, long quantity, BigDecimal price, List<String> callIds) {}

    record Notice(GmslaDefaultNotice notice, String json, String hash) {}

    record Statement(GmslaCloseOutStatement statement, String json, String hash) {
        long balance() {
            return statement.getBalance().longValueExact();
        }

        String payer() {
            return statement.getPayer();
        }
    }

    static Notice notice(String nonDefaulting, String defaulting, LocalDate eventOfDefault, LocalDate earlyTermination, boolean automatic) {
        GmslaDefaultNotice n = GmslaDefaultNotice.builder().setNonDefaultingParty(nonDefaulting).setDefaultingParty(defaulting)
                .setEventOfDefaultDate(Date.of(eventOfDefault)).setEarlyTerminationDate(Date.of(earlyTermination))
                .setAutomaticEarlyTermination(automatic).build();
        CdmRuntime.validate(n);
        String json = CdmRuntime.toJson(n);
        return new Notice(n, json, Cdm.keccakHex(json));
    }

    private static BigDecimal marketValue(long quantity, BigDecimal price) {
        return CdmRuntime.fn(GmraDefaultMarketValue.class).evaluate(BigDecimal.valueOf(quantity), price, CdmRepo.CASH_PRECISION);
    }

    /** The rate accrued from the first unbilled day to the Early Termination Date, built as an invoice is (a fee at the
     *  loaned security's price on that date); null when no day is unbilled or the amount rounds to zero. */
    static CdmLoanInvoice.Invoice accrual(LoanInput in, LocalDate earlyTermination) {
        if (!earlyTermination.isAfter(in.unbilledFrom())) return null;
        try {
            return in.terms().getRebateRate() != null
                    ? CdmLoanInvoice.rebate(in.timeline(), in.terms(), in.unbilledFrom(), earlyTermination)
                    : CdmLoanInvoice.fee(in.timeline(), in.terms(), in.unbilledFrom(), earlyTermination, in.price());
        } catch (IllegalStateException e) {
            if (String.valueOf(e.getMessage()).contains("rounds to zero")) return null;
            throw e;
        }
    }

    /** A trade as its JSON reads back. A trade built in this service carries resolved references that a trade parsed
     *  from a document does not, and CDM's transfer function settles the position on one and not the other; reading
     *  every input back from JSON makes the statement the same whichever service built the trade objects. */
    private static TradeState asParsed(TradeState t) {
        try {
            return CdmRuntime.JSON.readValue(CdmRuntime.toJson(t), TradeState.class);
        } catch (Exception e) {
            throw new IllegalStateException("the trade does not read back from its JSON: " + e.getMessage(), e);
        }
    }

    private static LoanInput asParsed(LoanInput in) {
        List<CdmLoanInvoice.Change> timeline = new ArrayList<>();
        for (CdmLoanInvoice.Change c : in.timeline()) timeline.add(new CdmLoanInvoice.Change(c.date(), asParsed(c.trade())));
        return new LoanInput(in.loanId(), asParsed(in.trade()), in.terms(), timeline, in.unbilledFrom(), in.price(), in.collateralPrice());
    }

    static GmslaDefaultLoanValue value(LoanInput raw, LocalDate earlyTermination) {
        LoanInput in = asParsed(raw);
        CdmLoan.Terms t = CdmLoan.terms(in.trade(), in.terms());
        if (t.cash() && in.collateralPrice().compareTo(BigDecimal.ONE) != 0) throw new IllegalArgumentException("cash collateral is valued at par");
        CdmLoanInvoice.Invoice acc = accrual(in, earlyTermination);
        var b = GmslaDefaultLoanValue.builder().setLoanId(in.loanId()).setTermination(CdmRepoDefault.termination(in.trade(), earlyTermination))
                .setLender(t.lender()).setBorrower(t.borrower()).setSecurity(t.isin()).setQuantity(BigDecimal.valueOf(t.quantity()))
                .setPrice(in.price()).setDefaultMarketValue(marketValue(t.quantity(), in.price()))
                .setCollateral(t.cash() ? "USD" : t.collateralIsin()).setCollateralCash(t.cash())
                .setCollateralQuantity(BigDecimal.valueOf(t.collateralAmount())).setCollateralPrice(in.collateralPrice())
                .setCollateralValue(marketValue(t.collateralAmount(), in.collateralPrice()))
                .setAccruedAmount(acc == null ? BigDecimal.ZERO : acc.doc().getAmount());
        if (acc != null) b.setAccrual(acc.doc());
        return b.build();
    }

    static GmslaDefaultHeldMargin margin(MarginInput m) {
        return GmslaDefaultHeldMargin.builder().setHolder(m.holder()).setGiver(m.giver()).setAsset(m.asset()).setCash(m.cash())
                .setQuantity(BigDecimal.valueOf(m.quantity())).setPrice(m.price()).setValue(marketValue(m.quantity(), m.price()))
                .setCallId(new ArrayList<>(m.callIds())).build();
    }

    /** The close-out statement: every loan and held margin, set off into one balance, validated. */
    static Statement statement(GmslaDefaultNotice notice, String baseCurrency, LocalDate valuationDate, List<LoanInput> loans, List<MarginInput> margins) {
        if (loans.isEmpty()) throw new IllegalArgumentException("no delivered loan to close out");
        LocalDate etd = notice.getEarlyTerminationDate().toLocalDate();
        List<GmslaDefaultLoanValue> values = new ArrayList<>();
        for (LoanInput l : loans) values.add(value(l, etd));
        List<GmslaDefaultHeldMargin> held = new ArrayList<>();
        for (MarginInput m : margins) if (m.quantity() > 0) held.add(margin(m));
        String nd = notice.getNonDefaultingParty(), d = notice.getDefaultingParty();
        BigDecimal net = CdmRuntime.fn(GmslaCloseOutNetAmount.class).evaluate(new ArrayList<>(values), new ArrayList<>(held), nd);
        var b = GmslaCloseOutStatement.builder().setNotice(notice).setBaseCurrency(baseCurrency).setValuationDate(Date.of(valuationDate))
                .setLoanValue(values).setHeldMargin(held).setNetAmount(net);
        if (net.signum() > 0) b.setBalance(net).setPayer(d).setReceiver(nd);
        else if (net.signum() < 0) b.setBalance(net.negate()).setPayer(nd).setReceiver(d);
        else b.setBalance(BigDecimal.ZERO);
        GmslaCloseOutStatement s = b.build();
        CdmRuntime.validate(s);
        String json = CdmRuntime.toJson(s);
        return new Statement(s, json, Cdm.keccakHex(json));
    }

    static GmslaCloseOutStatement parse(String json) {
        try {
            return CdmRuntime.JSON.readValue(json, GmslaCloseOutStatement.class);
        } catch (Exception e) {
            throw new IllegalStateException("not a GmslaCloseOutStatement: " + e.getMessage(), e);
        }
    }

    private static GmslaDefaultLoanValue loanValue(GmslaCloseOutStatement s, String loanId) {
        return s.getLoanValue().stream().filter(v -> v.getLoanId().equalsIgnoreCase(loanId)).findFirst()
                .orElseThrow(() -> new IllegalStateException("the statement does not value loan " + loanId));
    }

    /** The prices the statement states for a loan: the loaned security's and the collateral's. */
    static BigDecimal[] statedPrices(GmslaCloseOutStatement s, String loanId) {
        var v = loanValue(s, loanId);
        return new BigDecimal[]{v.getPrice(), v.getCollateralPrice()};
    }

    /** The held margin of a statement; Rune builds an empty list as null. */
    static List<? extends GmslaDefaultHeldMargin> heldMargin(GmslaCloseOutStatement s) {
        return s.getHeldMargin() == null ? List.of() : s.getHeldMargin();
    }

    /** The GMSLA calls whose margin a statement settles. */
    static List<String> settledCalls(GmslaCloseOutStatement s) {
        List<String> out = new ArrayList<>();
        for (var m : heldMargin(s)) out.addAll(m.getCallId());
        return out;
    }

    static java.util.Map<String, Object> view(GmslaCloseOutStatement s) {
        java.util.Map<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("earlyTerminationDate", s.getNotice().getEarlyTerminationDate().toString());
        m.put("automaticEarlyTermination", s.getNotice().getAutomaticEarlyTermination());
        m.put("nonDefaultingParty", s.getNotice().getNonDefaultingParty());
        m.put("defaultingParty", s.getNotice().getDefaultingParty());
        List<java.util.Map<String, Object>> loans = new ArrayList<>();
        for (var v : s.getLoanValue()) {
            java.util.Map<String, Object> l = new java.util.LinkedHashMap<>();
            l.put("loanId", v.getLoanId());
            l.put("lender", v.getLender());
            l.put("borrower", v.getBorrower());
            l.put("quantity", v.getQuantity().toPlainString());
            l.put("price", v.getPrice().stripTrailingZeros().toPlainString());
            l.put("defaultMarketValue", v.getDefaultMarketValue().toPlainString());
            l.put("collateral", v.getCollateral());
            l.put("collateralQuantity", v.getCollateralQuantity().toPlainString());
            l.put("collateralPrice", v.getCollateralPrice().stripTrailingZeros().toPlainString());
            l.put("collateralValue", v.getCollateralValue().toPlainString());
            l.put("rateType", v.getAccrual() == null ? null : v.getAccrual().getRateType().toString());
            l.put("accruedFrom", v.getAccrual() == null ? null : v.getAccrual().getPeriodStart().toString());
            l.put("accruedAmount", v.getAccruedAmount().toPlainString());
            loans.add(l);
        }
        m.put("loans", loans);
        List<java.util.Map<String, Object>> held = new ArrayList<>();
        for (var h : heldMargin(s))
            held.add(new java.util.LinkedHashMap<>(java.util.Map.of("holder", h.getHolder(), "asset", h.getAsset(), "quantity", h.getQuantity().toPlainString(), "value", h.getValue().toPlainString())));
        m.put("heldMargin", held);
        m.put("netAmount", s.getNetAmount().toPlainString());
        m.put("balance", s.getBalance().toPlainString());
        m.put("payer", s.getPayer());
        m.put("receiver", s.getReceiver());
        return m;
    }
}
