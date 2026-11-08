package cdmx;

import cdm.event.common.BusinessEvent;
import cdm.event.common.Instruction;
import cdm.event.common.TradeState;
import cdm.event.common.functions.Create_BusinessEvent;
import cdm.event.common.functions.ResolveRepurchaseTransferInstruction;
import cdm.product.qualification.functions.Qualify_RepurchaseAgreement;
import cdmx.collateral.repo.RepoSettlement;
import cdmx.collateral.repo.functions.RepoPriceDifferential;
import cdmx.collateral.repo.functions.RepoPurchasePrice;
import cdmx.collateral.repo.functions.RepoPurchaseQuantity;
import cdmx.collateral.repo.functions.RepoRepurchasePrice;
import com.regnosys.rosetta.common.hashing.ReferenceConfig;
import com.regnosys.rosetta.common.hashing.ReferenceResolverProcessStep;
import com.rosetta.model.lib.records.Date;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static cdmx.Cdm.*;
import static org.junit.jupiter.api.Assertions.*;

/** A term repo between BANK-A (seller, Party1) and BANK-B (buyer, Party2) and its prices (task-repo-purchase-repurchase,
 *  wp-adr-repo-purchase-repurchase). The trade is built by CDM's Create_BusinessEvent from an execution instruction
 *  shaped like CDM's repo-execution-func-input.json, with the fields CDM 7.7.0 validation requires. */
class RepoTest {
    static final String TUST = "US912810TM60";

    static Map<String, Object> party(String name) {
        return o("partyId", l(o("identifier", o("@data", name))), "name", o("@data", name));
    }

    static Map<String, Object> security(String isin) {
        return o("identifier", l(o("identifier", o("@data", isin), "identifierType", "ISIN")),
            "partyRole", o("partyReference", party("US-TREASURY"), "role", "Issuer"),
            "securityType", "Debt", "assetType", "Security");
    }

    static Map<String, Object> usd() {
        return o("currency", o("@data", "USD"));
    }

    static Map<String, Object> date(String d) {
        return o("adjustableDate", o("unadjustedDate", d, "dateAdjustments", o("businessDayConvention", "NONE")));
    }

    /** The execution instruction: seller sells quantity units of the security at price for purchasePrice, rate per annum. */
    static Map<String, Object> execution(String tradeId, String seller, String buyer, String isin, long quantity, String price,
                                         long purchasePrice, String rate, String marginRatio, String tradeDate,
                                         String purchaseDate, String repurchaseDate) {
        Map<String, Object> sec = security(isin);
        Map<String, Object> assetPayout = o("@type", "cdm.product.template.AssetPayout",
            "payerReceiver", o("payer", "Party2", "receiver", "Party1"),
            "priceQuantity", o("quantitySchedule", o("@ref:scoped", "quantity-2")),
            "assetLeg", l(o("settlementDate", date(purchaseDate), "deliveryMethod", "DeliveryVersusPayment"),
                o("settlementDate", date(repurchaseDate), "deliveryMethod", "DeliveryVersusPayment")),
            "underlier", withType(sec),
            "settlementTerms", o("settlementType", "Physical", "settlementCurrency", o("@data", "USD"),
                "transferSettlementType", "DeliveryVersusPayment",
                "securitySettlementCentre", "SecuritySettlementCentre", "cashSettlementCentre", "CashSettlementCentre"));
        Map<String, Object> product = o(
            "taxonomy", l(o("source", "CFI", "value", o("name", o("@data", "LRSTXD")))),
            "economicTerms", o(
                "effectiveDate", date(purchaseDate),
                "terminationDate", date(repurchaseDate),
                "payout", l(o("@type", "cdm.product.asset.InterestRatePayout",
                    "payerReceiver", o("payer", "Party1", "receiver", "Party2"),
                    "priceQuantity", o("quantitySchedule", o("@ref:scoped", "quantity-1")),
                    "principalPayment", o("initialPayment", true, "finalPayment", true, "intermediatePayment", false),
                    "rateSpecification", o("@type", "cdm.product.asset.FixedRateSpecification",
                        "rateSchedule", o("price", o("@ref:scoped", "price-1"))),
                    "dayCountFraction", o("@data", "ACT/360"))),
                "collateral", o(
                    "collateralPortfolio", l(o("collateralPosition", l(o(
                        "priceQuantity", l(o("quantity", o("value", quantity, "unit", o("financialUnit", "Share")))),
                        "product", o("@type", "cdm.product.template.TransferableProduct",
                            "asset", withType(sec),
                            "productPartyRole", "Party1",
                            "economicTerms", o("payout", l(assetPayout))))))),
                    "collateralProvisions", o("collateralType", "NonCash",
                        "eligibleCollateral", l(o(
                            "collateralCriteria", o("@type", "cdm.base.staticdata.asset.common.AssetIdentifier", "identifier", o("@data", isin), "identifierType", "ISIN"),
                            "treatment", o("isIncluded", true, "valuationTreatment", o("marginPercentage", new BigDecimal(marginRatio)))))))));
        return o("product", product,
            "priceQuantity", l(
                o("price", l(o("@key:scoped", "price-1", "value", new BigDecimal(rate), "unit", usd(), "perUnitOf", usd(), "priceType", "InterestRate")),
                    "quantity", o("@key:scoped", "quantity-1", "value", purchasePrice, "unit", usd())),
                o("price", l(o("@key:scoped", "price-2", "value", new BigDecimal(price), "unit", usd(), "perUnitOf", o("financialUnit", "Share"), "priceType", "AssetPrice")),
                    "quantity", o("@key:scoped", "quantity-2", "value", quantity, "unit", o("financialUnit", "Share")),
                    "observable", o("@key:scoped", "observable-1", "@data", withType(sec)))),
            "counterparty", l(o("role", "Party1", "partyReference", party(seller)), o("role", "Party2", "partyReference", party(buyer))),
            "parties", l(party(seller), party(buyer)),
            "partyRoles", l(o("partyReference", party(seller), "role", "Seller"), o("partyReference", party(buyer), "role", "Buyer")),
            "executionDetails", o("executionType", "OffFacility"),
            "tradeDate", o("@data", tradeDate),
            "tradeIdentifier", l(o("issuer", o("@data", seller), "assignedIdentifier", l(o("identifier", o("@data", tradeId))))));
    }

    static Map<String, Object> withType(Map<String, Object> sec) {
        Map<String, Object> m = o("@type", "cdm.base.staticdata.asset.common.Security");
        m.putAll(sec);
        return m;
    }

    static <T extends com.rosetta.model.lib.RosettaModelObject> T resolved(Class<T> type, T value) {
        var b = value.toBuilder();
        new ReferenceResolverProcessStep(ReferenceConfig.noScopeOrExcludedPaths()).runProcessStep(type, b);
        @SuppressWarnings("unchecked") T t = (T) b.build();
        return t;
    }

    static BusinessEvent book(Map<String, Object> execution, String tradeDate) {
        Instruction i = load(Instruction.class, o("primitiveInstruction", o("execution", execution)));
        return resolved(BusinessEvent.class, fn(Create_BusinessEvent.class).evaluate(new ArrayList<>(List.of(i)), null, Date.parse(tradeDate), null));
    }

    /** A sells 10,366 tUST at 98.40 to B for 1,000,000 USD, 4.5% for 7 days, Margin Ratio 1.02. */
    static BusinessEvent sample() {
        return book(execution("REPO-1", "BANK-A", "BANK-B", TUST, 10_366, "98.40", 1_000_000, "0.045", "1.02",
            "2026-11-09", "2026-11-09", "2026-11-16"), "2026-11-09");
    }

    @Test
    void theTradeIsValidCdmAndQualifiesAsARepo() {
        TradeState ts = sample().getAfter().get(0);
        assertEquals("", failedText(ts));
        assertTrue(fn(Qualify_RepurchaseAgreement.class).evaluate(ts.getTrade().getProduct().getEconomicTerms()));
    }

    @Test
    void quantityIsPurchasePriceTimesMarginRatioOverPriceRoundedUp() {
        var q = fn(RepoPurchaseQuantity.class);
        // 1,000,000 x 1.02 / 98.40 = 10,365.85...
        assertEquals(0, new BigDecimal(10_366).compareTo(q.evaluate(new BigDecimal(1_000_000), new BigDecimal("1.02"), new BigDecimal("98.40"))));
        assertEquals(0, new BigDecimal(1_020).compareTo(q.evaluate(new BigDecimal(1_000), new BigDecimal("1.02"), BigDecimal.ONE)));
        assertTrue(rejected(() -> q.evaluate(new BigDecimal(1_000), new BigDecimal("0.99"), BigDecimal.ONE)).contains("at least 1"));
    }

    @Test
    void repurchasePriceIsPurchasePricePlusFixedAmountOverTheTerm() {
        TradeState ts = sample().getAfter().get(0);
        assertEquals(0, new BigDecimal(1_000_000).compareTo(fn(RepoPurchasePrice.class).evaluate(ts).getValue()));
        // 1,000,000 x 4.5% x 7 / 360 = 875
        // CDM's arithmetic gives 874.99999999999999999999999999999998; the Repurchase Price rounds it
        assertEquals(0, new BigDecimal(875).compareTo(tenDecimals(fn(RepoPriceDifferential.class).evaluate(ts, Date.of(2026, 11, 16)))));
        var rp = fn(RepoRepurchasePrice.class).evaluate(ts, 0);
        assertEquals(0, new BigDecimal(1_000_875).compareTo(rp.getValue()));
        assertEquals("USD", rp.getUnit().getCurrency().getValue());
    }

    @Test
    void repurchasePriceRoundsToTheCashPrecision() {
        // CDM's own repo sample: 9,974,250 at 0.4% for 3 days = 332.475
        TradeState ts = book(execution("REPO-2", "BANK-A", "BANK-B", TUST, 10_000, "1007.50", 9_974_250, "0.004", "1.01",
            "2021-03-18", "2021-03-19", "2021-03-22"), "2021-03-18").getAfter().get(0);
        assertEquals(0, new BigDecimal("332.475").compareTo(tenDecimals(fn(RepoPriceDifferential.class).evaluate(ts, Date.of(2021, 3, 22)))));
        assertEquals(0, new BigDecimal(9_974_582).compareTo(fn(RepoRepurchasePrice.class).evaluate(ts, 0).getValue()));
        assertEquals(0, new BigDecimal("9974582.48").compareTo(fn(RepoRepurchasePrice.class).evaluate(ts, 2).getValue()));
    }

    static BigDecimal tenDecimals(BigDecimal v) {
        return v.setScale(10, java.math.RoundingMode.HALF_UP);
    }

    /** CDM's Repurchase event: ResolveRepurchaseTransferInstruction and Create_BusinessEvent. Create_BusinessEvent leaves
     *  the closed state's activityDate empty, which CDM's validation requires; it is set to the event date. */
    static BusinessEvent repurchaseEvent(TradeState ts, Date date) {
        var ri = fn(ResolveRepurchaseTransferInstruction.class).evaluate(ts, date);
        var b = fn(Create_BusinessEvent.class).evaluate(new ArrayList<>(ri.getInstruction()), ri.getIntent(), date, null).toBuilder();
        b.getAfter().get(0).getState().getClosedState().setActivityDate(date);
        return b.build();
    }

    @Test
    void priceDifferentialBeforeThePurchaseDateIsRejected() {
        TradeState ts = sample().getAfter().get(0);
        assertTrue(rejected(() -> fn(RepoPriceDifferential.class).evaluate(ts, Date.of(2026, 11, 8))).contains("on or after the Purchase Date"));
    }

    static Map<String, Object> transfer(Number value, Map<String, Object> unit, Map<String, Object> asset, String payer, String receiver, String date) {
        return o("quantity", o("value", value, "unit", unit), "asset", asset,
            "settlementDate", o("adjustedDate", o("@data", date)),
            "payerReceiver", o("payerPartyReference", party(payer), "receiverPartyReference", party(receiver)),
            "transferType", "Principal");
    }

    static Map<String, Object> cash() {
        return o("@type", "cdm.base.staticdata.asset.common.Cash", "identifier", l(o("identifier", o("@data", "USD"), "identifierType", "CurrencyCode")), "assetType", "Cash");
    }

    static Map<String, Object> securityAsset() {
        return withType(security(TUST));
    }

    @Test
    void theRepurchaseSettlementCarriesCdmsRepurchaseEvent() throws Exception {
        TradeState ts = sample().getAfter().get(0);
        BusinessEvent rep = repurchaseEvent(ts, Date.of(2026, 11, 16));
        assertEquals("Terminated", rep.getAfter().get(0).getState().getClosedState().getState().toString());
        assertEquals("", failedText(rep));
        assertTrue(rep.getAfter().get(0).getTrade().getTradeLot().get(0).getPriceQuantity().stream()
            .allMatch(pq -> pq.getQuantity().getValue().getValue().signum() == 0));
        Map<String, Object> doc = o("phase", "Repurchase", "trade", JSON.readValue(toJson(ts), Map.class),
            "securityTransfer", transfer(10_366, o("financialUnit", "Share"), securityAsset(), "BANK-B", "BANK-A", "2026-11-16"),
            "cashTransfer", transfer(1_000_875, usd(), cash(), "BANK-A", "BANK-B", "2026-11-16"),
            "repurchase", JSON.readValue(toJson(rep), Map.class));
        RepoSettlement s = load(RepoSettlement.class, doc);
        assertEquals("", failedText(s));
        doc.remove("repurchase");
        assertTrue(failedText(load(RepoSettlement.class, doc)).contains("RepurchaseEvent"));
    }

    @Test
    void thePurchaseSettlementMovesCashAgainstSecurities() throws Exception {
        TradeState ts = sample().getAfter().get(0);
        Map<String, Object> doc = o("phase", "Purchase", "trade", JSON.readValue(toJson(ts), Map.class),
            "securityTransfer", transfer(10_366, o("financialUnit", "Share"), securityAsset(), "BANK-A", "BANK-B", "2026-11-09"),
            "cashTransfer", transfer(1_000_000, usd(), cash(), "BANK-B", "BANK-A", "2026-11-09"));
        assertEquals("", failedText(load(RepoSettlement.class, doc)));
        doc.put("cashTransfer", transfer(1_000_000, usd(), cash(), "BANK-A", "BANK-B", "2026-11-09"));
        assertTrue(failedText(load(RepoSettlement.class, doc)).contains("OppositeDirections"));
    }
}
