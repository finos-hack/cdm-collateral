package collateral;

import cdm.base.staticdata.party.Party;
import cdm.observable.asset.Money;
import cdm.product.collateral.CollateralInterestParameters;
import cdmx.collateral.interest.CashCollateralDay;
import cdmx.collateral.interest.CollateralInterestStatement;
import cdmx.collateral.interest.InterestAccrualDay;
import cdmx.collateral.interest.functions.Create_CollateralInterestStatement;
import com.rosetta.model.lib.records.Date;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static collateral.CdmRuntime.o;

/**
 * The CDM interest statement on cash collateral for one Interest Period (flow-interest-on-cash; cdm-ext
 * {@code cdmx.collateral.interest}, gap G17). The secured party holds the pledgor's tUSD; {@code
 * Create_CollateralInterestStatement} accrues interest on it day by day under the agreement's CDM
 * {@code CollateralInterestParameters}. The statement's Rune JSON is the payload whose keccak-256 the control contract
 * records with the interest (wp-adr-cdm-payload-carrier).
 *
 * Prototype elections ({@link #AGREEMENT}): USD, a floating rate with no spread, negative interest passed on, ACT/360,
 * rounded to whole USD at period end (tUSD has no decimals, so the statement's transfer amount is the on-chain amount),
 * Transfer handling, and an Interest Amount may be netted with margin calls (netInterestWithMarginCalls, for
 * flow-settlement-netting; held amounts only, task-csa-settlement-netting). Interim reduction (project owner, 2026-11-06; task-sme-interest-daily-balances): one observed rate
 * for the whole period, and every day's balance is the tUSD in escrow when the secured party states the interest.
 */
public final class CdmInterest {
    public static final String CURRENCY = "USD";
    public static final int MAX_DAYS = 366;

    /** The prototype agreement's interest elections, as CDM CollateralInterestParameters (Rune JSON). */
    public static final Map<String, Object> AGREEMENT = o(
            "currency", CURRENCY,
            "interestCalculationParameters", o(
                    "floatingRate", o("negativeInterest", true, "compressibleSpread", false),
                    "inBaseCurrency", false, "dayCountFraction", "ACT/360",
                    "rounding", o("roundingDirection", "Nearest", "precision", 0), "roundingFrequency", "PeriodEnd"),
            "interestHandlingParameters", o(
                    "interestPaymentHandling", "Transfer", "netPostedAndHeldInterest", false, "netInterestWithMarginCalls", true,
                    "includeAccrualInMarginCalc", false, "onFullReturn", true, "onPartialReturn", false));

    public final CollateralInterestStatement statement;
    public final String json;
    public final String hash;

    private CdmInterest(CollateralInterestStatement statement) {
        CdmRuntime.validate(statement);
        this.statement = statement;
        this.json = CdmRuntime.toJson(statement);
        this.hash = Cdm.keccakHex(json);
    }

    static CollateralInterestParameters parameters() {
        return CdmRuntime.load(CollateralInterestParameters.class, AGREEMENT);
    }

    private static CollateralInterestStatement run(Party securedParty, Party pledgor, Date start, Date end, List<CashCollateralDay> days) {
        return CdmRuntime.fn(Create_CollateralInterestStatement.class).evaluate(parameters(), securedParty, pledgor, start, end, days, null, null);
    }

    /** Build and validate the statement: every day of [start, end) has balanceUsd at observedRate (a decimal, 4.3% = 0.043). */
    public static CdmInterest build(String securedParty, String pledgor, LocalDate start, LocalDate end, long balanceUsd, BigDecimal observedRate) {
        if (!end.isAfter(start)) throw new IllegalArgumentException("the period end must be after its start");
        if (start.plusDays(MAX_DAYS).isBefore(end)) throw new IllegalArgumentException("an Interest Period is at most " + MAX_DAYS + " days here");
        List<CashCollateralDay> days = new ArrayList<>();
        for (LocalDate d = start; d.isBefore(end); d = d.plusDays(1))
            days.add(CdmRuntime.load(CashCollateralDay.class, o("date", d.toString(), "balance", o("value", balanceUsd,
                    "unit", o("currency", o("@data", CURRENCY))), "observedRate", observedRate)));
        return new CdmInterest(run(CdmCloseOut.party(securedParty), CdmCloseOut.party(pledgor), Date.of(start), Date.of(end), days));
    }

    /**
     * Check a statement received through the payload store: it parses as a CollateralInterestStatement, passes CDM
     * validation, and Create_CollateralInterestStatement under the agreement's parameters over the statement's own days
     * (date, balance, observed rate) gives the same statement. Returns the parsed statement; throws otherwise.
     */
    public static CollateralInterestStatement verify(String json) {
        CollateralInterestStatement s;
        try {
            s = CdmRuntime.JSON.readValue(json, CollateralInterestStatement.class);
        } catch (Exception e) {
            throw new IllegalStateException("not a CollateralInterestStatement: " + e.getMessage(), e);
        }
        CdmRuntime.validate(s);
        List<CashCollateralDay> days = new ArrayList<>();
        for (InterestAccrualDay a : s.getAccrual())
            days.add(CashCollateralDay.builder().setDate(a.getDate()).setBalance(a.getBalance()).setObservedRate(a.getObservedRate()).build());
        CollateralInterestStatement again = run(s.getSecuredParty(), s.getPledgor(), s.getPeriodStartDate(), s.getPeriodEndDate(), days);
        if (!again.equals(s)) throw new IllegalStateException("Create_CollateralInterestStatement over the statement's days gives a different statement");
        return s;
    }

    /** Whole-unit value of a CDM Money (the prototype rounds to whole USD). */
    public static long usd(Money m) {
        return m.getValue().setScale(0, java.math.RoundingMode.UNNECESSARY).longValueExact();
    }
}
