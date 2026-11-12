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
