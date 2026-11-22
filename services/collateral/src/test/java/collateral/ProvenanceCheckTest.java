package collateral;

import cdmx.collateral.ledger.LedgerNetwork;
import cdmx.collateral.ledger.LedgerTransaction;
import cdmx.collateral.ledger.LedgerTransactionStatusEnum;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.io.InputStream;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static collateral.ProvenanceCheck.BreakKind;
import static org.junit.jupiter.api.Assertions.*;

/**
 * The tUST provenance pilot (task-document-provenance, wp-adr-document-provenance): the path from the pledged tUST
 * token back to the bond it is issued against, with fixture documents for the issuance record, token terms, custody
 * record, tokenizer constitution and valuation. Each link is a PROV-O record anchored on the ledger and attested by
 * its record keeper's P-256 credential.
 */
class ProvenanceCheckTest {
    private static final ObjectMapper M = new ObjectMapper();
    private static final String TUST = "urn:dti:QX4V2W9N3";
    private static final String TWIN = "urn:dti:QTWIN0000";
    private static final String BOND = "urn:isin:US912810TM60";
    private static final String HOLDING = "urn:cdmx:custody:fixture-custodian:account-7781";
    private static final String ANCHORS = "0x" + "c9".repeat(20);
    private static final String AT = "2026-11-22T15:00:00Z";

    private static ProvCredentials.Issuer tokenizer, custodian, sponsor, oracle;
    private static final Map<String, String> DOCS = new HashMap<>();

    @BeforeAll
    static void keys() throws Exception {
        tokenizer = ProvCredentials.newIssuer();
        custodian = ProvCredentials.newIssuer();
        sponsor = ProvCredentials.newIssuer();
        oracle = ProvCredentials.newIssuer();
        for (String f : List.of("issuance-record", "token-terms", "custody-record", "tokenizer-constitution", "valuation"))
            DOCS.put(f, fixture(f));
    }

    private static String fixture(String name) throws Exception {
        try (InputStream in = ProvenanceCheckTest.class.getResourceAsStream("/provenance/tust/" + name + ".json")) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    /** A fresh copy of the tUST path: records, credentials, documents, anchor events. */
    private static final class Path {
        final List<JsonNode> records = new ArrayList<>();
        final List<JsonNode> credentials = new ArrayList<>();
        final Map<String, String> documents = new HashMap<>();
        final List<LedgerTransaction> observed = new ArrayList<>();
        final Map<String, String> pinned = new LinkedHashMap<>();
        BigInteger unitsOnLedger = new BigInteger("100000");
        int tx = 1;

        Path() {
            add(issuance(TUST, "100000000", "100000", null), tokenizer, "issuance-record");
            add(link("urn:cdmx:link:tUST:terms", ProvRecords.TOKEN_TERMS, TUST, tokenizer.did(), DOCS.get("token-terms"), tokenizer, null, Map.of()), tokenizer, "token-terms");
            add(link("urn:cdmx:link:tUST:custody", ProvRecords.CUSTODY, tokenizer.did(), BOND, DOCS.get("custody-record"), custodian, null,
                Map.of("asset", BOND, "holding", HOLDING, "faceAmountHeld", "100000000")), custodian, "custody-record");
            add(link("urn:cdmx:link:tUST:constitution", ProvRecords.CONSTITUTION, sponsor.did(), tokenizer.did(), DOCS.get("tokenizer-constitution"), sponsor, null, Map.of()), sponsor, "tokenizer-constitution");
            add(link("urn:cdmx:link:tUST:valuation", ProvRecords.VALUATION, oracle.did(), BOND, DOCS.get("valuation"), oracle, null, Map.of("price", "98.40")), oracle, "valuation");
        }

        static ObjectNode link(String id, String relation, String subject, String object, String doc, ProvCredentials.Issuer keeper,
                               String revisionOf, Map<String, String> terms) {
            return ProvRecords.link(id, relation, TUST, subject, object, doc, keeper.did(), AT, revisionOf, terms);
        }

        static ObjectNode issuance(String token, String face, String units, String revisionOf) {
            ObjectNode r = ProvRecords.link("urn:cdmx:link:" + token + ":issuance", ProvRecords.ISSUED_AGAINST, token, token, BOND,
                DOCS.get("issuance-record"), tokenizer.did(), AT, revisionOf,
                Map.of("asset", BOND, "holding", HOLDING, "faceAmount", face, "unitsIssued", units));
            return r;
        }

        /** Add a record, its document, its anchor event and its record keeper's credential. */
        JsonNode add(ObjectNode record, ProvCredentials.Issuer keeper, String doc) {
            records.add(record);
            documents.put(ProvRecords.documentHash(record), DOCS.get(doc));
            anchor(record);
            credentials.add(ProvCredentials.attest(keeper, ProvRecords.hash(record), ProvRecords.relation(record), AT));
            return record;
        }

        void anchor(JsonNode record) {
            observed.add(LedgerTransaction.builder()
                .setNetwork(LedgerNetwork.builder().setName("besu-prototype").setPlatform("Hyperledger Besu").setChainId(1337).build())
                .setContractAddress(ANCHORS)
                .setTransactionHash(String.format("0x%064x", tx++))
                .setBlockNumber(100 + tx)
                .setLogIndex(0)
                .setEventName("ProvenanceAnchored")
                .setRecordedHash(ProvRecords.hash(record))
                .setStatus(LedgerTransactionStatusEnum.FINAL)
                .build());
        }

        JsonNode find(String relation) {
            return records.stream().filter(r -> TUST.equals(ProvRecords.token(r)) && relation.equals(ProvRecords.relation(r))).findFirst().orElseThrow();
        }

        ProvenanceCheck.Result check() {
            return ProvenanceCheck.check(new ProvenanceCheck.Input(TUST, records, credentials, documents, observed, pinned, unitsOnLedger));
        }
    }

    private static List<BreakKind> kinds(ProvenanceCheck.Result r) {
        return r.breaks().stream().map(ProvenanceCheck.Break::kind).toList();
    }

    @Test
    void theTustPathIsComplete() {
        ProvenanceCheck.Result r = new Path().check();
        assertTrue(r.clean(), () -> "breaks: " + r.breaks());
        assertEquals(ProvenanceCheck.PATH, List.copyOf(r.current().keySet()));
        assertEquals(List.of(TUST), r.tokensOnAsset());
    }

    @Test
    void aRecordIsValidProvJsonLd() {
        JsonNode r = new Path().find(ProvRecords.CUSTODY);
        assertEquals(ProvRecords.PROV, r.path("@context").path("prov").asText());
        assertEquals("prov:Entity", r.path("@type").get(0).asText());
        assertTrue(r.path("prov:wasDerivedFrom").path("@id").asText().startsWith("urn:keccak256:0x"));
        assertTrue(r.path("prov:wasAttributedTo").path("@id").asText().startsWith("did:key:z"));
    }

    @Test
    void aMissingLinkIsReported() {
        Path p = new Path();
        p.records.remove(p.find(ProvRecords.CUSTODY));
        assertEquals(List.of(BreakKind.Missing), kinds(p.check()));
    }

    @Test
    void anUnanchoredRecordIsReported() {
        Path p = new Path();
        String h = ProvRecords.hash(p.find(ProvRecords.TOKEN_TERMS));
        p.observed.removeIf(t -> h.equals(t.getRecordedHash()));
        assertEquals(List.of(BreakKind.NotAnchored), kinds(p.check()));
    }

    @Test
    void aRevertedAnchorIsNotComplete() {
        Path p = new Path();
        String h = ProvRecords.hash(p.find(ProvRecords.CONSTITUTION));
        p.observed.replaceAll(t -> h.equals(t.getRecordedHash()) ? t.toBuilder().setStatus(LedgerTransactionStatusEnum.REVERTED).build() : t);
        assertEquals(List.of(BreakKind.AnchorNotComplete), kinds(p.check()));
    }

    @Test
    void anAlteredDocumentIsReported() {
        Path p = new Path();
        String h = ProvRecords.documentHash(p.find(ProvRecords.CUSTODY));
        p.documents.put(h, DOCS.get("custody-record").replace("100000000", "900000000"));
        assertEquals(List.of(BreakKind.DocumentAltered), kinds(p.check()));
    }

    @Test
    void aLinkWithoutItsRecordKeepersCredentialIsReported() {
        Path p = new Path();
        String h = ProvRecords.urn(ProvRecords.hash(p.find(ProvRecords.CUSTODY)));
        p.credentials.removeIf(c -> h.equals(c.path("credentialSubject").path("id").asText()));
        assertEquals(List.of(BreakKind.Unattested), kinds(p.check()));
        // a credential from another party does not attest the custodian's record
        p.credentials.add(ProvCredentials.attest(tokenizer, ProvRecords.hash(p.find(ProvRecords.CUSTODY)), ProvRecords.CUSTODY, AT));
        assertEquals(List.of(BreakKind.BadCredential), kinds(p.check()));
    }

    @Test
    void aTamperedCredentialDoesNotVerify() {
        Path p = new Path();
        ObjectNode vc = (ObjectNode) p.credentials.get(2).deepCopy();
        assertTrue(ProvCredentials.verify(vc));
        ((ObjectNode) vc.get("credentialSubject")).put("cdmx:relation", ProvRecords.TOKEN_TERMS);
        assertFalse(ProvCredentials.verify(vc));
    }

    @Test
    void amendedTermsSupersedeThePinnedVersion() {
        Path p = new Path();
        JsonNode v1 = p.find(ProvRecords.TOKEN_TERMS);
        p.pinned.put(ProvRecords.TOKEN_TERMS, ProvRecords.hash(v1));
        assertTrue(p.check().clean());
        DOCS.put("token-terms-v2", DOCS.get("token-terms").replace("\"version\": \"1\"", "\"version\": \"2\""));
        ObjectNode v2 = Path.link("urn:cdmx:link:tUST:terms", ProvRecords.TOKEN_TERMS, TUST, tokenizer.did(), DOCS.get("token-terms-v2"),
            tokenizer, ProvRecords.hash(v1), Map.of());
        p.add(v2, tokenizer, "token-terms-v2");
        ProvenanceCheck.Result r = p.check();
        assertEquals(List.of(BreakKind.Superseded), kinds(r));
        assertEquals(ProvRecords.hash(v2), r.current().get(ProvRecords.TOKEN_TERMS));
    }

    @Test
    void anUnanchoredRevisionDoesNotReplaceTheCurrentRecord() {
        Path p = new Path();
        JsonNode v1 = p.find(ProvRecords.TOKEN_TERMS);
        p.records.add(Path.link("urn:cdmx:link:tUST:terms", ProvRecords.TOKEN_TERMS, TUST, tokenizer.did(), DOCS.get("token-terms"),
            tokenizer, ProvRecords.hash(v1), Map.of("note", "draft")));
        ProvenanceCheck.Result r = p.check();
        assertTrue(r.clean());
        assertEquals(ProvRecords.hash(v1), r.current().get(ProvRecords.TOKEN_TERMS));
    }

    @Test
    void twoCurrentRecordsOfOneLinkConflict() {
        Path p = new Path();
        p.add(Path.link("urn:cdmx:link:tUST:terms", ProvRecords.TOKEN_TERMS, TUST, tokenizer.did(), DOCS.get("token-terms"),
            tokenizer, null, Map.of("note", "second")), tokenizer, "token-terms");
        assertEquals(List.of(BreakKind.Conflict), kinds(p.check()));
    }

    @Test
    void aSecondTokenOnTheSameHoldingIsDoubleTokenization() {
        Path p = new Path();
        p.add(Path.issuance(TWIN, "50000000", "50000", null), tokenizer, "issuance-record");
        ProvenanceCheck.Result r = p.check();
        assertEquals(List.of(BreakKind.DoubleTokenized), kinds(r));
        assertTrue(r.breaks().get(0).detail().contains(TWIN));
        assertEquals(List.of(TWIN, TUST), r.tokensOnAsset()); // sorted by URN
    }

    @Test
    void issuanceBeyondTheHoldingAndUnitsBeyondTheIssuanceAreOverIssued() {
        Path p = new Path();
        JsonNode v1 = p.find(ProvRecords.ISSUED_AGAINST);
        p.add(Path.issuance(TUST, "120000000", "120000", ProvRecords.hash(v1)), tokenizer, "issuance-record");
        assertEquals(List.of(BreakKind.OverIssued), kinds(p.check()));

        Path q = new Path();
        q.unitsOnLedger = new BigInteger("100001");
        assertEquals(List.of(BreakKind.OverIssued), kinds(q.check()));
    }

    @Test
    void anIssuanceAgainstAnotherHoldingIsAMismatch() {
        Path p = new Path();
        JsonNode v1 = p.find(ProvRecords.ISSUED_AGAINST);
        ObjectNode v2 = Path.issuance(TUST, "100000000", "100000", ProvRecords.hash(v1));
        v2.put("cdmx:holding", "urn:cdmx:custody:fixture-custodian:account-0001");
        p.add(v2, tokenizer, "issuance-record");
        assertEquals(List.of(BreakKind.HoldingMismatch), kinds(p.check()));
    }

    @Test
    void jcsSortsMembersAndEscapesStrings() throws Exception {
        assertEquals("{\"a\":[1,true,null],\"b\":\"x\\ny\\u0001\",\"é\":\"€\"}",
            Jcs.canonical(M.readTree("{\"é\":\"€\", \"b\":\"x\\ny\\u0001\", \"a\":[1, true, null]}")));
        assertThrows(IllegalArgumentException.class, () -> Jcs.canonical(M.readTree("{\"a\":1.5}")));
    }

    @Test
    void aDidKeyRoundTripsToTheSameKey() {
        ProvCredentials.Issuer i = ProvCredentials.newIssuer();
        assertTrue(i.did().startsWith("did:key:zDn")); // P-256 Multikeys encode with the prefix zDn
        assertEquals(i.keys().getPublic(), ProvCredentials.publicKey(i.did()));
    }
}
