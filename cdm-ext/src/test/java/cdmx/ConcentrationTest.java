package cdmx;

import cdm.product.collateral.EligibleCollateralSpecification;
import cdmx.collateral.concentration.ConcentrationLimitBreach;
import cdmx.collateral.concentration.ValuedCollateral;
import cdmx.collateral.concentration.functions.ConcentrationLimitBreaches;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static cdmx.Cdm.*;
import static cdmx.Data.*;
import static org.junit.jupiter.api.Assertions.*;

/** Gap G8: concentration limits of an eligible collateral schedule evaluated on the value after haircuts. */
class ConcentrationTest {
    private final ConcentrationLimitBreaches breaches = fn(ConcentrationLimitBreaches.class);

    static final String TUST = "XS0000TUST01", TUST2 = "XS0000TUST02", TMMF = "XS0000TMMF01";

    /** CDM's EligibilityQuery: the asset and issuer details the schedule's criteria are checked against. */
    static Map<String, Object> details(String securityType, String issuerType, String issuer) {
        return o("maturity", 2,
            "collateralAssetType", o("assetType", "Security", "securityType", securityType),
            "assetCountryOfOrigin", "US", "denominatedCurrency", "USD",
            "agencyRating", o("creditNotation", o("agency", "StandardAndPoors", "notation", o("@data", "AA+"))),
            "issuerType", o("issuerType", issuerType),
            "issuerName", o("name", o("@data", issuer)));
    }

    static Map<String, Object> valued(String isin, Number value) {
        boolean fund = isin.equals(TMMF);
        return o("position", position(1_000, isin), "valueAfterHaircuts", money(value),
            "details", fund ? details("Fund", "Fund", "Tokenised MMF Ltd") : details("Debt", "SovereignCentralBank", "US Treasury"));
    }

    static List<ValuedCollateral> collateral(Map<?, ?>... items) {
        List<ValuedCollateral> out = new ArrayList<>();
        for (Map<?, ?> i : items) {
            @SuppressWarnings("unchecked") Map<String, Object> doc = (Map<String, Object>) i;
            out.add(load(ValuedCollateral.class, doc));
        }
        return out;
    }

    static Map<String, Object> assetTypeCriteria(String securityType) {
        return o("@type", "cdm.base.staticdata.asset.common.AssetType", "assetType", "Security", "securityType", securityType);
    }

    static Map<String, Object> upTo(double share) {
        return o("percentageLimit", o("upperBound", o("number", share, "inclusive", true)));
    }

    static Map<String, Object> criterion(String securityType, boolean included, Object... limits) {
        Map<String, Object> treatment = o("isIncluded", included);
        if (limits.length > 0) treatment.put("concentrationLimit", l(limits));
        return o("collateralCriteria", assetTypeCriteria(securityType), "treatment", treatment);
    }

    /** BANK-B's schedule in the im-dispute scenario: treasuries without a limit, money market fund shares up to 50%. */
    static EligibleCollateralSpecification schedule(Object... criteria) {
        return load(EligibleCollateralSpecification.class, o("criteria", l(criteria)));
    }

    static EligibleCollateralSpecification bankB() {
        return schedule(criterion("Debt", true), criterion("Fund", true, upTo(0.5)));
    }

    static String text(Number n) {
        return new java.math.BigDecimal(n.toString()).stripTrailingZeros().toPlainString();
    }

    @Test
    void theScheduleIsValidCdm() {
        assertEquals("", failedText(bankB()));
    }

    @Test
    void anAllFundProposalBreachesTheFiftyPercentLimit() {  // im-dispute: first proposal rejected
        List<? extends ConcentrationLimitBreach> b = breaches.evaluate(bankB(), collateral(valued(TMMF, 12_400_000)), "USD");
        assertEquals(1, b.size());
        assertEquals("1", text(b.get(0).getPercentage()));
        assertEquals("12400000", text(b.get(0).getConcentratedValue().getValue()));
        assertEquals("0.5", text(b.get(0).getLimit().getPercentageLimit().getUpperBound().getNumber()));
        assertNull(b.get(0).getAsset());
        assertEquals("", failedText(b.get(0)));
    }

    @Test
    void aMixWithinTheLimitHasNoBreach() {  // im-dispute: second proposal accepted
        assertTrue(breaches.evaluate(bankB(), collateral(valued(TMMF, 6_000_000), valued(TUST, 6_400_000)), "USD").isEmpty());
    }

    @Test
    void anInclusiveBoundAllowsExactlyTheLimit() {
        assertTrue(breaches.evaluate(bankB(), collateral(valued(TMMF, 5_000_000), valued(TUST, 5_000_000)), "USD").isEmpty());
    }

    @Test
    void collateralAlreadyHeldCountsTowardsTheLimit() {  // held treasuries 6m, proposed fund shares 7m: 53.8%
        List<? extends ConcentrationLimitBreach> b =
            breaches.evaluate(bankB(), collateral(valued(TUST, 6_000_000), valued(TMMF, 7_000_000)), "USD");
        assertEquals(1, b.size());
        assertEquals("13000000", text(b.get(0).getTotalValue().getValue()));
        assertTrue(b.get(0).getPercentage().doubleValue() > 0.538 && b.get(0).getPercentage().doubleValue() < 0.539);
    }

    @Test
    void anAssetLimitAppliesToEachAssetSeparately() {
        Map<String, Object> perAsset = upTo(0.4);
        perAsset.put("concentrationLimitCriteria", o("concentrationLimitType", "Asset"));
        EligibleCollateralSpecification s = schedule(criterion("Debt", true, perAsset), criterion("Fund", true));
        assertTrue(breaches.evaluate(s, collateral(valued(TUST, 3_500_000), valued(TUST2, 3_500_000), valued(TMMF, 3_000_000)), "USD").isEmpty());
        List<? extends ConcentrationLimitBreach> b =
            breaches.evaluate(s, collateral(valued(TUST, 6_000_000), valued(TUST2, 1_000_000), valued(TMMF, 3_000_000)), "USD");
        assertEquals(1, b.size());
        assertEquals(TUST, b.get(0).getAsset().getInstrument().getSecurity().getIdentifier().get(0).getIdentifier().getValue());
        assertEquals("0.6", text(b.get(0).getPercentage()));
    }

    @Test
    void anIssuerValueLimitAppliesToEachIssuer() {  // both treasuries have one issuer: 7m against USD 5m
        Map<String, Object> perIssuer = o("valueLimit", o("upperBound", o("money", money(5_000_000), "inclusive", true)),
            "concentrationLimitCriteria", o("concentrationLimitType", "Issuer"));
        EligibleCollateralSpecification s = schedule(criterion("Debt", true, perIssuer), criterion("Fund", true));
        List<? extends ConcentrationLimitBreach> b =
            breaches.evaluate(s, collateral(valued(TUST, 3_500_000), valued(TUST2, 3_500_000), valued(TMMF, 3_000_000)), "USD");
        assertEquals(1, b.size());
        assertEquals("US Treasury", b.get(0).getIssuer().getName().getValue());
        assertEquals("7000000", text(b.get(0).getConcentratedValue().getValue()));
    }

    @Test
    void anExclusionCriterionCarriesNoLimit() {
        EligibleCollateralSpecification s = schedule(criterion("Debt", true), criterion("Fund", false, upTo(0.1)));
        assertTrue(breaches.evaluate(s, collateral(valued(TMMF, 1_000_000), valued(TUST, 1_000_000)), "USD").isEmpty());
    }

    @Test
    void limitsThatNeedMarketDataAreRejected() {
        Map<String, Object> outstanding = upTo(0.1);
        outstanding.put("concentrationLimitCriteria", o("concentrationLimitType", "OutstandingBalance"));
        EligibleCollateralSpecification s = schedule(criterion("Debt", true, outstanding));
        assertTrue(rejected(() -> breaches.evaluate(s, collateral(valued(TUST, 1_000_000)), "USD"))
            .contains("need market data"));
    }

    @Test
    void collateralInAnotherCurrencyIsRejected() {
        Map<String, Object> eur = valued(TUST, 1_000_000);
        eur.put("valueAfterHaircuts", money(1_000_000, "EUR"));
        assertTrue(rejected(() -> breaches.evaluate(bankB(), collateral(eur), "USD")).contains("base currency"));
    }
}
