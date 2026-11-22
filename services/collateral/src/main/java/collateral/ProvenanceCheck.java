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
 * and any issuance the holding record does not cover.
 *
 * <p>The path depends on the token's authoritative record (cdm-ext {@code AuthoritativeRecordEnum}):
 * <ul>
 *   <li><b>Bearer</b> (tUST): issuance, token terms, custody record, constitution, valuation. The ledger is the register
 *       of holders; the custodian's record holds the asset behind the token.</li>
 *   <li><b>Asset kept in a registry</b> (the aircraft case, G40): issuance, token terms, the registry's registration of
 *       the owner (in place of the custody record), constitution, valuation; and for every interest in the asset entered
 *       in a registry (a mortgage registered as an international interest), the interest holder's consent to the
 *       tokenization (interim rule pending REG-8 of task-sme-registered-asset-completion).</li>
 *   <li><b>Registered or Claim</b> (tMMF): issuance, token terms, the record keeper's register statement, constitution,
 *       valuation, and the control agreement (interim rule REG-3 of task-sme-registered-asset-completion: such a token
 *       is eligible only under a control agreement with its record keeper). The register statement takes the custody
 *       record's place as the holding record.</li>
 * </ul>
 *
 * <p>For each relation the current record is the one whose hash is anchored on the ledger and that no other anchored
 * record of the same link revises ({@code prov:wasRevisionOf}). For that record the check confirms its anchor is
 * complete ({@code Create_LedgerAnchor}, {@code AnchorStatus}), the document behind it is held and unaltered, its record
 * keeper attests it with a Verifiable Credential that verifies ({@link ProvCredentials}), and it is the version the
 * secured party relied on, if one was pinned at the pledge.
 *
 * <p>By asset: the issuance record must name the same asset and holding as the holding record; the amount every token's
 * current issuance record claims against that holding must not exceed the amount held (double tokenization); the units
 * on the ledger must not exceed the units issued. For a Registered or Claim token the register statement and the control
 * agreement must come from the token's record keeper, and the control agreement must be the one the token's profile
 * names, with the secured party of the pledge.
 */
public final class ProvenanceCheck {
    private ProvenanceCheck() {}

    /** The path of a Bearer token, in the order the check reports it. */
    public static final List<String> PATH = List.of(ProvRecords.ISSUED_AGAINST, ProvRecords.TOKEN_TERMS,
        ProvRecords.CUSTODY, ProvRecords.CONSTITUTION, ProvRecords.VALUATION);

    /** The path of a token whose asset is kept in a registry outside the ledger (an aircraft). */
    public static final List<String> PATH_REGISTRY_ASSET = List.of(ProvRecords.ISSUED_AGAINST, ProvRecords.TOKEN_TERMS,
        ProvRecords.REGISTRATION, ProvRecords.CONSTITUTION, ProvRecords.VALUATION);

    /** The path of a Registered or Claim token. */
    public static final List<String> PATH_UNDER_CONTROL = List.of(ProvRecords.ISSUED_AGAINST, ProvRecords.TOKEN_TERMS,
        ProvRecords.REGISTER, ProvRecords.CONSTITUTION, ProvRecords.VALUATION, ProvRecords.CONTROL_AGREEMENT);

    public enum BreakKind {
        Missing, NotAnchored, AnchorNotComplete, Conflict, DocumentMissing, DocumentAltered, Unattested,
        BadCredential, Superseded, HoldingMismatch, DoubleTokenized, OverIssued, RecordKeeperMismatch,
        ControlAgreementMismatch, InterestNotConsented
    }

    public record Break(BreakKind kind, String relation, String detail) {}

    /**
     * What the deployment says about the token (the gateway's token registry; cdm-ext {@code TokenizedAsset}).
     *
     * @param authoritativeRecord Bearer, Registered or Claim
     * @param recordKeeper        the record keeper's name, for a Registered or Claim token (for example "MMF Transfer Agent")
     * @param controlAgreement    the control agreement's reference, for a Registered or Claim token
     * @param securedParty        the secured party of the pledge being checked, or null if not checked
     * @param assetRegistry       the registry the asset is kept in, for an asset outside the financial system (for example
     *                            "FAA Aircraft Registry"), or null
     */
    public record TokenProfile(String authoritativeRecord, String recordKeeper, String controlAgreement, String securedParty,
                               String assetRegistry) {
        public static final TokenProfile BEARER = new TokenProfile("Bearer", null, null, null, null);

        public TokenProfile(String authoritativeRecord, String recordKeeper, String controlAgreement, String securedParty) {
            this(authoritativeRecord, recordKeeper, controlAgreement, securedParty, null);
        }

        /** From one token entry of the gateway's registry, for a pledge to {@code securedParty} (may be null). */
        public static TokenProfile fromRegistry(JsonNode token, String securedParty) {
            return new TokenProfile(token.path("authoritativeRecord").asText("Bearer"), token.path("recordKeeper").asText(null),
                token.path("controlAgreement").asText(null), securedParty, token.path("assetRegistry").asText(null));
        }

        public boolean underControl() {
            return "Registered".equals(authoritativeRecord) || "Claim".equals(authoritativeRecord);
        }

        public boolean registryAsset() {
            return assetRegistry != null;
        }

        public List<String> path() {
            return underControl() ? PATH_UNDER_CONTROL : registryAsset() ? PATH_REGISTRY_ASSET : PATH;
        }

        /** The relation that records the holding the token is issued against. */
        public String holdingRelation() {
            return underControl() ? ProvRecords.REGISTER : registryAsset() ? ProvRecords.REGISTRATION : ProvRecords.CUSTODY;
        }
    }

    /**
     * What the check reads.
     *
     * @param token         the pledged token, as a URN (for example "urn:dti:QX4V2W9N3")
     * @param profile       the token's authoritative record, record keeper and control agreement
     * @param records       every link record known, of any token (issuance records of other tokens are needed for the
     *                      double-tokenization check)
     * @param credentials   the record keepers' credentials
     * @param documents     the documents behind the links, by keccak-256 hash
     * @param observed      the ledger's provenance anchor events (cdmHash = record hash), in chain order
     * @param pinned        the record hash the secured party relied on at the pledge, by relation; may be empty
     * @param unitsOnLedger the token's units on the ledger (total supply), or null if not checked
     */
    public record Input(String token, TokenProfile profile, List<JsonNode> records, List<JsonNode> credentials,
                        Map<String, String> documents, List<LedgerTransaction> observed, Map<String, String> pinned,
                        BigInteger unitsOnLedger) {}

    /** The breaks found, the current record hash of each relation, and every token whose issuance claims the asset. */
    public record Result(List<Break> breaks, Map<String, String> current, List<String> tokensOnAsset) {
        public boolean clean() { return breaks.isEmpty(); }
    }

    public static Result check(Input in) {
        TokenProfile profile = in.profile() == null ? TokenProfile.BEARER : in.profile();
        List<Break> breaks = new ArrayList<>();
        Map<String, JsonNode> current = new LinkedHashMap<>();
        for (String relation : profile.path()) {
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
        if (profile.underControl()) control(profile, current, breaks);
        if (profile.registryAsset()) interests(in, current, breaks);
        List<String> onAsset = issuance(in, profile, current, breaks);
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

    /** The current record of one link (by @id): anchored and not revised by another anchored record of it; null if none or several. */
    private static JsonNode headOfLink(Input in, String id) {
        List<JsonNode> anchored = in.records().stream()
            .filter(r -> id.equals(ProvRecords.id(r)) && anchored(in, ProvRecords.hash(r))).toList();
        Set<String> revised = anchored.stream().map(ProvRecords::revisionOf).filter(Objects::nonNull)
            .map(String::toLowerCase).collect(Collectors.toSet());
        List<JsonNode> heads = anchored.stream().filter(r -> !revised.contains(ProvRecords.hash(r))).toList();
        return heads.size() == 1 ? heads.get(0) : null;
    }

    private static boolean anchored(Input in, String hash) {
        return in.observed().stream().anyMatch(t -> hash.equalsIgnoreCase(t.getRecordedHash()));
    }

    private static void anchorStatus(Input in, JsonNode head, String hash, String relation, List<Break> breaks) {
        AnchoredRecordEnum kind = switch (relation) {
            case ProvRecords.VALUATION -> AnchoredRecordEnum.VALUATION;
            case ProvRecords.REGISTRATION, ProvRecords.REGISTERED_INTEREST -> AnchoredRecordEnum.REGISTRY_ENTRY;
            default -> AnchoredRecordEnum.ASSET_DOCUMENT;
        };
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

    /**
     * A Registered or Claim token: the register statement and the control agreement come from the token's record keeper
     * (the same key attests both, and the register statement names the record keeper the profile names); the control
     * agreement is the one the profile names, with the pledge's secured party.
     */
    private static void control(TokenProfile profile, Map<String, JsonNode> current, List<Break> breaks) {
        JsonNode register = current.get(ProvRecords.REGISTER);
        JsonNode agreement = current.get(ProvRecords.CONTROL_AGREEMENT);
        if (register != null && profile.recordKeeper() != null
            && !profile.recordKeeper().equals(ProvRecords.term(register, "recordKeeperName")))
            breaks.add(new Break(BreakKind.RecordKeeperMismatch, ProvRecords.REGISTER,
                "the register statement is kept by " + ProvRecords.term(register, "recordKeeperName")
                    + "; the token's record keeper is " + profile.recordKeeper()));
        if (register != null && agreement != null
            && !ProvRecords.recordKeeper(register).equals(ProvRecords.recordKeeper(agreement)))
            breaks.add(new Break(BreakKind.RecordKeeperMismatch, ProvRecords.CONTROL_AGREEMENT,
                "the control agreement is attested by " + ProvRecords.recordKeeper(agreement)
                    + ", not by the register's record keeper " + ProvRecords.recordKeeper(register)));
        if (agreement == null) return;
        String ref = ProvRecords.term(agreement, "reference");
        if (profile.controlAgreement() == null || !profile.controlAgreement().equals(ref))
            breaks.add(new Break(BreakKind.ControlAgreementMismatch, ProvRecords.CONTROL_AGREEMENT,
                "the record is control agreement " + ref + "; the token names " + profile.controlAgreement()));
        if (profile.securedParty() != null && !profile.securedParty().equals(ProvRecords.term(agreement, "securedParty")))
            breaks.add(new Break(BreakKind.ControlAgreementMismatch, ProvRecords.CONTROL_AGREEMENT,
                "the control agreement's secured party is " + ProvRecords.term(agreement, "securedParty")
                    + "; the pledge is to " + profile.securedParty()));
    }

    /**
     * An asset kept in a registry: every interest the registry shows in the asset (each current, anchored and attested
     * RegisteredInterest record naming the asset, of any token) needs the interest holder's consent to this token, as a
     * current InterestConsent record of this token that names the interest and is attested by the holder. Interim rule,
     * pending REG-8 (task-sme-registered-asset-completion): without the consent the token holders' claim would rank
     * behind the registered interest, and tokenizing may breach the loan agreement's negative pledge.
     */
    private static void interests(Input in, Map<String, JsonNode> current, List<Break> breaks) {
        JsonNode issued = current.get(ProvRecords.ISSUED_AGAINST);
        if (issued == null) return;
        String asset = ProvRecords.term(issued, "asset");
        // An asset can carry several interests (several links), so the current record is taken per link, not per relation.
        List<JsonNode> interests = in.records().stream()
            .filter(r -> ProvRecords.REGISTERED_INTEREST.equals(ProvRecords.relation(r)) && Objects.equals(asset, ProvRecords.term(r, "asset")))
            .map(ProvRecords::id).distinct().sorted()
            .map(id -> headOfLink(in, id)).filter(Objects::nonNull).toList();
        for (JsonNode interest : interests) {
            String hash = ProvRecords.hash(interest);
            List<Break> own = new ArrayList<>();
            attestation(in, interest, hash, ProvRecords.REGISTERED_INTEREST, own);
            document(in, interest, ProvRecords.REGISTERED_INTEREST, own);
            breaks.addAll(own);
            String id = ProvRecords.id(interest);
            String holder = ProvRecords.term(interest, "holder");
            boolean consented = in.records().stream()
                .filter(r -> in.token().equals(ProvRecords.token(r)) && ProvRecords.INTEREST_CONSENT.equals(ProvRecords.relation(r))
                    && id.equals(ProvRecords.term(r, "interest")))
                .filter(r -> anchored(in, ProvRecords.hash(r)) && holder != null && holder.equals(ProvRecords.recordKeeper(r)))
                .anyMatch(r -> {
                    List<Break> b = new ArrayList<>();
                    attestation(in, r, ProvRecords.hash(r), ProvRecords.INTEREST_CONSENT, b);
                    document(in, r, ProvRecords.INTEREST_CONSENT, b);
                    return b.isEmpty();
                });
            if (!consented)
                breaks.add(new Break(BreakKind.InterestNotConsented, ProvRecords.REGISTERED_INTEREST,
                    "the registry shows " + ProvRecords.term(interest, "interestType") + " " + id + " held by " + holder
                        + "; no anchored, attested consent from the holder to " + in.token()));
        }
    }

    /** Issuance against the holding record, across every token that claims the same asset and holding. */
    private static List<String> issuance(Input in, TokenProfile profile, Map<String, JsonNode> current, List<Break> breaks) {
        JsonNode issued = current.get(ProvRecords.ISSUED_AGAINST);
        JsonNode held = current.get(profile.holdingRelation());
        if (issued == null) return List.of();
        String asset = ProvRecords.term(issued, "asset");
        List<String> onAsset = asset == null ? List.of() : tokensIssuedAgainst(in, asset);
        if (in.unitsOnLedger() != null) {
            BigInteger units = amount(issued, "unitsIssued");
            if (units != null && in.unitsOnLedger().compareTo(units) > 0)
                breaks.add(new Break(BreakKind.OverIssued, ProvRecords.ISSUED_AGAINST,
                    in.unitsOnLedger() + " units on the ledger; the issuance record issues " + units));
        }
        if (held == null || asset == null) return onAsset;
        String holding = ProvRecords.term(issued, "holding");
        if (!asset.equals(ProvRecords.term(held, "asset")) || !Objects.equals(holding, ProvRecords.term(held, "holding"))) {
            breaks.add(new Break(BreakKind.HoldingMismatch, ProvRecords.ISSUED_AGAINST,
                "issued against " + asset + " in " + holding + "; the holding record shows " + ProvRecords.term(held, "asset")
                    + " in " + ProvRecords.term(held, "holding")));
            return onAsset;
        }
        BigInteger amountHeld = amount(held, "amountHeld");
        BigInteger claimed = BigInteger.ZERO;
        List<String> sharing = new ArrayList<>();
        for (String t : onAsset) {
            JsonNode h = head(in, t, ProvRecords.ISSUED_AGAINST, null);
            if (h == null || !Objects.equals(holding, ProvRecords.term(h, "holding"))) continue;
            BigInteger a = amount(h, "amountBacking");
            if (a != null) claimed = claimed.add(a);
            if (!t.equals(in.token())) sharing.add(t);
        }
        if (amountHeld != null && claimed.compareTo(amountHeld) > 0)
            breaks.add(new Break(sharing.isEmpty() ? BreakKind.OverIssued : BreakKind.DoubleTokenized, ProvRecords.ISSUED_AGAINST,
                "issuance records claim " + claimed + " of " + asset + " in " + holding + "; the holding record shows " + amountHeld
                    + (sharing.isEmpty() ? "" : "; also claimed by " + String.join(", ", sharing))));
        return onAsset;
    }

    private static BigInteger amount(JsonNode r, String term) {
        String v = ProvRecords.term(r, term);
        return v == null ? null : new BigInteger(v);
    }
}
