package collateral;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * CDM message content for the margin-call lifecycle (concept-asr-cdm-data-layer, concept-asr-onchain-call-state).
 *
 * First-cycle scope: messages are built as CDM-field-named canonical JSON (MarginCallIssuance, MarginCallResponse,
 * CollateralProposal) and hashed; the hash is the bytes32 recorded on-chain so a counterparty can check CDM content
 * received off-chain against the on-chain hash. Full org.finos.cdm:cdm-java object binding and the local cdm-ext
 * lifecycle types are the committed target (ADR wp-adr-java-cdm-stack) and are deferred for this first cycle
 * (see README, open item). The hash is SHA-256 over the canonical JSON, not keccak-256; aligning the hash algorithm
 * with the on-chain/off-chain verifiers is a separate open item (no verifier recomputes it in this flow).
 */
public final class Cdm {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    public final Map<String, Object> content;
    public final String json;
    public final String hash; // 0x-prefixed 32-byte hex

    private Cdm(Map<String, Object> content) {
        this.content = content;
        this.json = canonicalJson(content);
        this.hash = sha256Hex(this.json);
    }

    public static Cdm marginCallIssuance(String callId, String kind, String fromParty, String toParty, String amountScaled, long deadline) {
        var m = new LinkedHashMap<String, Object>();
        m.put("@type", "cdmx.collateral.margincall.MarginCallIssuance");
        m.put("callId", callId);
        m.put("callKind", kind); // IM | VM | Return
        m.put("regIMRole", kind.equals("IM") ? "SecuredParty" : "Transferee");
        m.put("instructingParty", fromParty);
        m.put("calledParty", toParty);
        m.put("callAmount", amount(amountScaled));
        m.put("settlementDate", deadline);
        return new Cdm(m);
    }

    public static Cdm marginCallResponse(String callId, String response, String agreedScaled, String disputedScaled) {
        var m = new LinkedHashMap<String, Object>();
        m.put("@type", "cdmx.collateral.margincall.MarginCallResponse");
        m.put("callId", callId);
        m.put("responseType", response); // full | partial | dispute
        m.put("agreedAmount", amount(agreedScaled));
        m.put("disputedAmount", amount(disputedScaled));
        return new Cdm(m);
    }

    public static Cdm collateralProposal(String callId, List<Map<String, Object>> assets) {
        var m = new LinkedHashMap<String, Object>();
        m.put("@type", "cdmx.collateral.CollateralProposal");
        m.put("callId", callId);
        m.put("proposedCollateral", assets); // [{token, isin, quantity}]
        return new Cdm(m);
    }

    private static Map<String, Object> amount(String scaled) {
        var a = new LinkedHashMap<String, Object>();
        a.put("value", scaled); // integer scaled by OracleFeed.PRICE_SCALE (1e8)
        a.put("unit", "USD");
        a.put("scale", "1e8");
        return a;
    }

    /** Deterministic bytes32 call id from a seed (party + counter + timestamp). Not derived from CDM content. */
    public static String callId(String seed) {
        return sha256Hex(seed);
    }

    private static String canonicalJson(Object o) {
        try {
            return MAPPER.writeValueAsString(o); // LinkedHashMap preserves insertion order -> stable bytes
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
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
