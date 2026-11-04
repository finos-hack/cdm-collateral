package cdmx;

import cdm.base.staticdata.asset.common.Asset;
import cdmx.collateral.enforcement.CollateralEnforcement;
import cdmx.collateral.enforcement.functions.Create_CollateralEnforcement;
import cdmx.collateral.event.CollateralEvent;
import cdmx.collateral.event.functions.AnchorCollateralEvent;
import cdmx.collateral.ledger.LedgerReference;
import cdmx.collateral.ledger.TokenizedAsset;
import cdmx.collateral.ledger.functions.AssetForToken;
import cdmx.collateral.ledger.functions.ContentAnchored;
import cdmx.collateral.ledger.functions.TokenForAsset;
import cdmx.collateral.margincall.MarginCallStepRecord;
import cdmx.collateral.margincall.functions.AnchorMarginCallStep;
import com.rosetta.model.lib.records.Date;
import org.junit.jupiter.api.Test;

import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Map;

import static cdmx.Cdm.*;
import static cdmx.Data.*;
import static cdmx.EnforcementTest.held;
import static cdmx.EnforcementTest.imDefault;
import static cdmx.PortfolioTest.delivered;
import static org.junit.jupiter.api.Assertions.*;

/** Gaps G24 (tokenized asset identity) and G25 (references from CDM records to the ledger), on the prototype's Besu
 *  network (chain id 1337). Addresses, hashes and the DTI are invented. */
class LedgerTest {
    private static final String TUST = "0x5fbdb2315678afecb367f032d93f642f64180aa3";
    private static final String TMMF = "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512";
    private static final String HASH = "0x9c22ff5f21f0b81b113e63f7db6da94fedef11b2119b4088b89664fb9a3cb658";

    static Map<String, Object> besu() {
        return o("name", "besu-prototype", "platform", "Hyperledger Besu", "chainId", 1337);
    }

    static Map<String, Object> tokenDoc(String isin, String contract, String record) {
        Map<String, Object> t = o("asset", security(isin), "network", besu(), "tokenContract", contract,
            "tokenStandard", "ERC20", "decimals", 0, "authoritativeRecord", record);
        if (!"Bearer".equals(record)) t.put("recordKeeper", o("name", o("@data", "Transfer Agent Ltd")));
        return t;
    }

    /** tUST is a bearer token; tMMF mirrors the fund's register kept by its transfer agent. */
    static List<TokenizedAsset> tokens() {
        Map<String, Object> tust = tokenDoc("XS0000TUST01", TUST, "Bearer");
        tust.put("dti", "X9J9K872S");
        return List.of(load(TokenizedAsset.class, tust), load(TokenizedAsset.class, tokenDoc("XS0000TMMF01", TMMF, "Registered")));
    }

    static LedgerReference ref(String event, Number block) {
        return load(LedgerReference.class, o("network", besu(), "contractAddress", TUST, "transactionHash",
            "0x" + "ab".repeat(32), "blockNumber", block, "eventName", event, "contentHash", HASH));
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

    @Test
    void anotherStandardIsNamed() {
        Map<String, Object> doc = tokenDoc("XS0000TUST01", TUST, "Bearer");
        doc.put("tokenStandard", "Other");
        assertTrue(failedText(load(TokenizedAsset.class, doc)).contains("OtherStandardNamed"));
    }

    // G25

    @Test
    void aMarginCallEventIsAnchoredOnTheEventAndItsStep() {
        CollateralEvent settled = delivered();
        CollateralEvent anchored = fn(AnchorCollateralEvent.class).evaluate(settled, ref("CallSettled", 42));
        assertEquals("CallSettled", anchored.getLedgerReference().getEventName());
        List<? extends MarginCallStepRecord> steps = anchored.getAfter().getStepRecord();
        MarginCallStepRecord last = steps.get(steps.size() - 1);
        assertEquals(settled.getEventIdentifier(), last.getIdentifier());
        assertEquals(42, last.getLedgerReference().getBlockNumber());
        assertNull(steps.get(0).getLedgerReference());
        assertEquals(settled.getAfter().getStatus(), anchored.getAfter().getStatus());
        assertEquals(settled.getTransfer(), anchored.getTransfer());
        assertEquals("", failedText(anchored));
    }

    @Test
    void onlyAnAppliedStepIsAnchored() {
        assertTrue(rejected(() -> fn(AnchorMarginCallStep.class).evaluate(delivered().getAfter(), "S-99", ref("CallSettled", 42)))
            .contains("one the call has applied"));
    }

    @Test
    void theContentHashIsCheckedAgainstTheLedger() {
        assertTrue(fn(ContentAnchored.class).evaluate(ref("CallIssued", 7), HASH));
        assertFalse(fn(ContentAnchored.class).evaluate(ref("CallIssued", 7), "0x" + "00".repeat(32)));
    }

    @Test
    void anEnforcementCarriesItsLedgerReference() {
        CollateralEnforcement e = fn(Create_CollateralEnforcement.class).evaluate(held(), null, "E-1", Date.of(2026, 10, 21),
            ZonedDateTime.of(2026, 10, 21, 9, 0, 0, 0, ZoneOffset.UTC), imDefault(), ref("Enforced", 120));
        assertEquals("Enforced", e.getLedgerReference().getEventName());
        assertEquals("", failedText(e));
    }

    @Test
    void anAnchoredEventSurvivesARuneJsonRoundTrip() throws Exception {
        CollateralEvent anchored = fn(AnchorCollateralEvent.class).evaluate(delivered(), ref("CallSettled", 42));
        assertEquals(anchored, JSON.readValue(toJson(anchored), CollateralEvent.class));
    }
}
