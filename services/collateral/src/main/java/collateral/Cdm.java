package collateral;

import cdmx.collateral.margincall.MarginCallInstruction;
import org.bouncycastle.jcajce.provider.digest.Keccak;

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
 * The on-chain {@code cdmHash} is keccak-256 over the Rune JSON (Ethereum/EVM hashing, so a contract or counterparty
 * can recompute it with {@code keccak256(bytes)} over the same canonical bytes).
 *
 * Each step is validated individually here; {@link CdmFold} folds the chain-ordered steps of both parties, read back
 * from the payload store by their {@code cdmHash}, into the shared {@code MarginCallState} (wp-adr-cdm-payload-carrier).
 * First-cycle reductions (nw-e2e-first-cycle-scope): the CDM {@code callIdentifier} is derived from the shared on-chain callId so both parties agree without peer
 * messaging; amounts are the agreement's base currency (USD) whole units, while the chain carries the 1e8-scaled value.
 */
public final class Cdm {
    public final MarginCallInstruction instruction;
    public final String step;      // issue | respond | propose | decide | settle
    public final String json;      // canonical Rune JSON of the instruction
    public final String hash;      // 0x-prefixed keccak-256 of the Rune JSON

    private Cdm(String step, Map<String, Object> value) {
        this.step = step;
        this.instruction = CdmRuntime.load(MarginCallInstruction.class, o(step, value));
        CdmRuntime.validate(this.instruction); // never let an invalid CDM document reach the ledger
        this.json = CdmRuntime.toJson(this.instruction);
        this.hash = keccak256Hex(this.json);
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

    /**
     * The call's common header. In the IM flow BANK-A pledges to BANK-B whichever party issues the call.
     * {@code regMarginType} is the CDM RegMarginTypeEnum name: "VM" for a variation margin call, "RegIM" otherwise
     * (a return's own margin type is stated when it settles, SettleCallInstruction returnedMarginType).
     */
    private static Map<String, Object> callBase(String callId, String issuer, String regMarginType) {
        return o("instructionType", o("callType", "MarginCall"),
                "callIdentifier", ident(callId, issuer),
                "callAgreementType", o("agreementType", "CreditSupportAgreement",
                        "creditSupportAgreementType", o("@data", "CreditSupportAnnex")),
                "regMarginType", regMarginType,
                "partyRole", l(o("partyReference", party("BANK-A"), "role", "Pledgor"),
                        o("partyReference", party("BANK-B"), "role", "SecuredParty")));
    }

    // ---- lifecycle steps (each a validated MarginCallInstruction) ----

    public static Cdm issue(String callId, String issuer, long amountUsd, String direction) {
        return issue(callId, issuer, amountUsd, direction, null, "RegIM");
    }

    public static Cdm issue(String callId, String issuer, long amountUsd, String direction, String replacesCall) {
        return issue(callId, issuer, amountUsd, direction, replacesCall, "RegIM");
    }

    /** The CDM RegMarginTypeEnum name of an on-chain call kind (IM, VM, Return). */
    public static String regMarginType(String kind) {
        return kind.equals("VM") ? "VM" : "RegIM";
    }

    /** IssueCall; {@code replacesCall} is the CDM identifier of a cancelled call this one replaces, or null (task-csa-call-replacement). */
    public static Cdm issue(String callId, String issuer, long amountUsd, String direction, String replacesCall, String regMarginType) {
        Map<String, Object> issuance = callBase(callId, issuer, regMarginType);
        issuance.put("callAmountInBaseCurrency", money(amountUsd));
        Map<String, Object> issue = o("issuance", issuance, "direction", direction);
        if (replacesCall != null) issue.put("replacesCall", replacesCall);
        return new Cdm("issue", issue);
    }

    /** Whether this IssueCall step may replace the folded state of a cancelled call (cdm-ext ReplacementAllowed). */
    public boolean replaces(cdmx.collateral.margincall.MarginCallState replaced) {
        return Boolean.TRUE.equals(CdmRuntime.fn(cdmx.collateral.margincall.functions.ReplacementAllowed.class)
                .evaluate(instruction.getIssue(), replaced));
    }

    public static Cdm respond(String callId, String issuer, String kind, long agreedUsd,
                              String action, long units, String collateralIsin) {
        return respond(callId, issuer, kind, agreedUsd, action, units, collateralIsin, "RegIM");
    }

    public static Cdm respond(String callId, String issuer, String kind, long agreedUsd,
                              String action, long units, String collateralIsin, String regMarginType) {
        Map<String, Object> resp = callBase(callId, issuer, regMarginType);
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

    /** Delivery settlement: delivers the accepted proposal against the call. */
    public static Cdm settle(String proposalId) {
        return new Cdm("settle", o("proposalId", proposalId));
    }

    /** Delivery settled in a settlement netting (flow-settlement-netting): the step names the netting. */
    public static Cdm settle(String proposalId, String nettingId) {
        return new Cdm("settle", o("proposalId", proposalId, "nettingIdentifier", nettingId));
    }

    /**
     * Return settlement: releases collateral already held (IM return) or transfers equivalent support back (VM return).
     * A return has no proposal; the SettleCallInstruction carries the released collateral and its value after haircuts,
     * which the CDM fold checks against the agreed return amount (SettleCallInstruction DeliveryOrReturn choice).
     */
    public static Cdm settleReturn(List<Map<String, Object>> assets, long releasedValueUsd) {
        return settleReturn(assets, releasedValueUsd, null, null);
    }

    /**
     * Return settlement stating the margin returned: "RegIM" when escrowed initial margin was released, "VM" when
     * variation margin was paid back by transfer (cdm-ext returnedMarginType; flow-reconciliation reads it).
     */
    public static Cdm settleReturn(List<Map<String, Object>> assets, long releasedValueUsd, String nettingId, String returnedMarginType) {
        List<Object> positions = new ArrayList<>();
        for (Map<String, Object> a : assets) {
            positions.add(position(((Number) a.get("units")).longValue(), (String) a.get("isin")));
        }
        Map<String, Object> s = o("releasedCollateral", positions, "releasedValue", money(releasedValueUsd));
        if (nettingId != null) s.put("nettingIdentifier", nettingId);
        if (returnedMarginType != null) s.put("returnedMarginType", returnedMarginType);
        return new Cdm("settle", s);
    }

    /** Return settled in a settlement netting (flow-settlement-netting): the step names the netting. */
    public static Cdm settleReturn(List<Map<String, Object>> assets, long releasedValueUsd, String nettingId) {
        return settleReturn(assets, releasedValueUsd, nettingId, "VM"); // netting settles variation margin only
    }

    // ---- cancellation (task-csa-call-cancellation; rules to confirm in task-sme-call-cancellation-rules) ----

    /** The calling party withdraws an unanswered call. */
    public static Cdm withdraw(String reason) {
        return new Cdm("withdraw", o("reason", reason == null || reason.isBlank() ? "withdrawn by the calling party" : reason));
    }

    /** Either party asks to cancel an answered call; role is Pledgor or SecuredParty (colr.005). */
    public static Cdm requestCancellation(String role, String reason) {
        Map<String, Object> r = o("requestedBy", role);
        if (reason != null && !reason.isBlank()) r.put("reason", reason);
        return new Cdm("requestCancellation", r);
    }

    /** The other party accepts or refuses the pending cancellation request (colr.006). */
    public static Cdm decideCancellation(String role, boolean accept, String reason) {
        Map<String, Object> d = o("decidedBy", role, "accept", accept);
        if (reason != null && !reason.isBlank()) d.put("reason", reason);
        return new Cdm("decideCancellation", d);
    }

    /**
     * CDM {@code callIdentifier} derived from the shared on-chain callId, so both parties' services name the same call
     * in their CDM documents without exchanging it (no peer messaging in this cycle).
     */
    public static String cdmCallId(String onChainCallId) {
        String h = onChainCallId.startsWith("0x") ? onChainCallId.substring(2) : onChainCallId;
        return "C-" + h.substring(0, Math.min(8, h.length())).toUpperCase();
    }

    /** Deterministic on-chain bytes32 call id from a seed (party + counter + nanoTime). An opaque id, not a content hash. */
    public static String onChainId(String seed) {
        try {
            return hex(MessageDigest.getInstance("SHA-256").digest(seed.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    /** keccak-256 (Ethereum/EVM), used for the CDM content hash so an on-chain verifier can recompute it. */
    private static String keccak256Hex(String s) {
        return hex(new Keccak.Digest256().digest(s.getBytes(StandardCharsets.UTF_8)));
    }

    /** keccak-256 over a document's UTF-8 bytes; a consumer recomputes this to verify a fetched payload (carrier). */
    public static String keccakHex(String s) {
        return keccak256Hex(s);
    }

    private static String hex(byte[] d) {
        StringBuilder sb = new StringBuilder("0x");
        for (byte b : d) sb.append(String.format("%02x", b));
        return sb.toString();
    }
}
