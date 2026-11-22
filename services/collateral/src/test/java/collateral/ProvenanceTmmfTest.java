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
 * Provenance of tMMF, a Registered token (task-document-provenance, wp-adr-document-provenance): the fund's transfer agent
 * keeps the share register that prevails over the ledger, so its register statement takes the custody record's place,
 * and the token is eligible only under a control agreement with that transfer agent (interim rule REG-3). The transfer
 * agent attests both with its P-256 credential; the profile comes from the gateway's token registry.
 */
class ProvenanceTmmfTest {
    private static final ObjectMapper M = new ObjectMapper();
    private static final String TMMF = "urn:dti:QZ0000000";
    private static final String FUND = "urn:isin:US9128100000";
    private static final String HOLDING = "urn:cdmx:register:mmf-transfer-agent:nominee-0042";
    private static final String ANCHORS = "0x" + "c9".repeat(20);
    private static final String AT = "2026-11-22T16:00:00Z";

    private static ProvCredentials.Issuer transferAgent, fund, oracle, other;
    private static final Map<String, String> DOCS = new HashMap<>();
    private static JsonNode registryEntry;

    @BeforeAll
    static void setUp() throws Exception {
        transferAgent = ProvCredentials.newIssuer();
        fund = ProvCredentials.newIssuer();
        oracle = ProvCredentials.newIssuer();
        other = ProvCredentials.newIssuer();
        for (String f : List.of("issuance-record", "token-terms", "register-statement", "fund-constitution", "valuation", "control-agreement"))
            try (InputStream in = ProvenanceTmmfTest.class.getResourceAsStream("/provenance/tmmf/" + f + ".json")) {
                DOCS.put(f, new String(in.readAllBytes(), StandardCharsets.UTF_8));
            }
        // as the gateway's registry and CdmRecordKeeperTest describe tMMF
        registryEntry = M.readTree("{\"address\":\"0x" + "a2".repeat(20) + "\",\"isin\":\"US9128100000\",\"dti\":\"QZ0000000\"," +
            "\"authoritativeRecord\":\"Registered\",\"recordKeeper\":\"MMF Transfer Agent\",\"controlAgreement\":\"CA-TMMF-2026-01\"}");
    }

    private static final class Path {
        final List<JsonNode> records = new ArrayList<>();
        final List<JsonNode> credentials = new ArrayList<>();
        final Map<String, String> documents = new HashMap<>();
        final List<LedgerTransaction> observed = new ArrayList<>();
        final Map<String, String> pinned = new LinkedHashMap<>();
        ProvenanceCheck.TokenProfile profile = ProvenanceCheck.TokenProfile.fromRegistry(registryEntry, "BANK-B");
        int tx = 1;

        Path() {
            add(rec("issuance", ProvRecords.ISSUED_AGAINST, TMMF, FUND, "issuance-record", transferAgent,
                Map.of("asset", FUND, "holding", HOLDING, "amountBacking", "5000000", "unitsIssued", "5000000")), transferAgent);
            add(rec("terms", ProvRecords.TOKEN_TERMS, TMMF, fund.did(), "token-terms", fund, Map.of()), fund);
            add(register("MMF Transfer Agent", "5000000", transferAgent, null), transferAgent);
            add(rec("constitution", ProvRecords.CONSTITUTION, fund.did(), FUND, "fund-constitution", fund, Map.of()), fund);
            add(rec("valuation", ProvRecords.VALUATION, oracle.did(), FUND, "valuation", oracle, Map.of("nav", "1.00")), oracle);
            add(control("CA-TMMF-2026-01", "BANK-B", transferAgent), transferAgent);
        }

        static ObjectNode rec(String name, String relation, String subject, String object, String doc, ProvCredentials.Issuer keeper,
                              Map<String, String> terms) {
            return ProvRecords.link("urn:cdmx:link:tMMF:" + name, relation, TMMF, subject, object, DOCS.get(doc), keeper.did(), AT, null, terms);
        }

        static ObjectNode register(String keeperName, String shares, ProvCredentials.Issuer keeper, String revisionOf) {
            return ProvRecords.link("urn:cdmx:link:tMMF:register", ProvRecords.REGISTER, TMMF, keeper.did(), FUND,
                DOCS.get("register-statement"), keeper.did(), AT, revisionOf,
                Map.of("asset", FUND, "holding", HOLDING, "amountHeld", shares, "recordKeeperName", keeperName));
        }

        static ObjectNode control(String reference, String securedParty, ProvCredentials.Issuer keeper) {
            return ProvRecords.link("urn:cdmx:link:tMMF:control:" + securedParty, ProvRecords.CONTROL_AGREEMENT, TMMF, securedParty, TMMF,
                DOCS.get("control-agreement"), keeper.did(), AT, null,
                Map.of("reference", reference, "pledgor", "BANK-A", "securedParty", securedParty));
        }

        void add(ObjectNode record, ProvCredentials.Issuer keeper) {
            records.add(record);
            documents.put(ProvRecords.documentHash(record), DOCS.values().stream()
                .filter(d -> Cdm.keccakHex(d).equalsIgnoreCase(ProvRecords.documentHash(record))).findFirst().orElseThrow());
            observed.add(LedgerTransaction.builder()
                .setNetwork(LedgerNetwork.builder().setName("besu-prototype").setPlatform("Hyperledger Besu").setChainId(1337).build())
                .setContractAddress(ANCHORS).setTransactionHash(String.format("0x%064x", tx++)).setBlockNumber(200 + tx).setLogIndex(0)
                .setEventName("ProvenanceAnchored").setRecordedHash(ProvRecords.hash(record))
                .setStatus(LedgerTransactionStatusEnum.FINAL).build());
            credentials.add(ProvCredentials.attest(keeper, ProvRecords.hash(record), ProvRecords.relation(record), AT));
        }

        void drop(String relation) {
            records.removeIf(r -> relation.equals(ProvRecords.relation(r)));
        }

        ProvenanceCheck.Result check() {
            return ProvenanceCheck.check(new ProvenanceCheck.Input(TMMF, profile, records, credentials, documents, observed, pinned,
                new BigInteger("5000000")));
        }
    }

    private static List<BreakKind> kinds(ProvenanceCheck.Result r) {
        return r.breaks().stream().map(ProvenanceCheck.Break::kind).toList();
    }

    @Test
    void theTmmfPathIsCompleteUnderControl() {
        ProvenanceCheck.Result r = new Path().check();
        assertTrue(r.clean(), () -> "breaks: " + r.breaks());
        assertEquals(ProvenanceCheck.PATH_UNDER_CONTROL, List.copyOf(r.current().keySet()));
    }

    @Test
    void theProfileComesFromTheRegistry() {
        ProvenanceCheck.TokenProfile p = ProvenanceCheck.TokenProfile.fromRegistry(registryEntry, null);
        assertTrue(p.underControl());
        assertEquals(ProvRecords.REGISTER, p.holdingRelation());
        assertEquals("CA-TMMF-2026-01", p.controlAgreement());
    }

    @Test
    void withoutAControlAgreementTheTokenIsNotCovered() {
        Path p = new Path();
        p.drop(ProvRecords.CONTROL_AGREEMENT);
        assertEquals(List.of(BreakKind.Missing), kinds(p.check()));
    }

    @Test
    void aCustodyRecordDoesNotStandInForTheRegister() {
        Path p = new Path();
        p.drop(ProvRecords.REGISTER);
        p.add(ProvRecords.link("urn:cdmx:link:tMMF:custody", ProvRecords.CUSTODY, TMMF, other.did(), FUND,
            DOCS.get("register-statement"), other.did(), AT, null, Map.of("asset", FUND, "holding", HOLDING, "amountHeld", "5000000")), other);
        assertEquals(List.of(BreakKind.Missing), kinds(p.check()));
    }

    @Test
    void aControlAgreementOtherThanTheTokensIsAMismatch() {
        Path p = new Path();
        p.drop(ProvRecords.CONTROL_AGREEMENT);
        p.add(Path.control("CA-TMMF-2025-09", "BANK-B", transferAgent), transferAgent);
        assertEquals(List.of(BreakKind.ControlAgreementMismatch), kinds(p.check()));
    }

    @Test
    void aControlAgreementWithAnotherSecuredPartyDoesNotCoverThePledge() {
        Path p = new Path();
        p.drop(ProvRecords.CONTROL_AGREEMENT);
        p.add(Path.control("CA-TMMF-2026-01", "BANK-C", transferAgent), transferAgent);
        assertEquals(List.of(BreakKind.ControlAgreementMismatch), kinds(p.check()));
    }

    @Test
    void aControlAgreementFromAnyoneButTheRecordKeeperIsAMismatch() {
        Path p = new Path();
        p.drop(ProvRecords.CONTROL_AGREEMENT);
        p.add(Path.control("CA-TMMF-2026-01", "BANK-B", other), other);
        assertEquals(List.of(BreakKind.RecordKeeperMismatch), kinds(p.check()));
    }

    @Test
    void aRegisterKeptByAnotherPartyIsAMismatch() {
        Path p = new Path();
        p.drop(ProvRecords.REGISTER);
        p.add(Path.register("Another Transfer Agent", "5000000", transferAgent, null), transferAgent);
        assertEquals(List.of(BreakKind.RecordKeeperMismatch), kinds(p.check()));
    }

    @Test
    void aRegisterShowingFewerSharesThanIssuedIsOverIssued() {
        Path p = new Path();
        JsonNode v1 = p.records.stream().filter(r -> ProvRecords.REGISTER.equals(ProvRecords.relation(r))).findFirst().orElseThrow();
        p.add(Path.register("MMF Transfer Agent", "4000000", transferAgent, ProvRecords.hash(v1)), transferAgent);
        assertEquals(List.of(BreakKind.OverIssued), kinds(p.check()));
    }

    @Test
    void aNewRegisterStatementSupersedesTheOneRelied() {
        Path p = new Path();
        JsonNode v1 = p.records.stream().filter(r -> ProvRecords.REGISTER.equals(ProvRecords.relation(r))).findFirst().orElseThrow();
        p.pinned.put(ProvRecords.REGISTER, ProvRecords.hash(v1));
        p.add(Path.register("MMF Transfer Agent", "5000000", transferAgent, ProvRecords.hash(v1)), transferAgent);
        ProvenanceCheck.Result r = p.check();
        assertEquals(List.of(BreakKind.Superseded), kinds(r));
        assertNotEquals(ProvRecords.hash(v1), r.current().get(ProvRecords.REGISTER));
    }
}
