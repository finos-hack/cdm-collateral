package collateral;

import cdmx.collateral.ledger.AnchorStatusEnum;
import cdmx.collateral.ledger.AnchoredRecordEnum;
import cdmx.collateral.ledger.LedgerAnchor;
import cdmx.collateral.ledger.LedgerTransaction;
import cdmx.collateral.ledger.functions.AnchorStatus;
import cdmx.collateral.ledger.functions.Create_LedgerAnchor;
import com.fasterxml.jackson.databind.JsonNode;

import java.math.BigInteger;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Walks the provenance path of a pledged token back to its asset (task-document-provenance, gap G41,
 * wp-adr-document-provenance) and reports every link that is missing, unanchored, unattested, altered or superseded,
 * and any issuance the custody record does not cover.
 *
 * <p>For each relation of the path (issuance, token terms, custody, constitution, valuation) the current record is the
 * one whose hash is anchored on the ledger and that no other anchored record of the same link revises
 * ({@code prov:wasRevisionOf}). For that record the check confirms:
 * <ul>
 *   <li>its anchor is complete ({@code Create_LedgerAnchor}, {@code AnchorStatus}, kind {@code AssetDocument} or
 *       {@code Valuation});</li>
 *   <li>the document behind it is held and hashes to the hash the record names;</li>
 *   <li>its record keeper attests it with a Verifiable Credential that verifies ({@link ProvCredentials});</li>
 *   <li>it is the version the secured party relied on, if one was pinned at the pledge.</li>
 * </ul>
 * The issuance record is also checked by asset: it must name the same asset and holding as the custody record, and the
 * face amount that every token's current issuance record claims against that holding must not exceed the face amount
 * the custody record holds (double tokenization). The units on the ledger must not exceed the units issued.
 */
public final class ProvenanceCheck {
    private ProvenanceCheck() {}

    /** The relations a token's path must have, in the order the check reports them. */
    public static final List<String> PATH = List.of(ProvRecords.ISSUED_AGAINST, ProvRecords.TOKEN_TERMS,
        ProvRecords.CUSTODY, ProvRecords.CONSTITUTION, ProvRecords.VALUATION);

    public enum BreakKind {
        Missing, NotAnchored, AnchorNotComplete, Conflict, DocumentMissing, DocumentAltered, Unattested,
        BadCredential, Superseded, HoldingMismatch, DoubleTokenized, OverIssued
    }

    public record Break(BreakKind kind, String relation, String detail) {}

    /**
     * What the check reads.
     *
     * @param token         the pledged token, as a URN (for example "urn:dti:QX4V2W9N3")
     * @param records       every link record known, of any token (issuance records of other tokens are needed for the
     *                      double-tokenization check)
     * @param credentials   the record keepers' credentials
     * @param documents     the documents behind the links, by keccak-256 hash
     * @param observed      the ledger's provenance anchor events (cdmHash = record hash), in chain order
     * @param pinned        the record hash the secured party relied on at the pledge, by relation; may be empty
     * @param unitsOnLedger the token's units on the ledger (total supply), or null if not checked
     */
    public record Input(String token, List<JsonNode> records, List<JsonNode> credentials, Map<String, String> documents,
                        List<LedgerTransaction> observed, Map<String, String> pinned, BigInteger unitsOnLedger) {}

    /** The breaks found, the current record hash of each relation, and every token whose issuance claims the asset. */
    public record Result(List<Break> breaks, Map<String, String> current, List<String> tokensOnAsset) {
        public boolean clean() { return breaks.isEmpty(); }
    }

    public static Result check(Input in) {
        List<Break> breaks = new ArrayList<>();
        Map<String, JsonNode> current = new LinkedHashMap<>();
        for (String relation : PATH) {
            JsonNode head = head(in, in.token(), relation, breaks);
            if (head == null) continue;
            current.put(relation, head);
            String hash = ProvRecords.hash(head);
            anchorStatus(in, head, hash, relation, breaks);
            document(in, head, relation, breaks);
            attestation(in, head, hash, relation, breaks);
            String pinned = in.pinned() == null ? null : in.pinned().get(relation);
            if (pinned != null && !pinned.equalsIgnoreCase(hash))
                breaks.add(new Break(BreakKind.Superseded, relation,
                    "relied on " + pinned + "; the current anchored record is " + hash));
        }
        List<String> onAsset = issuance(in, current, breaks);
        Map<String, String> hashes = new LinkedHashMap<>();
        current.forEach((k, v) -> hashes.put(k, ProvRecords.hash(v)));
        return new Result(List.copyOf(breaks), hashes, onAsset);
    }

    /** Every token whose current issuance record claims the asset, from all records known (the issuance link by asset). */
    public static List<String> tokensIssuedAgainst(Input in, String asset) {
        return in.records().stream()
            .filter(r -> ProvRecords.ISSUED_AGAINST.equals(ProvRecords.relation(r)) && asset.equals(ProvRecords.term(r, "asset")))
            .map(ProvRecords::token).distinct()
            .filter(t -> head(in, t, ProvRecords.ISSUED_AGAINST, null) != null)
            .sorted().collect(Collectors.toList());
    }

    /** The current record of a token's link: anchored, and not revised by another anchored record of the same link. */
    private static JsonNode head(Input in, String token, String relation, List<Break> breaks) {
        List<JsonNode> all = in.records().stream()
            .filter(r -> token.equals(ProvRecords.token(r)) && relation.equals(ProvRecords.relation(r))).toList();
        if (all.isEmpty()) {
            if (breaks != null) breaks.add(new Break(BreakKind.Missing, relation, "no record for " + token));
            return null;
        }
        List<JsonNode> anchored = all.stream().filter(r -> anchored(in, ProvRecords.hash(r))).toList();
        if (anchored.isEmpty()) {
            if (breaks != null) breaks.add(new Break(BreakKind.NotAnchored, relation,
                "no record of " + ProvRecords.id(all.get(0)) + " is anchored on the ledger"));
            return null;
        }
        Set<String> revised = anchored.stream().map(ProvRecords::revisionOf).filter(Objects::nonNull)
            .map(String::toLowerCase).collect(Collectors.toSet());
        List<JsonNode> heads = anchored.stream().filter(r -> !revised.contains(ProvRecords.hash(r))).toList();
        if (heads.size() != 1) {
            if (breaks != null) breaks.add(new Break(BreakKind.Conflict, relation,
                heads.size() + " anchored records of " + ProvRecords.id(anchored.get(0)) + " are each current"));
            return null;
        }
        return heads.get(0);
    }

    private static boolean anchored(Input in, String hash) {
        return in.observed().stream().anyMatch(t -> hash.equalsIgnoreCase(t.getRecordedHash()));
    }

    private static void anchorStatus(Input in, JsonNode head, String hash, String relation, List<Break> breaks) {
        AnchoredRecordEnum kind = ProvRecords.VALUATION.equals(relation) ? AnchoredRecordEnum.VALUATION : AnchoredRecordEnum.ASSET_DOCUMENT;
        LedgerAnchor anchor = CdmRuntime.fn(Create_LedgerAnchor.class).evaluate(kind, ProvRecords.id(head), hash, in.observed());
        AnchorStatusEnum s = CdmRuntime.fn(AnchorStatus.class).evaluate(anchor, 1);
        if (s != AnchorStatusEnum.COMPLETE)
            breaks.add(new Break(BreakKind.AnchorNotComplete, relation, ProvRecords.id(head) + " anchor is " + s.toDisplayString()));
    }

    private static void document(Input in, JsonNode head, String relation, List<Break> breaks) {
        String claimed = ProvRecords.documentHash(head);
        String doc = in.documents().get(claimed);
        if (doc == null) {
            breaks.add(new Break(BreakKind.DocumentMissing, relation, "document " + claimed + " is not held"));
        } else if (!Cdm.keccakHex(doc).equalsIgnoreCase(claimed)) {
            breaks.add(new Break(BreakKind.DocumentAltered, relation,
                "document held as " + claimed + " hashes to " + Cdm.keccakHex(doc)));
        }
    }

    private static void attestation(Input in, JsonNode head, String hash, String relation, List<Break> breaks) {
        String subject = ProvRecords.urn(hash);
        String keeper = ProvRecords.recordKeeper(head);
        List<JsonNode> about = in.credentials().stream()
            .filter(c -> subject.equals(c.path("credentialSubject").path("id").asText())).toList();
        boolean good = about.stream().anyMatch(c -> keeper.equals(c.path("issuer").asText()) && ProvCredentials.verify(c));
        if (good) return;
        if (about.isEmpty())
            breaks.add(new Break(BreakKind.Unattested, relation, "no credential from " + keeper + " for " + ProvRecords.id(head)));
        else
            breaks.add(new Break(BreakKind.BadCredential, relation,
                "no credential for " + ProvRecords.id(head) + " is issued by its record keeper and verifies"));
    }

    /** Issuance against the custody holding, across every token that claims the same asset and holding. */
    private static List<String> issuance(Input in, Map<String, JsonNode> current, List<Break> breaks) {
        JsonNode issued = current.get(ProvRecords.ISSUED_AGAINST);
        JsonNode custody = current.get(ProvRecords.CUSTODY);
        if (issued == null) return List.of();
        String asset = ProvRecords.term(issued, "asset");
        List<String> onAsset = asset == null ? List.of() : tokensIssuedAgainst(in, asset);
        if (in.unitsOnLedger() != null) {
            BigInteger units = amount(issued, "unitsIssued");
            if (units != null && in.unitsOnLedger().compareTo(units) > 0)
                breaks.add(new Break(BreakKind.OverIssued, ProvRecords.ISSUED_AGAINST,
                    in.unitsOnLedger() + " units on the ledger; the issuance record issues " + units));
        }
        if (custody == null || asset == null) return onAsset;
        String holding = ProvRecords.term(issued, "holding");
        if (!asset.equals(ProvRecords.term(custody, "asset")) || !Objects.equals(holding, ProvRecords.term(custody, "holding"))) {
            breaks.add(new Break(BreakKind.HoldingMismatch, ProvRecords.ISSUED_AGAINST,
                "issued against " + asset + " in " + holding + "; custody holds " + ProvRecords.term(custody, "asset")
                    + " in " + ProvRecords.term(custody, "holding")));
            return onAsset;
        }
        BigInteger held = amount(custody, "faceAmountHeld");
        BigInteger claimed = BigInteger.ZERO;
        List<String> sharing = new ArrayList<>();
        for (String t : onAsset) {
            JsonNode h = head(in, t, ProvRecords.ISSUED_AGAINST, null);
            if (h == null || !Objects.equals(holding, ProvRecords.term(h, "holding"))) continue;
            BigInteger f = amount(h, "faceAmount");
            if (f != null) claimed = claimed.add(f);
            if (!t.equals(in.token())) sharing.add(t);
        }
        if (held != null && claimed.compareTo(held) > 0)
            breaks.add(new Break(sharing.isEmpty() ? BreakKind.OverIssued : BreakKind.DoubleTokenized, ProvRecords.ISSUED_AGAINST,
                "issuance records claim " + claimed + " face of " + asset + " in " + holding + "; custody holds " + held
                    + (sharing.isEmpty() ? "" : "; also claimed by " + String.join(", ", sharing))));
        return onAsset;
    }

    private static BigInteger amount(JsonNode r, String term) {
        String v = ProvRecords.term(r, term);
        return v == null ? null : new BigInteger(v);
    }
}
