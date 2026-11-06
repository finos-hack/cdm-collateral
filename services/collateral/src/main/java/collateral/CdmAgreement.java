package collateral;

import cdm.base.staticdata.asset.common.AssetIdentifier;
import cdm.base.staticdata.party.CounterpartyRoleEnum;
import cdm.legaldocumentation.common.LegalAgreement;
import cdm.legaldocumentation.csa.CreditSupportAgreementInitialMarginElections;
import cdm.product.collateral.EligibleCollateralSpecification;
import cdmx.collateral.amendment.CollateralAgreementAmendment;
import cdmx.collateral.amendment.HaircutChange;
import cdmx.collateral.amendment.functions.Create_CollateralAgreementAmendment;
import cdmx.collateral.amendment.functions.HaircutFor;
import cdmx.collateral.amendment.functions.InitialMarginElections;
import cdmx.collateral.amendment.functions.MinimumTransferAmountFor;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.regnosys.rosetta.common.serialisation.RosettaObjectMapper;
import com.rosetta.model.lib.records.Date;

import java.io.InputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static collateral.CdmRuntime.l;
import static collateral.CdmRuntime.o;

/**
 * The IM CSA between the two parties as CDM data, and its amendments (flow-agreement-amendment; cdm-ext
 * {@code cdmx.collateral.amendment}). The baseline agreement is CDM's published sample 2018 NY law IM CSA
 * ({@code 01-2018-NY-Law-IM-CSA.json}, common-domain-model tag 7.7.0, Community Specification License 1.0) with the
 * prototype's parties and Minimum Transfer Amount: Party1 is the secured party, Party2 the pledgor (the sample's posting
 * party under the One Way Provisions). The baseline eligibility schedule has one AssetIdentifier (ISIN) criterion per
 * registry token at its deployed haircut. Each agreed amendment replaces the agreement (when its elections change) and
 * the schedule; both parties fold the same agreed amendments, in chain order, to the same terms.
 */
public final class CdmAgreement {
    static final String SAMPLE = "/cdm-samples/01-2018-NY-Law-IM-CSA.json";
    public static final long BASELINE_MTA_USD = 500_000;
    public static final String NO_HASH = "0x" + "0".repeat(64);

    /** The terms in force: agreement, schedule, and the hash of the last agreed amendment (NO_HASH for the baseline). */
    public record Terms(LegalAgreement agreement, EligibleCollateralSpecification schedule, String hash, int amendments) {}

    /** One asset's change in a proposed amendment. */
    public record Haircut(String isin, boolean eligible, int haircutBps) {}

    /** A proposed amendment as CDM data with its payload hash. */
    public record Proposal(CollateralAgreementAmendment amendment, String json, String hash) {}

    private CdmAgreement() {}

    private static ObjectNode party(String name) {
        ObjectNode p = CdmRuntime.JSON.createObjectNode();
        p.putArray("partyId").addObject().putObject("identifier").put("@data", name);
        p.putObject("name").put("@data", name);
        return p;
    }

    /** The baseline agreement: the CDM sample with the prototype's parties and MTA. */
    public static LegalAgreement baseline(String securedParty, String pledgor) {
        try (InputStream in = CdmAgreement.class.getResourceAsStream(SAMPLE)) {
            LegalAgreement sample = RosettaObjectMapper.getNewRosettaObjectMapper().readValue(in, LegalAgreement.class);
            ObjectNode t = CdmRuntime.JSON.valueToTree(sample);
            ArrayNode cp = t.putArray("contractualParty");
            cp.add(party(securedParty));
            cp.add(party(pledgor));
            ArrayNode roles = ((ObjectNode) t.path("agreementTerms")).putArray("counterparty");
            roles.addObject().put("role", "Party1").set("partyReference", party(securedParty));
            roles.addObject().put("role", "Party2").set("partyReference", party(pledgor));
            for (var pe : t.path("agreementTerms").path("agreement").path("creditSupportAgreementElections")
                    .path("creditSupportObligations").path("minimumTransferAmount").path("partyElection"))
                ((ObjectNode) pe.path("fixedAmount").path("amount")).put("value", BASELINE_MTA_USD);
            LegalAgreement a = CdmRuntime.JSON.treeToValue(t, LegalAgreement.class);
            CdmRuntime.validate(a);
            return a;
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("cannot load the baseline IM CSA: " + e.getMessage(), e);
        }
    }

    private static Map<String, Object> asset(String isin) {
        return o("identifier", o("@data", isin), "identifierType", "ISIN");
    }

    /** The baseline schedule: one AssetIdentifier criterion per token (ISIN, haircut in basis points). */
    public static EligibleCollateralSpecification baselineSchedule(Map<String, Integer> haircutBpsByIsin) {
        List<Object> criteria = new ArrayList<>();
        haircutBpsByIsin.forEach((isin, bps) -> {
            Map<String, Object> c = new java.util.LinkedHashMap<>(asset(isin));
            c.put("@type", "cdm.base.staticdata.asset.common.AssetIdentifier");
            criteria.add(o("collateralCriteria", c, "treatment", o("isIncluded", true,
                    "valuationTreatment", o("haircutPercentage", BigDecimal.valueOf(bps, 4)))));
        });
        return CdmRuntime.load(EligibleCollateralSpecification.class, o("criteria", l(criteria.toArray())));
    }

    public static Terms baselineTerms(String securedParty, String pledgor, Map<String, Integer> haircutBpsByIsin) {
        return new Terms(baseline(securedParty, pledgor), baselineSchedule(haircutBpsByIsin), NO_HASH, 0);
    }

    static CreditSupportAgreementInitialMarginElections elections(LegalAgreement a) {
        return CdmRuntime.fn(InitialMarginElections.class).evaluate(a);
    }

    /** The pledgor's (Party2's) fixed Minimum Transfer Amount, whole USD. */
    public static long pledgorMtaUsd(LegalAgreement a) {
        return CdmRuntime.fn(MinimumTransferAmountFor.class).evaluate(elections(a), CounterpartyRoleEnum.PARTY_2).getValue().longValueExact();
    }

    /** The Delivery Amount rounding multiple, whole USD. */
    public static long roundingUsd(LegalAgreement a) {
        return elections(a).getCreditSupportObligations().getRounding().getDeliveryAmount().longValueExact();
    }

    /** An asset's haircut in basis points under the schedule; null when it is not eligible. */
    public static Integer haircutBps(EligibleCollateralSpecification s, String isin) {
        BigDecimal h = CdmRuntime.fn(HaircutFor.class).evaluate(s, CdmRuntime.load(AssetIdentifier.class, asset(isin)));
        return h == null ? null : h.movePointRight(4).intValueExact();
    }

    static CreditSupportAgreementInitialMarginElections withPledgorMta(CreditSupportAgreementInitialMarginElections e, long usd) {
        try {
            ObjectNode tree = CdmRuntime.JSON.valueToTree(e);
            for (var pe : tree.path("creditSupportObligations").path("minimumTransferAmount").path("partyElection"))
                if (pe.path("party").asText().equals("Party2")) ((ObjectNode) pe.path("fixedAmount").path("amount")).put("value", usd);
            return CdmRuntime.JSON.treeToValue(tree, CreditSupportAgreementInitialMarginElections.class);
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    private static List<HaircutChange> changes(List<Haircut> haircuts) {
        List<HaircutChange> out = new ArrayList<>();
        for (Haircut h : haircuts) {
            Map<String, Object> m = new java.util.LinkedHashMap<>(o("asset", asset(h.isin()), "isIncluded", h.eligible()));
            if (h.eligible()) m.put("haircutPercentage", BigDecimal.valueOf(h.haircutBps(), 4));
            out.add(CdmRuntime.load(HaircutChange.class, m));
        }
        return out;
    }

    /** Build and validate an amendment of the terms in force: a new pledgor MTA (null: unchanged) and haircut changes. */
    public static Proposal propose(Terms current, Long pledgorMtaUsd, List<Haircut> haircuts, LocalDate date) {
        CreditSupportAgreementInitialMarginElections im = pledgorMtaUsd == null || pledgorMtaUsd == pledgorMtaUsd(current.agreement())
                ? null : withPledgorMta(elections(current.agreement()), pledgorMtaUsd);
        Date d = Date.of(date);
        CollateralAgreementAmendment m = CdmRuntime.fn(Create_CollateralAgreementAmendment.class)
                .evaluate(current.agreement(), im, current.schedule(), changes(haircuts), d, d);
        CdmRuntime.validate(m);
        String json = CdmRuntime.toJson(m);
        return new Proposal(m, json, Cdm.keccakHex(json));
    }

    /**
     * Check an amendment received through the payload store against the terms in force: it parses, passes CDM
     * validation, applies to the current agreement and schedule, and Create_CollateralAgreementAmendment over its own
     * inputs gives the same amendment. Returns it; throws otherwise.
     */
    public static CollateralAgreementAmendment verify(String json, Terms current) {
        CollateralAgreementAmendment m;
        try {
            m = CdmRuntime.JSON.readValue(json, CollateralAgreementAmendment.class);
        } catch (Exception e) {
            throw new IllegalStateException("not a CollateralAgreementAmendment: " + e.getMessage(), e);
        }
        CdmRuntime.validate(m);
        if (!m.getScheduleBefore().equals(current.schedule())) throw new IllegalStateException("the amendment does not apply to the schedule in force");
        CreditSupportAgreementInitialMarginElections im = null;
        if (m.getAgreementEvent() != null) {
            var before = m.getAgreementEvent().getInstruction().get(0).getBefore();
            if (before == null || !current.agreement().equals(before.getValue())) throw new IllegalStateException("the amendment does not apply to the agreement in force");
            im = elections(m.getAgreementEvent().getAfter().get(0));
        }
        CollateralAgreementAmendment again = CdmRuntime.fn(Create_CollateralAgreementAmendment.class).evaluate(current.agreement(), im,
                current.schedule(), m.getHaircutChange() == null ? List.of() : List.copyOf(m.getHaircutChange()), m.getEventDate(), m.getEffectiveDate());
        if (!again.equals(m)) throw new IllegalStateException("Create_CollateralAgreementAmendment over the amendment's inputs gives a different amendment");
        return m;
    }

    /** The terms after an agreed amendment. */
    public static Terms apply(Terms current, CollateralAgreementAmendment m, String hash) {
        LegalAgreement after = m.getAgreementEvent() == null ? current.agreement() : m.getAgreementEvent().getAfter().get(0);
        return new Terms(after, m.getScheduleAfter(), hash, current.amendments() + 1);
    }
}
