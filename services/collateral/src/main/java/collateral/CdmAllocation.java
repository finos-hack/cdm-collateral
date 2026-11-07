package collateral;

import cdmx.collateral.allocation.AllocationCandidate;
import cdmx.collateral.allocation.CollateralAllocation;
import cdmx.collateral.allocation.functions.AllocateCollateral;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static collateral.CdmRuntime.o;

/**
 * A suggested basket for an agreed IM or VM call (flow-allocation; cdm-ext {@code cdmx.collateral.allocation},
 * task-csa-allocation, wp-adr-allocation-scope). Each registry token the delivering party holds is a CDM
 * {@code AllocationCandidate} with its rank, its balance, its oracle feed price and the pair's eligibility and haircut;
 * {@code AllocateCollateral} takes them in rank order and rounds the last one up to whole units. The suggestion is not
 * recorded on-chain: the party proposes the basket, edited or not, through the existing proposal step.
 */
public final class CdmAllocation {
    public static final String CURRENCY = "USD";

    /**
     * One token as the allocation sees it. {@code priceScaled} is the oracle feed price scaled by {@code priceScale};
     * {@code haircutBps} is the pair's haircut in basis points; {@code eligible} is the pair's eligibility.
     */
    public record Candidate(String symbol, String isin, int rank, long held, BigInteger priceScaled, boolean eligible, int haircutBps) {}

    /** One allocated token and its whole units. */
    public record Line(String symbol, String isin, long units) {}

    public final CollateralAllocation allocation;
    public final List<Line> lines;

    private CdmAllocation(CollateralAllocation allocation, List<Line> lines) {
        CdmRuntime.validate(allocation);
        this.allocation = allocation;
        this.lines = lines;
    }

    /**
     * Allocate {@code agreedScaled} (the call's agreed amount, scaled by {@code priceScale}) from the candidates. Tokens
     * without a feed price are left out. Throws when CDM rejects the input (duplicate ranks, a non-positive amount).
     */
    public static CdmAllocation allocate(List<Candidate> candidates, BigInteger agreedScaled, BigInteger priceScale) {
        BigDecimal scale = new BigDecimal(priceScale);
        List<AllocationCandidate> in = new ArrayList<>();
        Map<String, Candidate> byIsin = new LinkedHashMap<>();
        for (Candidate c : candidates) {
            if (c.priceScaled() == null || c.priceScaled().signum() <= 0) continue;
            byIsin.put(c.isin(), c);
            in.add(CdmRuntime.load(AllocationCandidate.class, o(
                    "rank", c.rank(),
                    "holding", o("priceQuantity", CdmRuntime.l(o("quantity", o("value", c.held(), "unit", o("financialUnit", "Share")))),
                            "asset", o("@type", "cdm.base.staticdata.asset.common.Security",
                                    "identifier", CdmRuntime.l(o("identifier", o("@data", c.isin()), "identifierType", "ISIN")),
                                    "securityType", "Debt", "assetType", "Security")),
                    "unitPrice", money(new BigDecimal(c.priceScaled()).divide(scale)),
                    "eligible", c.eligible(),
                    "haircutPercentage", BigDecimal.valueOf(c.haircutBps(), 4))));
        }
        CollateralAllocation a = CdmRuntime.fn(AllocateCollateral.class)
                .evaluate(in, CdmRuntime.load(cdm.observable.asset.Money.class, money(new BigDecimal(agreedScaled).divide(scale))));
        List<Line> lines = new ArrayList<>();
        if (a.getAllocatedCollateral() != null) {
            for (var p : a.getAllocatedCollateral()) {
                String isin = p.getAsset().getInstrument().getSecurity().getIdentifier().get(0).getIdentifier().getValue();
                long units = p.getPriceQuantity().get(0).getQuantity().getValue().getValue().longValueExact();
                lines.add(new Line(byIsin.get(isin).symbol(), isin, units));
            }
        }
        return new CdmAllocation(a, lines);
    }

    public boolean covers() {
        return allocation.getCoversAgreedAmount();
    }

    /** The suggested basket's value after haircuts, in USD, as a plain decimal string. */
    public String valueUsd() {
        return allocation.getValueAfterHaircuts().getValue().stripTrailingZeros().toPlainString();
    }

    private static Map<String, Object> money(BigDecimal v) {
        return o("value", v, "unit", o("currency", o("@data", CURRENCY)));
    }
}
