package collateral;

import org.junit.jupiter.api.Test;

import java.math.BigInteger;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** Collateral allocation as the collateral service builds it (flow-allocation). */
class CdmAllocationTest {
    private static final BigInteger SCALE = BigInteger.TEN.pow(8);

    private static BigInteger usd(long v) {
        return BigInteger.valueOf(v).multiply(SCALE);
    }

    private static CdmAllocation.Candidate tust(int rank, long held) {
        return new CdmAllocation.Candidate("tUST", "XS0000TUST01", rank, held, usd(100), true, 200);
    }

    private static CdmAllocation.Candidate tmmf(int rank, long held) {
        return new CdmAllocation.Candidate("tMMF", "XS0000TMMF01", rank, held, usd(1), true, 500);
    }

    @Test
    void fillsInRankOrderFromScaledPricesAndBasisPoints() {
        CdmAllocation a = CdmAllocation.allocate(List.of(tust(1, 50_000), tmmf(2, 10_000_000)), usd(12_400_000), SCALE);
        assertTrue(a.covers());
        assertEquals(List.of(new CdmAllocation.Line("tUST", "XS0000TUST01", 50_000), new CdmAllocation.Line("tMMF", "XS0000TMMF01", 7_894_737)), a.lines);
        assertEquals("12400000.15", a.valueUsd());
    }

    @Test
    void ineligibleAndUnpricedTokensAreLeftOut() {
        CdmAllocation a = CdmAllocation.allocate(List.of(
                new CdmAllocation.Candidate("tUST", "XS0000TUST01", 1, 200_000, usd(100), false, 200),
                new CdmAllocation.Candidate("tUSD", "XS0000TUSD01", 2, 5_000_000, null, true, 0),
                tmmf(3, 20_000_000)), usd(12_400_000), SCALE);
        assertEquals(List.of(new CdmAllocation.Line("tMMF", "XS0000TMMF01", 13_052_632)), a.lines);
    }

    @Test
    void reportsWhenTheInventoryCannotCover() {
        CdmAllocation a = CdmAllocation.allocate(List.of(tust(1, 1_000)), usd(12_400_000), SCALE);
        assertFalse(a.covers());
        assertTrue(a.lines.isEmpty());
        assertEquals("0", a.valueUsd());
    }
}
