package collateral;

import cdm.event.common.BusinessEvent;
import cdm.event.common.CollateralPortfolio;
import cdm.event.common.Instruction;
import cdm.event.common.TradeState;
import cdm.event.common.functions.Create_BusinessEvent;
import cdm.event.common.functions.Create_SubstitutionPrimitiveInstruction;
import cdm.event.qualification.functions.Qualify_Substitution;
import cdm.observable.asset.PriceQuantity;
import cdmx.collateral.gmsla.GmslaLoanSubstitution;
import cdmx.collateral.gmsla.GmslaLoanTerms;
import cdmx.collateral.gmsla.functions.GmslaIsSubstitution;
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
 * The borrower's substitution of all the non-cash collateral of a securities loan (task-gmsla-substitution,
 * wp-adr-gmsla-substitution). The substitute quantity is the loan's required collateral at the substitution date's feed
 * prices (cdm-ext GmslaRequiredCollateral). The event is CDM's Create_SubstitutionPrimitiveInstruction over the loan,
 * with the loaned lot restated (its priceQuantity input is required) and the loan's own effective date (so the fee
 * accrual does not restart), and Create_BusinessEvent; it is qualified by cdm-ext GmslaIsSubstitution, because CDM's
 * Qualify_Substitution cannot be true for a loan (defect D22). The document is cdm-ext GmslaLoanSubstitution.
 */
public final class CdmLoanSubstitution {
    private CdmLoanSubstitution() {}

    /** A substitution document: the substitute's ISIN and quantity, and the collateral held that goes back. */
    public record Substitution(GmslaLoanSubstitution doc, String json, String hash, String isin, long quantity, long returned) {
        public TradeState after() {
            return doc.getSubstitutionEvent().getAfter().get(0);
        }
    }

    /** The collateral portfolio the loan holds with the substitute: the portfolio a new loan with it would have. */
    @SuppressWarnings("unchecked")
    static CollateralPortfolio portfolio(CdmLoan.Terms t) {
        Map<String, Object> product = (Map<String, Object>) CdmLoan.execution(t).get("product");
        Map<String, Object> economicTerms = (Map<String, Object>) product.get("economicTerms");
        Map<String, Object> collateral = (Map<String, Object>) economicTerms.get("collateral");
        List<Object> portfolios = (List<Object>) collateral.get("collateralPortfolio");
        return CdmRuntime.load(CollateralPortfolio.class, (Map<String, Object>) portfolios.get(0));
    }

    /** CDM's substitution event over the loan in force: the new portfolio, the loaned lot restated, the effective date kept. */
    static BusinessEvent event(TradeState before, CdmLoan.Terms t, CdmLoan.Terms substituted, LocalDate date) {
        PriceQuantity lot = CdmRuntime.load(PriceQuantity.class, o(
                "price", l(o("value", t.price(), "unit", o("currency", o("@data", "USD")), "perUnitOf", o("financialUnit", "Share"), "priceType", "AssetPrice")),
                "quantity", o("value", t.quantity(), "unit", o("financialUnit", "Share"))));
        var pi = CdmRuntime.fn(Create_SubstitutionPrimitiveInstruction.class).evaluate(before,
                before.getTrade().getProduct().getEconomicTerms().getEffectiveDate(), portfolio(substituted), List.of(lot));
        Instruction i = Instruction.builder().setBeforeValue(before).setPrimitiveInstruction(pi).build();
        return CdmRepo.resolved(BusinessEvent.class,
                CdmRuntime.fn(Create_BusinessEvent.class).evaluate(new ArrayList<>(List.of(i)), null, Date.of(date), null));
    }

    /** The substitution of the loan's collateral with `isin` on `date`, at the feed prices of the loaned security and
     *  the substitute. */
    public static Substitution substitute(TradeState before, GmslaLoanTerms lt, String isin, BigDecimal loanedPrice,
                                          BigDecimal substitutePrice, LocalDate date) {
        CdmLoan.Terms t = CdmLoan.terms(before, lt);
        if (t.cash()) throw new IllegalArgumentException("only non-cash collateral is substituted");
        if (isin.equals(t.collateralIsin())) throw new IllegalArgumentException("the substitute is the current collateral");
        if (isin.equals(t.isin())) throw new IllegalArgumentException("the substitute is the loaned security");
        long quantity = CdmLoan.requiredCollateral(t.quantity(), loanedPrice, t.margin(), substitutePrice);
        CdmLoan.Terms substituted = new CdmLoan.Terms(t.loanId(), t.lender(), t.borrower(), t.isin(), t.quantity(), t.price(),
                isin, quantity, t.margin(), t.rebateRate(), t.feeRate(), t.tradeDate(), t.termDate());
        BusinessEvent ev = event(before, t, substituted, date);
        CdmRuntime.validate(ev);
        if (!CdmRuntime.fn(GmslaIsSubstitution.class).evaluate(ev))
            throw new IllegalStateException("the event does not qualify as a GMSLA substitution");
        Map<String, Object> share = o("financialUnit", "Share");
        Map<String, Object> doc = o("trade", CdmLoan.tree(before), "terms", CdmLoan.tree(lt),
                "loanedPrice", loanedPrice, "substitutePrice", substitutePrice, "substitutionEvent", CdmLoan.tree(ev),
                "collateralIn", CdmLoan.transfer(quantity, share, CdmRepo.security(isin), t.borrower(), t.lender(), date),
                "collateralOut", CdmLoan.transfer(t.collateralAmount(), share, CdmRepo.security(t.collateralIsin()), t.lender(), t.borrower(), date));
        GmslaLoanSubstitution s = CdmRuntime.load(GmslaLoanSubstitution.class, doc);
        CdmRuntime.validate(s);
        String json = CdmRuntime.toJson(s);
        return new Substitution(s, json, Cdm.keccakHex(json), isin, quantity, t.collateralAmount());
    }

    /** The lender's check of a substitution document: rebuilding it from its own trade, terms, substitute, prices and
     *  date gives the same document. Returns the substitution; throws otherwise. The caller checks the trade, the prices
     *  and the date against its own. */
    public static Substitution verify(String json) {
        GmslaLoanSubstitution s;
        try {
            s = CdmRuntime.JSON.readValue(json, GmslaLoanSubstitution.class);
        } catch (Exception e) {
            throw new IllegalStateException("not a GmslaLoanSubstitution: " + e.getMessage(), e);
        }
        if (s.getSubstitutionEvent() == null || s.getCollateralIn() == null) throw new IllegalStateException("the document is not a substitution");
        String isin = CdmLoan.firstIsin(CdmRuntime.JSON.valueToTree(s.getCollateralIn().getAsset()));
        Substitution again = substitute(s.getTrade(), s.getTerms(), isin, s.getLoanedPrice(), s.getSubstitutePrice(),
                s.getSubstitutionEvent().getEventDate().toLocalDate());
        if (!again.hash().equalsIgnoreCase(Cdm.keccakHex(json))) throw new IllegalStateException("the substitution does not rebuild to the same document");
        return again;
    }

    /** A view of a substitution for the console. */
    public static Map<String, Object> view(Substitution s) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("isin", s.isin());
        m.put("quantity", String.valueOf(s.quantity()));
        m.put("returned", String.valueOf(s.returned()));
        m.put("date", s.doc().getSubstitutionEvent().getEventDate().toString());
        m.put("qualification", "GmslaIsSubstitution");
        m.put("cdmQualifySubstitution", CdmRuntime.fn(Qualify_Substitution.class).evaluate(s.doc().getSubstitutionEvent()));
        return m;
    }
}
