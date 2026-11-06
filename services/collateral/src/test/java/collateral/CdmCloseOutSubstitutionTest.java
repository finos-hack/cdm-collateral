package collateral;

import cdm.event.common.CollateralPortfolio;
import cdmx.collateral.closeout.CloseOutStatement;
import cdmx.collateral.substitution.CollateralSubstitution;
import cdmx.collateral.substitution.SubstitutionStatusEnum;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** The CDM documents of flow-close-out-netting (G15) and flow-substitution (G16) as the collateral service builds them. */
class CdmCloseOutSubstitutionTest {
    private static final String TUST = "US912810TM60";
    private static final String TMMF = "US9128100000";
    private static final String SUB = "0x" + "ab".repeat(32);

    @Test
    void closeOutAppliesThePledgedCollateralAndReturnsTheSurplus() {
        CdmCloseOut c = CdmCloseOut.build("BANK-B", "BANK-A", 11_700_000, 12_653_158);
        assertEquals(11_700_000, CdmCloseOut.usd(c.statement.getEarlyTerminationAmount()));
        assertEquals(11_700_000, CdmCloseOut.usd(c.statement.getCollateralApplied()));
        assertEquals(-953_158, CdmCloseOut.usd(c.statement.getAmountPayable()));
        assertEquals(c.hash, Cdm.keccakHex(c.json));
        CloseOutStatement s = CdmCloseOut.verify(c.json);
        assertEquals(c.statement, s);
    }

    @Test
    void aStatementWhoseFiguresDoNotFollowFromItsInputsIsRejected() {
        CdmCloseOut c = CdmCloseOut.build("BANK-B", "BANK-A", 11_700_000, 12_653_158);
        String tampered = c.json.replace("-953158", "-853158");
        assertNotEquals(c.json, tampered);
        assertThrows(IllegalStateException.class, () -> CdmCloseOut.verify(tampered));
    }

    private static CollateralPortfolio held(long tust, long tmmf, long valueUsd) {
        List<Map<String, Object>> positions = new java.util.ArrayList<>();
        if (tust > 0) positions.add(Map.of("isin", TUST, "units", tust));
        if (tmmf > 0) positions.add(Map.of("isin", TMMF, "units", tmmf));
        return CdmSubstitution.portfolio(positions, valueUsd, "BANK-A", "BANK-B");
    }

    @Test
    void aConsentedSubstitutionFoldsToCollateralSubstituted() {
        CdmSubstitution req = CdmSubstitution.request(SUB, List.of(Map.of("isin", TUST, "units", 44_000L)), 4_242_920,
                List.of(Map.of("isin", TMMF, "units", 4_300_000L)), 4_257_000);
        CdmSubstitution consent = CdmSubstitution.consent(SUB, true, null);
        CdmSubstitution settle = CdmSubstitution.settle(SUB);
        CollateralPortfolio p = held(128_589, 0, 12_400_094);
        long t = 1_793_000_000L;
        List<CollateralSubstitution> events = CdmSubstitution.fold(SUB, List.of(
                new CdmSubstitution.Step(req.json, p, t), new CdmSubstitution.Step(consent.json, p, t + 2),
                new CdmSubstitution.Step(settle.json, p, t + 4)));
        assertEquals(List.of("SubstitutionRequested", "SubstitutionConsented", "CollateralSubstituted"),
                events.stream().map(CollateralSubstitution::getEventQualifier).toList());
        CollateralSubstitution last = events.get(2);
        assertEquals(SubstitutionStatusEnum.SETTLED, last.getAfter().getStatus());
        assertTrue(last.getAfter().getConsentRequired());
        assertEquals(0, last.getPortfolioAfter().getCollateralBalance().get(0).getAmountBaseCurrency().getValue()
                .compareTo(new java.math.BigDecimal(12_414_174)));
        assertEquals(2, last.getTransfer().size());
    }

    @Test
    void settlingWithoutConsentFailsTheFold() {
        CdmSubstitution req = CdmSubstitution.request(SUB, List.of(Map.of("isin", TUST, "units", 44_000L)), 4_242_920,
                List.of(Map.of("isin", TMMF, "units", 4_300_000L)), 4_257_000);
        CollateralPortfolio p = held(128_589, 0, 12_400_094);
        assertThrows(RuntimeException.class, () -> CdmSubstitution.fold(SUB, List.of(
                new CdmSubstitution.Step(req.json, p, 1L), new CdmSubstitution.Step(CdmSubstitution.settle(SUB).json, p, 2L))));
    }

    @Test
    void aRequestForItemsNotHeldFailsTheFold() {
        CdmSubstitution req = CdmSubstitution.request(SUB, List.of(Map.of("isin", TUST, "units", 200_000L)), 4_242_920,
                List.of(Map.of("isin", TMMF, "units", 4_300_000L)), 4_257_000);
        assertThrows(RuntimeException.class, () -> CdmSubstitution.fold(SUB, List.of(
                new CdmSubstitution.Step(req.json, held(128_589, 0, 12_400_094), 1L))));
    }
}
