package collateral;

import cdmx.collateral.ccp.CcpMember;
import cdmx.collateral.ccp.CcpRulebook;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

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
}
