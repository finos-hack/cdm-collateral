package collateral;

import cdm.event.common.TradeState;
import cdm.product.collateral.EligibleCollateralSpecification;
import cdmx.collateral.triparty.TripartyAllocation;
import cdmx.collateral.triparty.TripartyDeposit;
import cdmx.collateral.triparty.TripartyRepoRequest;
import cdmx.collateral.triparty.TripartyTerms;
import cdmx.collateral.triparty.TripartyValuedPosition;
import cdmx.collateral.triparty.functions.AllocateTriparty;
import cdmx.collateral.triparty.functions.TripartyConcentrationBreaches;
import cdmx.collateral.triparty.TripartyMovement;
import cdmx.collateral.triparty.TripartyRevaluation;
import cdmx.collateral.triparty.TripartyRevaluationOutcomeEnum;
import cdmx.collateral.triparty.functions.RepoIsCollateralRelease;
import cdmx.collateral.triparty.functions.RepoIsCollateralTopUp;
import cdmx.collateral.triparty.functions.RevalueTriparty;
import cdmx.collateral.triparty.functions.TripartyRequiredValue;
import cdmx.collateral.triparty.TripartyRequesterEnum;
import cdmx.collateral.triparty.TripartySubstitution;
import cdmx.collateral.triparty.TripartySubstitutionOutcomeEnum;
import cdmx.collateral.triparty.TripartySubstitutionRequest;
import cdmx.collateral.triparty.functions.SubstituteTriparty;
import cdmx.collateral.repo.functions.RepoIsSubstitution;
import cdm.event.workflow.EventInstruction;
import cdm.event.workflow.EventTimestamp;
import cdm.event.workflow.WorkflowStep;
import cdm.event.workflow.WorkflowStepApproval;
import cdm.event.workflow.functions.Create_AcceptedWorkflowStep;
import cdm.event.workflow.functions.Create_ProposedWorkflowStep;
import cdm.base.staticdata.party.Party;
import cdm.event.common.BusinessEvent;
import cdm.event.common.CollateralPortfolio;
import cdm.event.common.Instruction;
import cdm.event.common.PrimitiveInstruction;
import cdm.event.common.ValuationInstruction;
import cdm.event.common.functions.Create_BusinessEvent;
import cdm.event.common.functions.Create_SubstitutionInstruction;
import com.rosetta.model.lib.records.Date;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
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
    static final int UST_HAIRCUT_BPS = 200, AGY_HAIRCUT_BPS = 300, MMF_HAIRCUT_BPS = 400;
    static final BigDecimal AGY_LIMIT = new BigDecimal("0.5");

    private CdmTriparty() {}

    record Terms(TripartyTerms terms, String json, String hash) {}

    /** The giver's request for a repo: the cdm-ext TripartyRepoRequest, its Rune JSON and hash. */
    record Request(TripartyRepoRequest request, String json, String hash) {}

    /** One asset of the giver's free account: the giver's rank, its ISIN, free units and the agent's price. */
    record Deposit(int rank, String isin, long units, BigDecimal price) {}

    /** The agent's allocation, its Rune JSON and hash, and the CDM repo when the allocation covers the Purchase Price. */
    record Allocation(TripartyAllocation allocation, String json, String hash, TradeState trade) {
        boolean covers() {
            return Boolean.TRUE.equals(allocation.getCoversPurchasePrice());
        }

        /** ISIN to allocated units, in the giver's ranking. */
        Map<String, Long> units() {
            Map<String, Long> m = new LinkedHashMap<>();
            if (allocation.getPositions() != null)
                for (TripartyValuedPosition p : allocation.getPositions()) m.put(p.getIsin(), p.getUnits().longValueExact());
            return m;
        }
    }

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
        return profile(ustIsin, agyIsin, null);
    }

    /**
     * The profile with, when mmfIsin is given, tMMF added at the CSA baseline haircut and with no concentration limit
     * (task-authoritative-record-other-flows). tMMF is a Registered token: the giver adds it only when it is eligible under
     * a control agreement (EligibleUnderControl), and each movement of it completes on its record keeper's confirmation.
     */
    static EligibleCollateralSpecification profile(String ustIsin, String agyIsin, String mmfIsin) {
        List<Object> criteria = new ArrayList<>(List.of(criterion(ustIsin, UST_HAIRCUT_BPS, null), criterion(agyIsin, AGY_HAIRCUT_BPS, AGY_LIMIT)));
        if (mmfIsin != null) criteria.add(criterion(mmfIsin, MMF_HAIRCUT_BPS, null));
        return CdmRuntime.load(EligibleCollateralSpecification.class, o("criteria", criteria));
    }

    static Terms build(String giver, String receiver, String agent, String gmraTermsHash, LocalDate effective, String ustIsin, String agyIsin) {
        return build(giver, receiver, agent, gmraTermsHash, effective, ustIsin, agyIsin, null);
    }

    static Terms build(String giver, String receiver, String agent, String gmraTermsHash, LocalDate effective, String ustIsin, String agyIsin, String mmfIsin) {
        Map<String, Object> doc = o("giver", party(giver), "receiver", party(receiver),
                "agent", o("partyReference", party(agent), "role", "TripartyAgent"),
                "gmraTermsHash", gmraTermsHash, "baseCurrency", BASE_CURRENCY, "effectiveDate", effective.toString(),
                "profile", CdmRuntime.JSON.convertValue(profile(ustIsin, agyIsin, mmfIsin), Map.class));
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
        return verify(json, giver, receiver, agent, ustIsin, agyIsin, null);
    }

    /** As above; the document may also be the profile with tMMF (mmfIsin, when this party admits it), and must equal one
     *  of the two builds. */
    static Terms verify(String json, String giver, String receiver, String agent, String ustIsin, String agyIsin, String mmfIsin) {
        TripartyTerms p = parse(json);
        var failures = CdmRuntime.failures(p);
        if (!failures.isEmpty()) throw new IllegalStateException("the terms fail CDM validation: " + failures.get(0));
        if (!giver.equals(name(p.getGiver())) || !receiver.equals(name(p.getReceiver())) || !agent.equals(name(p.getAgent().getPartyReference().getValue())))
            throw new IllegalStateException("the terms name other parties");
        Terms again = build(giver, receiver, agent, p.getGmraTermsHash(), p.getEffectiveDate().toLocalDate(), ustIsin, agyIsin);
        if (again.json().equals(json)) return again;
        if (mmfIsin != null) {
            Terms withMmf = build(giver, receiver, agent, p.getGmraTermsHash(), p.getEffectiveDate().toLocalDate(), ustIsin, agyIsin, mmfIsin);
            if (withMmf.json().equals(json)) return withMmf;
        }
        throw new IllegalStateException("the terms differ from the terms this party builds");
    }

    // --- trade start (task-triparty-trade-start, wp-adr-triparty-trade-start)

    /** The giver's request: the cash terms of the repo under the terms with this hash. */
    static Request request(String termsHash, String tradeId, long purchasePrice, BigDecimal rate, LocalDate purchaseDate, LocalDate repurchaseDate) {
        TripartyRepoRequest r = CdmRuntime.load(TripartyRepoRequest.class, o("termsHash", termsHash, "tradeId", tradeId,
                "purchasePrice", o("value", purchasePrice, "unit", o("currency", o("@data", BASE_CURRENCY))),
                "repoRate", rate, "purchaseDate", purchaseDate.toString(), "repurchaseDate", repurchaseDate.toString()));
        CdmRuntime.validate(r);
        String json = CdmRuntime.toJson(r);
        return new Request(r, json, Cdm.keccakHex(json));
    }

    /** The receiver's check of a request: it parses, passes CDM validation, rebuilds to the same document, names the
     *  terms with this hash, and states this Purchase Price. Returns the request; throws with the reason otherwise. */
    static Request verifyRequest(String json, String termsHash, long purchasePrice) {
        TripartyRepoRequest r;
        try {
            r = CdmRuntime.JSON.readValue(json, TripartyRepoRequest.class);
        } catch (Exception e) {
            throw new IllegalStateException("not a TripartyRepoRequest document: " + e.getMessage(), e);
        }
        var failures = CdmRuntime.failures(r);
        if (!failures.isEmpty()) throw new IllegalStateException("the request fails CDM validation: " + failures.get(0));
        if (!termsHash.equalsIgnoreCase(r.getTermsHash())) throw new IllegalStateException("the request names other triparty terms");
        if (r.getPurchasePrice().getValue().compareTo(BigDecimal.valueOf(purchasePrice)) != 0)
            throw new IllegalStateException("the request states another Purchase Price than the chain");
        Request again = request(r.getTermsHash(), r.getTradeId(), r.getPurchasePrice().getValue().longValueExact(), r.getRepoRate(),
                r.getPurchaseDate().toLocalDate(), r.getRepurchaseDate().toLocalDate());
        if (!again.json().equals(json)) throw new IllegalStateException("the request differs from the request this party builds");
        return again;
    }

    static TripartyRepoRequest parseRequest(String json) {
        try {
            return CdmRuntime.JSON.readValue(json, TripartyRepoRequest.class);
        } catch (Exception e) {
            throw new IllegalStateException("not a TripartyRepoRequest document: " + e.getMessage(), e);
        }
    }

    private static Map<String, Object> usd() {
        return o("currency", o("@data", BASE_CURRENCY));
    }

    private static Map<String, Object> date(LocalDate d) {
        return o("adjustableDate", o("unadjustedDate", d.toString(), "dateAdjustments", o("businessDayConvention", "NONE")));
    }

    /** One collateral position of the repo: the allocated units of one asset, with its own asset payout. */
    private static Map<String, Object> position(String isin, long units, LocalDate purchase, LocalDate repurchase) {
        Map<String, Object> share = o("financialUnit", "Share");
        Map<String, Object> assetPayout = o("@type", "cdm.product.template.AssetPayout",
                "payerReceiver", o("payer", "Party2", "receiver", "Party1"),
                "priceQuantity", o("quantitySchedule", o("value", units, "unit", share)),
                "assetLeg", l(o("settlementDate", date(purchase), "deliveryMethod", "DeliveryVersusPayment"),
                        o("settlementDate", date(repurchase), "deliveryMethod", "DeliveryVersusPayment")),
                "underlier", CdmRepo.security(isin),
                "settlementTerms", o("settlementType", "Physical", "settlementCurrency", o("@data", BASE_CURRENCY),
                        "transferSettlementType", "DeliveryVersusPayment",
                        "securitySettlementCentre", "SecuritySettlementCentre", "cashSettlementCentre", "CashSettlementCentre"));
        return o("priceQuantity", l(o("quantity", o("value", units, "unit", share))),
                "product", o("@type", "cdm.product.template.TransferableProduct", "asset", CdmRepo.security(isin),
                        "productPartyRole", "Party1", "economicTerms", o("payout", l(assetPayout))));
    }

    /** The execution instruction of the triparty repo: the giver as seller (Party1), the receiver as buyer (Party2),
     *  the agent in CDM's TripartyAgent role, the profile as the eligible collateral, and one collateral position per
     *  allocated asset. The trade-level price quantity is the cash leg only. */
    static Map<String, Object> execution(TripartyTerms terms, TripartyRepoRequest r, Map<String, Long> units) {
        String giver = name(terms.getGiver()), receiver = name(terms.getReceiver()), agent = name(terms.getAgent().getPartyReference().getValue());
        LocalDate purchase = r.getPurchaseDate().toLocalDate(), repurchase = r.getRepurchaseDate().toLocalDate();
        List<Object> positions = new ArrayList<>();
        units.forEach((isin, n) -> positions.add(position(isin, n, purchase, repurchase)));
        @SuppressWarnings("unchecked") Map<String, Object> profile = CdmRuntime.JSON.convertValue(terms.getProfile(), Map.class);
        Map<String, Object> product = o(
                "taxonomy", l(o("source", "CFI", "value", o("name", o("@data", "LRSTXD")))),
                "economicTerms", o(
                        "effectiveDate", date(purchase),
                        "terminationDate", date(repurchase),
                        "payout", l(o("@type", "cdm.product.asset.InterestRatePayout",
                                "payerReceiver", o("payer", "Party1", "receiver", "Party2"),
                                "priceQuantity", o("quantitySchedule", o("@ref:scoped", "quantity-1")),
                                "principalPayment", o("initialPayment", true, "finalPayment", true, "intermediatePayment", false),
                                "rateSpecification", o("@type", "cdm.product.asset.FixedRateSpecification",
                                        "rateSchedule", o("price", o("@ref:scoped", "price-1"))),
                                "dayCountFraction", o("@data", "ACT/360"))),
                        "collateral", o(
                                "collateralPortfolio", l(o("collateralPosition", positions)),
                                "collateralProvisions", o("collateralType", "NonCash", "eligibleCollateral", profile.get("criteria")))));
        return o("product", product,
                "priceQuantity", l(o("price", l(o("@key:scoped", "price-1", "value", r.getRepoRate(), "unit", usd(), "perUnitOf", usd(), "priceType", "InterestRate")),
                        "quantity", o("@key:scoped", "quantity-1", "value", r.getPurchasePrice().getValue(), "unit", usd()))),
                "counterparty", l(o("role", "Party1", "partyReference", party(giver)), o("role", "Party2", "partyReference", party(receiver))),
                "parties", l(party(giver), party(receiver), party(agent)),
                "partyRoles", l(o("partyReference", party(giver), "role", "Seller"), o("partyReference", party(receiver), "role", "Buyer"),
                        o("partyReference", party(agent), "role", "TripartyAgent")),
                "executionDetails", o("executionType", "OffFacility"),
                "tradeDate", o("@data", purchase.toString()),
                "tradeIdentifier", l(o("issuer", o("@data", giver), "assignedIdentifier", l(o("identifier", o("@data", r.getTradeId()))))));
    }

    /** The agent allocates (cdm-ext AllocateTriparty) and, when the allocation covers the Purchase Price, books the CDM
     *  repo with the allocation as its collateral and checks it against the profile's limits (TripartyConcentrationBreaches). */
    static Allocation allocate(TripartyTerms terms, TripartyRepoRequest r, String requestHash, List<Deposit> deposits) {
        List<TripartyDeposit> ds = new ArrayList<>();
        for (Deposit d : deposits) ds.add(CdmRuntime.load(TripartyDeposit.class, o("rank", d.rank(), "isin", d.isin(), "units", d.units(),
                "unitPrice", o("value", d.price(), "unit", usd()))));
        TripartyAllocation a = CdmRuntime.fn(AllocateTriparty.class).evaluate(r, requestHash, ds, terms.getProfile());
        TradeState trade = null;
        if (Boolean.TRUE.equals(a.getCoversPurchasePrice())) {
            var breaches = CdmRuntime.fn(TripartyConcentrationBreaches.class).evaluate(terms.getProfile(), new ArrayList<>(a.getPositions()), a.getRequiredValue());
            if (!breaches.isEmpty()) throw new IllegalStateException("the allocation breaches the limit on " + breaches.get(0).getIsin());
            Map<String, Long> units = new LinkedHashMap<>();
            for (TripartyValuedPosition p : a.getPositions()) units.put(p.getIsin(), p.getUnits().longValueExact());
            trade = CdmRepo.bookExecution(execution(terms, r, units), r.getPurchaseDate().toLocalDate()).trade();
            a = a.toBuilder().setTrade(trade).build();
        }
        CdmRuntime.validate(a);
        String json = CdmRuntime.toJson(a);
        return new Allocation(a, json, Cdm.keccakHex(json), trade);
    }

    // --- revaluation (task-triparty-revaluation, wp-adr-triparty-revaluation) ---

    /** The agent's revaluation, its Rune JSON and hash, and the repo after it (the trade state the next revaluation reads). */
    record Revaluation(TripartyRevaluation revaluation, String json, String hash, TradeState trade) {
        TripartyRevaluationOutcomeEnum outcome() {
            return revaluation.getOutcome();
        }

        /** ISIN to held units after the revaluation, in the order of heldAfter. */
        Map<String, Long> units() {
            Map<String, Long> m = new LinkedHashMap<>();
            for (TripartyValuedPosition p : revaluation.getHeldAfter()) m.put(p.getIsin(), p.getUnits().longValueExact());
            return m;
        }
    }

    private static List<TripartyDeposit> deposits(List<Deposit> ds) {
        List<TripartyDeposit> out = new ArrayList<>();
        for (Deposit d : ds) out.add(CdmRuntime.load(TripartyDeposit.class, o("rank", d.rank(), "isin", d.isin(), "units", d.units(),
                "unitPrice", o("value", d.price(), "unit", usd()))));
        return out;
    }

    private static Map<String, Object> money(BigDecimal v) {
        return o("value", v, "unit", usd());
    }

    /** The repo after a revaluation: the open trade of the terms change when units moved, otherwise the valuation's. */
    static TradeState tradeAfter(TripartyRevaluation r) {
        BusinessEvent ev = r.getAdjustment() != null ? r.getAdjustment() : r.getValuation();
        return ev.getAfter().stream().filter(s -> s.getState() == null || s.getState().getClosedState() == null).findFirst()
                .orElseThrow(() -> new IllegalStateException("the revaluation leaves no open trade"));
    }

    private static BusinessEvent event(TradeState before, PrimitiveInstruction pi, LocalDate date) {
        Instruction i = Instruction.builder().setBeforeValue(before).setPrimitiveInstruction(pi).build();
        return CdmRepo.resolved(BusinessEvent.class, CdmRuntime.fn(Create_BusinessEvent.class).evaluate(new ArrayList<>(List.of(i)), null, Date.of(date), null));
    }

    /** The agent revalues a settled repo on a date (cdm-ext RevalueTriparty) from its held assets and the giver's free
     *  account, both ranked and at the feed prices, and adds the CDM events over the repo: the valuation update (the
     *  collateral at its value before, the trade at the required value) and, when units move, the terms change of the
     *  collateral portfolio with the trade's own Purchase Date, qualified by cdm-ext RepoIsCollateralTopUp or
     *  RepoIsCollateralRelease. {@code trade} is the repo as the basis document left it. */
    static Revaluation revalue(TripartyTerms terms, TradeState basisTrade, String basisHash, LocalDate date, List<Deposit> held, List<Deposit> free) {
        // A repo read back from a stored document has its scoped references (the cash quantity and the rate) unresolved.
        TradeState trade = CdmRepo.resolved(TradeState.class, basisTrade);
        var required = CdmRuntime.fn(TripartyRequiredValue.class).evaluate(trade, Date.of(date));
        TripartyRevaluation r = CdmRuntime.fn(RevalueTriparty.class).evaluate(basisHash, Date.of(date), required, deposits(held), deposits(free), terms.getProfile());
        String at = date + "T17:00:00Z";
        ValuationInstruction vi = CdmRuntime.load(ValuationInstruction.class, o("replace", false, "valuation", l(
                o("amount", money(r.getValueBefore().getValue()), "timestamp", at, "method", "MarkToMarket", "scope", "Collateral"),
                o("amount", money(r.getRequiredValue().getValue()), "timestamp", at, "method", "MarkToMarket", "scope", "Trade"))));
        BusinessEvent valuation = event(trade, PrimitiveInstruction.builder().setValuation(vi).build(), date);
        var b = r.toBuilder().setValuation(valuation);
        if (r.getMovements() != null && !r.getMovements().isEmpty()) {
            TradeState valued = valuation.getAfter().get(0);
            LocalDate purchase = valued.getTrade().getProduct().getEconomicTerms().getEffectiveDate().getAdjustableDate().getUnadjustedDate().toLocalDate();
            LocalDate repurchase = valued.getTrade().getProduct().getEconomicTerms().getTerminationDate().getAdjustableDate().getUnadjustedDate().toLocalDate();
            List<Object> positions = new ArrayList<>();
            for (TripartyValuedPosition p : r.getHeldAfter()) positions.add(position(p.getIsin(), p.getUnits().longValueExact(), purchase, repurchase));
            CollateralPortfolio portfolio = CdmRuntime.load(CollateralPortfolio.class, o("collateralPosition", positions));
            var tc = CdmRuntime.fn(Create_SubstitutionInstruction.class).evaluate(valued.getTrade().getProduct(),
                    CdmRuntime.load(cdm.base.datetime.AdjustableOrRelativeDate.class, date(purchase)), portfolio);
            BusinessEvent adjustment = event(valued, PrimitiveInstruction.builder().setTermsChange(tc).build(), date);
            boolean qualified = r.getOutcome() == TripartyRevaluationOutcomeEnum.TOP_UP
                    ? CdmRuntime.fn(RepoIsCollateralTopUp.class).evaluate(adjustment)
                    : CdmRuntime.fn(RepoIsCollateralRelease.class).evaluate(adjustment);
            if (!qualified) throw new IllegalStateException("the collateral change does not qualify as a " + r.getOutcome());
            b.setAdjustment(adjustment);
        }
        TripartyRevaluation doc = b.build();
        CdmRuntime.validate(doc);
        String json = CdmRuntime.toJson(doc);
        return new Revaluation(doc, json, Cdm.keccakHex(json), tradeAfter(doc));
    }

    static TripartyRevaluation parseRevaluation(String json) {
        try {
            return CdmRuntime.JSON.readValue(json, TripartyRevaluation.class);
        } catch (Exception e) {
            throw new IllegalStateException("not a TripartyRevaluation document: " + e.getMessage(), e);
        }
    }

    /** The giver's or the receiver's check of a revaluation: the one this party computes from the same terms, repo,
     *  basis, date, holding, free account and prices is the same document. Returns it; throws otherwise. */
    static Revaluation verifyRevaluation(String json, TripartyTerms terms, TradeState trade, String basisHash, LocalDate date, List<Deposit> held, List<Deposit> free) {
        Revaluation again = revalue(terms, trade, basisHash, date, held, free);
        if (!again.json().equals(json)) throw new IllegalStateException("the revaluation differs from the revaluation this party computes");
        return again;
    }

    private static String plain(BigDecimal v) {
        return v.stripTrailingZeros().toPlainString();
    }

    private static List<Map<String, Object>> positionsView(List<? extends TripartyValuedPosition> ps, BigDecimal required) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (ps != null) for (TripartyValuedPosition p : ps) {
            Map<String, Object> e = new LinkedHashMap<>();
            e.put("isin", p.getIsin());
            e.put("units", p.getUnits().longValueExact());
            e.put("unitPrice", plain(p.getUnitPrice().getValue()));
            e.put("valueAfterHaircuts", plain(p.getValueAfterHaircuts().getValue()));
            e.put("share", p.getValueAfterHaircuts().getValue().divide(required, 4, java.math.RoundingMode.HALF_UP).stripTrailingZeros().toPlainString());
            out.add(e);
        }
        return out;
    }

    /** The revaluation for the console: the date, the values, the movements, the holdings and the breaches. */
    static Map<String, Object> revaluationView(TripartyRevaluation r) {
        BigDecimal required = r.getRequiredValue().getValue();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("revaluationDate", r.getRevaluationDate().toString());
        m.put("outcome", switch (r.getOutcome()) {
            case TOP_UP -> "TopUp";
            case RELEASE -> "Release";
            case UNCOVERED -> "Uncovered";
            case UNCHANGED -> "Unchanged";
        });
        m.put("requiredValue", plain(required));
        m.put("valueBefore", plain(r.getValueBefore().getValue()));
        m.put("valueAfter", plain(r.getValueAfter().getValue()));
        List<Map<String, Object>> moves = new ArrayList<>();
        if (r.getMovements() != null) for (TripartyMovement mv : r.getMovements())
            moves.add(new LinkedHashMap<>(Map.of("isin", mv.getIsin(), "units", mv.getUnits().longValueExact(),
                    "direction", mv.getDirection() == cdmx.collateral.triparty.TripartyMovementDirectionEnum.TOP_UP ? "TopUp" : "Release")));
        m.put("movements", moves);
        m.put("heldBefore", positionsView(r.getHeldBefore(), required));
        m.put("heldAfter", positionsView(r.getHeldAfter(), required));
        List<Map<String, Object>> breaches = new ArrayList<>();
        if (r.getBreaches() != null) for (var x : r.getBreaches())
            breaches.add(new LinkedHashMap<>(Map.of("isin", x.getIsin(), "limit", plain(x.getLimit()),
                    "percentage", x.getPercentage().setScale(4, java.math.RoundingMode.HALF_UP).stripTrailingZeros().toPlainString())));
        m.put("breaches", breaches);
        m.put("cdmEvents", (r.getValuation() != null ? 1 : 0) + (r.getAdjustment() != null ? 1 : 0));
        return m;
    }

    // --- substitution (task-triparty-substitution, wp-adr-triparty-substitution) ---

    /** A substitution request, its Rune JSON and hash. */
    record SubstitutionRequest(TripartySubstitutionRequest request, String json, String hash) {}

    /** The agent's substitution, its Rune JSON and hash, and the repo after it (the basis repo when declined). */
    record Substitution(TripartySubstitution substitution, String json, String hash, TradeState trade) {
        boolean substituted() {
            return substitution.getOutcome() == TripartySubstitutionOutcomeEnum.SUBSTITUTED;
        }

        Map<String, Long> units() {
            Map<String, Long> m = new LinkedHashMap<>();
            for (TripartyValuedPosition p : substitution.getHeldAfter()) m.put(p.getIsin(), p.getUnits().longValueExact());
            return m;
        }
    }

    static SubstitutionRequest substitutionRequest(String tradeId, String isin, long units, boolean byAgent, LocalDate date) {
        TripartySubstitutionRequest r = CdmRuntime.load(TripartySubstitutionRequest.class, o("tradeId", tradeId, "isin", isin, "units", units,
                "requestedBy", byAgent ? "Agent" : "Giver", "requestDate", date.toString()));
        CdmRuntime.validate(r);
        String json = CdmRuntime.toJson(r);
        return new SubstitutionRequest(r, json, Cdm.keccakHex(json));
    }

    static TripartySubstitutionRequest parseSubstitutionRequest(String json) {
        try {
            return CdmRuntime.JSON.readValue(json, TripartySubstitutionRequest.class);
        } catch (Exception e) {
            throw new IllegalStateException("not a TripartySubstitutionRequest document: " + e.getMessage(), e);
        }
    }

    static TripartySubstitution parseSubstitution(String json) {
        try {
            return CdmRuntime.JSON.readValue(json, TripartySubstitution.class);
        } catch (Exception e) {
            throw new IllegalStateException("not a TripartySubstitution document: " + e.getMessage(), e);
        }
    }

    /** The repo after a substitution that took effect: the open trade of its terms change. */
    static TradeState tradeAfter(TripartySubstitution s) {
        if (s.getAdjustment() == null) throw new IllegalStateException("a declined substitution changes no trade");
        return s.getAdjustment().getAfter().stream().filter(t -> t.getState() == null || t.getState().getClosedState() == null).findFirst()
                .orElseThrow(() -> new IllegalStateException("the substitution leaves no open trade"));
    }

    private static Party party(TradeState trade, String name) {
        return trade.getTrade().getParty().stream().map(p -> (Party) p).filter(p -> p.getName() != null && p.getName().getValue().equals(name))
                .findFirst().orElseThrow(() -> new IllegalStateException("the repo has no party " + name));
    }

    private static List<Object> identifiers(String issuer, String id) {
        return l(o("issuer", o("@data", issuer), "assignedIdentifier", l(o("identifier", o("@data", id)))));
    }

    /** The agent substitutes a request on a settled repo (cdm-ext SubstituteTriparty) and, when it takes effect, adds the
     *  terms change of the collateral portfolio with the trade's own Purchase Date, qualified by cdm-ext
     *  RepoIsSubstitution (RepoIsCollateralRelease when nothing replaces the returned units), and CDM's proposed and
     *  accepted workflow steps. {@code giver} is the giver's name in the repo; {@code basisTrade} the repo as the basis
     *  document left it. */
    static Substitution substitute(TripartyTerms terms, TradeState basisTrade, String basisHash, String requestHash, TripartySubstitutionRequest request,
                                   String giver, LocalDate date, List<Deposit> held, List<Deposit> free) {
        TradeState trade = CdmRepo.resolved(TradeState.class, basisTrade);
        var required = CdmRuntime.fn(TripartyRequiredValue.class).evaluate(trade, Date.of(date));
        TripartySubstitution s = CdmRuntime.fn(SubstituteTriparty.class).evaluate(requestHash, basisHash, Date.of(date), required, deposits(held), deposits(free),
                request.getIsin(), request.getUnits(), terms.getProfile());
        TradeState after = trade;
        if (s.getOutcome() == TripartySubstitutionOutcomeEnum.SUBSTITUTED) {
            LocalDate purchase = trade.getTrade().getProduct().getEconomicTerms().getEffectiveDate().getAdjustableDate().getUnadjustedDate().toLocalDate();
            LocalDate repurchase = trade.getTrade().getProduct().getEconomicTerms().getTerminationDate().getAdjustableDate().getUnadjustedDate().toLocalDate();
            List<Object> positions = new ArrayList<>();
            for (TripartyValuedPosition p : s.getHeldAfter()) positions.add(position(p.getIsin(), p.getUnits().longValueExact(), purchase, repurchase));
            CollateralPortfolio portfolio = CdmRuntime.load(CollateralPortfolio.class, o("collateralPosition", positions));
            var tc = CdmRuntime.fn(Create_SubstitutionInstruction.class).evaluate(trade.getTrade().getProduct(),
                    CdmRuntime.load(cdm.base.datetime.AdjustableOrRelativeDate.class, date(purchase)), portfolio);
            Instruction instruction = Instruction.builder().setBeforeValue(trade).setPrimitiveInstruction(PrimitiveInstruction.builder().setTermsChange(tc).build()).build();
            BusinessEvent adjustment = CdmRepo.resolved(BusinessEvent.class,
                    CdmRuntime.fn(Create_BusinessEvent.class).evaluate(new ArrayList<>(List.of(instruction)), null, Date.of(date), null));
            boolean replaced = s.getMovements().stream().anyMatch(m -> m.getDirection() == cdmx.collateral.triparty.TripartyMovementDirectionEnum.TOP_UP);
            boolean qualified = replaced
                    ? CdmRuntime.fn(RepoIsSubstitution.class).evaluate(adjustment) && !CdmRuntime.fn(RepoIsCollateralTopUp.class).evaluate(adjustment)
                        && !CdmRuntime.fn(RepoIsCollateralRelease.class).evaluate(adjustment)
                    : CdmRuntime.fn(RepoIsCollateralRelease.class).evaluate(adjustment);
            if (!qualified) throw new IllegalStateException("the collateral change does not qualify as a substitution");
            // CDM's workflow: the request as a proposed step (the requester, the instruction, the agent's approval) and the
            // agent's accepted step with the event. Timestamps are the substitution date, so a recomputation is identical.
            String requester = request.getRequestedBy() == TripartyRequesterEnum.AGENT ? AGENT : giver;
            EventTimestamp stamp = CdmRuntime.load(EventTimestamp.class, o("dateTime", date + "T17:00:00Z", "qualification", "eventCreationDateTime"));
            EventInstruction proposedEvent = CdmRuntime.load(EventInstruction.class, o("eventDate", date.toString())).toBuilder().addInstruction(instruction).build();
            WorkflowStepApproval approval = WorkflowStepApproval.builder().setApproved(true).setPartyValue(party(trade, AGENT)).setTimestamp(stamp).build();
            WorkflowStep proposed = CdmRuntime.fn(Create_ProposedWorkflowStep.class).evaluate(null, new ArrayList<>(List.of(stamp)),
                    new ArrayList<>(idList(requester, requestHash)),
                    new ArrayList<Party>(List.of(party(trade, requester))), new ArrayList<cdm.base.staticdata.party.Account>(), null,
                    cdm.event.common.ActionEnum.NEW, proposedEvent, new ArrayList<>(List.of(approval)));
            WorkflowStep accepted = CdmRuntime.fn(Create_AcceptedWorkflowStep.class).evaluate(null, new ArrayList<>(List.of(stamp)),
                    new ArrayList<>(idList(AGENT, requestHash + "-substituted")), new ArrayList<Party>(List.of(party(trade, AGENT))),
                    new ArrayList<cdm.base.staticdata.party.Account>(), proposed, adjustment);
            s = s.toBuilder().setAdjustment(adjustment).setProposed(proposed).setAccepted(accepted).build();
            after = tradeAfter(s);
        }
        CdmRuntime.validate(s);
        String json = CdmRuntime.toJson(s);
        return new Substitution(s, json, Cdm.keccakHex(json), after);
    }

    private static List<cdm.base.staticdata.identifier.Identifier> idList(String issuer, String id) {
        return List.of(CdmRuntime.load(cdm.base.staticdata.identifier.Identifier.class, (Map<String, Object>) identifiers(issuer, id).get(0)));
    }

    /** The giver's or the receiver's check of a substitution: the same document from the same inputs. */
    static Substitution verifySubstitution(String json, TripartyTerms terms, TradeState basisTrade, String basisHash, String requestHash,
                                           TripartySubstitutionRequest request, String giver, LocalDate date, List<Deposit> held, List<Deposit> free) {
        Substitution again = substitute(terms, basisTrade, basisHash, requestHash, request, giver, date, held, free);
        if (!again.json().equals(json)) throw new IllegalStateException("the substitution differs from the substitution this party computes");
        return again;
    }

    /** The units of each asset over its limit in a holding, rounded up: what the agent asks back to remove a breach. */
    static Map<String, Long> excessUnits(List<? extends TripartyValuedPosition> heldAfter, List<? extends cdmx.collateral.triparty.TripartyConcentrationBreach> breaches, BigDecimal required) {
        Map<String, Long> out = new LinkedHashMap<>();
        if (breaches == null) return out;
        for (var b : breaches) {
            for (TripartyValuedPosition p : heldAfter) {
                if (!p.getIsin().equals(b.getIsin())) continue;
                BigDecimal unitValue = p.getValueAfterHaircuts().getValue().divide(p.getUnits(), java.math.MathContext.DECIMAL64);
                BigDecimal excess = p.getValueAfterHaircuts().getValue().subtract(b.getLimit().multiply(required));
                out.put(p.getIsin(), excess.divide(unitValue, 0, java.math.RoundingMode.CEILING).longValueExact());
            }
        }
        return out;
    }

    /** The substitution for the console: the request, the values, the movements, the holdings and the breaches. */
    static Map<String, Object> substitutionView(TripartySubstitution s) {
        BigDecimal required = s.getRequiredValue().getValue();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("substitutionDate", s.getSubstitutionDate().toString());
        m.put("outcome", s.getOutcome() == TripartySubstitutionOutcomeEnum.SUBSTITUTED ? "Substituted" : "Declined");
        m.put("isin", s.getIsin());
        m.put("units", s.getUnits().longValueExact());
        m.put("requiredValue", plain(required));
        m.put("valueBefore", plain(s.getValueBefore().getValue()));
        m.put("valueAfter", plain(s.getValueAfter().getValue()));
        List<Map<String, Object>> moves = new ArrayList<>();
        if (s.getMovements() != null) for (TripartyMovement mv : s.getMovements())
            moves.add(new LinkedHashMap<>(Map.of("isin", mv.getIsin(), "units", mv.getUnits().longValueExact(),
                    "direction", mv.getDirection() == cdmx.collateral.triparty.TripartyMovementDirectionEnum.TOP_UP ? "TopUp" : "Release")));
        m.put("movements", moves);
        m.put("heldBefore", positionsView(s.getHeldBefore(), required));
        m.put("heldAfter", positionsView(s.getHeldAfter(), required));
        List<Map<String, Object>> breaches = new ArrayList<>();
        if (s.getBreaches() != null) for (var x : s.getBreaches())
            breaches.add(new LinkedHashMap<>(Map.of("isin", x.getIsin(), "limit", plain(x.getLimit()),
                    "percentage", x.getPercentage().setScale(4, java.math.RoundingMode.HALF_UP).stripTrailingZeros().toPlainString())));
        m.put("breaches", breaches);
        m.put("workflowSteps", (s.getProposed() != null ? 1 : 0) + (s.getAccepted() != null ? 1 : 0));
        return m;
    }

    // --- trade end (task-triparty-trade-end, wp-adr-triparty-trade-end) ---

    /** The agent's trade end, its Rune JSON and hash, and the Repurchase Price in whole units. */
    record TradeEnd(cdmx.collateral.triparty.TripartyTradeEnd tradeEnd, String json, String hash, long repurchasePrice) {}

    private static Map<String, Object> scheduled(Number value, Map<String, Object> unit, Map<String, Object> asset, String payer, String receiver, LocalDate date) {
        return o("quantity", o("value", value, "unit", unit), "asset", asset,
                "settlementDate", o("adjustedDate", o("@data", date.toString())),
                "payerReceiver", o("payerPartyReference", CdmRepo.party(payer), "receiverPartyReference", CdmRepo.party(receiver)),
                "transferType", "Principal");
    }

    /** The agent's trade end of a settled repo on its Repurchase Date: CDM's repurchase event over the repo as the basis
     *  document left it, one release per asset of {@code held} (the holding on-chain) from the receiver to the giver, and
     *  the Repurchase Price from the giver to the receiver. cdm-ext's conditions require the release to be the repo's
     *  collateral portfolio unit for unit. */
    static TradeEnd tradeEnd(TradeState basisTrade, String basisHash, Map<String, Long> held, String giver, String receiver) {
        TradeState trade = CdmRepo.resolved(TradeState.class, basisTrade);
        LocalDate repurchaseDate = trade.getTrade().getProduct().getEconomicTerms().getTerminationDate().getAdjustableDate().getUnadjustedDate().toLocalDate();
        long price = CdmRuntime.fn(cdmx.collateral.repo.functions.RepoRepurchasePrice.class).evaluate(trade, 0).getValue().longValueExact();
        List<Object> releases = new ArrayList<>();
        held.forEach((isin, units) -> releases.add(scheduled(units, o("financialUnit", "Share"), CdmRepo.security(isin), receiver, giver, repurchaseDate)));
        Map<String, Object> cash = o("@type", "cdm.base.staticdata.asset.common.Cash",
                "identifier", l(o("identifier", o("@data", "USD"), "identifierType", "CurrencyCode")), "assetType", "Cash");
        var doc = CdmRuntime.load(cdmx.collateral.triparty.TripartyTradeEnd.class, o("basisHash", basisHash, "repurchaseDate", repurchaseDate.toString(),
                "repurchasePrice", o("value", price, "unit", usd()),
                "repurchase", CdmRuntime.JSON.convertValue(CdmRuntime.JSON.valueToTree(CdmRepo.repurchaseEvent(trade, repurchaseDate)), Map.class),
                "releases", releases, "cashTransfer", scheduled(price, usd(), cash, giver, receiver, repurchaseDate)));
        CdmRuntime.validate(doc);
        String json = CdmRuntime.toJson(doc);
        return new TradeEnd(doc, json, Cdm.keccakHex(json), price);
    }

    static cdmx.collateral.triparty.TripartyTradeEnd parseTradeEnd(String json) {
        try {
            return CdmRuntime.JSON.readValue(json, cdmx.collateral.triparty.TripartyTradeEnd.class);
        } catch (Exception e) {
            throw new IllegalStateException("not a TripartyTradeEnd document: " + e.getMessage(), e);
        }
    }

    /** The giver's or the receiver's check of a trade end: the same document from the same basis and holding. */
    static TradeEnd verifyTradeEnd(String json, TradeState basisTrade, String basisHash, Map<String, Long> held, String giver, String receiver) {
        TradeEnd again = tradeEnd(basisTrade, basisHash, held, giver, receiver);
        if (!again.json().equals(json)) throw new IllegalStateException("the trade end differs from the trade end this party computes");
        return again;
    }

    /** The trade end for the console. */
    static Map<String, Object> tradeEndView(cdmx.collateral.triparty.TripartyTradeEnd t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("repurchaseDate", t.getRepurchaseDate().toString());
        m.put("repurchasePrice", t.getRepurchasePrice().getValue().longValueExact());
        List<Map<String, Object>> rs = new ArrayList<>();
        for (var r : t.getReleases()) {
            String isin = ((cdm.base.staticdata.asset.common.Instrument) r.getAsset().getInstrument()).getSecurity() != null
                    ? r.getAsset().getInstrument().getSecurity().getIdentifier().get(0).getIdentifier().getValue() : null;
            rs.add(new LinkedHashMap<>(Map.of("isin", String.valueOf(isin), "units", r.getQuantity().getValue().longValueExact())));
        }
        m.put("releases", rs);
        return m;
    }

    // --- reporting (task-triparty-reporting, wp-adr-triparty-reporting) ---

    /** One settled repo as the report reads it: its ids, the repo as its last document left it, and its holding. */
    record ReportedRepo(String repoId, String tradeId, TradeState basisTrade, List<Deposit> held) {}

    /** The agent's report, its Rune JSON and hash. */
    record Report(cdmx.collateral.triparty.TripartyReport report, String json, String hash) {}

    private static TripartyValuedPosition valued(Deposit d, TripartyTerms terms) {
        return CdmRuntime.fn(cdmx.collateral.triparty.functions.TripartyValued.class).evaluate(deposits(List.of(d)).get(0), BigDecimal.valueOf(d.units()), terms.getProfile());
    }

    /** The agent's report for one terms on a date (cdm-ext TripartyReport): each settled repo with its exposure, its
     *  holding valued, its coverage and breaches and CDM's CollateralPortfolio of it, and the giver's free collateral in
     *  eligible assets. */
    static Report report(TripartyTerms terms, String termsHash, LocalDate date, List<ReportedRepo> repos, List<Deposit> free, String giver, String receiver) {
        List<Object> repoReports = new ArrayList<>();
        for (ReportedRepo rr : repos) {
            TradeState trade = CdmRepo.resolved(TradeState.class, rr.basisTrade());
            var exposure = CdmRuntime.fn(TripartyRequiredValue.class).evaluate(trade, Date.of(date));
            List<TripartyValuedPosition> vs = new ArrayList<>();
            BigDecimal after = BigDecimal.ZERO, before = BigDecimal.ZERO;
            Map<String, BigDecimal> haircuts = new HashMap<>();
            for (Deposit d : rr.held()) {
                TripartyValuedPosition v = valued(d, terms);
                vs.add(v);
                after = after.add(v.getValueAfterHaircuts().getValue());
                before = before.add(d.price().multiply(BigDecimal.valueOf(d.units())));
                haircuts.put(d.isin(), v.getHaircutPercentage());
            }
            var tree = (com.fasterxml.jackson.databind.node.ObjectNode) CdmRuntime.JSON.valueToTree(trade).path("trade").path("product").path("economicTerms")
                    .path("collateral").path("collateralPortfolio").path(0).deepCopy();
            tree.set("portfolioIdentifier", CdmRuntime.JSON.valueToTree(identifiers(AGENT, rr.tradeId()).get(0)));
            for (var pos : tree.path("collateralPosition")) {
                String isin = pos.path("product").path("asset").path("identifier").path(0).path("identifier").path("@data").asText();
                ((com.fasterxml.jackson.databind.node.ObjectNode) pos).put("collateralPositionStatus", "SettledAmount");
                ((com.fasterxml.jackson.databind.node.ObjectNode) pos).set("treatment",
                        CdmRuntime.JSON.valueToTree(o("valuationTreatment", o("haircutPercentage", haircuts.getOrDefault(isin, BigDecimal.ZERO)), "isIncluded", true)));
            }
            Map<String, Object> pr = o("payerPartyReference", CdmRepo.party(giver), "receiverPartyReference", CdmRepo.party(receiver));
            tree.set("collateralBalance", CdmRuntime.JSON.valueToTree(l(
                    o("collateralBalanceStatus", "SettledAmount", "haircutIndicator", "PostHaircut", "amountBaseCurrency", money(after), "payerReceiver", pr),
                    o("collateralBalanceStatus", "SettledAmount", "haircutIndicator", "PreHaircut", "amountBaseCurrency", money(before), "payerReceiver", pr))));
            repoReports.add(o("repoId", rr.repoId(), "tradeId", rr.tradeId(),
                    "exposure", CdmRuntime.JSON.convertValue(CdmRuntime.JSON.valueToTree(exposure), Map.class),
                    "valued", CdmRuntime.JSON.convertValue(CdmRuntime.JSON.valueToTree(vs), List.class),
                    "valueAfterHaircuts", money(after),
                    "covered", after.compareTo(exposure.getValue()) >= 0,
                    "breaches", CdmRuntime.JSON.convertValue(CdmRuntime.JSON.valueToTree(
                            CdmRuntime.fn(TripartyConcentrationBreaches.class).evaluate(terms.getProfile(), vs, exposure)), List.class),
                    "portfolio", CdmRuntime.JSON.convertValue(tree, Map.class)));
        }
        List<Object> freeValued = new ArrayList<>();
        List<Object> freePositions = new ArrayList<>();
        for (Deposit d : free) {
            if (!CdmRuntime.fn(cdmx.collateral.triparty.functions.ProfileEligible.class).evaluate(terms.getProfile(), d.isin())) continue;
            freeValued.add(CdmRuntime.JSON.convertValue(CdmRuntime.JSON.valueToTree(valued(d, terms)), Map.class));
            freePositions.add(position(d.isin(), d.units(), date, date));
        }
        Map<String, Object> doc = new LinkedHashMap<>(o("termsHash", termsHash, "reportDate", date.toString(), "repos", repoReports));
        if (!freeValued.isEmpty()) {
            doc.put("freeValued", freeValued);
            doc.put("free", o("portfolioIdentifier", identifiers(AGENT, giver + "-free").get(0), "collateralPosition", freePositions));
        }
        var r = CdmRuntime.load(cdmx.collateral.triparty.TripartyReport.class, doc);
        CdmRuntime.validate(r);
        String json = CdmRuntime.toJson(r);
        return new Report(r, json, Cdm.keccakHex(json));
    }

    static cdmx.collateral.triparty.TripartyReport parseReport(String json) {
        try {
            return CdmRuntime.JSON.readValue(json, cdmx.collateral.triparty.TripartyReport.class);
        } catch (Exception e) {
            throw new IllegalStateException("not a TripartyReport document: " + e.getMessage(), e);
        }
    }

    /** The giver's or the receiver's check of a report: the same document from the same inputs. */
    static Report verifyReport(String json, TripartyTerms terms, String termsHash, LocalDate date, List<ReportedRepo> repos, List<Deposit> free, String giver, String receiver) {
        Report again = report(terms, termsHash, date, repos, free, giver, receiver);
        if (!again.json().equals(json)) throw new IllegalStateException("the report differs from the report this party computes");
        return again;
    }

    /** The report for the console: per repo the exposure, value, coverage and holding; the free collateral. */
    static Map<String, Object> reportView(cdmx.collateral.triparty.TripartyReport r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("reportDate", r.getReportDate().toString());
        List<Map<String, Object>> repos = new ArrayList<>();
        if (r.getRepos() != null) for (var x : r.getRepos()) {
            Map<String, Object> e = new LinkedHashMap<>();
            e.put("repoId", x.getRepoId());
            e.put("tradeId", x.getTradeId());
            e.put("exposure", plain(x.getExposure().getValue()));
            e.put("valueAfterHaircuts", plain(x.getValueAfterHaircuts().getValue()));
            e.put("covered", x.getCovered());
            e.put("held", positionsView(x.getValued(), x.getExposure().getValue()));
            e.put("breaches", x.getBreaches() == null ? 0 : x.getBreaches().size());
            repos.add(e);
        }
        m.put("repos", repos);
        List<Map<String, Object>> free = new ArrayList<>();
        if (r.getFreeValued() != null) for (var v : r.getFreeValued()) {
            free.add(new LinkedHashMap<>(Map.of("isin", v.getIsin(), "units", v.getUnits().longValueExact(), "valueAfterHaircuts", plain(v.getValueAfterHaircuts().getValue()))));
        }
        m.put("free", free);
        return m;
    }

    static TripartyAllocation parseAllocation(String json) {
        try {
            return CdmRuntime.JSON.readValue(json, TripartyAllocation.class);
        } catch (Exception e) {
            throw new IllegalStateException("not a TripartyAllocation document: " + e.getMessage(), e);
        }
    }

    /** The giver's or the receiver's check of the agent's allocation: the allocation this party computes from the same
     *  terms, request, free account, ranking and prices is the same document. Returns it; throws otherwise. */
    static Allocation verifyAllocation(String json, TripartyTerms terms, TripartyRepoRequest r, String requestHash, List<Deposit> deposits) {
        Allocation again = allocate(terms, r, requestHash, deposits);
        if (!again.json().equals(json)) throw new IllegalStateException("the allocation differs from the allocation this party computes");
        return again;
    }

    /** The allocation for the console: positions with their values, the required and allocated values, and the
     *  share of the Purchase Price each asset is. */
    static Map<String, Object> allocationView(TripartyAllocation a) {
        Map<String, Object> m = new LinkedHashMap<>();
        BigDecimal required = a.getRequiredValue().getValue();
        m.put("covers", Boolean.TRUE.equals(a.getCoversPurchasePrice()));
        m.put("requiredValue", required.stripTrailingZeros().toPlainString());
        m.put("allocatedValue", a.getAllocatedValue().getValue().stripTrailingZeros().toPlainString());
        List<Map<String, Object>> ps = new ArrayList<>();
        if (a.getPositions() != null) for (TripartyValuedPosition p : a.getPositions()) {
            Map<String, Object> e = new LinkedHashMap<>();
            e.put("isin", p.getIsin());
            e.put("units", p.getUnits().longValueExact());
            e.put("unitPrice", p.getUnitPrice().getValue().stripTrailingZeros().toPlainString());
            e.put("haircutBps", p.getHaircutPercentage().movePointRight(4).intValueExact());
            e.put("valueAfterHaircuts", p.getValueAfterHaircuts().getValue().stripTrailingZeros().toPlainString());
            e.put("share", p.getValueAfterHaircuts().getValue().divide(required, 4, java.math.RoundingMode.HALF_UP).stripTrailingZeros().toPlainString());
            ps.add(e);
        }
        m.put("positions", ps);
        m.put("cdmRepo", a.getTrade() != null);
        return m;
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
