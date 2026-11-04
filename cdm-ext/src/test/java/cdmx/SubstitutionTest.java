package cdmx;

import cdm.event.common.CollateralPortfolio;
import cdm.event.common.UnscheduledTransfer;
import cdm.legaldocumentation.csa.Substitution;
import cdmx.collateral.substitution.CollateralSubstitution;
import cdmx.collateral.substitution.SubstitutionInstruction;
import cdmx.collateral.substitution.SubstitutionState;
import cdmx.collateral.substitution.SubstitutionStatusEnum;
import cdmx.collateral.substitution.functions.Create_CollateralSubstitution;
import com.rosetta.model.lib.records.Date;
import org.junit.jupiter.api.Test;

import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.Map;

import static cdmx.Cdm.*;
import static cdmx.Data.*;
import static cdmx.EnforcementTest.held;
import static cdmx.PortfolioTest.balance;
import static cdmx.PortfolioTest.holdings;
import static org.junit.jupiter.api.Assertions.*;

/** Gap G16: substitution of posted collateral under an ISDA CSA. BANK-A holds 128,589 tUST with BANK-B (USD 12,400,094
 *  after haircuts) and swaps 44,000 tUST (USD 4,242,920) for 4,300,000 money market fund tokens (USD 4,257,000).
 *  Amounts invented. */
class SubstitutionTest {
    private final Create_CollateralSubstitution substitute = fn(Create_CollateralSubstitution.class);
    private static final Date D = Date.of(2026, 10, 22);
    private static final ZonedDateTime T = ZonedDateTime.of(2026, 10, 22, 9, 0, 0, 0, ZoneOffset.UTC);
    private static final String TMMF = "XS0000TMMF01";

    static Map<String, Object> requestDoc(Number originalUnits, Number originalValue, Number substituteValue) {
        return o("substitutionIdentifier", "S-1", "pledgorRole", "Party1",
            "originalCollateral", l(position(originalUnits)), "originalValue", money(originalValue),
            "substituteCollateral", l(position(4_300_000, TMMF)), "substituteValue", money(substituteValue));
    }

    static SubstitutionInstruction step(String kind, Object value) {
        return load(SubstitutionInstruction.class, o(kind, value));
    }

    static SubstitutionInstruction request() {
        return step("request", requestDoc(44_000, 4_242_920, 4_257_000));
    }

    static SubstitutionInstruction consent(boolean yes) {
        return step("consent", yes ? o("substitutionIdentifier", "S-1", "consent", true)
            : o("substitutionIdentifier", "S-1", "consent", false, "reason", "Fund concentration"));
    }

    static SubstitutionInstruction settle(String id) {
        return step("settle", o("substitutionIdentifier", id));
    }

    static Substitution consentElection(String party) {
        return load(Substitution.class, o("partyElection", l(o("party", party, "needsConsent", true))));
    }

    private CollateralSubstitution run(SubstitutionState before, CollateralPortfolio p, Substitution elections,
                                       SubstitutionInstruction instruction) {
        return substitute.evaluate(before, p, elections, "S-1/" + (before == null ? 1 : 2), D, T, instruction, null);
    }

    private static String isin(UnscheduledTransfer u) {
        return u.getAsset().getInstrument().getSecurity().getIdentifier().get(0).getIdentifier().getValue();
    }

    private static String payer(UnscheduledTransfer u) {
        return u.getPayerReceiver().getPayerPartyReference().getValue().getPartyId().get(0).getIdentifier().getValue();
    }

    @Test
    void withoutAConsentElectionTheRequestSettlesDirectly() {
        CollateralPortfolio p = held();
        CollateralSubstitution requested = run(null, p, null, request());
        assertEquals(SubstitutionStatusEnum.REQUESTED, requested.getAfter().getStatus());
        assertFalse(requested.getAfter().getConsentRequired());
        assertEquals("SubstitutionRequested", requested.getEventQualifier());
        assertEquals(p, requested.getPortfolioAfter());
        assertTrue(requested.getTransfer() == null || requested.getTransfer().isEmpty());

        CollateralSubstitution settled = run(requested.getAfter(), p, null, settle("S-1"));
        assertEquals(SubstitutionStatusEnum.SETTLED, settled.getAfter().getStatus());
        assertEquals(D, settled.getAfter().getSubstitutionDate());
        assertEquals(Map.of("XS0000TUST01", "84589", TMMF, "4300000"), holdings(settled.getPortfolioAfter()));
        assertEquals("12414174", balance(settled.getPortfolioAfter()));
        assertEquals(2, settled.getTransfer().size());
        UnscheduledTransfer in = settled.getTransfer().get(0).getTransfer().getUnscheduledTransfer();
        UnscheduledTransfer out = settled.getTransfer().get(1).getTransfer().getUnscheduledTransfer();
        assertEquals(TMMF, isin(in));
        assertEquals("BANK-A", payer(in));
        assertEquals("XS0000TUST01", isin(out));
        assertEquals("BANK-B", payer(out));
        assertEquals("CollateralSubstituted", settled.getEventQualifier());
        assertEquals("", failedText(settled));
    }

    @Test
    void withConsentElectedTheSecuredPartyConsentsBeforeSettlement() {
        CollateralPortfolio p = held();
        Substitution elections = consentElection("Party1");
        SubstitutionState requested = run(null, p, elections, request()).getAfter();
        assertTrue(requested.getConsentRequired());
        assertTrue(rejected(() -> run(requested, p, elections, settle("S-1"))).contains("once consented"));
        CollateralSubstitution consented = run(requested, p, elections, consent(true));
        assertEquals("SubstitutionConsented", consented.getEventQualifier());
        assertEquals("CollateralSubstituted", run(consented.getAfter(), p, elections, settle("S-1")).getEventQualifier());
    }

    @Test
    void aRefusedSubstitutionDoesNotSettle() {
        CollateralPortfolio p = held();
        Substitution elections = consentElection("Party1");
        CollateralSubstitution refused = run(run(null, p, elections, request()).getAfter(), p, elections, consent(false));
        assertEquals(SubstitutionStatusEnum.REFUSED, refused.getAfter().getStatus());
        assertEquals("Fund concentration", refused.getAfter().getRefusalReason());
        assertEquals("SubstitutionRefused", refused.getEventQualifier());
        assertTrue(rejected(() -> run(refused.getAfter(), p, elections, settle("S-1"))).contains("once consented"));
    }

    @Test
    void consentIsOnlyGivenWhereItIsNeeded() {
        CollateralPortfolio p = held();
        SubstitutionState requested = run(null, p, null, request()).getAfter();
        assertTrue(rejected(() -> run(requested, p, null, consent(true))).contains("only for a requested substitution that needs it"));
    }

    @Test
    void theOtherPartysElectionDoesNotApply() {
        assertFalse(run(null, held(), consentElection("Party2"), request()).getAfter().getConsentRequired());
    }

    @Test
    void theSubstituteMustBeWorthAtLeastTheOriginal() {
        assertTrue(rejected(() -> run(null, held(), null, step("request", requestDoc(44_000, 4_242_920, 4_000_000))))
            .contains("worth no more than the substitute"));
    }

    @Test
    void onlyHeldItemsCanBeReturned() {
        assertTrue(rejected(() -> run(null, held(), null, step("request", requestDoc(130_000, 4_242_920, 4_257_000))))
            .contains("items to be returned are held"));
    }

    @Test
    void laterStepsNameTheSubstitutionRequested() {
        CollateralPortfolio p = held();
        SubstitutionState requested = run(null, p, null, request()).getAfter();
        assertTrue(rejected(() -> run(requested, p, null, settle("S-2"))).contains("names the substitution requested"));
    }

    @Test
    void aSubstitutionStartsWithTheRequest() {
        assertTrue(rejected(() -> run(null, held(), null, settle("S-1"))).contains("starts with the request"));
    }

    @Test
    void theEventSurvivesARuneJsonRoundTrip() throws Exception {
        CollateralPortfolio p = held();
        CollateralSubstitution e = run(run(null, p, null, request()).getAfter(), p, null, settle("S-1"));
        assertEquals(e, JSON.readValue(toJson(e), CollateralSubstitution.class));
    }
}
