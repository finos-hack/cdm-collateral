package collateral;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Fixture provenance for the deployment's tUST and tMMF tokens (task-document-provenance): the documents under
 * {@code src/main/resources/provenance/}, a PROV-O link record for each, and each record keeper's credential over the
 * record. Synthetic: the custodian, tokenizer, fund, transfer agent and the documents are invented, and each record
 * keeper's P-256 key is made when the fixture is built and not kept, so only its did:key, inside the records and
 * credentials, outlives it. A real record keeper would sign with its own key.
 *
 * <p>{@link #build} returns what to store and anchor; the service puts every text in the payload store under its
 * keccak-256 hash and anchors each record and credential hash in ProvenanceAnchors, the credential under its own link.
 */
public final class ProvenanceFixtures {
    private ProvenanceFixtures() {}

    /** One text to store and anchor: a link record or a credential, with the link it is anchored under. */
    public record Anchored(String symbol, String token, String linkId, String text, String hash, String kind) {}

    /** What a fixture build produces: the documents to store, then the records and credentials to store and anchor. */
    public record Build(List<String> documents, List<Anchored> anchored) {}

    /** The relations of a Bearer and of a Registered token, with the fixture document and the record keeper of each. */
    private record Link(String name, String relation, String doc, String keeper) {}

    private static final List<Link> BEARER = List.of(
        new Link("issuance", ProvRecords.ISSUED_AGAINST, "issuance-record", "tokenizer"),
        new Link("terms", ProvRecords.TOKEN_TERMS, "token-terms", "tokenizer"),
        new Link("custody", ProvRecords.CUSTODY, "custody-record", "custodian"),
        new Link("constitution", ProvRecords.CONSTITUTION, "tokenizer-constitution", "sponsor"),
        new Link("valuation", ProvRecords.VALUATION, "valuation", "oracle"));

    private static final List<Link> REGISTERED = List.of(
        new Link("issuance", ProvRecords.ISSUED_AGAINST, "issuance-record", "transferAgent"),
        new Link("terms", ProvRecords.TOKEN_TERMS, "token-terms", "fund"),
        new Link("register", ProvRecords.REGISTER, "register-statement", "transferAgent"),
        new Link("constitution", ProvRecords.CONSTITUTION, "fund-constitution", "fund"),
        new Link("valuation", ProvRecords.VALUATION, "valuation", "oracle"),
        new Link("control", ProvRecords.CONTROL_AGREEMENT, "control-agreement", "transferAgent"));

    public static String document(String dir, String name) {
        try (InputStream in = ProvenanceFixtures.class.getResourceAsStream("/provenance/" + dir + "/" + name + ".json")) {
            if (in == null) throw new IllegalStateException("no fixture document provenance/" + dir + "/" + name + ".json");
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (java.io.IOException e) {
            throw new IllegalStateException(e);
        }
    }

    /**
     * The fixture provenance of one token of the registry: tUST's path when it is Bearer, tMMF's when it is Registered
     * or Claim. {@code pledgor} and {@code securedParty} (registry party names, for example "bank-a" and "bank-b") go into
     * the control agreement.
     */
    public static Build build(String symbol, JsonNode token, String pledgor, String securedParty, String at) {
        boolean underControl = !"Bearer".equals(token.path("authoritativeRecord").asText("Bearer"));
        String dir = underControl ? "tmmf" : "tust";
        String urn = "urn:dti:" + token.get("dti").asText();
        String asset = "urn:isin:" + token.get("isin").asText();
        String holding = underControl ? "urn:cdmx:register:mmf-transfer-agent:nominee-0042" : "urn:cdmx:custody:fixture-custodian:account-7781";
        Map<String, ProvCredentials.Issuer> keepers = Map.of(
            "tokenizer", ProvCredentials.newIssuer(), "custodian", ProvCredentials.newIssuer(),
            "sponsor", ProvCredentials.newIssuer(), "oracle", ProvCredentials.newIssuer(),
            "transferAgent", ProvCredentials.newIssuer(), "fund", ProvCredentials.newIssuer());
        String amount = underControl ? "5000000" : "100000000";
        String units = underControl ? "5000000" : "100000";
        List<String> documents = new ArrayList<>();
        List<Anchored> anchored = new ArrayList<>();
        for (Link l : underControl ? REGISTERED : BEARER) {
            String doc = document(dir, l.doc());
            documents.add(doc);
            ProvCredentials.Issuer keeper = keepers.get(l.keeper());
            String id = "urn:cdmx:link:" + symbol + ":" + l.name() + (l.relation().equals(ProvRecords.CONTROL_AGREEMENT) ? ":" + securedParty : "");
            Map<String, String> terms = switch (l.relation()) {
                case ProvRecords.ISSUED_AGAINST -> Map.of("asset", asset, "holding", holding, "amountBacking", amount, "unitsIssued", units);
                case ProvRecords.CUSTODY -> Map.of("asset", asset, "holding", holding, "amountHeld", amount);
                case ProvRecords.REGISTER -> Map.of("asset", asset, "holding", holding, "amountHeld", amount,
                    "recordKeeperName", token.path("recordKeeper").asText(""));
                case ProvRecords.CONTROL_AGREEMENT -> Map.of("reference", token.path("controlAgreement").asText(""),
                    "pledgor", pledgor, "securedParty", securedParty);
                default -> Map.of();
            };
            String subject = switch (l.relation()) {
                case ProvRecords.ISSUED_AGAINST, ProvRecords.TOKEN_TERMS -> urn;
                case ProvRecords.CONTROL_AGREEMENT -> securedParty;
                default -> keeper.did();
            };
            String object = switch (l.relation()) {
                case ProvRecords.TOKEN_TERMS -> keeper.did();
                case ProvRecords.CONTROL_AGREEMENT -> urn;
                default -> asset;
            };
            ObjectNode record = ProvRecords.link(id, l.relation(), urn, subject, object, doc, keeper.did(), at, null, terms);
            String recordText = Jcs.canonical(record);
            anchored.add(new Anchored(symbol, token.get("address").asText(), Cdm.keccakHex(id).toLowerCase(), recordText,
                Cdm.keccakHex(recordText).toLowerCase(), "record"));
            ObjectNode vc = ProvCredentials.attest(keeper, ProvRecords.hash(record), l.relation(), at);
            String vcText = Jcs.canonical(vc);
            String vcLink = id + "#credential:" + keeper.did();
            anchored.add(new Anchored(symbol, token.get("address").asText(), Cdm.keccakHex(vcLink).toLowerCase(), vcText,
                Cdm.keccakHex(vcText).toLowerCase(), "credential"));
        }
        return new Build(documents, anchored);
    }
}
