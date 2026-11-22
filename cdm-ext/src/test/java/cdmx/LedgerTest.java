package cdmx;

import cdm.base.staticdata.asset.common.Asset;
import cdm.base.staticdata.party.LegalEntity;
import cdmx.collateral.event.CollateralEvent;
import cdmx.collateral.ledger.AnchorStatusEnum;
import cdmx.collateral.ledger.AnchoredRecordEnum;
import cdmx.collateral.ledger.LedgerAnchor;
import cdmx.collateral.ledger.LedgerTransaction;
import cdmx.collateral.ledger.RecordKeeperConfirmation;
import cdmx.collateral.ledger.TokenizedAsset;
import cdmx.collateral.ledger.functions.AnchorFor;
import cdmx.collateral.ledger.functions.AnchorStatus;
import cdmx.collateral.ledger.functions.AssetForToken;
import cdmx.collateral.ledger.functions.Create_LedgerAnchor;
import cdmx.collateral.ledger.functions.MarginCallStepAnchorStatus;
import cdmx.collateral.ledger.functions.TokenForAsset;
import cdmx.collateral.ledger.functions.TransferComplete;
import cdmx.collateral.ledger.functions.EligibleUnderControl;
import cdmx.collateral.ledger.functions.RegisterBreaks;
import cdmx.collateral.reconciliation.LedgerBreak;
import cdmx.collateral.reconciliation.LedgerBreakTypeEnum;
import cdmx.collateral.reconciliation.LedgerFact;
import cdmx.collateral.margincall.MarginCallInstruction;
import org.bouncycastle.jcajce.provider.digest.Keccak;
import org.bouncycastle.util.encoders.Hex;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static cdmx.Cdm.*;
import static cdmx.Data.*;
import static cdmx.EnforcementTest.imDefault;
import static cdmx.PortfolioTest.delivered;
import static org.junit.jupiter.api.Assertions.*;

/** Gaps G24 (tokenized asset identity) and G25 (ledger anchors, nw-ledger-anchor-redesign), on the prototype's Besu
 *  network (chain id 1337, QBFT). Addresses, transaction hashes and the DTI are invented; document hashes are
 *  keccak256 over the Rune JSON, as the collateral service computes cdmHash. */
class LedgerTest {
    private static final String TUST = "0x5fbdb2315678afecb367f032d93f642f64180aa3";
    private static final String TMMF = "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512";
    private static final String CONTROL = "0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0";
    private static final String TX_A = "0x" + "aa".repeat(32);
    private static final String TX_B = "0x" + "bb".repeat(32);
    private static final String TX_C = "0x" + "cc".repeat(32);
    private static final String KEEPER = "Transfer Agent Ltd";

    static Map<String, Object> besu() {
        return o("name", "besu-prototype", "platform", "Hyperledger Besu", "chainId", 1337);
    }

    static Map<String, Object> tokenDoc(String isin, String contract, String record) {
        Map<String, Object> t = o("asset", security(isin), "network", besu(), "tokenContract", contract,
            "tokenStandard", "ERC20", "decimals", 0, "authoritativeRecord", record);
        if (!"Bearer".equals(record)) t.put("recordKeeper", o("name", o("@data", KEEPER)));
        return t;
    }

    /** tUST is a bearer token; tMMF mirrors the fund's register kept by its transfer agent. */
    static List<TokenizedAsset> tokens() {
        Map<String, Object> tust = tokenDoc("XS0000TUST01", TUST, "Bearer");
        tust.put("dti", "X9J9K872S");
        return List.of(load(TokenizedAsset.class, tust), load(TokenizedAsset.class, tokenDoc("XS0000TMMF01", TMMF, "Registered")));
    }

    static String keccak(String json) {
        return "0x" + Hex.toHexString(new Keccak.Digest256().digest(json.getBytes(StandardCharsets.UTF_8)));
    }

    /** One contract event as a party reads it from the chain; recordedHash is null for events that carry none. */
    static LedgerTransaction log(String tx, int logIndex, String contract, String event, String recordedHash, String status) {
        Map<String, Object> d = o("network", besu(), "contractAddress", contract, "transactionHash", tx,
            "blockNumber", 42, "logIndex", logIndex, "eventName", event, "status", status);
        if (recordedHash != null) d.put("recordedHash", recordedHash);
        return load(LedgerTransaction.class, d);
    }

    private static String stepHash(CollateralEvent e) {
        return keccak(toJson(e.getInstruction()));
    }

    /** The settlement step's events in chain order: tUST moves and CallSettled carries the hash in transaction A;
     *  transactions B and C belong to other records. */
    private static List<LedgerTransaction> chain(String hash, String status) {
        return List.of(
            log(TX_B, 0, CONTROL, "CallIssued", "0x" + "01".repeat(32), status),
            log(TX_A, 0, TUST, "Transfer", null, status),
            log(TX_A, 1, CONTROL, "CallSettled", hash, status),
            log(TX_C, 0, TUST, "Transfer", null, status));
    }

    private static LedgerAnchor anchor(CollateralEvent e, String status) {
        return fn(Create_LedgerAnchor.class).evaluate(AnchoredRecordEnum.MARGIN_CALL_STEP, e.getEventIdentifier(),
            stepHash(e), chain(stepHash(e), status));
    }

    private static Asset asset(String isin) {
        return load(Asset.class, security(isin));
    }

    private static String isin(Asset a) {
        return a.getInstrument().getSecurity().getIdentifier().get(0).getIdentifier().getValue();
    }

    // G24

    @Test
    void tokensAndCdmAssetsMapBothWays() {
        assertEquals(TMMF, fn(TokenForAsset.class).evaluate(tokens(), asset("XS0000TMMF01"), "besu-prototype").getTokenContract());
        assertEquals("XS0000TUST01", isin(fn(AssetForToken.class).evaluate(tokens(), "besu-prototype", TUST)));
        tokens().forEach(t -> assertEquals("", failedText(t)));
    }

    @Test
    void anUnknownTokenOrNetworkHasNoMatch() {
        assertNull(fn(AssetForToken.class).evaluate(tokens(), "besu-prototype", "0x0000000000000000000000000000000000000001"));
        assertNull(fn(TokenForAsset.class).evaluate(tokens(), asset("XS0000TUST01"), "canton-prototype"));
    }

    @Test
    void aContractRepresentsOneAsset() {
        List<TokenizedAsset> twice = List.of(tokens().get(0), load(TokenizedAsset.class, tokenDoc("XS0000TMMF01", TUST, "Bearer")));
        assertTrue(rejected(() -> fn(AssetForToken.class).evaluate(twice, "besu-prototype", TUST)).contains("represents one asset"));
    }

    @Test
    void aRegisteredTokenNamesItsRecordKeeper() {
        Map<String, Object> doc = tokenDoc("XS0000TMMF01", TMMF, "Registered");
        doc.remove("recordKeeper");
        assertTrue(failedText(load(TokenizedAsset.class, doc)).contains("RecordKeeperOffLedger"));
    }

    /** task-dti-format-check: published DTIs pass (Ether X9J9K872S, the EIB bond WGHBLG826, from the DTIF FAQ). */
    @Test
    void aWellFormedDtiPasses() {
        for (String dti : List.of("X9J9K872S", "WGHBLG826")) {
            Map<String, Object> doc = tokenDoc("XS0000TUST01", TUST, "Bearer");
            doc.put("dti", dti);
            assertEquals("", failedText(load(TokenizedAsset.class, doc)), dti);
        }
    }

    /** Wrong length, a vowel or Y in the base number, a leading zero, lower case, a symbol: each is rejected. */
    @Test
    void aMalformedDtiIsRejectedWithItsReason() {
        for (String dti : List.of("X9J9K872", "X9J9K872SS", "QUSD00000", "QAGY00000", "0X9J9K87S", "x9j9k872s", "X9J9K87-S")) {
            Map<String, Object> doc = tokenDoc("XS0000TUST01", TUST, "Bearer");
            doc.put("dti", dti);
            String failed = failedText(load(TokenizedAsset.class, doc));
            assertTrue(failed.contains("dti") && failed.contains(dti), dti + " -> " + failed);
        }
    }

    @Test
    void anotherStandardIsNamed() {
        Map<String, Object> doc = tokenDoc("XS0000TUST01", TUST, "Bearer");
        doc.put("tokenStandard", "Other");
        assertTrue(failedText(load(TokenizedAsset.class, doc)).contains("OtherStandardNamed"));
    }

    // G25: the hashed document

    @Test
    void theInstructionHashIsStableAcrossARuneJsonRoundTrip() throws Exception {
        String json = toJson(delivered().getInstruction());
        String again = toJson(JSON.readValue(json, MarginCallInstruction.class));
        assertEquals(json, again);
        assertEquals(keccak(json), keccak(again));
        assertTrue(keccak(json).matches("0x[0-9a-f]{64}"));
    }

    // G25: anchors

    @Test
    void aStepIsAnchoredFromTheChain() {
        CollateralEvent settled = delivered();
        LedgerAnchor a = anchor(settled, "Final");
        assertEquals(stepHash(settled), a.getDocumentHash());
        assertEquals(List.of("Transfer", "CallSettled"), a.getTransaction().stream().map(LedgerTransaction::getEventName).toList());
        assertTrue(a.getTransaction().stream().allMatch(t -> TX_A.equals(t.getTransactionHash())));
        assertEquals("", failedText(a));
    }

    @Test
    void bothPartiesBuildTheSameAnchorAndTheEventIsUnchanged() {
        CollateralEvent settled = delivered();
        String eventJson = toJson(settled);
        LedgerAnchor mine = anchor(settled, "Final");
        LedgerAnchor theirs = anchor(delivered(), "Final");
        assertEquals(mine, theirs);
        assertEquals(toJson(mine), toJson(theirs));
        assertEquals(eventJson, toJson(settled));
    }

    @Test
    void noAnchorWithoutTheHashOnChain() {
        CollateralEvent settled = delivered();
        assertTrue(rejected(() -> fn(Create_LedgerAnchor.class).evaluate(AnchoredRecordEnum.MARGIN_CALL_STEP,
            settled.getEventIdentifier(), stepHash(settled), chain("0x" + "02".repeat(32), "Final")))
            .contains("records the record's hash"));
    }

    @Test
    void anAnchorHoldsOnlyItsOwnHash() {
        LedgerAnchor a = anchor(delivered(), "Final");
        List<LedgerTransaction> mixed = new ArrayList<>(a.getTransaction());
        mixed.add(log(TX_B, 0, CONTROL, "CallIssued", "0x" + "01".repeat(32), "Final"));
        assertTrue(failedText(a.toBuilder().setTransaction(mixed).build()).contains("TransactionsCarryTheHash"));
    }

    @Test
    void theStatusFollowsTheTransactions() {
        AnchorStatus status = fn(AnchorStatus.class);
        CollateralEvent settled = delivered();
        assertEquals(AnchorStatusEnum.MISSING, status.evaluate(null, 1));
        assertEquals(AnchorStatusEnum.PENDING, status.evaluate(anchor(settled, "Mined"), 1));
        assertEquals(AnchorStatusEnum.COMPLETE, status.evaluate(anchor(settled, "Final"), 1));
        assertEquals(AnchorStatusEnum.FAILED, status.evaluate(anchor(settled, "Reverted"), 1));
        assertEquals(AnchorStatusEnum.PENDING, status.evaluate(anchor(settled, "Final"), 2));
    }

    @Test
    void aMarginCallStepAndTheLedgerAgree() {
        CollateralEvent settled = delivered();
        List<LedgerAnchor> anchors = List.of(anchor(settled, "Final"));
        assertEquals(AnchorStatusEnum.COMPLETE,
            fn(MarginCallStepAnchorStatus.class).evaluate(settled.getAfter(), settled.getEventIdentifier(), anchors));
        String earlier = settled.getAfter().getStepRecord().get(0).getIdentifier();
        assertEquals(AnchorStatusEnum.MISSING, fn(MarginCallStepAnchorStatus.class).evaluate(settled.getAfter(), earlier, anchors));
        assertTrue(rejected(() -> fn(MarginCallStepAnchorStatus.class).evaluate(settled.getAfter(), "S-99", anchors))
            .contains("one the call has applied"));
    }

    @Test
    void anEnforcementIsAnchoredOnItsInstruction() {
        String hash = keccak(toJson(imDefault()));
        LedgerAnchor a = fn(Create_LedgerAnchor.class).evaluate(AnchoredRecordEnum.ENFORCEMENT, "E-1", hash,
            List.of(log(TX_C, 0, TUST, "Transfer", null, "Final"), log(TX_C, 1, CONTROL, "Enforced", hash, "Final")));
        assertEquals(a, fn(AnchorFor.class).evaluate(List.of(a), AnchoredRecordEnum.ENFORCEMENT, "E-1"));
        assertNull(fn(AnchorFor.class).evaluate(List.of(a), AnchoredRecordEnum.SUBSTITUTION, "E-1"));
        assertTrue(rejected(() -> fn(AnchorFor.class).evaluate(List.of(a, a), AnchoredRecordEnum.ENFORCEMENT, "E-1"))
            .contains("at most one anchor"));
    }

    // G24 with G25: completion by authoritative record (provisional, task-sme-registered-asset-completion)

    private static RecordKeeperConfirmation confirmation(String keeper, String isin, String record) {
        return RecordKeeperConfirmation.builder()
            .setRecordKeeper(load(LegalEntity.class, o("name", o("@data", keeper))))
            .setAsset(asset(isin))
            .setRecordIdentifier(record)
            .setConfirmedAt(ZonedDateTime.of(2026, 10, 21, 10, 0, 0, 0, ZoneOffset.UTC))
            .build();
    }

    @Test
    void aBearerTransferNeedsOnlyTheLedger() {
        TransferComplete complete = fn(TransferComplete.class);
        TokenizedAsset tust = tokens().get(0);
        assertTrue(complete.evaluate(tust, "S-5", AnchorStatusEnum.COMPLETE, List.of()));
        assertFalse(complete.evaluate(tust, "S-5", AnchorStatusEnum.PENDING, List.of()));
    }

    @Test
    void aRegisteredTransferNeedsTheRecordKeeper() {
        TransferComplete complete = fn(TransferComplete.class);
        TokenizedAsset tmmf = tokens().get(1);
        assertFalse(complete.evaluate(tmmf, "S-5", AnchorStatusEnum.COMPLETE, List.of()));
        assertTrue(complete.evaluate(tmmf, "S-5", AnchorStatusEnum.COMPLETE, List.of(confirmation(KEEPER, "XS0000TMMF01", "S-5"))));
        assertFalse(complete.evaluate(tmmf, "S-5", AnchorStatusEnum.COMPLETE, List.of(confirmation("Another Registrar", "XS0000TMMF01", "S-5"))));
        assertFalse(complete.evaluate(tmmf, "S-5", AnchorStatusEnum.COMPLETE, List.of(confirmation(KEEPER, "XS0000TMMF01", "S-4"))));
        assertFalse(complete.evaluate(tmmf, "S-5", AnchorStatusEnum.FAILED, List.of(confirmation(KEEPER, "XS0000TMMF01", "S-5"))));
    }

    @Test
    void anAnchorSurvivesARuneJsonRoundTrip() throws Exception {
        LedgerAnchor a = anchor(delivered(), "Final");
        assertEquals(a, JSON.readValue(toJson(a), LedgerAnchor.class));
    }

    // Interim rules of task-sme-registered-asset-completion (project owner, 2026-11-21)

    /** REG-3: a Registered or Claim token is eligible only with a control agreement; a Bearer token always. */
    @Test
    void aRegisteredTokenIsEligibleOnlyUnderAControlAgreement() {
        EligibleUnderControl eligible = fn(EligibleUnderControl.class);
        assertTrue(eligible.evaluate(tokens().get(0)));
        assertFalse(eligible.evaluate(tokens().get(1)));
        Map<String, Object> doc = tokenDoc("XS0000TMMF01", TMMF, "Registered");
        doc.put("controlAgreement", "CA-TMMF-1");
        assertTrue(eligible.evaluate(load(TokenizedAsset.class, doc)));
        Map<String, Object> claim = tokenDoc("XS0000TMMF01", TMMF, "Claim");
        assertFalse(eligible.evaluate(load(TokenizedAsset.class, claim)));
    }

    private static LedgerFact fact(String record, String value) {
        return LedgerFact.builder().setRecordIdentifier(record).setAttribute("units").setFactValue(value).build();
    }

    /** REG-5: the register and the ledger agree, or each disagreement is a break typed from the register's side. */
    @Test
    void theRegisterAndTheLedgerAreComparedHolderByHolder() {
        RegisterBreaks breaks = fn(RegisterBreaks.class);
        List<LedgerFact> register = List.of(fact("register/tMMF/bank-a", "100"), fact("register/tMMF/escrow", "50"));
        assertTrue(breaks.evaluate(register, register).isEmpty());
        List<LedgerFact> chain = List.of(fact("register/tMMF/bank-a", "60"), fact("register/tMMF/escrow", "50"), fact("register/tMMF/bank-b", "40"));
        List<? extends LedgerBreak> found = breaks.evaluate(register, chain);
        assertEquals(2, found.size());
        LedgerBreak a = found.stream().filter(b -> b.getRecordIdentifier().endsWith("bank-a")).findFirst().orElseThrow();
        assertEquals(LedgerBreakTypeEnum.VALUE_DIFFERS, a.getBreakType());
        assertEquals("100", a.getRecordedValue());
        assertEquals("60", a.getLedgerValue());
        LedgerBreak b = found.stream().filter(x -> x.getRecordIdentifier().endsWith("bank-b")).findFirst().orElseThrow();
        assertEquals(LedgerBreakTypeEnum.MISSING_FROM_RECORDS, b.getBreakType());
    }
}
