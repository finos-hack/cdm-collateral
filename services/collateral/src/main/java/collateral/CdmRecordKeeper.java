package collateral;

import cdm.base.staticdata.asset.common.Asset;
import cdm.base.staticdata.party.LegalEntity;
import cdmx.collateral.ledger.AnchorStatusEnum;
import cdmx.collateral.ledger.AnchoredRecordEnum;
import cdmx.collateral.ledger.LedgerAnchor;
import cdmx.collateral.ledger.RecordKeeperConfirmation;
import cdmx.collateral.ledger.TokenizedAsset;
import cdmx.collateral.ledger.functions.AnchorStatus;
import cdmx.collateral.ledger.functions.Create_LedgerAnchor;
import cdmx.collateral.ledger.functions.EligibleUnderControl;
import cdmx.collateral.ledger.functions.RegisterBreaks;
import cdmx.collateral.ledger.functions.TransferComplete;
import cdmx.collateral.reconciliation.LedgerBreak;
import cdmx.collateral.reconciliation.LedgerFact;
import com.fasterxml.jackson.databind.JsonNode;

import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static collateral.CdmRuntime.o;

/**
 * Completion of transfers and enforcement by the token's authoritative record (task-authoritative-record-settlement-
 * enforcement; cdm-ext {@code TransferComplete}, {@code EligibleUnderControl}, {@code RegisterBreaks}). For a Bearer
 * token the final ledger transaction completes a movement. For a Registered or Claim token (tMMF, kept by its transfer
 * agent) the record keeper must also confirm that its register shows the movement: interim rules REG-1 to REG-5
 * (project owner, 2026-11-21, task-sme-registered-asset-completion). Both parties read the same confirmations from the
 * chain (RecordKeeperRegister), so both reach the same result. The completion is reported next to the CDM state and is
 * not part of it: the CDM status records what the parties instructed.
 */
public final class CdmRecordKeeper {
    private CdmRecordKeeper() {}

    /** The CDM TokenizedAsset of each registry token, by symbol. */
    static Map<String, TokenizedAsset> tokens(JsonNode registry) {
        Map<String, TokenizedAsset> out = new LinkedHashMap<>();
        JsonNode all = registry.get("tokens");
        all.fieldNames().forEachRemaining(sym -> {
            JsonNode t = all.get(sym);
            String record = t.path("authoritativeRecord").asText("Bearer");
            Map<String, Object> doc = o("asset", CdmSubstitution.security(t.get("isin").asText()),
                "network", o("name", "besu-prototype", "platform", "Hyperledger Besu", "chainId", registry.path("chainId").asInt(1337)),
                "tokenContract", t.get("address").asText().toLowerCase(),
                "tokenStandard", "ERC20", "decimals", t.path("decimals").asInt(0), "authoritativeRecord", record);
            if (t.hasNonNull("dti")) doc.put("dti", t.get("dti").asText());
            if (t.hasNonNull("recordKeeper")) doc.put("recordKeeper", o("name", o("@data", t.get("recordKeeper").asText())));
            if (t.hasNonNull("controlAgreement")) doc.put("controlAgreement", t.get("controlAgreement").asText());
            out.put(sym, CdmRuntime.load(TokenizedAsset.class, doc));
        });
        return out;
    }

    /** REG-3: whether the token may be collateral given its authoritative record (EligibleUnderControl). */
    static boolean eligible(TokenizedAsset token) {
        return Boolean.TRUE.equals(CdmRuntime.fn(EligibleUnderControl.class).evaluate(token));
    }

    private static boolean bearer(TokenizedAsset t) {
        return "Bearer".equals(t.getAuthoritativeRecord().toDisplayString());
    }

    private static String symbolOf(Map<String, TokenizedAsset> tokens, String contract) {
        for (var e : tokens.entrySet()) if (e.getValue().getTokenContract().equalsIgnoreCase(contract)) return e.getKey();
        return null;
    }

    /** The record keeper's confirmations of one transaction, as CDM RecordKeeperConfirmations of the record. */
    private static List<RecordKeeperConfirmation> confirmations(JsonNode chain, TokenizedAsset token, String txHash, String recordIdentifier) {
        List<RecordKeeperConfirmation> out = new ArrayList<>();
        if (token.getRecordKeeper() == null) return out;
        for (JsonNode c : chain) {
            if (!c.get("txHash").asText().equalsIgnoreCase(txHash) || !c.get("token").asText().equalsIgnoreCase(token.getTokenContract())) continue;
            out.add(RecordKeeperConfirmation.builder()
                .setRecordKeeper(CdmRuntime.load(LegalEntity.class, o("name", o("@data", token.getRecordKeeper().getName().getValue()))))
                .setAsset(CdmRuntime.load(Asset.class, CdmSubstitution.security(isin(token))))
                .setRecordIdentifier(recordIdentifier)
                // The confirmation's block time is not read; both parties use the same fixed instant, so the result is the
                // same on both sides.
                .setConfirmedAt(ZonedDateTime.of(1970, 1, 1, 0, 0, 0, 0, ZoneOffset.UTC))
                .setReference(c.path("ref").asText(null))
                .setTransactionHash(txHash.toLowerCase())
                .build());
        }
        return out;
    }

    private static String isin(TokenizedAsset t) {
        return t.getAsset().getInstrument().getSecurity().getIdentifier().get(0).getIdentifier().getValue();
    }

    /** The tokens a transaction moved: the contracts of its Transfer logs that are registry tokens. */
    private static Set<String> moved(Map<String, TokenizedAsset> tokens, JsonNode step) {
        Set<String> out = new LinkedHashSet<>();
        for (JsonNode l : step.path("txLogs")) {
            if (!"Transfer".equals(l.path("event").asText())) continue;
            String sym = symbolOf(tokens, l.get("contract").asText());
            if (sym != null) out.add(sym);
        }
        return out;
    }

    /** One record's completion: for each token its transaction moved, whether TransferComplete holds. */
    private static Map<String, Object> record(Map<String, TokenizedAsset> tokens, String identifier, JsonNode step,
                                              AnchorStatusEnum anchorStatus, JsonNode chainConfirmations) {
        TransferComplete complete = CdmRuntime.fn(TransferComplete.class);
        List<Map<String, Object>> perToken = new ArrayList<>();
        boolean all = anchorStatus == AnchorStatusEnum.COMPLETE;
        for (String sym : moved(tokens, step)) {
            TokenizedAsset t = tokens.get(sym);
            List<RecordKeeperConfirmation> cs = confirmations(chainConfirmations, t, step.get("txHash").asText(), identifier);
            boolean ok = Boolean.TRUE.equals(complete.evaluate(t, identifier, anchorStatus, cs));
            all &= ok;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("symbol", sym);
            m.put("authoritativeRecord", t.getAuthoritativeRecord().toDisplayString());
            if (!bearer(t)) {
                m.put("recordKeeper", t.getRecordKeeper().getName().getValue());
                m.put("confirmed", !cs.isEmpty());
                if (!cs.isEmpty() && cs.get(0).getReference() != null) m.put("reference", cs.get(0).getReference());
            }
            m.put("complete", ok);
            perToken.add(m);
        }
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("identifier", identifier);
        r.put("txHash", step.get("txHash").asText().toLowerCase());
        r.put("tokens", perToken);
        r.put("complete", all);
        return r;
    }

    /**
     * Completion of each folded margin call step (step i is "S-i", as CdmAnchors and CdmFold number it). anchorStatuses
     * is CdmAnchors.statuses' output. Returns {records: [...], complete} where complete holds when every step's anchor
     * is Complete and every token each one moved is complete under its authoritative record.
     */
    static Map<String, Object> steps(JsonNode registry, JsonNode steps, int folded, List<Map<String, Object>> anchorStatuses, JsonNode chainConfirmations) {
        Map<String, TokenizedAsset> tokens = tokens(registry);
        List<Map<String, Object>> records = new ArrayList<>();
        boolean all = true;
        for (int i = 0; i < folded; i++) {
            String id = "S-" + (i + 1);
            AnchorStatusEnum status = AnchorStatusEnum.MISSING;
            for (Map<String, Object> s : anchorStatuses) if (id.equals(s.get("identifier"))) status = AnchorStatusEnum.fromDisplayName(String.valueOf(s.get("status")));
            Map<String, Object> r = record(tokens, id, steps.get(i), status, chainConfirmations);
            all &= Boolean.TRUE.equals(r.get("complete"));
            if (!((List<?>) r.get("tokens")).isEmpty()) records.add(r); // only the steps that moved tokens
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("records", records);
        out.put("complete", all);
        return out;
    }

    /**
     * Completion of a call's enforcement (REG-4): the Enforcement LedgerAnchor of the CDM CollateralEnforcement record,
     * built from the Enforced event and its transaction, and TransferComplete for each token it moved.
     */
    static Map<String, Object> enforcement(JsonNode registry, JsonNode enforcementSteps, String recordIdentifier, String documentHash, JsonNode chainConfirmations) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("identifier", recordIdentifier);
        if (enforcementSteps.isEmpty()) {
            out.put("anchorStatus", "Missing");
            out.put("complete", false);
            return out;
        }
        JsonNode step = enforcementSteps.get(0);
        LedgerAnchor anchor = CdmRuntime.fn(Create_LedgerAnchor.class).evaluate(AnchoredRecordEnum.ENFORCEMENT, recordIdentifier,
            documentHash.toLowerCase(), CdmAnchors.observed(enforcementSteps));
        AnchorStatusEnum status = CdmRuntime.fn(AnchorStatus.class).evaluate(anchor, 1);
        out.put("anchorStatus", status.toDisplayString());
        out.put("anchorHash", Cdm.keccakHex(CdmRuntime.toJson(anchor)));
        out.putAll(record(tokens(registry), recordIdentifier, step, status, chainConfirmations));
        return out;
    }

    /**
     * REG-5: the record keeper's register against the ledger for one token (RegisterBreaks). register: holder -> units
     * from the record keeper; onLedger: holder -> units from balanceOf. Facts are "register/<symbol>/<holder>" units.
     */
    static Map<String, Object> breaks(String symbol, Map<String, String> register, Map<String, String> onLedger) {
        List<LedgerFact> r = facts(symbol, register), l = facts(symbol, onLedger);
        List<? extends LedgerBreak> found = CdmRuntime.fn(RegisterBreaks.class).evaluate(r, l);
        List<Map<String, Object>> rows = new ArrayList<>();
        for (LedgerBreak b : found) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("record", b.getRecordIdentifier());
            m.put("breakType", b.getBreakType().toDisplayString());
            if (b.getRecordedValue() != null) m.put("registerValue", b.getRecordedValue());
            if (b.getLedgerValue() != null) m.put("ledgerValue", b.getLedgerValue());
            rows.add(m);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("symbol", symbol);
        out.put("checkedFacts", r.size() + l.size());
        out.put("breaks", rows);
        out.put("reconciled", rows.isEmpty());
        return out;
    }

    private static List<LedgerFact> facts(String symbol, Map<String, String> holdings) {
        List<LedgerFact> out = new ArrayList<>();
        holdings.forEach((holder, units) -> {
            if (!"0".equals(units)) out.add(LedgerFact.builder().setRecordIdentifier("register/" + symbol + "/" + holder.toLowerCase())
                .setAttribute("units").setFactValue(units).build());
        });
        return out;
    }
}
