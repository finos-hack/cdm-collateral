package collateral;

import cdmx.collateral.ledger.LedgerNetwork;
import cdmx.collateral.ledger.LedgerTransaction;
import cdmx.collateral.ledger.LedgerTransactionStatusEnum;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.math.BigInteger;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static collateral.ProvenanceCheck.BreakKind;
import static org.junit.jupiter.api.Assertions.*;

/**
 * The aircraft case (task-document-provenance, G40, whiteboard artifact-provenance-whiteboard): tokens issued on the SPV
 * that owns an aircraft. The asset is kept in registries outside the ledger: the FAA registry shows the SPV as owner, and
 * the International Registry shows the lender's mortgage as an international interest. Both are RegistryEntry links,
 * attested by the registry; the lender must consent to the tokenization (interim rule pending REG-8). CDM 7.7.0 has no
 * asset type for an aircraft (G40), so the asset is a URN of manufacturer, model and MSN.
 */
class ProvenanceAircraftTest {
    private static final String TAIR = "urn:dti:QAIR00000";
    private static final String TWIN = "urn:dti:QAIRTWIN0";
    private static final String AIRCRAFT = "urn:cdmx:aircraft:fixture-aerospace:fx-320:7781";
    private static final String OWNER = "urn:cdmx:registration:faa:N781FX";
    private static final String INTEREST = "urn:cdmx:link:aircraft-7781:international-interest:IR-FIXTURE-0001";
    private static final String ANCHORS = "0x" + "c9".repeat(20);
    private static final String AT = "2026-11-22T18:00:00Z";

    private static ProvCredentials.Issuer spv, faa, internationalRegistry, assetManager, appraiser, lender, other;
    private static final Map<String, String> DOCS = new HashMap<>();
    private static final ProvenanceCheck.TokenProfile PROFILE = new ProvenanceCheck.TokenProfile("Bearer", null, null, null, "FAA Aircraft Registry");

    @BeforeAll
    static void setUp() {
        spv = ProvCredentials.newIssuer();
        faa = ProvCredentials.newIssuer();
        internationalRegistry = ProvCredentials.newIssuer();
        assetManager = ProvCredentials.newIssuer();
        appraiser = ProvCredentials.newIssuer();
        lender = ProvCredentials.newIssuer();
        other = ProvCredentials.newIssuer();
        for (String f : List.of("issuance-record", "token-terms", "registration", "spv-constitution", "appraisal",
            "international-interest", "lender-consent"))
            DOCS.put(f, ProvenanceFixtures.document("aircraft", f));
    }

    private static final class Path {
        final List<JsonNode> records = new ArrayList<>();
        final List<JsonNode> credentials = new ArrayList<>();
        final Map<String, String> documents = new HashMap<>();
        final List<LedgerTransaction> observed = new ArrayList<>();
        final Map<String, String> pinned = new LinkedHashMap<>();
        int tx = 1;

        Path() {
            add(issuance(TAIR), spv);
            add(link(TAIR, "terms", ProvRecords.TOKEN_TERMS, TAIR, spv.did(), "token-terms", spv, Map.of()), spv);
            add(registration(OWNER, faa), faa);
            add(link(TAIR, "constitution", ProvRecords.CONSTITUTION, assetManager.did(), spv.did(), "spv-constitution", assetManager, Map.of()), assetManager);
            add(link(TAIR, "valuation", ProvRecords.VALUATION, appraiser.did(), AIRCRAFT, "appraisal", appraiser, Map.of("valueUsd", "142000000")), appraiser);
            add(interest(INTEREST, lender.did()), internationalRegistry);
            add(consent(INTEREST, lender), lender);
        }

        static ObjectNode link(String token, String name, String relation, String subject, String object, String doc,
                               ProvCredentials.Issuer keeper, Map<String, String> terms) {
            return ProvRecords.link("urn:cdmx:link:" + token + ":" + name, relation, token, subject, object, DOCS.get(doc),
                keeper.did(), AT, null, terms);
        }

        static ObjectNode issuance(String token) {
            return link(token, "issuance", ProvRecords.ISSUED_AGAINST, token, AIRCRAFT, "issuance-record", spv,
                Map.of("asset", AIRCRAFT, "holding", OWNER, "amountBacking", "1", "unitsIssued", "1000000"));
        }

        static ObjectNode registration(String holding, ProvCredentials.Issuer registry) {
            return link(TAIR, "registration", ProvRecords.REGISTRATION, registry.did(), AIRCRAFT, "registration", registry,
                Map.of("asset", AIRCRAFT, "holding", holding, "amountHeld", "1", "registeredOwner", "Fixture Aircraft SPV"));
        }

        static ObjectNode interest(String id, String holder) {
            return ProvRecords.link(id, ProvRecords.REGISTERED_INTEREST, TAIR, holder, AIRCRAFT, DOCS.get("international-interest"),
                internationalRegistry.did(), AT, null,
                Map.of("asset", AIRCRAFT, "holder", holder, "interestType", "InternationalInterest", "fileNumber", "IR-FIXTURE-0001"));
        }

        static ObjectNode consent(String interestId, ProvCredentials.Issuer holder) {
            return ProvRecords.link("urn:cdmx:link:tAIR:consent:" + interestId, ProvRecords.INTEREST_CONSENT, TAIR, holder.did(), TAIR,
                DOCS.get("lender-consent"), holder.did(), AT, null, Map.of("interest", interestId));
        }

        void add(ObjectNode record, ProvCredentials.Issuer keeper) {
            records.add(record);
            String d = ProvRecords.documentHash(record);
            documents.put(d, DOCS.values().stream().filter(x -> Cdm.keccakHex(x).equalsIgnoreCase(d)).findFirst().orElseThrow());
            observed.add(LedgerTransaction.builder()
                .setNetwork(LedgerNetwork.builder().setName("besu-prototype").setPlatform("Hyperledger Besu").setChainId(1337).build())
                .setContractAddress(ANCHORS).setTransactionHash(String.format("0x%064x", tx++)).setBlockNumber(300 + tx).setLogIndex(0)
                .setEventName("ProvenanceAnchored").setRecordedHash(ProvRecords.hash(record))
                .setStatus(LedgerTransactionStatusEnum.FINAL).build());
            credentials.add(ProvCredentials.attest(keeper, ProvRecords.hash(record), ProvRecords.relation(record), AT));
        }

        void drop(String relation) {
            records.removeIf(r -> relation.equals(ProvRecords.relation(r)));
        }

        ProvenanceCheck.Result check() {
            return ProvenanceCheck.check(new ProvenanceCheck.Input(TAIR, PROFILE, records, credentials, documents, observed, pinned,
                new BigInteger("1000000")));
        }
    }

    private static List<BreakKind> kinds(ProvenanceCheck.Result r) {
        return r.breaks().stream().map(ProvenanceCheck.Break::kind).toList();
    }

    @Test
    void theAircraftPathIsCompleteWithTheLendersConsent() {
        ProvenanceCheck.Result r = new Path().check();
        assertTrue(r.clean(), () -> "breaks: " + r.breaks());
        assertEquals(ProvenanceCheck.PATH_REGISTRY_ASSET, List.copyOf(r.current().keySet()));
        assertEquals(List.of(TAIR), r.tokensOnAsset());
    }

    @Test
    void theRegistrationTakesTheCustodyRecordsPlace() {
        Path p = new Path();
        p.drop(ProvRecords.REGISTRATION);
        assertEquals(List.of(BreakKind.Missing), kinds(p.check()));
    }

    @Test
    void aRegistrationOfAnotherOwnerIsAHoldingMismatch() {
        Path p = new Path();
        p.drop(ProvRecords.REGISTRATION);
        p.add(Path.registration("urn:cdmx:registration:faa:N999XX", faa), faa);
        assertEquals(List.of(BreakKind.HoldingMismatch), kinds(p.check()));
    }

    @Test
    void aRegisteredMortgageWithoutTheLendersConsentIsReported() {
        Path p = new Path();
        p.drop(ProvRecords.INTEREST_CONSENT);
        ProvenanceCheck.Result r = p.check();
        assertEquals(List.of(BreakKind.InterestNotConsented), kinds(r));
        assertTrue(r.breaks().get(0).detail().contains("IR-FIXTURE-0001"));
    }

    @Test
    void aConsentFromAnyoneButTheInterestHolderDoesNotCount() {
        Path p = new Path();
        p.drop(ProvRecords.INTEREST_CONSENT);
        p.add(Path.consent(INTEREST, other), other);
        assertEquals(List.of(BreakKind.InterestNotConsented), kinds(p.check()));
    }

    @Test
    void eachRegisteredInterestNeedsItsOwnConsent() {
        Path p = new Path();
        String second = "urn:cdmx:link:aircraft-7781:international-interest:IR-FIXTURE-0002";
        p.add(Path.interest(second, lender.did()), internationalRegistry);
        assertEquals(List.of(BreakKind.InterestNotConsented), kinds(p.check()));
        p.add(Path.consent(second, lender), lender);
        assertTrue(p.check().clean());
    }

    @Test
    void anInterestEntryNotAttestedByAnyoneIsReported() {
        Path p = new Path();
        String h = ProvRecords.urn(ProvRecords.hash(p.records.stream()
            .filter(r -> ProvRecords.REGISTERED_INTEREST.equals(ProvRecords.relation(r))).findFirst().orElseThrow()));
        p.credentials.removeIf(c -> h.equals(c.path("credentialSubject").path("id").asText()));
        assertEquals(List.of(BreakKind.Unattested), kinds(p.check()));
    }

    @Test
    void aSecondTokenOnTheSameAircraftIsDoubleTokenization() {
        Path p = new Path();
        p.add(Path.issuance(TWIN), spv);
        ProvenanceCheck.Result r = p.check();
        assertEquals(List.of(BreakKind.DoubleTokenized), kinds(r));
        assertEquals(List.of(TAIR, TWIN), r.tokensOnAsset()); // sorted by URN
    }
}
