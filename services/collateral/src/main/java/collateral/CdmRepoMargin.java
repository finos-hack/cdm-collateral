package collateral;

import cdm.event.common.TradeState;
import cdmx.collateral.gmra.GmraElections;
import cdmx.collateral.gmra.NetMarginInterest;
import cdmx.collateral.repo.RepoNetMarginInterestStatement;
import cdmx.collateral.repo.functions.RepoMarginCallAmount;
import cdmx.collateral.repo.functions.RepoMarginRatio;
import cdmx.collateral.repo.functions.RepoNetExposure;
import cdmx.collateral.repo.functions.RepoNetMarginInterest;
import cdmx.collateral.repo.functions.RepoTransactionExposure;
import com.rosetta.model.lib.records.Date;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

import static collateral.CdmRuntime.o;

/**
 * Margin maintenance on repos under the GMRA (task-repo-margin-maintenance, wp-adr-repo-margin-maintenance): cdm-ext's
 * exposure, call amount and Net Margin interest functions, and the Net Margin interest statement. The rules are the
 * assumptions listed in task-sme-repo-margin-exposure.
 */
public final class CdmRepoMargin {
    /** tUSD has no decimals. */
    static final int CASH_PRECISION = 0;

    /** A Net Margin interest statement and its hash. */
    public record Statement(RepoNetMarginInterestStatement statement, String json, String hash) {}

    private CdmRepoMargin() {}

    /** The Margin Ratio a Transaction's exposure uses, by the GMRA's marginRatioBasis election. */
    public static BigDecimal marginRatio(TradeState ts, GmraElections e) {
        return CdmRuntime.fn(RepoMarginRatio.class).evaluate(ts, e);
    }

    /** A Transaction's exposure from one party's side: positive when that party is exposed. The Buyer is exposed when
     *  RepoTransactionExposure is positive, so the Seller's side is its negative. */
    public static BigDecimal exposure(TradeState ts, GmraElections e, LocalDate date, long quantity, BigDecimal price, boolean mySideIsSeller) {
        BigDecimal ratio = CdmRuntime.fn(RepoMarginRatio.class).evaluate(ts, e);
        BigDecimal buyerSide = CdmRuntime.fn(RepoTransactionExposure.class).evaluate(ts, Date.of(date), BigDecimal.valueOf(quantity), price, ratio);
        return mySideIsSeller ? buyerSide.negate() : buyerSide;
    }

    public static BigDecimal netExposure(List<BigDecimal> exposures, BigDecimal netMarginHeld) {
        return CdmRuntime.fn(RepoNetExposure.class).evaluate(new ArrayList<>(exposures), netMarginHeld);
    }

    /** The amount a party may call, in whole USD rounded down so a call never exceeds the Net Exposure; 0 when none. */
    public static long callAmount(BigDecimal netExposure, long minimumTransferAmount) {
        return CdmRuntime.fn(RepoMarginCallAmount.class).evaluate(netExposure, BigDecimal.valueOf(minimumTransferAmount))
                .setScale(0, RoundingMode.DOWN).longValueExact();
    }

    /** Whether an anchored IssueCall document is a call under the GMRA (Cdm.issue with its gmra flag). */
    public static boolean isGmraIssue(String json) {
        try {
            return CdmRuntime.JSON.readTree(json).findPath("masterAgreementType").toString().contains("GMRA");
        } catch (Exception e) {
            throw new IllegalStateException("not a JSON document: " + e.getMessage(), e);
        }
    }

    /** Whether an anchored interest document is a Net Margin statement, which the CSA interest path does not read. */
    public static boolean isStatement(String json) {
        try {
            return CdmRuntime.JSON.readTree(json).has("cashMargin");
        } catch (Exception e) {
            return false;
        }
    }

    private static BigDecimal interest(long cashMargin, BigDecimal observedRate, int days, NetMarginInterest terms) {
        return CdmRuntime.fn(RepoNetMarginInterest.class).evaluate(BigDecimal.valueOf(cashMargin), observedRate, days, terms, CASH_PRECISION);
    }

    /** The holder's statement of the interest on the Cash Margin it holds for one period, at one observed rate. */
    public static Statement build(String payer, String receiver, LocalDate start, LocalDate end, long cashMargin, BigDecimal observedRate, GmraElections e) {
        int days = Math.toIntExact(ChronoUnit.DAYS.between(start, end));
        RepoNetMarginInterestStatement s = CdmRuntime.load(RepoNetMarginInterestStatement.class, o(
                "payer", payer, "receiver", receiver, "periodStartDate", start.toString(), "periodEndDate", end.toString(),
                "days", days, "cashMargin", cashMargin, "observedRate", observedRate, "spread", e.getNetMarginInterest().getSpread(),
                "interest", interest(cashMargin, observedRate, days, e.getNetMarginInterest())));
        CdmRuntime.validate(s);
        String json = CdmRuntime.toJson(s);
        return new Statement(s, json, Cdm.keccakHex(json));
    }

    /** The statement in a document, valid and with the interest RepoNetMarginInterest gives over its own inputs. */
    public static RepoNetMarginInterestStatement verify(String json, GmraElections e) {
        RepoNetMarginInterestStatement s;
        try {
            s = CdmRuntime.JSON.readValue(json, RepoNetMarginInterestStatement.class);
        } catch (Exception ex) {
            throw new IllegalStateException("not a RepoNetMarginInterestStatement: " + ex.getMessage(), ex);
        }
        CdmRuntime.validate(s);
        long cash = s.getCashMargin().longValueExact();
        BigDecimal again = interest(cash, s.getObservedRate(), s.getDays(), e.getNetMarginInterest());
        if (again.compareTo(s.getInterest()) != 0) throw new IllegalStateException("the interest is not RepoNetMarginInterest over the statement's inputs");
        return s;
    }

    /** The whole-USD amount of a statement. */
    public static long amount(RepoNetMarginInterestStatement s) {
        return s.getInterest().longValueExact();
    }

    /** The value of one asset at the feed price with no haircut (wp-adr-repo-margin-maintenance), in USD. */
    public static BigDecimal value(long quantity, BigDecimal price) {
        return price.multiply(BigDecimal.valueOf(quantity));
    }
}
