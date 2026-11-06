package collateral;

import cdm.event.common.CollateralPortfolio;
import cdm.legaldocumentation.csa.Substitution;
import cdmx.collateral.substitution.CollateralSubstitution;
import cdmx.collateral.substitution.SubstitutionInstruction;
import cdmx.collateral.substitution.SubstitutionState;
import cdmx.collateral.substitution.functions.Create_CollateralSubstitution;
import com.rosetta.model.lib.records.Date;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static collateral.CdmRuntime.l;
import static collateral.CdmRuntime.o;

/**
 * CDM content for the substitution of pledged initial margin (flow-substitution; cdm-ext
 * {@code cdmx.collateral.substitution}, gap G16, defect D5). Each step (request, consent or refusal, settle) is one
 * validated {@code SubstitutionInstruction}; its keccak-256 is the hash the control contract records with the step
 * (wp-adr-cdm-payload-carrier). {@link #fold} replays the chain-ordered steps through
 * {@code Create_CollateralSubstitution}, the same way {@link CdmFold} replays a margin call.
 *
 * Inputs both parties build the same way, so their folds give the same events:
 * <ul>
 *   <li>The portfolio before each step is the escrow and the feed prices at the end of the block before the step's
 *   block, read by each party from its own node. Its balance is the escrow's value after haircuts, in whole USD.</li>
 *   <li>The event date and timestamp are the step's block time.</li>
 *   <li>The CSA's Substitution election needs consent for the pledgor (Paragraph 13 (f)(ii)), as the control contract
 *   requires consent for every substitution. The pledgor (BANK-A) is Party1.</li>
 * </ul>
 */
public final class CdmSubstitution {
    public static final String PLEDGOR_ROLE = "Party1";

    public final SubstitutionInstruction instruction;
    public final String json;
    public final String hash;

    private CdmSubstitution(Map<String, Object> step) {
        this.instruction = CdmRuntime.load(SubstitutionInstruction.class, step);
        CdmRuntime.validate(instruction);
        this.json = CdmRuntime.toJson(instruction);
        this.hash = Cdm.keccakHex(json);
    }

    static Map<String, Object> money(long v) {
        return o("value", v, "unit", o("currency", o("@data", "USD")));
    }

    static Map<String, Object> security(String isin) {
        return o("@type", "cdm.base.staticdata.asset.common.Security",
                "identifier", l(o("identifier", o("@data", isin), "identifierType", "ISIN")),
                "securityType", "Debt", "assetType", "Security");
    }

    static Map<String, Object> position(long units, String isin) {
        return o("priceQuantity", l(o("quantity", o("value", units, "unit", o("financialUnit", "Share")))),
                "asset", security(isin));
    }

    /** The CDM substitutionIdentifier, derived from the on-chain id so both parties name the same substitution. */
    public static String cdmId(String onChainId) {
        String h = onChainId.startsWith("0x") ? onChainId.substring(2) : onChainId;
        return "S-" + h.substring(0, Math.min(8, h.length())).toUpperCase();
    }

    /** original and substitute: lists of {isin, units}. Values after haircuts in whole USD. */
    public static CdmSubstitution request(String substitutionId, List<Map<String, Object>> original, long originalValueUsd,
                                          List<Map<String, Object>> substitute, long substituteValueUsd) {
        return new CdmSubstitution(o("request", o("substitutionIdentifier", cdmId(substitutionId), "pledgorRole", PLEDGOR_ROLE,
                "originalCollateral", positions(original), "originalValue", money(originalValueUsd),
                "substituteCollateral", positions(substitute), "substituteValue", money(substituteValueUsd))));
    }

    public static CdmSubstitution consent(String substitutionId, boolean consent, String reason) {
        Map<String, Object> c = o("substitutionIdentifier", cdmId(substitutionId), "consent", consent);
        if (!consent && reason != null && !reason.isBlank()) c.put("reason", reason);
        return new CdmSubstitution(o("consent", c));
    }

    public static CdmSubstitution settle(String substitutionId) {
        return new CdmSubstitution(o("settle", o("substitutionIdentifier", cdmId(substitutionId))));
    }

    private static List<Object> positions(List<Map<String, Object>> assets) {
        List<Object> out = new ArrayList<>();
        for (Map<String, Object> a : assets) out.add(position(((Number) a.get("units")).longValue(), (String) a.get("isin")));
        return out;
    }

    /** The prototype agreement's Substitution election: the pledgor needs the secured party's consent. */
    public static Substitution elections() {
        return CdmRuntime.load(Substitution.class, o("partyElection", l(o("party", PLEDGOR_ROLE, "needsConsent", true))));
    }

    /**
     * The portfolio the secured party holds from the pledgor: positions {isin, units} and their value after haircuts in
     * whole USD. Same shape as cdm-ext ApplyCollateralEvent's output (one SettledAmount balance, PostHaircut).
     */
    public static CollateralPortfolio portfolio(List<Map<String, Object>> positions, long valueUsd, String pledgor, String securedParty) {
        List<Object> held = new ArrayList<>();
        for (Map<String, Object> p : positions) {
            Map<String, Object> pos = position(((Number) p.get("units")).longValue(), (String) p.get("isin"));
            pos.put("collateralPositionStatus", "SettledAmount");
            held.add(pos);
        }
        return CdmRuntime.load(CollateralPortfolio.class, o(
                "collateralPosition", held,
                "collateralBalance", l(o("collateralBalanceStatus", "SettledAmount", "haircutIndicator", "PostHaircut",
                        "amountBaseCurrency", money(valueUsd),
                        "payerReceiver", o("payerPartyReference", party(pledgor), "receiverPartyReference", party(securedParty))))));
    }

    private static Map<String, Object> party(String name) {
        return o("partyId", l(o("identifier", o("@data", name))));
    }

    /** One step to fold: its instruction document, the portfolio before it, and its block time (epoch seconds). */
    public record Step(String doc, CollateralPortfolio portfolio, long blockTime) {}

    /** Fold the chain-ordered steps; returns one CollateralSubstitution event per step. Throws if a step fails CDM validation. */
    public static List<CollateralSubstitution> fold(String substitutionId, List<Step> steps) {
        Create_CollateralSubstitution fn = CdmRuntime.fn(Create_CollateralSubstitution.class);
        Substitution elections = elections();
        List<CollateralSubstitution> events = new ArrayList<>();
        SubstitutionState before = null;
        int i = 0;
        for (Step s : steps) {
            i++;
            try {
                SubstitutionInstruction inst = CdmRuntime.JSON.readValue(s.doc(), SubstitutionInstruction.class);
                ZonedDateTime t = Instant.ofEpochSecond(s.blockTime()).atZone(ZoneOffset.UTC);
                CollateralSubstitution e = fn.evaluate(before, s.portfolio(), elections, cdmId(substitutionId) + "/" + i,
                        Date.of(t.getYear(), t.getMonthValue(), t.getDayOfMonth()), t, inst);
                CdmRuntime.validate(e);
                events.add(e);
                before = e.getAfter();
            } catch (RuntimeException e) {
                throw new RuntimeException("substitution step " + i + " failed: " + e.getMessage(), e);
            } catch (Exception e) {
                throw new RuntimeException("substitution step " + i + " failed: " + e.getMessage(), e);
            }
        }
        return events;
    }
}
