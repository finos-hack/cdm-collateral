package cdmx;

import cdm.base.staticdata.identifier.Identifier;
import cdm.event.common.BusinessEvent;
import cdm.event.common.Instruction;
import cdm.event.common.TradeState;
import cdm.event.common.functions.Create_PairOffInstruction;
import cdm.product.qualification.functions.Qualify_RepurchaseAgreement;
import cdmx.collateral.repo.RepoPairOffSettlement;
import cdmx.collateral.repo.functions.RepoIsPairOff;
import cdmx.collateral.repo.functions.RepoPairOffEvent;
import cdmx.collateral.repo.functions.RepoPairOffMatches;
import cdmx.collateral.repo.functions.RepoPairOffNetAmount;
import cdmx.collateral.repo.functions.RepoRepurchasePrice;
import com.rosetta.model.lib.records.Date;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import static cdmx.Cdm.*;
import static cdmx.RepoTest.*;
import static org.junit.jupiter.api.Assertions.*;

/** The pair-off of two offsetting repos between BANK-A and BANK-B (task-repo-pair-off, wp-adr-repo-pair-off, defect D24):
 *  the cdm-ext event, its qualifier and the net cash of the paired repurchase legs. */
class PairOffTest {
    static final Date ON = Date.of(2026, 11, 16);

    static TradeState repo(String id, String seller, String buyer, long quantity, String rate, String repurchaseDate) {
        return book(execution(id, seller, buyer, TUST, quantity, "98.40", 1_000_000, rate, "1.02",
            "2026-11-09", "2026-11-09", repurchaseDate), "2026-11-09").getAfter().get(0);
    }

    static TradeState aToB() {
        return repo("REPO-1", "BANK-A", "BANK-B", 10_366, "0.045", "2026-11-16");
    }

    static TradeState bToA() {
        return repo("REPO-2", "BANK-B", "BANK-A", 10_366, "0.04", "2026-11-16");
    }

    static Identifier pair() {
        return load(Identifier.class, o("issuer", o("@data", "BANK-A"), "assignedIdentifier", l(o("identifier", o("@data", "PAIR-1")))));
    }

    /** Not run through the reference resolver: both trades use the same scoped keys (price-1, quantity-1), and resolving
     *  the whole event binds the first trade's references to the second trade's values. */
    static BusinessEvent pairOff(TradeState a, TradeState b) {
        return fn(RepoPairOffEvent.class).evaluate(a, b, pair(), ON);
    }

    @Test
    void offsettingReposMatch() {
        assertTrue(fn(RepoPairOffMatches.class).evaluate(aToB(), bToA()));
    }

    @Test
    void reposInTheSameDirectionOrWithOtherTermsDoNotMatch() {
        var m = fn(RepoPairOffMatches.class);
        assertFalse(m.evaluate(aToB(), repo("REPO-3", "BANK-A", "BANK-B", 10_366, "0.04", "2026-11-16")));
        assertFalse(m.evaluate(aToB(), repo("REPO-3", "BANK-B", "BANK-A", 10_000, "0.04", "2026-11-16")));
        assertFalse(m.evaluate(aToB(), repo("REPO-3", "BANK-B", "BANK-A", 10_366, "0.04", "2026-11-17")));
        assertFalse(m.evaluate(aToB(), repo("REPO-3", "BANK-B", "BANK-C", 10_366, "0.04", "2026-11-16")));
    }

    @Test
    void thePairOffEventIsValidCdmAndKeepsBothTradesOpenWithOnePackage() {
        TradeState a = aToB(), b = bToA();
        BusinessEvent ev = pairOff(a, b);
        assertEquals("", failedText(ev));
        assertTrue(fn(RepoIsPairOff.class).evaluate(ev));
        assertEquals(2, ev.getAfter().size());
        for (TradeState after : ev.getAfter()) {
            assertNull(after.getState() == null ? null : after.getState().getClosedState());
            var pkg = after.getTrade().getExecutionDetails().getPackageReference();
            assertEquals("PAIR-1", pkg.getListId().getAssignedIdentifier().get(0).getIdentifier().getValue());
            assertEquals(2, pkg.getComponentId().size());
            assertEquals(cdm.event.common.ExecutionTypeEnum.OFF_FACILITY, after.getTrade().getExecutionDetails().getExecutionType());
        }
        assertEquals(a.getTrade().getProduct(), ev.getAfter().get(0).getTrade().getProduct());
        assertEquals(b.getTrade().getTradeLot(), ev.getAfter().get(1).getTrade().getTradeLot());
    }

    @Test
    void reposThatDoNotMatchCannotPairOff() {
        TradeState sameWay = repo("REPO-3", "BANK-A", "BANK-B", 10_366, "0.04", "2026-11-16");
        String why = rejected(() -> fn(RepoPairOffEvent.class).evaluate(aToB(), sameWay, pair(), ON));
        assertNotNull(why);
    }

    @Test
    void cdmsOwnPairOffFailsCdmsInstructionConditionDefectD24() {
        TradeState a = aToB(), b = bToA();
        List<? extends Instruction> ins = fn(Create_PairOffInstruction.class).evaluate(List.of(a, b), pair());
        BusinessEvent ev = resolved(BusinessEvent.class, fn(cdm.event.common.functions.Create_BusinessEvent.class)
            .evaluate(new ArrayList<>(ins), null, ON, null));
        assertTrue(failedText(ev).contains("NewTrade"), failedText(ev));
        assertFalse(fn(RepoIsPairOff.class).evaluate(ev));
    }

    @Test
    void aChangedTradeIsNotAPairOff() {
        BusinessEvent ev = pairOff(aToB(), bToA());
        var b = ev.toBuilder();
        b.getAfter().get(1).getTrade().getTradeLot().get(0).getPriceQuantity().get(1).getQuantity().getValue().setValue(BigDecimal.valueOf(9_000));
        assertFalse(fn(RepoIsPairOff.class).evaluate(b.build()));
    }

    @Test
    void eachPairedTradeStillQualifiesAsARepoWithOnePayoutGapG30() {
        for (TradeState after : pairOff(aToB(), bToA()).getAfter()) {
            assertEquals(1, after.getTrade().getProduct().getEconomicTerms().getPayout().size());
            assertNotNull(after.getTrade().getProduct().getEconomicTerms().getPayout().get(0).getInterestRatePayout());
            assertTrue(fn(Qualify_RepurchaseAgreement.class).evaluate(after.getTrade().getProduct().getEconomicTerms()));
        }
    }

    @Test
    void theNetCashIsTheDifferenceOfTheRepurchasePrices() {
        TradeState a = aToB(), b = bToA();
        // 1,000,000 x 4.5% x 7 / 360 = 875; 1,000,000 x 4% x 7 / 360 = 777.78 -> 778
        assertEquals(0, BigDecimal.valueOf(1_000_875).compareTo(fn(RepoRepurchasePrice.class).evaluate(a, 0).getValue()));
        assertEquals(0, BigDecimal.valueOf(1_000_778).compareTo(fn(RepoRepurchasePrice.class).evaluate(b, 0).getValue()));
        var net = fn(RepoPairOffNetAmount.class);
        assertEquals(0, BigDecimal.valueOf(97).compareTo(net.evaluate(a, b, BigDecimal.ZERO, BigDecimal.ZERO, 0)));
        assertEquals(0, BigDecimal.valueOf(-97).compareTo(net.evaluate(b, a, BigDecimal.ZERO, BigDecimal.ZERO, 0)));
        TradeState sameRate = repo("REPO-3", "BANK-B", "BANK-A", 10_366, "0.045", "2026-11-16");
        assertEquals(0, BigDecimal.ZERO.compareTo(net.evaluate(a, sameRate, BigDecimal.ZERO, BigDecimal.ZERO, 0)));
    }

    @Test
    void theSettlementCarriesBothRepurchasesAndTheNetCashOnlyWhenItIsNotZero() {
        BusinessEvent ev = pairOff(aToB(), bToA());
        Object pairOffTree = JSON.convertValue(JSON.valueToTree(ev), java.util.Map.class);
        Object r1 = JSON.convertValue(JSON.valueToTree(repurchaseEvent(ev.getAfter().get(0), ON)), java.util.Map.class);
        Object r2 = JSON.convertValue(JSON.valueToTree(repurchaseEvent(ev.getAfter().get(1), ON)), java.util.Map.class);
        RepoPairOffSettlement withCash = load(RepoPairOffSettlement.class, o("pairOff", pairOffTree, "repurchase", l(r1, r2), "netAmount", 97,
            "netCashTransfer", transfer(97, usd(), cash(), "BANK-A", "BANK-B", "2026-11-16")));
        assertEquals("", failedText(withCash));
        RepoPairOffSettlement noCashGiven = load(RepoPairOffSettlement.class, o("pairOff", pairOffTree, "repurchase", l(r1, r2), "netAmount", 97));
        assertTrue(failedText(noCashGiven).contains("NetCash"), failedText(noCashGiven));
        RepoPairOffSettlement zero = load(RepoPairOffSettlement.class, o("pairOff", pairOffTree, "repurchase", l(r1, r2), "netAmount", 0));
        assertEquals("", failedText(zero));
    }
}
