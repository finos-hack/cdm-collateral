package cdmx;

import cdm.base.datetime.AdjustableDate;
import cdm.base.datetime.AdjustableOrRelativeDate;
import cdm.base.datetime.BusinessDayAdjustments;
import cdm.base.datetime.BusinessDayConventionEnum;
import cdm.event.common.BusinessEvent;
import cdm.event.common.Instruction;
import cdm.event.common.TradeState;
import cdm.event.common.functions.Create_BusinessEvent;
import cdm.event.common.functions.Create_TerminationInstruction;
import cdm.event.qualification.functions.Qualify_Termination;
import cdmx.collateral.repo.GmraCloseOutStatement;
import cdmx.collateral.repo.GmraDefaultHeldMargin;
import cdmx.collateral.repo.GmraDefaultNotice;
import cdmx.collateral.repo.GmraDefaultTransactionValue;
import cdmx.collateral.repo.functions.GmraCloseOutNetAmount;
import cdmx.collateral.repo.functions.GmraDefaultMarketValue;
import cdmx.collateral.repo.functions.GmraDefaultRepurchasePrice;
import com.rosetta.model.lib.records.Date;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import static cdmx.Cdm.*;
import static cdmx.RepoTest.*;
import static cdmx.BuySellBackTest.same;
import static org.junit.jupiter.api.Assertions.*;

/** A GMRA default close-out (task-repo-default-close-out, wp-adr-repo-default-close-out): CDM's termination event per
 *  Transaction, the Repurchase Price to the Early Termination Date, the Default Market Value, and one net balance. */
class DefaultCloseOutTest {
    static final Date EOD = Date.of(2026, 11, 12);

    static TradeState repo(String id, String seller, String buyer, String rate) {
        return BuySellBackTest.trade(id, seller, buyer, rate, false);
    }

    static AdjustableOrRelativeDate adj(Date d) {
        return AdjustableOrRelativeDate.builder().setAdjustableDate(AdjustableDate.builder().setUnadjustedDate(d)
            .setDateAdjustments(BusinessDayAdjustments.builder().setBusinessDayConvention(BusinessDayConventionEnum.NONE))).build();
    }

    /** CDM's termination of a Transaction: Create_TerminationInstruction, with the closed state's activity date set. */
    static BusinessEvent termination(TradeState ts, Date d) {
        var pi = fn(Create_TerminationInstruction.class).evaluate(ts, adj(d));
        Instruction i = Instruction.builder().setBeforeValue(ts).setPrimitiveInstruction(pi).build();
        var b = fn(Create_BusinessEvent.class).evaluate(new ArrayList<>(List.of(i)), null, d, null).toBuilder();
        b.getAfter().get(0).getState().getClosedState().setActivityDate(d);
        return b.build();
    }

    static BigDecimal rp(TradeState ts, Date etd, String deduction) {
        return fn(GmraDefaultRepurchasePrice.class).evaluate(ts, etd, new BigDecimal(deduction), 0);
    }

    static GmraDefaultTransactionValue value(TradeState ts, String id, String seller, String buyer, String price) {
        BigDecimal dmv = fn(GmraDefaultMarketValue.class).evaluate(new BigDecimal(10_366), new BigDecimal(price), 0);
        return GmraDefaultTransactionValue.builder().setRepoId(id).setTermination(termination(ts, EOD)).setSeller(seller).setBuyer(buyer)
            .setBuySellBack(false).setRepurchasePrice(rp(ts, EOD, "0")).setSecurity(TUST).setQuantity(new BigDecimal(10_366))
            .setPrice(new BigDecimal(price)).setDefaultMarketValue(dmv).build();
    }

    static GmraDefaultNotice notice(boolean automatic, Date etd) {
        return GmraDefaultNotice.builder().setNonDefaultingParty("BANK-A").setDefaultingParty("BANK-B")
            .setEventOfDefaultDate(EOD).setEarlyTerminationDate(etd).setAutomaticEarlyTermination(automatic).build();
    }

    static GmraDefaultHeldMargin cashHeldByA(long amount) {
        return GmraDefaultHeldMargin.builder().setHolder("BANK-A").setGiver("BANK-B").setAsset("USD").setCash(true)
            .setQuantity(new BigDecimal(amount)).setPrice(BigDecimal.ONE).setValue(new BigDecimal(amount)).addCallId("0xcall").build();
    }

    static GmraCloseOutStatement.GmraCloseOutStatementBuilder statement(List<GmraDefaultTransactionValue> tx, List<GmraDefaultHeldMargin> margin) {
        BigDecimal net = fn(GmraCloseOutNetAmount.class).evaluate(new ArrayList<>(tx), new ArrayList<>(margin), new ArrayList<>(), "BANK-A");
        var b = GmraCloseOutStatement.builder().setNotice(notice(true, EOD)).setBaseCurrency("USD").setValuationDate(EOD)
            .setTransactionValue(new ArrayList<>(tx)).setHeldMargin(new ArrayList<>(margin)).setNetAmount(net);
        int s = net.signum();
        if (s > 0) b.setBalance(net).setPayer("BANK-B").setReceiver("BANK-A");
        else if (s < 0) b.setBalance(net.negate()).setPayer("BANK-A").setReceiver("BANK-B");
        else b.setBalance(BigDecimal.ZERO);
        return b;
    }

    @Test
    void cdmsTerminationEventQualifiesWithNoIntent() {
        BusinessEvent ev = termination(repo("R1", "BANK-A", "BANK-B", "0.045"), EOD);
        assertTrue(fn(Qualify_Termination.class).evaluate(ev));
        assertNull(ev.getIntent());
        assertEquals(List.of(), failures(ev));
    }

    @Test
    void theRepurchasePriceAccruesToTheEarlyTerminationDate() {
        TradeState r = repo("R1", "BANK-A", "BANK-B", "0.045");
        // 1,000,000 x 4.5% x 3 / 360 = 375
        same("1000375", rp(r, EOD, "0"));
        // on the Repurchase Date it is the Repurchase Price
        same("1000875", rp(r, Date.of(2026, 11, 16), "0"));
        // a buy/sell-back's income deduction comes off
        same("995189", rp(BuySellBackTest.bsb(), EOD, "5186"));
        rejected(() -> rp(r, EOD, "10"));
        rejected(() -> rp(r, Date.of(2026, 11, 17), "0"));
    }

    @Test
    void theDefaultMarketValueIsQuantityTimesPrice() {
        same("1020014", fn(GmraDefaultMarketValue.class).evaluate(new BigDecimal(10_366), new BigDecimal("98.40"), 0));
    }

    @Test
    void theBuyerOwesTheExcessOfTheSecuritiesOverTheRepurchasePrice() {
        // A sold to B: B owes 1,020,014 of securities and is owed 1,000,375; B, the defaulting party, pays A 19,639
        GmraCloseOutStatement s = statement(List.of(value(repo("R1", "BANK-A", "BANK-B", "0.045"), "R1", "BANK-A", "BANK-B", "98.40")), List.of()).build();
        assertEquals(List.of(), failures(s));
        same("19639", s.getBalance());
        assertEquals("BANK-B", s.getPayer());
    }

    @Test
    void marginAndTransactionsBothWaysNetToOneBalance() {
        // R1 as above (+19,639 to A); R2: B sold to A at 5% (1,000,417 owed to A, 1,020,014 owed by A: -19,597);
        // A holds 5,000 Cash Margin from B (-5,000): A pays B 4,958
        var tx = List.of(value(repo("R1", "BANK-A", "BANK-B", "0.045"), "R1", "BANK-A", "BANK-B", "98.40"),
            value(repo("R2", "BANK-B", "BANK-A", "0.05"), "R2", "BANK-B", "BANK-A", "98.40"));
        GmraCloseOutStatement s = statement(tx, List.of(cashHeldByA(5_000))).build();
        assertEquals(List.of(), failures(s));
        same("-4958", s.getNetAmount());
        same("4958", s.getBalance());
        assertEquals("BANK-A", s.getPayer());
        assertEquals("BANK-B", s.getReceiver());
    }

    @Test
    void aWrongBalanceOrPayerFailsValidation() {
        var tx = List.of(value(repo("R1", "BANK-A", "BANK-B", "0.045"), "R1", "BANK-A", "BANK-B", "98.40"));
        assertTrue(failedText(statement(tx, List.of()).setBalance(new BigDecimal(19_000)).build()).contains("Balance"));
        assertTrue(failedText(statement(tx, List.of()).setPayer("BANK-A").build()).contains("Balance"));
        assertTrue(failedText(statement(tx, List.of()).setNetAmount(new BigDecimal(1)).build()).contains("NetAmount"));
    }

    @Test
    void anotherPairsTransactionOrAnOpenTradeFailsValidation() {
        var other = value(repo("R3", "BANK-A", "BANK-C", "0.045"), "R3", "BANK-A", "BANK-C", "98.40");
        assertTrue(failedText(statement(List.of(other), List.of()).build()).contains("PairOnly"));
        TradeState open = repo("R1", "BANK-A", "BANK-B", "0.045");
        var notTerminated = value(open, "R1", "BANK-A", "BANK-B", "98.40").toBuilder()
            .setTermination(book(execution("R1", "BANK-A", "BANK-B", TUST, 10_366, "98.40", 1_000_000, "0.045", "1.02",
                "2026-11-09", "2026-11-09", "2026-11-16"), "2026-11-09")).build();
        assertTrue(failedText(statement(List.of(notTerminated), List.of()).build()).contains("Terminated"));
    }

    @Test
    void automaticEarlyTerminationTakesEffectOnTheDefaultDate() {
        assertEquals(List.of(), failures(notice(true, EOD)));
        assertEquals(List.of(), failures(notice(false, Date.of(2026, 11, 13))));
        assertTrue(failedText(notice(true, Date.of(2026, 11, 13))).contains("AutomaticOnTheDefaultDate"));
        assertTrue(failedText(notice(false, Date.of(2026, 11, 11))).contains("NotBeforeTheDefault"));
    }
}
