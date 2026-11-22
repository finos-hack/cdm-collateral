package collateral;

import cdm.event.common.CollateralPortfolio;
import cdmx.collateral.enforcement.CollateralEnforcement;
import cdmx.collateral.enforcement.EnforcementInstruction;
import cdmx.collateral.enforcement.functions.Create_CollateralEnforcement;
import com.rosetta.model.lib.records.Date;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static collateral.CdmRuntime.l;
import static collateral.CdmRuntime.o;

/**
 * The CDM record of the secured party's enforcement against the pledged initial margin after the pledgor's default
 * (flow-default-enforcement; cdm-ext {@code Create_CollateralEnforcement}, G14). The record's Rune JSON is the payload
 * whose keccak-256 the control contract records with the enforcement (wp-adr-cdm-payload-carrier), so an Enforcement
 * LedgerAnchor can be built for it and, for a Registered or Claim token, the record keeper's confirmation completes it
 * (interim rule REG-4, task-authoritative-record-settlement-enforcement).
 *
 * Reductions: the notice states a Failure to Pay or Deliver and designates the Early Termination Date on the day of the
 * enforcement; the secured party takes every pledged position, and the realised value is the value after haircuts.
 */
public final class CdmEnforcement {
    public final CollateralEnforcement enforcement;
    public final String json;
    public final String hash;

    private CdmEnforcement(CollateralEnforcement enforcement) {
        CdmRuntime.validate(enforcement);
        this.enforcement = enforcement;
        this.json = CdmRuntime.toJson(enforcement);
        this.hash = Cdm.keccakHex(json);
    }

    private static Map<String, Object> party(String name) {
        return o("partyId", l(o("identifier", o("@data", name))));
    }

    /** The CDM identifier of a call's enforcement, derived from the on-chain call id so both parties name it the same. */
    public static String cdmId(String callId) {
        String h = callId.startsWith("0x") ? callId.substring(2) : callId;
        return "E-" + h.substring(0, Math.min(8, h.length())).toUpperCase();
    }

    /** positions: {isin, units}, the pledged escrow; valueUsd: its value after haircuts in whole USD. */
    public static CdmEnforcement build(String callId, String pledgor, String securedParty, List<Map<String, Object>> positions, long valueUsd) {
        CollateralPortfolio held = CdmSubstitution.portfolio(positions, valueUsd, pledgor, securedParty);
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        Date date = Date.of(today.getYear(), today.getMonthValue(), today.getDayOfMonth());
        List<Object> taken = new ArrayList<>();
        for (Map<String, Object> p : positions) taken.add(CdmSubstitution.position(((Number) p.get("units")).longValue(), (String) p.get("isin")));
        EnforcementInstruction instruction = CdmRuntime.load(EnforcementInstruction.class, o(
                "notice", o("defaultingParty", party(pledgor), "nonDefaultingParty", party(securedParty),
                        "eventOfDefault", "FailureToPayOrDeliver", "noticeDate", today.toString(),
                        "earlyTerminationDate", today.toString()),
                "exclusiveControl", true,
                "enforcedCollateral", taken,
                "enforcedValue", CdmSubstitution.money(valueUsd),
                "realisedValue", CdmSubstitution.money(valueUsd)));
        CollateralEnforcement e = CdmRuntime.fn(Create_CollateralEnforcement.class).evaluate(held, null, cdmId(callId), date,
                ZonedDateTime.now(ZoneOffset.UTC).truncatedTo(ChronoUnit.SECONDS), instruction);
        return new CdmEnforcement(e);
    }

    /** Parse and validate an enforcement record fetched from the payload store. */
    public static CollateralEnforcement verify(String json) {
        try {
            CollateralEnforcement e = CdmRuntime.JSON.readValue(json, CollateralEnforcement.class);
            CdmRuntime.validate(e);
            return e;
        } catch (java.io.IOException ex) {
            throw new IllegalArgumentException("enforcement record unreadable: " + ex.getMessage(), ex);
        }
    }
}
