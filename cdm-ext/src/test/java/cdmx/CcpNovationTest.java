package cdmx;

import cdm.event.common.BusinessEvent;
import cdm.event.common.EventIntentEnum;
import cdm.event.common.Instruction;
import cdm.event.common.PrimitiveInstruction;
import cdm.event.common.TradeState;
import cdm.event.common.functions.Create_BusinessEvent;
import cdmx.collateral.ccp.CcpNovation;
import cdmx.collateral.repo.functions.RepoRepurchasePrice;
import com.regnosys.rosetta.common.hashing.GlobalKeyProcessStep;
import com.regnosys.rosetta.common.hashing.NonNullHashCollector;
import com.rosetta.model.lib.records.Date;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static cdmx.Cdm.*;
import static cdmx.RepoTest.*;
import static org.junit.jupiter.api.Assertions.*;

/** The clearing of BANK-A's repo to BANK-B at the CCP BANK-C (task-ccp-clearing, wp-adr-ccp-clearing): CDM's split with
 *  intent Clearing in three branches, which Qualify_ClearedTrade accepts, inside the cdm-ext CcpNovation. */
class CcpNovationTest {
    static final Date ON = Date.of(2026, 11, 9);

    @SuppressWarnings("unchecked")
    static Map<String, Object> fromJson(String json) {
        try {
            return JSON.readValue(json, Map.class);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    static Map<String, Object> party(String name) {
        return o("partyId", l(o("identifier", o("@data", name))), "name", o("@data", name));
    }

    static TradeState bilateral() {
        return book(execution("REPO-1", "BANK-A", "BANK-B", TUST, 1_020, "98.40", 98_400, "0.045", "1.02",
                "2026-11-09", "2026-11-09", "2026-11-16"), "2026-11-09").getAfter().get(0);
    }

    static Map<String, Object> change(String ccp, String role, String id) {
        return o("partyChange", o("counterparty", o("role", role, "partyReference", party(ccp)),
                "partyRole", o("partyReference", party(ccp), "role", "ClearingOrganization"),
                "tradeId", l(o("issuer", o("@data", ccp), "assignedIdentifier", l(o("identifier", o("@data", id)))))));
    }

    static BusinessEvent clearing(TradeState ts, String ccp, boolean close) {
        Object zero = o("quantityChange", o("direction", "Replace", "change", l(
                o("quantity", o("value", 0, "unit", o("currency", o("@data", "USD")))),
                o("quantity", o("value", 0, "unit", o("financialUnit", "Share"))))));
        List<Object> breakdown = new ArrayList<>(List.of(change(ccp, "Party2", "REPO-1-S"), change(ccp, "Party1", "REPO-1-B")));
        if (close) breakdown.add(zero);
        PrimitiveInstruction pi = load(PrimitiveInstruction.class, o("split", o("breakdown", breakdown)));
        var ib = Instruction.builder().setBeforeValue(ts).setPrimitiveInstruction(pi);
        new GlobalKeyProcessStep(NonNullHashCollector::new).runProcessStep(Instruction.class, ib);
        BusinessEvent ev = resolved(BusinessEvent.class, fn(Create_BusinessEvent.class)
                .evaluate(new ArrayList<>(List.of(ib.build())), EventIntentEnum.CLEARING, ON, null));
        var b = ev.toBuilder();
        for (var a : b.getAfter())
            if (a.getState() != null && a.getState().getClosedState() != null) a.getState().getClosedState().setActivityDate(ON);
        return b.build();
    }

    static Map<String, Object> novationDoc(BusinessEvent ev, String ccp) {
        return o("rulebookHash", "0x" + "44".repeat(32), "bilateralTradeHash", "0x" + "55".repeat(32),
                "ccp", o("partyReference", party(ccp), "role", "ClearingOrganization"), "clearing", fromJson(toJson(ev)));
    }

    @Test
    void theThreeBranchClearingIsAValidNovationAndEachLegKeepsTheRepurchasePrice() {
        BusinessEvent ev = clearing(bilateral(), "BANK-C", true);
        CcpNovation n = load(CcpNovation.class, novationDoc(ev, "BANK-C"));
        assertEquals("", failedText(n));
        assertEquals(3, ev.getAfter().size());
        long bilateralRp = fn(RepoRepurchasePrice.class).evaluate(bilateral(), 0).getValue().longValueExact();
        for (int i = 0; i < 2; i++) {
            TradeState leg = resolved(TradeState.class, load(TradeState.class, fromJson(toJson(ev.getAfter().get(i)))));
            assertEquals(bilateralRp, fn(RepoRepurchasePrice.class).evaluate(leg, 0).getValue().longValueExact());
        }
    }

    @Test
    void aSplitThatClosesNothingOrAnotherCcpIsNotANovation() {
        assertTrue(failedText(load(CcpNovation.class, novationDoc(clearing(bilateral(), "BANK-C", false), "BANK-C"))).contains("ClearedTrade"));
        assertTrue(failedText(load(CcpNovation.class, novationDoc(clearing(bilateral(), "BANK-C", true), "BANK-X"))).contains("CcpOnBothTrades"));
    }
}
