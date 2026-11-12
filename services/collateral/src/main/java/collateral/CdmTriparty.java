package collateral;

import cdm.product.collateral.EligibleCollateralSpecification;
import cdmx.collateral.triparty.TripartyTerms;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static collateral.CdmRuntime.l;
import static collateral.CdmRuntime.o;

/** The triparty terms of a repo under the GMRA (task-triparty-terms-profile, wp-adr-triparty-terms-profile): the giver,
 *  the receiver and the agent BANK-T, the GMRA terms in force between the giver and the receiver, and the collateral
 *  profile, as cdm-ext TripartyTerms. Each of the three services builds the terms itself; the receiver and the agent
 *  check the giver's document against their own build before affirming its hash. */
final class CdmTriparty {
    static final String AGENT = "BANK-T";
    static final String BASE_CURRENCY = "USD";
    /** The profile (wp-adr-triparty-terms-profile): the CSA baseline haircuts, tAGY up to half of the allocated value. */
    static final int UST_HAIRCUT_BPS = 200, AGY_HAIRCUT_BPS = 300;
    static final BigDecimal AGY_LIMIT = new BigDecimal("0.5");

    private CdmTriparty() {}

    record Terms(TripartyTerms terms, String json, String hash) {}

    private static Map<String, Object> party(String name) {
        return o("partyId", l(o("identifier", o("@data", name))), "name", o("@data", name));
    }

    private static Map<String, Object> criterion(String isin, int haircutBps, BigDecimal limit) {
        Map<String, Object> treatment = o("isIncluded", true, "valuationTreatment", o("haircutPercentage", BigDecimal.valueOf(haircutBps, 4)));
        if (limit != null) treatment.put("concentrationLimit", l(o("percentageLimit", o("upperBound", o("number", limit, "inclusive", true)))));
        return o("collateralCriteria", o("@type", "cdm.base.staticdata.asset.common.AssetIdentifier",
                "identifier", o("@data", isin), "identifierType", "ISIN"), "treatment", treatment);
    }

    /** The baseline profile over the deployment's tUST and tAGY. */
    static EligibleCollateralSpecification profile(String ustIsin, String agyIsin) {
        return CdmRuntime.load(EligibleCollateralSpecification.class,
                o("criteria", l(criterion(ustIsin, UST_HAIRCUT_BPS, null), criterion(agyIsin, AGY_HAIRCUT_BPS, AGY_LIMIT))));
    }

    static Terms build(String giver, String receiver, String agent, String gmraTermsHash, LocalDate effective, String ustIsin, String agyIsin) {
        Map<String, Object> doc = o("giver", party(giver), "receiver", party(receiver),
                "agent", o("partyReference", party(agent), "role", "TripartyAgent"),
                "gmraTermsHash", gmraTermsHash, "baseCurrency", BASE_CURRENCY, "effectiveDate", effective.toString(),
                "profile", CdmRuntime.JSON.convertValue(profile(ustIsin, agyIsin), Map.class));
        TripartyTerms t = CdmRuntime.load(TripartyTerms.class, doc);
        CdmRuntime.validate(t);
        String json = CdmRuntime.toJson(t);
        return new Terms(t, json, Cdm.keccakHex(json));
    }

    static TripartyTerms parse(String json) {
        try {
            return CdmRuntime.JSON.readValue(json, TripartyTerms.class);
        } catch (Exception e) {
            throw new IllegalStateException("not a TripartyTerms document: " + e.getMessage(), e);
        }
    }

    static String name(cdm.base.staticdata.party.Party p) {
        return p == null || p.getName() == null ? null : p.getName().getValue();
    }

    /** Check a proposed document: it parses, names these three parties, and equals the terms this service builds with
     *  the effective date and GMRA terms hash it states. Returns the terms; throws with the reason otherwise. */
    static Terms verify(String json, String giver, String receiver, String agent, String ustIsin, String agyIsin) {
        TripartyTerms p = parse(json);
        var failures = CdmRuntime.failures(p);
        if (!failures.isEmpty()) throw new IllegalStateException("the terms fail CDM validation: " + failures.get(0));
        if (!giver.equals(name(p.getGiver())) || !receiver.equals(name(p.getReceiver())) || !agent.equals(name(p.getAgent().getPartyReference().getValue())))
            throw new IllegalStateException("the terms name other parties");
        Terms again = build(giver, receiver, agent, p.getGmraTermsHash(), p.getEffectiveDate().toLocalDate(), ustIsin, agyIsin);
        if (!again.json().equals(json)) throw new IllegalStateException("the terms differ from the terms this party builds");
        return again;
    }

    static Map<String, Object> view(TripartyTerms t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("giver", name(t.getGiver()));
        m.put("receiver", name(t.getReceiver()));
        m.put("agent", name(t.getAgent().getPartyReference().getValue()));
        m.put("gmraTermsHash", t.getGmraTermsHash());
        m.put("baseCurrency", t.getBaseCurrency());
        m.put("effectiveDate", t.getEffectiveDate().toString());
        List<Map<String, Object>> profile = new ArrayList<>();
        for (var c : t.getProfile().getCriteria()) {
            Map<String, Object> e = new LinkedHashMap<>();
            var id = c.getCollateralCriteria().getAssetIdentifier();
            e.put("isin", id == null ? null : id.getIdentifier().getValue());
            e.put("eligible", Boolean.TRUE.equals(c.getTreatment().getIsIncluded()));
            var v = c.getTreatment().getValuationTreatment();
            e.put("haircutBps", v == null || v.getHaircutPercentage() == null ? null : v.getHaircutPercentage().movePointRight(4).intValueExact());
            var limits = c.getTreatment().getConcentrationLimit();
            e.put("concentrationLimit", limits == null || limits.isEmpty() ? null
                    : limits.get(0).getPercentageLimit().getUpperBound().getNumber().stripTrailingZeros().toPlainString());
            profile.add(e);
        }
        m.put("profile", profile);
        return m;
    }
}
