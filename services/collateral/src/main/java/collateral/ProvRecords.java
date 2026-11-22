package collateral;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.Map;

/**
 * Provenance link records for task-document-provenance, written as W3C PROV-O JSON-LD (wp-adr-document-provenance,
 * question 1, option B: PROV-O is the record, and CDM documents refer to it by hash).
 *
 * <p>One record per link. The record is a {@code prov:Entity} derived from the document behind the link
 * ({@code prov:wasDerivedFrom}, identified by the document's keccak-256 hash), attributed to the record keeper's
 * {@code did:key} ({@code prov:wasAttributedTo}), and, when it replaces an earlier record of the same link, a
 * {@code prov:wasRevisionOf} that record. The link itself, which PROV-O has no term for, is the {@code cdmx:} relation
 * between a subject and an object (for example the token and the bond it is issued against). Every record names the
 * token it belongs to ({@code cdmx:token}); an issuance record also names the asset ({@code cdmx:asset}), so issuance
 * records can be looked up by asset as well as by token.
 *
 * <p>A record's hash is keccak-256 over its JCS canonical form (RFC 8785), the hash that is anchored on the ledger
 * (cdm-ext {@code AnchoredRecordEnum} {@code AssetDocument} or {@code Valuation}).
 */
public final class ProvRecords {
    private static final ObjectMapper M = new ObjectMapper();
    public static final String PROV = "http://www.w3.org/ns/prov#";
    public static final String CDMX = "https://github.com/finos-hack/cdm-collateral/ns/provenance#";

    /** The relations of a token's provenance path (whiteboard artifact-provenance-whiteboard, mapped to tUST in the ADR). */
    public static final String ISSUED_AGAINST = "cdmx:IssuedAgainst";
    public static final String TOKEN_TERMS = "cdmx:TokenTerms";
    public static final String CUSTODY = "cdmx:Custody";
    public static final String CONSTITUTION = "cdmx:Constitution";
    public static final String VALUATION = "cdmx:Valuation";

    private ProvRecords() {}

    /** The JSON-LD context of the records and credentials: PROV-O and the prototype's cdmx terms. */
    public static ObjectNode context() {
        ObjectNode c = M.createObjectNode();
        c.put("prov", PROV);
        c.put("cdmx", CDMX);
        return c;
    }

    /** The URN that identifies a document or a record by its keccak-256 hash. */
    public static String urn(String keccakHex) {
        return "urn:keccak256:" + keccakHex.toLowerCase();
    }

    /** keccak-256 of a record's JCS canonical form: the hash anchored on the ledger and attested by a credential. */
    public static String hash(JsonNode record) {
        return Cdm.keccakHex(Jcs.canonical(record)).toLowerCase();
    }

    /**
     * A link record.
     *
     * @param id           the link's identifier, stable across revisions (for example "urn:cdmx:link:tUST:custody")
     * @param relation     one of the relation constants
     * @param token        the token the link belongs to, as a URN (for example "urn:dti:QX4V2W9N3")
     * @param subject      the link's subject (URN or DID)
     * @param object       the link's object (URN or DID)
     * @param document     the document behind the link (its text; its keccak-256 hash goes into the record)
     * @param recordKeeper the did:key of the party that keeps the document and attests the link
     * @param generatedAt  when the record was made (ISO 8601)
     * @param revisionOf   the hash of the record this one replaces, or null
     * @param terms        further cdmx terms of the link (for an issuance record: asset, holding, amounts), as strings
     */
    public static ObjectNode link(String id, String relation, String token, String subject, String object, String document,
                                  String recordKeeper, String generatedAt, String revisionOf, Map<String, String> terms) {
        ObjectNode r = M.createObjectNode();
        r.set("@context", context());
        r.put("@id", id);
        r.putArray("@type").add("prov:Entity").add("cdmx:Link");
        r.put("cdmx:relation", relation);
        r.putObject("cdmx:token").put("@id", token);
        r.putObject("cdmx:subject").put("@id", subject);
        r.putObject("cdmx:object").put("@id", object);
        r.putObject("prov:wasDerivedFrom").put("@id", urn(Cdm.keccakHex(document)));
        r.putObject("prov:wasAttributedTo").put("@id", recordKeeper);
        r.put("prov:generatedAtTime", generatedAt);
        if (revisionOf != null) r.putObject("prov:wasRevisionOf").put("@id", urn(revisionOf));
        if (terms != null) terms.forEach((k, v) -> r.put("cdmx:" + k, v));
        return r;
    }

    public static String id(JsonNode r) { return r.path("@id").asText(); }
    public static String relation(JsonNode r) { return r.path("cdmx:relation").asText(); }
    public static String token(JsonNode r) { return r.path("cdmx:token").path("@id").asText(); }
    public static String recordKeeper(JsonNode r) { return r.path("prov:wasAttributedTo").path("@id").asText(); }
    public static String term(JsonNode r, String name) { return r.path("cdmx:" + name).asText(null); }

    /** The keccak-256 hash of the document behind the link, from the record's prov:wasDerivedFrom. */
    public static String documentHash(JsonNode r) {
        return stripUrn(r.path("prov:wasDerivedFrom").path("@id").asText());
    }

    /** The hash of the record this one revises, or null. */
    public static String revisionOf(JsonNode r) {
        JsonNode n = r.path("prov:wasRevisionOf").path("@id");
        return n.isMissingNode() ? null : stripUrn(n.asText());
    }

    static String stripUrn(String urn) {
        return urn.startsWith("urn:keccak256:") ? urn.substring("urn:keccak256:".length()) : urn;
    }
}
