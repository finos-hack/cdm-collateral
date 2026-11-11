package collateral;

import cdm.event.common.TradeState;
import cdmx.collateral.gmsla.GmslaRecallNotice;
import cdmx.collateral.gmsla.GmslaRecallWithdrawal;
import cdmx.collateral.gmsla.functions.GmslaRecallOffset;
import cdmx.collateral.gmsla.functions.GmslaRecallOverdue;
import cdmx.collateral.gmsla.functions.GmslaRecallSettlementDate;
import com.rosetta.model.lib.records.Date;

import java.time.LocalDate;

import static collateral.CdmRuntime.o;

/**
 * The recall of loaned securities under the GMSLA (task-gmsla-recall, wp-adr-gmsla-recall): cdm-ext GmslaRecallNotice
 * and GmslaRecallWithdrawal. The lender builds a notice from the loan's trade in force and the business date; the
 * borrower rebuilds it from the trade at the notice's trade hash. The rules are the assumptions listed in
 * task-sme-gmsla-recall-rules.
 */
public final class CdmRecall {
    public record Notice(GmslaRecallNotice notice, String json, String hash) {
        /** The intended settlement date as the contract holds it, YYYYMMDD. */
        public int settlementDate() {
            return yyyymmdd(notice.getIntendedSettlementDate().toLocalDate());
        }
    }

    public record Withdrawal(GmslaRecallWithdrawal withdrawal, String json, String hash) {}

    private CdmRecall() {}

    public static int yyyymmdd(LocalDate d) {
        return d.getYear() * 10_000 + d.getMonthValue() * 100 + d.getDayOfMonth();
    }

    public static LocalDate fromYyyymmdd(int v) {
        return LocalDate.of(v / 10_000, v / 100 % 100, v % 100);
    }

    /** The business days from a notice to its settlement, from the loan's RecallProvision; throws when not recallable. */
    public static int offset(TradeState ts) {
        Integer n = CdmRuntime.fn(GmslaRecallOffset.class).evaluate(ts);
        if (n == null) throw new IllegalStateException("the loan's trade has no RecallProvision: it is not recallable");
        return n;
    }

    public static LocalDate settlementDate(LocalDate noticeDate, int offset) {
        return CdmRuntime.fn(GmslaRecallSettlementDate.class).evaluate(Date.of(noticeDate), offset).toLocalDate();
    }

    /** The notice recalling `quantity` of the loan whose trade in force is `ts` (at `tradeHash`), given on `noticeDate`. */
    public static Notice notice(TradeState ts, String tradeHash, long quantity, LocalDate noticeDate) {
        CdmLoan.Terms t = CdmLoan.terms(ts, null);
        int off = offset(ts);
        GmslaRecallNotice n = CdmRuntime.load(GmslaRecallNotice.class, o(
                "loanId", t.loanId(), "tradeHash", tradeHash, "lender", t.lender(), "borrower", t.borrower(), "security", t.isin(),
                "quantityOutstanding", t.quantity(), "quantity", quantity, "noticeDate", noticeDate.toString(),
                "settlementOffset", off, "intendedSettlementDate", settlementDate(noticeDate, off).toString()));
        CdmRuntime.validate(n);
        String json = CdmRuntime.toJson(n);
        return new Notice(n, json, Cdm.keccakHex(json));
    }

    /** A published notice, parsed; its CDM conditions are checked by {@link #notice} on the rebuild. */
    public static GmslaRecallNotice parse(String json) {
        try {
            return CdmRuntime.JSON.readValue(json, GmslaRecallNotice.class);
        } catch (Exception e) {
            throw new IllegalStateException("not a GmslaRecallNotice: " + e.getMessage(), e);
        }
    }

    /** The borrower's check: rebuilding the notice from the trade at its trade hash, its quantity and its date gives the
     *  same document. */
    public static Notice verify(String json, TradeState tradeAtNotice) {
        GmslaRecallNotice n = parse(json);
        Notice again = notice(tradeAtNotice, n.getTradeHash(), n.getQuantity().longValueExact(), n.getNoticeDate().toLocalDate());
        if (!again.hash().equalsIgnoreCase(Cdm.keccakHex(json))) throw new IllegalStateException("the recall notice does not rebuild to the same document");
        return again;
    }

    public static Withdrawal withdrawal(GmslaRecallNotice n, String noticeHash, LocalDate date) {
        GmslaRecallWithdrawal w = CdmRuntime.load(GmslaRecallWithdrawal.class, o(
                "loanId", n.getLoanId(), "notice", noticeHash, "lender", n.getLender(), "borrower", n.getBorrower(), "withdrawalDate", date.toString()));
        CdmRuntime.validate(w);
        String json = CdmRuntime.toJson(w);
        return new Withdrawal(w, json, Cdm.keccakHex(json));
    }

    public static boolean overdue(LocalDate intendedSettlementDate, LocalDate businessDate) {
        return CdmRuntime.fn(GmslaRecallOverdue.class).evaluate(Date.of(intendedSettlementDate), Date.of(businessDate));
    }
}
