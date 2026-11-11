package collateral;

import cdm.base.datetime.AdjustableDate;
import cdm.base.datetime.AdjustableOrRelativeDate;
import cdm.base.datetime.BusinessDayAdjustments;
import cdm.base.datetime.BusinessDayConventionEnum;
import cdm.event.common.BusinessEvent;
import cdm.event.common.Instruction;
import cdm.event.common.TradeState;
import cdm.event.common.functions.Create_BusinessEvent;
import cdm.event.common.functions.Create_TerminationInstruction;
import cdmx.collateral.repo.GmraCloseOutStatement;
import cdmx.collateral.repo.GmraDefaultHeldMargin;
import cdmx.collateral.repo.GmraDefaultNotice;
import cdmx.collateral.repo.GmraDefaultTransactionValue;
import cdmx.collateral.repo.functions.GmraCloseOutNetAmount;
import cdmx.collateral.repo.functions.GmraDefaultMarketValue;
import cdmx.collateral.repo.functions.GmraDefaultRepurchasePrice;
import com.rosetta.model.lib.records.Date;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/** A GMRA default close-out (wp-adr-repo-default-close-out, GMRA paragraph 10): the Default Notice, CDM's termination
 *  event per Transaction, the values as at the Early Termination Date and one net balance in the Base Currency. The
 *  non-defaulting party's service builds the statement; the other party's service rebuilds it from its own trades, the
 *  chain's deductions and margin, and the prices the statement states, and compares the hash. */
final class CdmRepoDefault {
    private CdmRepoDefault() {}

    /** One Transaction to close out: the trade, its buy/sell-back income deduction (zero for a repo) and the price of
     *  one unit of its securities at the Default Valuation Time. */
    record TxInput(String repoId, TradeState trade, long incomeDeduction, BigDecimal price) {}

    /** Margin one party holds from the other, net per asset, with the GMRA calls it was transferred under. */
    record MarginInput(String holder, String giver, String asset, boolean cash, long quantity, BigDecimal price, List<String> callIds) {}

    record Notice(GmraDefaultNotice notice, String json, String hash) {}

    record Statement(GmraCloseOutStatement statement, String json, String hash) {
        long balance() {
            return statement.getBalance().longValueExact();
        }

        String payer() {
            return statement.getPayer();
        }
    }

    static Notice notice(String nonDefaulting, String defaulting, LocalDate eventOfDefault, LocalDate earlyTermination, boolean automatic) {
        GmraDefaultNotice n = GmraDefaultNotice.builder().setNonDefaultingParty(nonDefaulting).setDefaultingParty(defaulting)
                .setEventOfDefaultDate(Date.of(eventOfDefault)).setEarlyTerminationDate(Date.of(earlyTermination))
                .setAutomaticEarlyTermination(automatic).build();
        CdmRuntime.validate(n);
        String json = CdmRuntime.toJson(n);
        return new Notice(n, json, Cdm.keccakHex(json));
    }

    private static AdjustableOrRelativeDate adjustable(LocalDate d) {
        return AdjustableOrRelativeDate.builder().setAdjustableDate(AdjustableDate.builder().setUnadjustedDate(Date.of(d))
                .setDateAdjustments(BusinessDayAdjustments.builder().setBusinessDayConvention(BusinessDayConventionEnum.NONE))).build();
    }

    /** CDM's termination of a Transaction on the Early Termination Date: Create_TerminationInstruction, with the closed
     *  state's activity date set (CDM validation requires it); no intent, as Qualify_Termination requires. */
    static BusinessEvent termination(TradeState ts, LocalDate earlyTermination) {
        var pi = CdmRuntime.fn(Create_TerminationInstruction.class).evaluate(ts, adjustable(earlyTermination));
        Instruction i = Instruction.builder().setBeforeValue(ts).setPrimitiveInstruction(pi).build();
        var b = CdmRuntime.fn(Create_BusinessEvent.class).evaluate(new ArrayList<>(List.of(i)), null, Date.of(earlyTermination), null).toBuilder();
        b.getAfter().get(0).getState().getClosedState().setActivityDate(Date.of(earlyTermination));
        return b.build();
    }

    static GmraDefaultTransactionValue value(TxInput t, LocalDate earlyTermination) {
        CdmRepo.Terms terms = CdmRepo.terms(t.trade());
        BigDecimal quantity = BigDecimal.valueOf(terms.quantity());
        BigDecimal rp = CdmRuntime.fn(GmraDefaultRepurchasePrice.class)
                .evaluate(t.trade(), Date.of(earlyTermination), BigDecimal.valueOf(t.incomeDeduction()), CdmRepo.CASH_PRECISION);
        BigDecimal dmv = CdmRuntime.fn(GmraDefaultMarketValue.class).evaluate(quantity, t.price(), CdmRepo.CASH_PRECISION);
        return GmraDefaultTransactionValue.builder().setRepoId(t.repoId()).setTermination(termination(t.trade(), earlyTermination))
                .setSeller(terms.seller()).setBuyer(terms.buyer()).setBuySellBack(terms.buySellBack()).setRepurchasePrice(rp)
                .setSecurity(terms.isin()).setQuantity(quantity).setPrice(t.price()).setDefaultMarketValue(dmv).build();
    }

    static GmraDefaultHeldMargin margin(MarginInput m) {
        BigDecimal quantity = BigDecimal.valueOf(m.quantity());
        BigDecimal value = CdmRuntime.fn(GmraDefaultMarketValue.class).evaluate(quantity, m.price(), CdmRepo.CASH_PRECISION);
        return GmraDefaultHeldMargin.builder().setHolder(m.holder()).setGiver(m.giver()).setAsset(m.asset()).setCash(m.cash())
                .setQuantity(quantity).setPrice(m.price()).setValue(value).setCallId(new ArrayList<>(m.callIds())).build();
    }

    /** The close-out statement: every Transaction and held margin, set off into one balance, validated. */
    static Statement statement(GmraDefaultNotice notice, String baseCurrency, LocalDate valuationDate, List<TxInput> txs, List<MarginInput> margins) {
        if (txs.isEmpty()) throw new IllegalArgumentException("no Transaction to close out");
        LocalDate etd = notice.getEarlyTerminationDate().toLocalDate();
        List<GmraDefaultTransactionValue> values = new ArrayList<>();
        for (TxInput t : txs) values.add(value(t, etd));
        List<GmraDefaultHeldMargin> held = new ArrayList<>();
        for (MarginInput m : margins) if (m.quantity() > 0) held.add(margin(m));
        String nd = notice.getNonDefaultingParty(), d = notice.getDefaultingParty();
        BigDecimal net = CdmRuntime.fn(GmraCloseOutNetAmount.class).evaluate(new ArrayList<>(values), new ArrayList<>(held), new ArrayList<>(), nd);
        var b = GmraCloseOutStatement.builder().setNotice(notice).setBaseCurrency(baseCurrency).setValuationDate(Date.of(valuationDate))
                .setTransactionValue(values).setHeldMargin(held).setNetAmount(net);
        if (net.signum() > 0) b.setBalance(net).setPayer(d).setReceiver(nd);
        else if (net.signum() < 0) b.setBalance(net.negate()).setPayer(nd).setReceiver(d);
        else b.setBalance(BigDecimal.ZERO);
        GmraCloseOutStatement s = b.build();
        CdmRuntime.validate(s);
        String json = CdmRuntime.toJson(s);
        return new Statement(s, json, Cdm.keccakHex(json));
    }

    /** Parses a statement document (no checks beyond the JSON shape). */
    static GmraCloseOutStatement parse(String json) {
        try {
            return CdmRuntime.JSON.readValue(json, GmraCloseOutStatement.class);
        } catch (Exception e) {
            throw new IllegalStateException("not a GmraCloseOutStatement: " + e.getMessage(), e);
        }
    }

    /** The price the statement states for a Transaction's securities. */
    static BigDecimal statedPrice(GmraCloseOutStatement s, String repoId) {
        return s.getTransactionValue().stream().filter(v -> v.getRepoId().equalsIgnoreCase(repoId)).findFirst()
                .orElseThrow(() -> new IllegalStateException("the statement does not value repo " + repoId)).getPrice();
    }

    /** The price the statement states for held margin in an asset, or null when it holds none. */
    static BigDecimal statedMarginPrice(GmraCloseOutStatement s, String asset) {
        return heldMargin(s).stream().filter(m -> m.getAsset().equals(asset)).findFirst().map(GmraDefaultHeldMargin::getPrice).orElse(null);
    }

    /** The held margin of a statement; Rune builds an empty list as null. */
    static List<? extends GmraDefaultHeldMargin> heldMargin(GmraCloseOutStatement s) {
        return s.getHeldMargin() == null ? List.of() : s.getHeldMargin();
    }

    /** The GMRA calls whose margin a statement settles. */
    static List<String> settledCalls(GmraCloseOutStatement s) {
        List<String> out = new ArrayList<>();
        for (GmraDefaultHeldMargin m : heldMargin(s)) out.addAll(m.getCallId());
        return out;
    }
}
