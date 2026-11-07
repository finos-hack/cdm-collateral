package cdmx;

import cdm.event.common.CollateralPosition;
import cdmx.collateral.allocation.AllocationCandidate;
import cdmx.collateral.allocation.CollateralAllocation;
import cdmx.collateral.allocation.functions.AllocateCollateral;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static cdmx.Cdm.*;
import static cdmx.Data.*;
import static org.junit.jupiter.api.Assertions.*;

/** G34: collateral allocation in the pledgor's ranking order (wp-adr-allocation-scope). */
class AllocationTest {
    private static final String TUST = "XS0000TUST01";
    private static final String TMMF = "XS0000TMMF01";
    private static final String TUSD = "XS0000TUSD01";

    private final AllocateCollateral allocate = fn(AllocateCollateral.class);

    private static Map<String, Object> candidateDoc(int rank, String isin, Number held, Number price, boolean eligible, Number haircut, String ccy) {
        return o("rank", rank, "holding", position(held, isin), "unitPrice", money(price, ccy), "eligible", eligible, "haircutPercentage", haircut);
    }

    private static AllocationCandidate candidate(int rank, String isin, Number held, Number price, boolean eligible, Number haircut) {
        return load(AllocationCandidate.class, candidateDoc(rank, isin, held, price, eligible, haircut, "USD"));
    }

    /** tUST at 100 with a 2% haircut (98 a unit), tMMF at 1 with a 5% haircut (0.95 a unit). */
    private static AllocationCandidate tust(int rank, Number held) {
        return candidate(rank, TUST, held, 100, true, 0.02);
    }

    private static AllocationCandidate tmmf(int rank, Number held) {
        return candidate(rank, TMMF, held, 1, true, 0.05);
    }

    private static String isin(CollateralPosition p) {
        return p.getAsset().getInstrument().getSecurity().getIdentifier().get(0).getIdentifier().getValue();
    }

    /** ISIN to units, in the order allocated. */
    private static Map<String, String> basket(CollateralAllocation a) {
        Map<String, String> m = new LinkedHashMap<>();
        for (CollateralPosition p : a.getAllocatedCollateral())
            m.put(isin(p), p.getPriceQuantity().get(0).getQuantity().getValue().getValue().stripTrailingZeros().toPlainString());
        return m;
    }

    private static void assertValue(String expected, CollateralAllocation a) {
        assertEquals(0, new BigDecimal(expected).compareTo(a.getValueAfterHaircuts().getValue()), a.getValueAfterHaircuts().getValue().toPlainString());
        assertEquals("USD", a.getValueAfterHaircuts().getUnit().getCurrency().getValue());
    }

    @Test
    void fillsInRankingOrderAndRoundsTheLastAssetUp() {
        // tUST covers 4,900,000; tMMF covers the 7,500,000 left: 7,894,736.84 units, rounded up.
        CollateralAllocation a = allocate.evaluate(List.of(tust(1, 50_000), tmmf(2, 10_000_000)), amount(12_400_000, "USD"));
        assertTrue(a.getCoversAgreedAmount());
        assertEquals(List.of(TUST, TMMF), List.copyOf(basket(a).keySet()));
        assertEquals(Map.of(TUST, "50000", TMMF, "7894737"), basket(a));
        assertValue("12400000.15", a);
        assertEquals("", failedText(a));
    }

    @Test
    void rankDecidesTheOrderNotTheListOrder() {
        // tMMF ranked first: all 10,000,000 units (9,500,000), then 2,900,000 / 98 = 29,591.84 tUST, rounded up.
        CollateralAllocation a = allocate.evaluate(List.of(tust(2, 50_000), tmmf(1, 10_000_000)), amount(12_400_000, "USD"));
        assertEquals(List.of(TMMF, TUST), List.copyOf(basket(a).keySet()));
        assertEquals(Map.of(TMMF, "10000000", TUST, "29592"), basket(a));
        assertValue("12400016", a);
    }

    @Test
    void firstRankedAssetAloneWhenItCovers() {
        // 12,400,000 / 98 = 126,530.61 tUST, rounded up; tMMF is not used.
        CollateralAllocation a = allocate.evaluate(List.of(tust(1, 200_000), tmmf(2, 10_000_000)), amount(12_400_000, "USD"));
        assertEquals(Map.of(TUST, "126531"), basket(a));
        assertValue("12400038", a);
    }

    @Test
    void exactFitIsNotRoundedFurther() {
        CollateralAllocation a = allocate.evaluate(List.of(tust(1, 200_000)), amount(9_800_000, "USD"));
        assertEquals(Map.of(TUST, "100000"), basket(a));
        assertValue("9800000", a);
    }

    @Test
    void ineligibleAndEmptyHoldingsAreSkipped() {
        CollateralAllocation a = allocate.evaluate(List.of(
                candidate(1, TUST, 200_000, 100, false, 0.02),   // not eligible between the pair
                candidate(2, TUSD, 0, 1, true, 0),              // nothing held
                candidate(3, TUSD + "X", 5_000_000, 1, true, 1), // a 100% haircut gives no value
                tmmf(4, 20_000_000)),
            amount(12_400_000, "USD"));
        assertEquals(Map.of(TMMF, "13052632"), basket(a));
    }

    @Test
    void nothingSuggestedWhenTheInventoryCannotCover() {
        CollateralAllocation a = allocate.evaluate(List.of(tust(1, 50_000), tmmf(2, 1_000_000)), amount(12_400_000, "USD"));
        assertFalse(a.getCoversAgreedAmount());
        assertTrue(a.getAllocatedCollateral() == null || a.getAllocatedCollateral().isEmpty());  // absent
        assertValue("0", a);
        assertEquals("", failedText(a));
        assertFalse(allocate.evaluate(List.of(), amount(1, "USD")).getCoversAgreedAmount());
    }

    @Test
    void preconditions() {
        AllocationCandidate eur = load(AllocationCandidate.class, candidateDoc(1, TUST, 1, 100, true, 0.02, "EUR"));
        assertTrue(rejected(() -> allocate.evaluate(List.of(eur), amount(100, "USD"))).contains("currency of the agreed amount"));
        assertTrue(rejected(() -> allocate.evaluate(List.of(tust(1, 1), tmmf(1, 1)), amount(100, "USD"))).contains("its own rank"));
        assertTrue(rejected(() -> allocate.evaluate(List.of(tust(1, 1)), amount(0, "USD"))).contains("positive"));
    }

    @Test
    void typeConditions() {
        assertEquals("", failedText(tust(1, 50_000)));
        assertTrue(failedText(candidate(1, TUST, 1, 0, true, 0.02)).contains("PositivePrice"));
        assertTrue(failedText(candidate(1, TUST, 1, 100, true, 1.5)).contains("HaircutRange"));
        assertTrue(failedText(candidate(1, TUST, -1, 100, true, 0.02)).contains("NonNegativeHolding"));
        CollateralAllocation bad = load(CollateralAllocation.class, o("allocatedCollateral", l(position(1)),
            "valueAfterHaircuts", money(98), "coversAgreedAmount", false));
        assertTrue(failedText(bad).contains("NothingWhenUncovered"));
    }

    @Test
    void serialisationRoundtrip() throws Exception {
        CollateralAllocation a = allocate.evaluate(List.of(tust(1, 50_000), tmmf(2, 10_000_000)), amount(12_400_000, "USD"));
        String js = toJson(a);
        assertTrue(js.contains("\"@type\":\"cdmx.collateral.allocation.CollateralAllocation\""), js);
        assertEquals(a, JSON.readValue(js, CollateralAllocation.class));
    }
}
