package collateral;

import cdmx.collateral.margincall.MarginCallInstruction;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static collateral.CdmRuntime.l;
import static collateral.CdmRuntime.o;

/**
 * CDM message content for the margin-call lifecycle (ASR concept-asr-cdm-data-layer, concept-asr-onchain-call-state;
 * ADR wp-adr-java-cdm-stack).
 *
 * Each lifecycle message is a real CDM object: one {@code MarginCallInstruction} step from the local extension
 * (cdm-ext / {@code local.cdmx:cdmx-java}) built over FINOS CDM 7.7.0 types. The instruction is validated with CDM's
 * {@code RosettaTypeValidator} (all type conditions, cardinalities and the extension's own one-of/identity rules) and
 * serialised to canonical Rune JSON with {@code RuneJsonObjectMapper}. The on-chain {@code cdmHash} is taken over that
 * Rune JSON, and the Rune JSON is what the per-participant store keeps, so a counterparty can check CDM content
 * received off-chain against the on-chain hash.
 *
 * The Rune JSON shapes mirror the extension's own lifecycle tests (cdm-ext/src/test/java/cdmx/Data.java), which prove
 * these documents validate and drive {@code Create_MarginCallState}; here they are parameterised with the live callId,
 * parties, token ISINs and amounts of the running cycle.
 *
 * First-cycle reductions (nw-e2e-first-cycle-scope): steps are validated individually rather than folded into a shared
 * {@code MarginCallState} (that stateful fold is what service-to-peer CDM exchange would carry, which this cycle omits);
 * the CDM {@code callIdentifier} is derived from the shared on-chain callId so both parties agree without peer
 * messaging; amounts are the agreement's base currency (USD) whole units, while the chain carries the 1e8-scaled value;
 * and the hash is SHA-256, not keccak-256 (algorithm alignment across verifiers is a separate task).
 */
public final class Cdm {
    public final MarginCallInstruction instruction;
    public final String step;      // issue | respond | propose | decide | settle
    public final String json;      // canonical Rune JSON of the instruction
    public final String hash;      // 0x-prefixed SHA-256 of the Rune JSON

    private Cdm(String step, Map<String, Object> value) {
        this.step = step;
        this.instruction = CdmRuntime.load(MarginCallInstruction.class, o(step, value));
        CdmRuntime.validate(this.instruction); // never let an invalid CDM document reach the ledger
        this.json = CdmRuntime.toJson(this.instruction);
        this.hash = sha256Hex(this.json);
    }

    // ---- Rune JSON builders (shapes from cdm-ext test Data.java), parameterised with live cycle values ----

    private static Map<String, Object> money(long v) {
        return o("value", v, "unit", o("currency", o("@data", "USD")));
    }

    private static Map<String, Object> ident(String v, String issuer) {
        return o("issuer", o("@data", issuer), "assignedIdentifier", l(o("identifier", o("@data", v))));
    }

    /** A collateral security identified by ISIN. A choice value carries its chosen option's @type. */
    private static Map<String, Object> security(String isin) {
        return o("@type", "cdm.base.staticdata.asset.common.Security",
                "identifier", l(o("identifier", o("@data", isin), "identifierType", "ISIN")),
                "securityType", "Debt", "assetType", "Security");
    }

    private static Map<String, Object> position(long units, String isin) {
        return o("priceQuantity", l(o("quantity", o("value", units, "unit", o("financialUnit", "Share")))),
                "asset", security(isin));
    }

    private static Map<String, Object> party(String name) {
        return o("partyId", l(o("identifier", o("@data", name))));
    }

    /** The call's common header. In the IM flow BANK-A pledges to BANK-B whichever party issues the call. */
    private static Map<String, Object> callBase(String callId, String issuer) {
        return o("instructionType", o("callType", "MarginCall"),
                "callIdentifier", ident(callId, issuer),
                "callAgreementType", o("agreementType", "CreditSupportAgreement",
                        "creditSupportAgreementType", o("@data", "CreditSupportAnnex")),
                "regMarginType", "RegIM",
                "partyRole", l(o("partyReference", party("BANK-A"), "role", "Pledgor"),
                        o("partyReference", party("BANK-B"), "role", "SecuredParty")));
    }

    // ---- lifecycle steps (each a validated MarginCallInstruction) ----

    public static Cdm issue(String callId, String issuer, long amountUsd, String direction) {
        Map<String, Object> issuance = callBase(callId, issuer);
        issuance.put("callAmountInBaseCurrency", money(amountUsd));
        return new Cdm("issue", o("issuance", issuance, "direction", direction));
    }

    public static Cdm respond(String callId, String issuer, String kind, long agreedUsd,
                              String action, long units, String collateralIsin) {
        Map<String, Object> resp = callBase(callId, issuer);
        resp.put("marginResponseType", kind); // AgreeinFull | PartiallyAgree | Dispute
        resp.put("agreedAmountBaseCurrency", money(agreedUsd));
        resp.put("marginCallResponseAction",
                l(o("collateralPositionComponent", l(position(units, collateralIsin)), "marginCallAction", action)));
        return new Cdm("respond", resp);
    }

    /** assets: list of {isin, units}; valueAfterHaircutsUsd: value the proposal covers, in the agreement's base currency. */
    public static Cdm propose(String callId, String callIssuer, String proposalId, String proposer,
                              List<Map<String, Object>> assets, long valueAfterHaircutsUsd) {
        List<Object> positions = new ArrayList<>();
        for (Map<String, Object> a : assets) {
            positions.add(position(((Number) a.get("units")).longValue(), (String) a.get("isin")));
        }
        Map<String, Object> prop = o(
                "proposalIdentifier", ident(proposalId, proposer),
                "callIdentifier", ident(callId, callIssuer),
                "proposedCollateral", positions,
                "valueAfterHaircuts", money(valueAfterHaircutsUsd),
                "status", "Proposed");
        return new Cdm("propose", prop);
    }

    public static Cdm decide(String proposalId, boolean accept, String reason) {
        Map<String, Object> d = o("proposalId", proposalId, "accept", accept);
        if (!accept && reason != null && !reason.isBlank()) d.put("reason", reason);
        return new Cdm("decide", d);
    }

    public static Cdm settle(String proposalId) {
        return new Cdm("settle", o("proposalId", proposalId));
    }

    /**
     * CDM {@code callIdentifier} derived from the shared on-chain callId, so both parties' services name the same call
     * in their CDM documents without exchanging it (no peer messaging in this cycle).
     */
    public static String cdmCallId(String onChainCallId) {
        String h = onChainCallId.startsWith("0x") ? onChainCallId.substring(2) : onChainCallId;
        return "C-" + h.substring(0, Math.min(8, h.length())).toUpperCase();
    }

    /** Deterministic on-chain bytes32 call id from a seed (party + counter + nanoTime). Not derived from CDM content. */
    public static String onChainId(String seed) {
        return sha256Hex(seed);
    }

    private static String sha256Hex(String s) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder("0x");
            for (byte b : d) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
