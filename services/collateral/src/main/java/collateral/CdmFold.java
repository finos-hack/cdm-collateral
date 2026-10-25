package collateral;

import cdmx.collateral.margincall.MarginCallInstruction;
import cdmx.collateral.margincall.MarginCallState;
import cdmx.collateral.margincall.functions.Create_MarginCallState;

import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.List;

/**
 * Folds the ordered lifecycle steps of one call into a cumulative, validated {@code MarginCallState}
 * (ADR wp-adr-cdm-payload-carrier). Each step is a {@code MarginCallInstruction} recovered from the payload store;
 * {@code Create_MarginCallState} applies it to the running state and runs CDM's full validation (the cross-party
 * conditions: response matches the call, settlement covers the agreed amount, steps in order). This is the same path
 * the extension's own lifecycle tests exercise, driven here by the documents both parties committed on-chain.
 */
public final class CdmFold {
    // A fixed base time; the fold needs ordered step timestamps (stepRecord), and chain order is the real sequence.
    private static final ZonedDateTime T0 = ZonedDateTime.of(2026, 1, 1, 0, 0, 0, 0, ZoneOffset.UTC);

    private CdmFold() {}

    /** Fold the given ordered step documents (each a MarginCallInstruction Rune JSON). Throws if a step fails CDM validation. */
    public static MarginCallState fold(List<String> stepDocs) {
        MarginCallState state = null;
        Create_MarginCallState fn = CdmRuntime.fn(Create_MarginCallState.class);
        int i = 0;
        for (String doc : stepDocs) {
            i++;
            try {
                MarginCallInstruction inst = CdmRuntime.JSON.readValue(doc, MarginCallInstruction.class);
                state = fn.evaluate(state, "S-" + i, T0.plusMinutes(i), inst);
            } catch (RuntimeException e) {
                throw e;
            } catch (Exception e) {
                throw new RuntimeException("fold step " + i + " failed: " + e.getMessage(), e);
            }
        }
        return state;
    }
}
