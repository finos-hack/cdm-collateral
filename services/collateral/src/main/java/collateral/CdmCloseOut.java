package collateral;

import cdm.base.staticdata.party.Party;
import cdm.observable.asset.Money;
import cdmx.collateral.closeout.CloseOutAmount;
import cdmx.collateral.closeout.CloseOutStatement;
import cdmx.collateral.closeout.CollateralArrangementEnum;
import cdmx.collateral.closeout.functions.CloseOutNetting;

import java.util.List;
import java.util.Map;

import static collateral.CdmRuntime.l;
import static collateral.CdmRuntime.o;

/**
 * The CDM close-out statement after a pledgor's default (flow-close-out-netting; cdm-ext {@code cdmx.collateral.closeout},
 * gap G15). The secured party is the Non-defaulting Party: it gives the Close-out Amount of the netting set, and
 * {@code CloseOutNetting} (ISDA 2002 MA Section 6(e)) nets it with the Unpaid Amounts and applies the pledged collateral
 * under the security interest of the 2018 IM CSA. The statement's Rune JSON is the payload whose keccak-256 the control
 * contract records with the close-out (wp-adr-cdm-payload-carrier).
 *
 * Reductions (nw-prototype-scope): one Close-out Amount for the whole netting set, no Unpaid Amounts, amounts in whole
 * USD (the Termination Currency). {@code collateralHeld} is the escrow's value after haircuts at the feed prices when the
 * secured party closes out; the contract applies whole token units, so the value it applies can exceed the statement's
 * {@code collateralApplied} by less than one unit of the last token applied.
 */
public final class CdmCloseOut {
    public static final String CURRENCY = "USD";
    public static final String NETTING_SET = "NETTING-SET-1";

    public final CloseOutStatement statement;
    public final String json;
    public final String hash;

    private CdmCloseOut(CloseOutStatement statement) {
        CdmRuntime.validate(statement);
        this.statement = statement;
        this.json = CdmRuntime.toJson(statement);
        this.hash = Cdm.keccakHex(json);
    }

    private static Map<String, Object> money(long v) {
        return o("value", v, "unit", o("currency", o("@data", CURRENCY)));
    }

    static Party party(String name) {
        return CdmRuntime.load(Party.class, o("partyId", l(o("identifier", o("@data", name)))));
    }

    /** Build and validate the statement. closeOutAmountUsd is from the Non-defaulting Party's side (positive: a loss to it). */
    public static CdmCloseOut build(String nonDefaulting, String defaulting, long closeOutAmountUsd, long collateralHeldUsd) {
        CloseOutAmount amount = CdmRuntime.load(CloseOutAmount.class, o(
                "tradeIdentifier", o("issuer", o("@data", nonDefaulting), "assignedIdentifier", l(o("identifier", o("@data", NETTING_SET)))),
                "amount", money(closeOutAmountUsd)));
        Money held = CdmRuntime.load(Money.class, money(collateralHeldUsd));
        CloseOutStatement s = CdmRuntime.fn(CloseOutNetting.class).evaluate(party(nonDefaulting), party(defaulting),
                CollateralArrangementEnum.SECURITY_INTEREST, List.of(amount), List.of(), held, CURRENCY);
        return new CdmCloseOut(s);
    }

    /**
     * Check a statement received through the payload store: it parses as a CloseOutStatement, passes CDM validation, and
     * {@code CloseOutNetting} over its own inputs gives the same statement. Returns the parsed statement; throws otherwise.
     */
    public static CloseOutStatement verify(String json) {
        try {
            CloseOutStatement s = CdmRuntime.JSON.readValue(json, CloseOutStatement.class);
            CdmRuntime.validate(s);
            // Under title transfer the statement's Unpaid Amounts include the Credit Support Balance that CloseOutNetting
            // adds itself, so recomputing from them would count it twice; the prototype's IM CSA is a security interest.
            if (s.getArrangement() != CollateralArrangementEnum.SECURITY_INTEREST)
                throw new IllegalStateException("only a security-interest close-out is checked here");
            List<cdmx.collateral.closeout.UnpaidAmount> unpaid = s.getUnpaidAmount() == null ? List.of() : List.copyOf(s.getUnpaidAmount());
            CloseOutStatement again = CdmRuntime.fn(CloseOutNetting.class).evaluate(s.getNonDefaultingParty(), s.getDefaultingParty(),
                    s.getArrangement(), s.getCloseOutAmount() == null ? List.of() : List.copyOf(s.getCloseOutAmount()), unpaid,
                    s.getCollateralHeld(), s.getEarlyTerminationAmount().getUnit().getCurrency().getValue());
            if (!again.equals(s)) throw new IllegalStateException("CloseOutNetting over the statement's inputs gives a different statement");
            return s;
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("not a CloseOutStatement: " + e.getMessage(), e);
        }
    }

    /** Whole-unit value of a CDM Money (the statement keeps whole USD). */
    public static long usd(Money m) {
        return m.getValue().longValueExact();
    }
}
