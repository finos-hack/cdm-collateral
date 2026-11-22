package collateral;

import cdmx.collateral.ledger.AnchorStatusEnum;
import cdmx.collateral.ledger.AnchoredRecordEnum;
import cdmx.collateral.ledger.LedgerAnchor;
import cdmx.collateral.ledger.LedgerNetwork;
import cdmx.collateral.ledger.LedgerTransaction;
import cdmx.collateral.ledger.LedgerTransactionStatusEnum;
import cdmx.collateral.ledger.functions.AnchorFor;
import cdmx.collateral.ledger.functions.AnchorStatus;
import cdmx.collateral.ledger.functions.Create_LedgerAnchor;
import cdmx.collateral.ledger.functions.MarginCallStepAnchorStatus;
import cdmx.collateral.margincall.MarginCallState;
import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Builds the CDM {@code LedgerAnchor} of each folded margin call step from the chain events the gateway reports (gap
 * G25, nw-ledger-anchor-redesign, nw-ledger-anchor-implementation). The anchors are derived data: each party builds them
 * from the same chain events with {@code Create_LedgerAnchor}, so both build the same anchors, and the folded
 * {@code MarginCallState} (and its stateHash) holds no ledger data.
 *
 * <p>The observed events are every step event of the call (each carrying its cdmHash) and the other events of the same
 * transactions without a hash (token Transfer, Pledged, Transferred), in chain order. A step event that also appears
 * among another step's transaction logs is taken once, with its hash.
 */
public final class CdmAnchors {
    private CdmAnchors() {}

    /** The chain events of a call, in chain order (block, then log index), from the gateway's steps. */
    static List<LedgerTransaction> observed(JsonNode steps) {
        List<Object[]> rows = new ArrayList<>(); // {block, logIndex, LedgerTransaction}
        Set<String> seen = new HashSet<>();
        for (JsonNode s : steps) {
            if (seen.add(s.get("txHash").asText() + "#" + s.get("logIndex").asInt()))
                rows.add(new Object[]{s.get("block").asLong(), s.get("logIndex").asInt(),
                    tx(s, s.get("contract").asText(), s.get("logIndex").asInt(), s.get("event").asText(), s.get("cdmHash").asText())});
        }
        for (JsonNode s : steps) {
            for (JsonNode l : s.path("txLogs")) {
                if (!seen.add(s.get("txHash").asText() + "#" + l.get("logIndex").asInt())) continue;
                rows.add(new Object[]{s.get("block").asLong(), l.get("logIndex").asInt(),
                    tx(s, l.get("contract").asText(), l.get("logIndex").asInt(), l.hasNonNull("event") ? l.get("event").asText() : null, null)});
            }
        }
        rows.sort(Comparator.<Object[]>comparingLong(r -> (Long) r[0]).thenComparingInt(r -> (Integer) r[1]));
        List<LedgerTransaction> out = new ArrayList<>();
        for (Object[] r : rows) out.add((LedgerTransaction) r[2]);
        return out;
    }

    private static LedgerTransaction tx(JsonNode step, String contract, int logIndex, String event, String recordedHash) {
        JsonNode n = step.get("network");
        LedgerTransaction.LedgerTransactionBuilder b = LedgerTransaction.builder()
            .setNetwork(LedgerNetwork.builder()
                .setName(n.get("name").asText())
                .setPlatform(n.get("platform").asText())
                .setChainId(n.hasNonNull("chainId") ? n.get("chainId").asInt() : null)
                .build())
            .setContractAddress(contract.toLowerCase())
            .setTransactionHash(step.get("txHash").asText().toLowerCase())
            .setBlockNumber(step.get("block").asInt())
            .setLogIndex(logIndex)
            .setStatus("Reverted".equals(step.path("status").asText())
                ? LedgerTransactionStatusEnum.REVERTED : LedgerTransactionStatusEnum.FINAL);
        if (event != null) b.setEventName(event);
        if (recordedHash != null) b.setRecordedHash(recordedHash.toLowerCase());
        return b.build();
    }

    /** The anchor of each folded step: step i is identified "S-i", as {@link CdmFold} numbers it, and its document hash
     *  is computed here from the payload (keccak256 over the Rune JSON), independently of the hash the chain reports. */
    static List<LedgerAnchor> anchors(JsonNode steps, List<String> foldedDocs) {
        List<LedgerTransaction> observed = observed(steps);
        Create_LedgerAnchor create = CdmRuntime.fn(Create_LedgerAnchor.class);
        List<LedgerAnchor> anchors = new ArrayList<>();
        for (int i = 0; i < foldedDocs.size(); i++)
            anchors.add(create.evaluate(AnchoredRecordEnum.MARGIN_CALL_STEP, "S-" + (i + 1),
                Cdm.keccakHex(foldedDocs.get(i)).toLowerCase(), observed));
        return anchors;
    }

    /** The Substitution anchor of each folded substitution step (task-substitution-ledger-anchors). A step is identified
     *  by its name (request, consent, settle): the control contract records each at most once for a substitution. Its
     *  document hash is computed here from the SubstitutionInstruction payload, as for a margin call step. */
    static List<LedgerAnchor> substitutionAnchors(JsonNode steps, List<String> foldedDocs) {
        List<LedgerTransaction> observed = observed(steps);
        Create_LedgerAnchor create = CdmRuntime.fn(Create_LedgerAnchor.class);
        List<LedgerAnchor> anchors = new ArrayList<>();
        for (int i = 0; i < foldedDocs.size(); i++)
            anchors.add(create.evaluate(AnchoredRecordEnum.SUBSTITUTION, steps.get(i).get("step").asText(),
                Cdm.keccakHex(foldedDocs.get(i)).toLowerCase(), observed));
        return anchors;
    }

    /** Each folded substitution step's anchor status (AnchorStatus of its anchor, one transaction a step), in step order. */
    static List<Map<String, Object>> substitutionStatuses(JsonNode steps, int folded, List<LedgerAnchor> anchors) {
        AnchorFor anchorFor = CdmRuntime.fn(AnchorFor.class);
        AnchorStatus status = CdmRuntime.fn(AnchorStatus.class);
        List<Map<String, Object>> out = new ArrayList<>();
        for (int i = 0; i < folded; i++) {
            String step = steps.get(i).get("step").asText();
            LedgerAnchor a = anchorFor.evaluate(anchors, AnchoredRecordEnum.SUBSTITUTION, step);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("identifier", step);
            m.put("status", status.evaluate(a, 1).toDisplayString());
            m.put("transactions", a == null ? 0 : a.getTransaction().size());
            out.add(m);
        }
        return out;
    }

    /** Each folded step's anchor status (MarginCallStepAnchorStatus), in step order. */
    static List<Map<String, Object>> statuses(MarginCallState state, List<LedgerAnchor> anchors) {
        MarginCallStepAnchorStatus status = CdmRuntime.fn(MarginCallStepAnchorStatus.class);
        List<Map<String, Object>> out = new ArrayList<>();
        for (var record : state.getStepRecord()) {
            AnchorStatusEnum s = status.evaluate(state, record.getIdentifier(), anchors);
            LedgerAnchor a = anchors.stream().filter(x -> x.getRecordIdentifier().equals(record.getIdentifier())).findFirst().orElse(null);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("identifier", record.getIdentifier());
            m.put("step", String.valueOf(record.getStep()));
            m.put("status", s.toDisplayString());
            m.put("transactions", a == null ? 0 : a.getTransaction().size());
            out.add(m);
        }
        return out;
    }
}
