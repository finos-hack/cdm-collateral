package collateral;

import cdmx.collateral.gmsla.GmslaMarkStatement;
import cdmx.collateral.gmsla.GmslaMarkedLoan;
import cdmx.collateral.gmsla.functions.GmslaLoanCollateralValue;
import cdmx.collateral.gmsla.functions.GmslaLoanExposure;
import cdmx.collateral.gmsla.functions.GmslaLoanRequirement;
import cdmx.collateral.gmsla.functions.GmslaMarginCallAmount;
import cdmx.collateral.gmsla.functions.GmslaNetExposure;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static collateral.CdmRuntime.o;

/**
 * The aggregated mark of a pair's securities loans under GMSLA paragraph 5.4 (task-gmsla-marking,
 * wp-adr-gmsla-marking): cdm-ext GmslaMarkStatement, stated for the calling party. Both parties build it from the chain
 * and the feed, so the called party's rebuild hashes the same for the same loans, prices, margin held and business date.
 * The rules are the assumptions listed in task-sme-gmsla-marking-rules.
 */
public final class CdmGmslaMark {
    /** One open loan as the chain and the loan's trade give it, with the feed prices. collateral is the collateral's
     *  ISIN, or the Base Currency for cash (price 1). */
    public record LoanInput(String loanId, String tradeHash, String lender, String borrower, String isin, long quantity,
                            BigDecimal price, BigDecimal margin, String collateral, long collateralAmount, BigDecimal collateralPrice) {}

    public record Statement(GmslaMarkStatement statement, String json, String hash) {}

    private CdmGmslaMark() {}

    private static GmslaMarkedLoan marked(LoanInput l) {
        BigDecimal q = BigDecimal.valueOf(l.quantity()), c = BigDecimal.valueOf(l.collateralAmount());
        return CdmRuntime.load(GmslaMarkedLoan.class, o(
                "loanId", l.loanId(), "tradeHash", l.tradeHash(), "lender", l.lender(), "borrower", l.borrower(),
                "security", l.isin(), "quantity", q, "price", l.price(), "marketValue", q.multiply(l.price()), "margin", l.margin(),
                "requirement", CdmRuntime.fn(GmslaLoanRequirement.class).evaluate(q, l.price(), l.margin()),
                "collateral", l.collateral(), "collateralAmount", c, "collateralPrice", l.collateralPrice(),
                "collateralValue", CdmRuntime.fn(GmslaLoanCollateralValue.class).evaluate(c, l.collateralPrice())));
    }

    /** The mark stated for {@code party}, over the pair's open loans in loan identifier order. */
    public static Statement build(String party, String counterparty, LocalDate businessDate, String baseCurrency,
                                  List<LoanInput> loans, BigDecimal netMarginHeld, long minimumTransferAmount) {
        List<LoanInput> sorted = new ArrayList<>(loans);
        sorted.sort(Comparator.comparing(l -> l.loanId().toLowerCase()));
        List<GmslaMarkedLoan> marked = new ArrayList<>();
        for (LoanInput l : sorted) marked.add(marked(l));
        BigDecimal net = CdmRuntime.fn(GmslaNetExposure.class).evaluate(marked, party, netMarginHeld);
        BigDecimal mta = BigDecimal.valueOf(minimumTransferAmount);
        BigDecimal call = CdmRuntime.fn(GmslaMarginCallAmount.class).evaluate(net, mta);
        List<Object> loanDocs = new ArrayList<>();
        for (GmslaMarkedLoan m : marked) loanDocs.add(CdmRuntime.JSON.convertValue(m, Map.class));
        GmslaMarkStatement s = CdmRuntime.load(GmslaMarkStatement.class, o(
                "party", party, "counterparty", counterparty, "businessDate", businessDate.toString(), "baseCurrency", baseCurrency,
                "loan", loanDocs, "netMarginHeld", netMarginHeld, "netExposure", net, "minimumTransferAmount", mta, "callAmount", call));
        CdmRuntime.validate(s);
        String json = CdmRuntime.toJson(s);
        return new Statement(s, json, Cdm.keccakHex(json));
    }

    /** A published statement, valid: its figures follow from its loans (cdm-ext conditions). */
    public static GmslaMarkStatement verify(String json) {
        GmslaMarkStatement s;
        try {
            s = CdmRuntime.JSON.readValue(json, GmslaMarkStatement.class);
        } catch (Exception ex) {
            throw new IllegalStateException("not a GmslaMarkStatement: " + ex.getMessage(), ex);
        }
        CdmRuntime.validate(s);
        return s;
    }

    /** The whole-USD call amount; 0 when the mark allows no call. */
    public static long callAmount(GmslaMarkStatement s) {
        return s.getCallAmount().longValueExact();
    }

    /** One loan's exposure from the statement party's side. */
    public static BigDecimal exposure(GmslaMarkedLoan l, String party) {
        return CdmRuntime.fn(GmslaLoanExposure.class).evaluate(l, party);
    }

    /** The agreement an anchored IssueCall document names (MasterAgreementTypeEnum: GMRA, GMSLA), or null for a CSA call. */
    public static String agreementOf(String issueJson) {
        try {
            String v = CdmRuntime.JSON.readTree(issueJson).findPath("masterAgreementType").toString();
            return v.contains("GMSLA") ? "GMSLA" : v.contains("GMRA") ? "GMRA" : null;
        } catch (Exception e) {
            throw new IllegalStateException("not a JSON document: " + e.getMessage(), e);
        }
    }

    /** The hash of the GmslaMarkStatement an IssueCall document carries, or null. */
    public static String markStatementOf(String issueJson) {
        try {
            var node = CdmRuntime.JSON.readTree(issueJson).findPath("markStatement");
            return node.isMissingNode() || node.isNull() ? null : node.asText();
        } catch (Exception e) {
            throw new IllegalStateException("not a JSON document: " + e.getMessage(), e);
        }
    }

    /** The view of a statement for the console. */
    public static Map<String, Object> view(GmslaMarkStatement s) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("party", s.getParty());
        m.put("businessDate", s.getBusinessDate().toString());
        List<Map<String, Object>> loans = new ArrayList<>();
        for (GmslaMarkedLoan l : s.getLoan() == null ? List.<GmslaMarkedLoan>of() : s.getLoan()) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("loanId", l.getLoanId());
            r.put("role", l.getLender().equals(s.getParty()) ? "lender" : "borrower");
            r.put("quantity", l.getQuantity().toPlainString());
            r.put("price", l.getPrice().stripTrailingZeros().toPlainString());
            r.put("marketValueUsd", usd(l.getMarketValue()));
            r.put("marginPercent", l.getMargin().movePointRight(2).stripTrailingZeros().toPlainString());
            r.put("requirementUsd", usd(l.getRequirement()));
            r.put("collateralValueUsd", usd(l.getCollateralValue()));
            r.put("exposureUsd", usd(exposure(l, s.getParty())));
            loans.add(r);
        }
        m.put("loans", loans);
        m.put("netMarginHeldUsd", usd(s.getNetMarginHeld()));
        m.put("netExposureUsd", usd(s.getNetExposure()));
        m.put("minimumTransferAmountUsd", usd(s.getMinimumTransferAmount()));
        m.put("callableUsd", String.valueOf(callAmount(s)));
        return m;
    }

    private static String usd(BigDecimal v) {
        return v.setScale(2, java.math.RoundingMode.HALF_UP).toPlainString();
    }
}
