package collateral;

import cdm.event.common.CollateralPortfolio;
import cdmx.collateral.enforcement.CollateralReclaim;
import cdmx.collateral.enforcement.ReclaimInstruction;
import cdmx.collateral.enforcement.functions.Create_CollateralReclaim;
import com.rosetta.model.lib.records.Date;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;

import static collateral.CdmRuntime.l;
import static collateral.CdmRuntime.o;

/**
 * The CDM record of a pledgor's reclaim after its secured party's default (two-way initial margin, wp-adr-two-way-im;
 * cdm-ext {@code Create_CollateralReclaim}). The pledgor is the Non-defaulting Party: it takes back its whole
 * segregated escrow on the leg. The record's Rune JSON is the payload whose keccak-256 the control contract records
 * with the reclaim (wp-adr-cdm-payload-carrier).
 *
 * Reductions: the notice states a Failure to Pay or Deliver on the day of the reclaim, and the portfolio is the
 * escrow and the feed prices when the pledgor reclaims; the clause and its conditions are for the SME
 * (task-sme-two-way-im-rules).
 */
public final class CdmReclaim {
    public final CollateralReclaim reclaim;
    public final String json;
    public final String hash;

    private CdmReclaim(CollateralReclaim reclaim) {
        CdmRuntime.validate(reclaim);
        this.reclaim = reclaim;
        this.json = CdmRuntime.toJson(reclaim);
        this.hash = Cdm.keccakHex(json);
    }

    private static Map<String, Object> party(String name) {
        return o("partyId", l(o("identifier", o("@data", name))));
    }

    /** positions: {isin, units}; valueUsd: their value after haircuts in whole USD. */
    public static CdmReclaim build(String reclaimId, String pledgor, String securedParty, List<Map<String, Object>> positions, long valueUsd) {
        CollateralPortfolio held = CdmSubstitution.portfolio(positions, valueUsd, pledgor, securedParty);
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        Date date = Date.of(today.getYear(), today.getMonthValue(), today.getDayOfMonth());
        List<Object> returned = new java.util.ArrayList<>();
        for (Map<String, Object> p : positions) returned.add(CdmSubstitution.position(((Number) p.get("units")).longValue(), (String) p.get("isin")));
        ReclaimInstruction instruction = CdmRuntime.load(ReclaimInstruction.class, o(
                "notice", o("defaultingParty", party(securedParty), "nonDefaultingParty", party(pledgor),
                        "eventOfDefault", "FailureToPayOrDeliver", "noticeDate", today.toString()),
                "reclaimedCollateral", returned,
                "reclaimedValue", CdmSubstitution.money(valueUsd)));
        CollateralReclaim r = CdmRuntime.fn(Create_CollateralReclaim.class).evaluate(held, reclaimId, date,
                ZonedDateTime.now(ZoneOffset.UTC).truncatedTo(ChronoUnit.SECONDS), instruction);
        return new CdmReclaim(r);
    }

    /** Parse and validate a reclaim record fetched from the payload store. */
    public static CollateralReclaim verify(String json) {
        try {
            CollateralReclaim r = CdmRuntime.JSON.readValue(json, CollateralReclaim.class);
            CdmRuntime.validate(r);
            return r;
        } catch (java.io.IOException e) {
            throw new IllegalArgumentException("reclaim record unreadable: " + e.getMessage(), e);
        }
    }
}
