package collateral;

import cdm.event.common.BusinessEvent;
import cdm.event.common.EventIntentEnum;
import cdm.event.common.Instruction;
import cdm.event.common.PrimitiveInstruction;
import cdm.event.common.TradeState;
import cdm.event.common.functions.Create_BusinessEvent;
import cdmx.collateral.ccp.CcpMember;
import cdmx.collateral.ccp.CcpNovation;
import cdmx.collateral.ccp.CcpRulebook;
import com.regnosys.rosetta.common.hashing.GlobalKeyProcessStep;
import com.regnosys.rosetta.common.hashing.NonNullHashCollector;
import com.rosetta.model.lib.records.Date;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static collateral.CdmRuntime.l;
import static collateral.CdmRuntime.o;

/**
 * The CCP rulebook (task-ccp-membership, wp-adr-ccp-membership): the cdm-ext CcpRulebook between the CCP BANK-C and
 * the members BANK-A and BANK-B, with a 5% initial margin rate, daily variation margin, a 1,000,000 USD default fund of
 * two 500,000 shares and 250,000 USD of the CCP's own capital. Each member's agreement with the CCP is CDM's
 * LegalAgreementBase of type Other ("CCP rulebook"). The CCP builds the rulebook and records its hash on CcpClearing;
 * each member rebuilds it from the same parties and effective date and affirms only an identical document.
 */
final class CdmCcp {
    static final String CCP = "BANK-C";
    static final String BASE_CURRENCY = "USD";
    static final String OTHER_AGREEMENT = "CCP rulebook";
    static final BigDecimal IM_RATE = new BigDecimal("0.05");
    static final int VM_PERIOD_DAYS = 1;
    static final long DEFAULT_FUND = 1_000_000, CCP_CAPITAL = 250_000;

    private CdmCcp() {}

    record Rulebook(CcpRulebook rulebook, String json, String hash) {
        /** Member name to its default fund share, whole USD, in the rulebook's order. */
        Map<String, Long> shares() {
            Map<String, Long> m = new LinkedHashMap<>();
            for (CcpMember x : rulebook.getMember())
                m.put(CdmTriparty.name(x.getParty()), x.getDefaultFundShare().getValue().longValueExact());
            return m;
        }

        long capital() {
            return rulebook.getCcpCapital().getValue().longValueExact();
        }
    }

    private static Map<String, Object> party(String name) {
        return o("partyId", l(o("identifier", o("@data", name))), "name", o("@data", name));
    }

    private static Map<String, Object> money(long v) {
        return o("value", v, "unit", o("currency", o("@data", BASE_CURRENCY)));
    }

    /** The baseline rulebook between the CCP and the members, the default fund split equally between them. */
    static Rulebook build(String ccp, List<String> members, LocalDate effective) {
        if (members.isEmpty() || DEFAULT_FUND % members.size() != 0) throw new IllegalArgumentException("the default fund does not split equally");
        long share = DEFAULT_FUND / members.size();
        List<Object> member = new ArrayList<>();
        for (String m : members)
            member.add(o("party", party(m), "defaultFundShare", money(share),
                    "agreement", o("agreementDate", effective.toString(),
                            "legalAgreementIdentification", o("agreementName", o("agreementType", "Other", "otherAgreement", OTHER_AGREEMENT)),
                            "contractualParty", l(party(ccp), party(m)))));
        Map<String, Object> doc = o("ccp", o("partyReference", party(ccp), "role", "ClearingOrganization"),
                "member", member, "baseCurrency", BASE_CURRENCY, "initialMarginRate", IM_RATE,
                "variationMarginPeriodDays", VM_PERIOD_DAYS, "defaultFund", money(DEFAULT_FUND), "ccpCapital", money(CCP_CAPITAL),
                "effectiveDate", effective.toString());
        CcpRulebook r = CdmRuntime.load(CcpRulebook.class, doc);
        CdmRuntime.validate(r);
        String json = CdmRuntime.toJson(r);
        return new Rulebook(r, json, Cdm.keccakHex(json));
    }

    static CcpRulebook parse(String json) {
        try {
            return CdmRuntime.JSON.readValue(json, CcpRulebook.class);
        } catch (Exception e) {
            throw new IllegalStateException("not a CcpRulebook document: " + e.getMessage(), e);
        }
    }

    /** Check a published rulebook: it parses, validates, names this CCP and these members, and equals the rulebook this
     *  service builds with the effective date it states. Returns the rulebook; throws with the reason otherwise. */
    static Rulebook verify(String json, String ccp, List<String> members) {
        CcpRulebook p = parse(json);
        var failures = CdmRuntime.failures(p);
        if (!failures.isEmpty()) throw new IllegalStateException("the rulebook fails CDM validation: " + failures.get(0));
        if (!ccp.equals(CdmTriparty.name(p.getCcp().getPartyReference().getValue())))
            throw new IllegalStateException("the rulebook names another CCP");
        List<String> named = p.getMember().stream().map(m -> CdmTriparty.name(m.getParty())).toList();
        if (!named.equals(members)) throw new IllegalStateException("the rulebook names other members");
        Rulebook again = build(ccp, members, p.getEffectiveDate().toLocalDate());
        if (!again.json().equals(json)) throw new IllegalStateException("the rulebook differs from the rulebook this party builds");
        return again;
    }

    /** The rulebook's fields for the console. */
    static Map<String, Object> view(CcpRulebook r) {
        Map<String, Object> v = new LinkedHashMap<>();
        v.put("ccp", CdmTriparty.name(r.getCcp().getPartyReference().getValue()));
        v.put("role", String.valueOf(r.getCcp().getRole()));
        v.put("initialMarginRate", r.getInitialMarginRate().toPlainString());
        v.put("variationMarginPeriodDays", r.getVariationMarginPeriodDays());
        v.put("defaultFund", r.getDefaultFund().getValue().longValueExact());
        v.put("ccpCapital", r.getCcpCapital().getValue().longValueExact());
        v.put("baseCurrency", r.getBaseCurrency());
        v.put("effectiveDate", r.getEffectiveDate().toString());
        List<Map<String, Object>> ms = new ArrayList<>();
        for (CcpMember m : r.getMember())
            ms.add(o("name", CdmTriparty.name(m.getParty()), "share", m.getDefaultFundShare().getValue().longValueExact(),
                    "agreement", m.getAgreement().getLegalAgreementIdentification().getAgreementName().getOtherAgreement()));
        v.put("members", ms);
        return v;
    }

    // --- clearing (task-ccp-clearing, wp-adr-ccp-clearing) ---

    /** The ISINs the CCP clears: the deployment's tUST and tAGY. */
    static Set<String> eligible(String ustIsin, String agyIsin) {
        return Set.of(ustIsin, agyIsin);
    }

    /** A novation: the cdm-ext CcpNovation, its Rune JSON and hash, and the two cleared trades, each reloaded from its
     *  JSON with references resolved (straight out of Create_BusinessEvent CDM's Purchase Price over them reads 0). The
     *  seller's leg is the seller against the CCP, the buyer's leg the CCP against the buyer. */
    record Novation(CcpNovation novation, String json, String hash, TradeState sellerLeg, TradeState buyerLeg) {}

    private static Map<String, Object> partyChange(String ccp, String role, String tradeId) {
        return o("partyChange", o("counterparty", o("role", role, "partyReference", party(ccp)),
                "partyRole", o("partyReference", party(ccp), "role", "ClearingOrganization"),
                "tradeId", l(o("issuer", o("@data", ccp), "assignedIdentifier", l(o("identifier", o("@data", tradeId)))))));
    }

    /** CDM's clearing event over the bilateral trade on its trade date: a split, intent Clearing, keyed by CDM's
     *  GlobalKeyProcessStep, of a party change of Party2 to the CCP, a party change of Party1 to the CCP, and a quantity
     *  change of the cash and the securities to zero that closes the bilateral trade. */
    static BusinessEvent clearingEvent(TradeState bilateral, String ccp) {
        CdmRepo.Terms t = CdmRepo.terms(bilateral);
        Object close = o("quantityChange", o("direction", "Replace", "change", l(
                o("quantity", o("value", 0, "unit", o("currency", o("@data", "USD")))),
                o("quantity", o("value", 0, "unit", o("financialUnit", "Share"))))));
        PrimitiveInstruction pi = CdmRuntime.load(PrimitiveInstruction.class, o("split", o("breakdown", l(
                partyChange(ccp, "Party2", t.tradeId() + "-SC"), partyChange(ccp, "Party1", t.tradeId() + "-CB"), close))));
        var ib = Instruction.builder().setBeforeValue(bilateral).setPrimitiveInstruction(pi);
        new GlobalKeyProcessStep(NonNullHashCollector::new).runProcessStep(Instruction.class, ib);
        Date on = Date.of(t.tradeDate());
        BusinessEvent ev = CdmRepo.resolved(BusinessEvent.class, CdmRuntime.fn(Create_BusinessEvent.class)
                .evaluate(new ArrayList<>(List.of(ib.build())), EventIntentEnum.CLEARING, on, null));
        var b = ev.toBuilder();
        for (var a : b.getAfter())
            if (a.getState() != null && a.getState().getClosedState() != null) a.getState().getClosedState().setActivityDate(on);
        return b.build();
    }

    static TradeState reloaded(TradeState ts) {
        try {
            return CdmRepo.resolved(TradeState.class, CdmRuntime.JSON.readValue(CdmRuntime.toJson(ts), TradeState.class));
        } catch (Exception e) {
            throw new IllegalStateException("a cleared trade does not reload: " + e.getMessage(), e);
        }
    }

    /** The novation of a bilateral repo under a rulebook: built by the seller, rebuilt by the buyer and the CCP. */
    static Novation novation(String rulebookHash, TradeState bilateral, String bilateralTradeHash, String ccp) {
        BusinessEvent ev = clearingEvent(bilateral, ccp);
        Map<String, Object> doc = o("rulebookHash", rulebookHash, "bilateralTradeHash", bilateralTradeHash,
                "ccp", o("partyReference", party(ccp), "role", "ClearingOrganization"),
                "clearing", CdmRuntime.JSON.convertValue(CdmRuntime.JSON.valueToTree(ev), Map.class));
        CcpNovation n = CdmRuntime.load(CcpNovation.class, doc);
        CdmRuntime.validate(n);
        String json = CdmRuntime.toJson(n);
        TradeState sellerLeg = null, buyerLeg = null;
        String seller = CdmRepo.terms(bilateral).seller();
        for (TradeState a : ev.getAfter()) {
            if (a.getState() != null && a.getState().getClosedState() != null) continue;
            TradeState leg = reloaded(a);
            if (seller.equals(CdmRepo.terms(leg).seller())) sellerLeg = leg;
            else buyerLeg = leg;
        }
        if (sellerLeg == null || buyerLeg == null) throw new IllegalStateException("the clearing does not give a leg for each member");
        return new Novation(n, json, Cdm.keccakHex(json), sellerLeg, buyerLeg);
    }

    static CcpNovation parseNovation(String json) {
        try {
            return CdmRuntime.JSON.readValue(json, CcpNovation.class);
        } catch (Exception e) {
            throw new IllegalStateException("not a CcpNovation document: " + e.getMessage(), e);
        }
    }

    /** The bilateral trade a novation carries: its clearing event's before state. */
    static TradeState bilateralOf(CcpNovation n) {
        var before = n.getClearing().getInstruction().get(0).getBefore();
        if (before == null || before.getValue() == null) throw new IllegalStateException("the clearing names no bilateral trade");
        return CdmRepo.resolved(TradeState.class, before.getValue());
    }

    /** Check a novation: it parses and validates, and equals the one this party builds from the bilateral trade (its own
     *  booking for a member; the trade the event carries for the CCP), the rulebook hash and the CCP. */
    static Novation verifyNovation(String json, TradeState bilateral, String rulebookHash, String bilateralTradeHash, String ccp) {
        CcpNovation p = parseNovation(json);
        var failures = CdmRuntime.failures(p);
        if (!failures.isEmpty()) throw new IllegalStateException("the novation fails CDM validation: " + failures.get(0));
        Novation again = novation(rulebookHash, bilateral, bilateralTradeHash, ccp);
        if (!again.json().equals(json)) throw new IllegalStateException("the novation differs from the novation this party builds");
        return again;
    }
}
