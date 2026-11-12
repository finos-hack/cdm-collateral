package collateral;

import cdm.event.qualification.functions.Qualify_Repurchase;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static collateral.CdmTripartyTest.AGY;
import static collateral.CdmTripartyTest.UST;
import static org.junit.jupiter.api.Assertions.*;

/** Triparty trade end (task-triparty-trade-end, wp-adr-triparty-trade-end) over the trade-start repo (500,000 tUSD at 5%
 *  from 2026-11-12 to 2026-11-19, Repurchase Price 500,486) and over it as a substitution left it. */
class CdmTripartyTradeEndTest {
    /** The holding in on-chain order, as the services read it. */
    static Map<String, Long> held(Object... isinUnits) {
        Map<String, Long> m = new java.util.LinkedHashMap<>();
        for (int i = 0; i < isinUnits.length; i += 2) m.put((String) isinUnits[i], (Long) isinUnits[i + 1]);
        return m;
    }

    @Test
    void theAgentsTradeEndReleasesTheWholeHoldingAgainstTheRepurchasePrice() {
        var a = CdmTripartyTradeStartTest.allocate(3_000, 4_000);
        var basis = CdmTriparty.parseAllocation(a.json()).getTrade();
        var e = CdmTriparty.tradeEnd(basis, a.hash(), held(UST, 3_000L, AGY, 2_190L), "BANK-B", "BANK-A");
        assertEquals(500_486L, e.repurchasePrice());
        var doc = e.tradeEnd();
        assertEquals("2026-11-19", doc.getRepurchaseDate().toString());
        assertEquals(2, doc.getReleases().size());
        assertEquals("BANK-A", doc.getReleases().get(0).getPayerReceiver().getPayerPartyReference().getValue().getName().getValue());
        assertEquals("BANK-B", doc.getCashTransfer().getPayerReceiver().getPayerPartyReference().getValue().getName().getValue());
        assertEquals("Terminated", doc.getRepurchase().getAfter().get(0).getState().getClosedState().getState().toString());
        assertFalse(CdmRuntime.fn(Qualify_Repurchase.class).evaluate(doc.getRepurchase())); // D25
        // The giver and the receiver rebuild it; a holding on-chain other than the repo's collateral is refused.
        assertEquals(e.hash(), CdmTriparty.verifyTradeEnd(e.json(), basis, a.hash(), held(UST, 3_000L, AGY, 2_190L), "BANK-B", "BANK-A").hash());
        assertThrows(RuntimeException.class, () -> CdmTriparty.tradeEnd(basis, a.hash(), held(UST, 3_000L, AGY, 2_000L), "BANK-B", "BANK-A"));
        assertThrows(RuntimeException.class, () -> CdmTriparty.tradeEnd(basis, a.hash(), held(UST, 3_000L), "BANK-B", "BANK-A"));
        assertEquals(e.hash(), Cdm.keccakHex(CdmRuntime.toJson(CdmTriparty.parseTradeEnd(e.json()))));
        Map<String, Object> v = CdmTriparty.tradeEndView(doc);
        assertEquals(500_486L, v.get("repurchasePrice"));
        assertEquals(List.of(Map.of("isin", UST, "units", 3_000L), Map.of("isin", AGY, "units", 2_190L)), v.get("releases"));
    }

    @Test
    void aSubstitutedRepoEndsWithItsNewHolding() {
        var a = CdmTripartyTradeStartTest.allocate(3_000, 4_000);
        var req = CdmTriparty.substitutionRequest("TP-B-1", AGY, 1_000, false, CdmTripartyTradeStartTest.PURCHASE);
        var s = CdmTriparty.substitute(CdmTripartyTradeStartTest.terms().terms(), CdmTriparty.parseAllocation(a.json()).getTrade(), a.hash(), req.hash(), req.request(), "BANK-B",
                CdmTripartyTradeStartTest.PURCHASE,
                List.of(new CdmTriparty.Deposit(1, UST, 3_000, new BigDecimal("98.4")), new CdmTriparty.Deposit(2, AGY, 2_190, new BigDecimal("99.2"))),
                List.of(new CdmTriparty.Deposit(1, UST, 1_500, new BigDecimal("98.4"))));
        var basis = CdmTriparty.tradeAfter(CdmTriparty.parseSubstitution(s.json()));
        var e = CdmTriparty.tradeEnd(basis, s.hash(), held(UST, 3_998L, AGY, 1_190L), "BANK-B", "BANK-A");
        assertEquals(500_486L, e.repurchasePrice());
        assertEquals(s.hash(), e.tradeEnd().getBasisHash());
        assertThrows(RuntimeException.class, () -> CdmTriparty.tradeEnd(basis, s.hash(), held(UST, 3_000L, AGY, 2_190L), "BANK-B", "BANK-A"));
    }
}
