package collateral;

import cdm.base.staticdata.party.Party;
import cdm.product.collateral.CollateralInterestHandlingParameters;
import cdmx.collateral.netting.SettlementNettingStatement;
import cdmx.collateral.netting.SettlementObligation;
import cdmx.collateral.netting.functions.Create_SettlementNetting;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static collateral.CdmRuntime.l;
import static collateral.CdmRuntime.o;

/**
 * The CDM statement of one settlement netting (flow-settlement-netting; cdm-ext {@code cdmx.collateral.netting},
 * task-csa-settlement-netting). The day's agreed VM calls, VM returns and held Interest Amounts between the two parties
 * are CDM {@code SettlementObligation}s; {@code Create_SettlementNetting} sums them per direction and gives the net
 * transfer, under the agreement's interest handling ({@code netInterestWithMarginCalls}, {@link CdmInterest#AGREEMENT}).
 * The statement's Rune JSON is the payload whose keccak-256 the control contract records with the netting
 * (wp-adr-cdm-payload-carrier). Amounts are whole USD, one unit of tUSD each. The scope is the project owner's choice of
 * 2026-11-06; the rules are assumptions awaiting a business SME (task-sme-settlement-netting-rules).
 */
public final class CdmNetting {
    public static final String CURRENCY = "USD";

    /** One movement before netting: type is DeliveryAmount, ReturnAmount or InterestAmount; payer and receiver bank names. */
    public record Item(String reference, String type, String payer, String receiver, long usd) {}

    public final SettlementNettingStatement statement;
    public final String json;
    public final String hash;

    private CdmNetting(SettlementNettingStatement statement) {
        CdmRuntime.validate(statement);
        this.statement = statement;
        this.json = CdmRuntime.toJson(statement);
        this.hash = Cdm.keccakHex(json);
    }

    static CollateralInterestHandlingParameters handling() {
        return CdmInterest.parameters().getInterestHandlingParameters();
    }

    private static SettlementNettingStatement run(String nettingId, List<? extends SettlementObligation> obligations) {
        return CdmRuntime.fn(Create_SettlementNetting.class).evaluate(nettingId, new ArrayList<>(obligations), handling());
    }

    public static CdmNetting build(String nettingId, LocalDate settlementDate, List<Item> items) {
        List<SettlementObligation> obligations = new ArrayList<>();
        for (Item i : items) {
            obligations.add(CdmRuntime.load(SettlementObligation.class, o("reference", i.reference(), "obligationType", i.type(),
                    "payer", partyDoc(i.payer()), "receiver", partyDoc(i.receiver()),
                    "amount", o("value", i.usd(), "unit", o("currency", o("@data", CURRENCY))),
                    "settlementDate", settlementDate.toString())));
        }
        return new CdmNetting(run(nettingId, obligations));
    }

    /**
     * Check a statement received through the payload store: it parses as a SettlementNettingStatement, passes CDM
     * validation, and Create_SettlementNetting over its own obligations gives the same statement. Returns the parsed
     * statement; throws otherwise.
     */
    public static SettlementNettingStatement verify(String json) {
        SettlementNettingStatement s;
        try {
            s = CdmRuntime.JSON.readValue(json, SettlementNettingStatement.class);
        } catch (Exception e) {
            throw new IllegalStateException("not a SettlementNettingStatement: " + e.getMessage(), e);
        }
        CdmRuntime.validate(s);
        SettlementNettingStatement again = run(s.getNettingIdentifier(), s.getObligations());
        if (!again.equals(s)) throw new IllegalStateException("Create_SettlementNetting over the statement's obligations gives a different statement");
        return s;
    }

    private static java.util.Map<String, Object> partyDoc(String name) {
        return o("partyId", l(o("identifier", o("@data", name))));
    }

    public static String partyName(Party p) {
        return p == null ? null : p.getPartyId().get(0).getIdentifier().getValue();
    }
}
