package cdmx;

import cdm.base.staticdata.party.Party;
import cdmx.collateral.closeout.CloseOutAmount;
import cdmx.collateral.closeout.CloseOutStatement;
import cdmx.collateral.closeout.CollateralArrangementEnum;
import cdmx.collateral.closeout.UnpaidAmount;
import cdmx.collateral.closeout.functions.CloseOutNetting;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static cdmx.Cdm.*;
import static cdmx.Data.*;
import static cdmx.ValuationTest.assertAmount;
import static cdmx.VariationMarginTest.bank;
import static org.junit.jupiter.api.Assertions.*;

/** Gap G15: close-out netting under the ISDA 2002 Master Agreement Section 6(e) and the application of collateral, on
 *  the console's im-default scenario (BANK-A defaults, BANK-B is the Non-defaulting Party). Amounts in USD, invented. */
class CloseOutTest {
    private final CloseOutNetting closeOut = fn(CloseOutNetting.class);
    private static final CollateralArrangementEnum PLEDGE = CollateralArrangementEnum.SECURITY_INTEREST;
    private static final CollateralArrangementEnum TITLE = CollateralArrangementEnum.TITLE_TRANSFER;

    /** Close-out Amounts from BANK-B's side: trade id, amount, trade id, amount, ... */
    static List<CloseOutAmount> trades(Object... idAndAmount) {
        List<CloseOutAmount> out = new ArrayList<>();
        for (int i = 0; i < idAndAmount.length; i += 2)
            out.add(load(CloseOutAmount.class, o("tradeIdentifier", ident((String) idAndAmount[i], "BANK-B"),
                "amount", money((Number) idAndAmount[i + 1]))));
        return out;
    }

    static UnpaidAmount unpaid(String owedTo, Number amount) {
        return load(UnpaidAmount.class, o("owedTo", party(owedTo), "amount", money(amount)));
    }

    private CloseOutStatement run(CollateralArrangementEnum arrangement, List<CloseOutAmount> trades,
                                  List<UnpaidAmount> unpaid, Number collateral) {
        return closeOut.evaluate(bank("BANK-B"), bank("BANK-A"), arrangement, trades, unpaid, amount(collateral, "USD"), "USD");
    }

    @Test
    void imDefaultAppliesThePledgedCollateralAndReturnsTheSurplus() {
        // 128,589 tUST at 98.40 = USD 12,653,158 against a close-out amount of USD 11.7m.
        CloseOutStatement s = run(PLEDGE, trades("IRS-1", 11_700_000), List.of(), 12_653_158);
        assertAmount(11_700_000, s.getEarlyTerminationAmount());
        assertAmount(11_700_000, s.getCollateralApplied());
        assertAmount(-953_158, s.getAmountPayable());  // owed back to BANK-A
        assertEquals("", failedText(s));
    }

    @Test
    void aShortfallRemainsPayableByTheDefaultingParty() {
        CloseOutStatement s = run(PLEDGE, trades("IRS-1", 15_000_000), List.of(), 12_653_158);
        assertAmount(12_653_158, s.getCollateralApplied());
        assertAmount(2_346_842, s.getAmountPayable());
    }

    @Test
    void closeOutAmountsAndUnpaidAmountsAreNetted() {  // 10m - 3m + 0.5m owed to B - 0.2m owed to A
        CloseOutStatement s = run(PLEDGE, trades("IRS-1", 10_000_000, "IRS-2", -3_000_000),
            List.of(unpaid("BANK-B", 500_000), unpaid("BANK-A", 200_000)), 0);
        assertAmount(7_300_000, s.getEarlyTerminationAmount());
        assertAmount(0, s.getCollateralApplied());
        assertAmount(7_300_000, s.getAmountPayable());
    }

    @Test
    void whenTheNonDefaultingPartyOwesItAlsoReturnsAllPledgedCollateral() {
        CloseOutStatement s = run(PLEDGE, trades("IRS-1", -2_000_000), List.of(), 5_000_000);
        assertAmount(-2_000_000, s.getEarlyTerminationAmount());
        assertAmount(0, s.getCollateralApplied());
        assertAmount(-7_000_000, s.getAmountPayable());
    }

    @Test
    void underTitleTransferTheCreditSupportBalanceIsAnUnpaidAmountOwedToTheTransferor() {
        // VM by title transfer: BANK-B holds a Credit Support Balance of USD 8.24m; the close-out amount is USD 8m.
        CloseOutStatement s = run(TITLE, trades("IRS-1", 8_000_000), List.of(), 8_240_000);
        assertAmount(-240_000, s.getEarlyTerminationAmount());
        assertAmount(0, s.getCollateralApplied());
        assertAmount(-240_000, s.getAmountPayable());
        UnpaidAmount balance = s.getUnpaidAmount().get(0);
        assertEquals("BANK-A", balance.getOwedTo().getPartyId().get(0).getIdentifier().getValue());
        assertAmount(8_240_000, balance.getAmount());
        assertEquals("", failedText(s));
    }

    @Test
    void underTitleTransferAShortfallIsPayable() {
        assertAmount(760_000, run(TITLE, trades("IRS-1", 9_000_000), List.of(), 8_240_000).getAmountPayable());
    }

    @Test
    void anUnpaidAmountOwedToAThirdPartyIsRejected() {
        assertTrue(rejected(() -> run(PLEDGE, trades("IRS-1", 1_000_000), List.of(unpaid("BANK-C", 1_000)), 0))
            .contains("one of the two parties"));
    }

    @Test
    void amountsInAnotherCurrencyAreRejected() {
        List<CloseOutAmount> eur = List.of(load(CloseOutAmount.class,
            o("tradeIdentifier", ident("IRS-1", "BANK-B"), "amount", money(1_000_000, "EUR"))));
        assertTrue(rejected(() -> run(PLEDGE, eur, List.of(), 0)).contains("Termination Currency"));
    }

    @Test
    void anUnpaidAmountIsPositive() {
        assertTrue(failedText(unpaid("BANK-B", -5)).contains("Positive"));
    }

    @Test
    void theStatementSurvivesARuneJsonRoundTrip() throws Exception {
        CloseOutStatement s = run(PLEDGE, trades("IRS-1", 11_700_000), List.of(), 12_653_158);
        assertEquals(s, JSON.readValue(toJson(s), CloseOutStatement.class));
    }
}
