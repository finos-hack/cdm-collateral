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
import cdmx.collateral.ccp.CcpAdmission;
import cdmx.collateral.ccp.CcpDefaultManagement;
import cdmx.collateral.ccp.CcpDefaultTransaction;
import cdmx.collateral.ccp.CcpMarginStatement;
import cdmx.collateral.ccp.CcpPorting;
import cdmx.collateral.ccp.CcpVariationMarginLine;
import cdmx.collateral.ccp.CcpWaterfall;
import cdmx.collateral.ccp.functions.CcpInitialMarginRequired;
import cdmx.collateral.ccp.functions.CcpRepoExposure;
import cdmx.collateral.ccp.functions.CcpWaterfallLayer;
import cdmx.collateral.repo.GmraDefaultTransactionValue;
import cdmx.collateral.repo.functions.GmraDefaultMarketValue;
import cdmx.collateral.repo.functions.GmraDefaultRepurchasePrice;
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

    // --- margin (task-ccp-margin, wp-adr-ccp-margin) ---

    /** One cleared repo in a member's statement: the leg whose terms value it (both legs have the same terms), the
     *  feed price and the variation margin paid before, from the seller's side. */
    record MarginLine(String repoId, String seller, String buyer, boolean repurchased, TradeState leg, BigDecimal price, long previousVm) {}

    record MarginStatement(CcpMarginStatement statement, String json, String hash) {
        long vm() {
            return statement.getVariationMarginAmount().longValueExact();
        }

        long im() {
            return statement.getInitialMarginAmount().longValueExact();
        }

        long net() {
            return statement.getNetAmount().longValueExact();
        }

        /** A line's change, from the seller's side, by repo id. */
        long lineVm(String repoId) {
            for (CcpVariationMarginLine l : lines(statement))
                if (l.getRepoId().equals(repoId)) return l.getVariationMargin().longValueExact();
            throw new IllegalArgumentException("no line for " + repoId);
        }
    }

    private static Map<String, Object> callOf(String ccp, String member, LocalDate date, String type, long amount) {
        return o("instructionType", o("callType", "MarginCall"),
                "callIdentifier", o("issuer", o("@data", ccp), "assignedIdentifier", l(o("identifier", o("@data", "CCP-" + type + "-" + date + "-" + member)))),
                "callAgreementType", o("agreementType", "Other", "otherAgreement", OTHER_AGREEMENT),
                "regMarginType", type,
                "partyRole", l(o("partyReference", o("partyId", l(o("identifier", o("@data", member)))), "role", "Pledgor"),
                        o("partyReference", o("partyId", l(o("identifier", o("@data", ccp)))), "role", "SecuredParty")),
                "callAmountInBaseCurrency", money(amount));
    }

    /** A member's margin statement for a business date: a line per cleared repo, the initial margin at the rate of its
     *  open cleared repos' Purchase Prices less what it holds, and CDM's calls for what it pays. Built by the CCP and
     *  rebuilt by the member from the same chain values and feed prices. */
    static MarginStatement marginStatement(String rulebookHash, String ccp, String member, LocalDate date, BigDecimal rate,
                                           List<MarginLine> lines, long imBase, long imHeld) {
        List<Object> ls = new ArrayList<>();
        long vm = 0;
        for (MarginLine x : lines) {
            CdmRepo.Terms t = CdmRepo.terms(x.leg());
            BigDecimal qty = BigDecimal.valueOf(t.quantity());
            BigDecimal exposure = x.repurchased() ? BigDecimal.ZERO : CdmRuntime.fn(CcpRepoExposure.class)
                    .evaluate(x.leg(), Date.of(date), qty, x.price(), t.marginRatio(), CdmRepo.CASH_PRECISION);
            long change = exposure.longValueExact() - x.previousVm();
            vm += x.seller().equals(member) ? change : -change;
            ls.add(o("repoId", x.repoId(), "seller", x.seller(), "buyer", x.buyer(), "repurchased", x.repurchased(),
                    "quantity", qty, "price", x.price(), "marginRatio", t.marginRatio(), "exposure", exposure.longValueExact(),
                    "previousVariationMargin", x.previousVm(), "variationMargin", change));
        }
        long required = CdmRuntime.fn(CcpInitialMarginRequired.class).evaluate(BigDecimal.valueOf(imBase), rate).longValueExact();
        long im = required - imHeld;
        List<Object> calls = new ArrayList<>();
        if (vm > 0) calls.add(callOf(ccp, member, date, "VM", vm));
        if (im > 0) calls.add(callOf(ccp, member, date, "NonRegIM", im));
        Map<String, Object> doc = o("rulebookHash", rulebookHash, "ccp", o("partyReference", party(ccp), "role", "ClearingOrganization"),
                "member", member, "businessDate", date.toString(), "initialMarginRate", rate, "line", ls,
                "variationMarginAmount", vm, "initialMarginBase", imBase, "initialMarginRequired", required,
                "initialMarginHeld", imHeld, "initialMarginAmount", im, "netAmount", vm + im, "call", calls);
        CcpMarginStatement s = CdmRuntime.load(CcpMarginStatement.class, doc);
        CdmRuntime.validate(s);
        String json = CdmRuntime.toJson(s);
        return new MarginStatement(s, json, Cdm.keccakHex(json));
    }

    static CcpMarginStatement parseMargin(String json) {
        try {
            return CdmRuntime.JSON.readValue(json, CcpMarginStatement.class);
        } catch (Exception e) {
            throw new IllegalStateException("not a CcpMarginStatement document: " + e.getMessage(), e);
        }
    }

    /** A statement's lines; a statement without any (a member whose initial margin alone changes) has none. */
    static List<? extends CcpVariationMarginLine> lines(CcpMarginStatement s) {
        return s.getLine() == null ? List.of() : s.getLine();
    }

    /** The price a statement states for a repo's securities. */
    static BigDecimal statedPrice(CcpMarginStatement s, String repoId) {
        for (CcpVariationMarginLine l : lines(s)) if (l.getRepoId().equals(repoId)) return l.getPrice();
        return null;
    }

    /** A business date as the yyyymmdd number the chain keys a round by. */
    static long dateKey(LocalDate d) {
        return d.getYear() * 10_000L + d.getMonthValue() * 100L + d.getDayOfMonth();
    }

    static LocalDate dateOfKey(String key) {
        long k = Long.parseLong(key);
        return LocalDate.of((int) (k / 10_000), (int) (k / 100 % 100), (int) (k % 100));
    }

    // --- default (task-ccp-default, wp-adr-ccp-default) ---

    /** One cleared repo of the defaulter: its two legs, the feed price, and the variation margin paid. */
    record DefaultInput(String repoId, boolean purchased, TradeState defaulterLeg, TradeState survivorLeg, String survivor, long vmPaid, BigDecimal price) {}

    /** What the waterfall has: the defaulter's initial margin and contribution, the CCP's capital and the other members'
     *  contributions. */
    record Resources(long im, long contribution, long capital, long members) {}

    record Management(CcpDefaultManagement management, String json, String hash) {
        CcpWaterfall waterfall() {
            return management.getWaterfall();
        }

        /** Each repo's residual from the seller's side, by repo id, in the document's order. */
        Map<String, Long> residuals() {
            Map<String, Long> m = new LinkedHashMap<>();
            for (CcpDefaultTransaction t : management.getTransaction()) m.put(t.getRepoId(), t.getResidual().longValueExact());
            return m;
        }
    }

    private static BigDecimal layer(BigDecimal loss, long before, long available) {
        return CdmRuntime.fn(CcpWaterfallLayer.class).evaluate(loss, BigDecimal.valueOf(before), BigDecimal.valueOf(available));
    }

    /** The CCP's management of a member's default: each cleared repo closed out at the feed price on the close-out date,
     *  the residual after the variation margin paid, and the waterfall over the loss. */
    static Management defaultManagement(String rulebookHash, String ccp, String defaulter, LocalDate eventOfDefault, LocalDate closeOut,
                                        List<DefaultInput> txs, Resources r) {
        List<Object> ts = new ArrayList<>();
        BigDecimal loss = BigDecimal.ZERO;
        for (DefaultInput x : txs) {
            GmraDefaultTransactionValue d = CdmRepoDefault.value(new CdmRepoDefault.TxInput(x.repoId(), x.defaulterLeg(), 0, x.price()), closeOut);
            GmraDefaultTransactionValue s = CdmRepoDefault.value(new CdmRepoDefault.TxInput(x.repoId(), x.survivorLeg(), 0, x.price()), closeOut);
            BigDecimal residual = x.purchased()
                    ? s.getRepurchasePrice().subtract(s.getDefaultMarketValue()).subtract(BigDecimal.valueOf(x.vmPaid()))
                    : BigDecimal.ZERO;
            BigDecimal amount = x.survivor().equals(s.getBuyer()) ? residual : residual.negate();
            loss = loss.add(amount);
            ts.add(o("repoId", x.repoId(), "purchased", x.purchased(),
                    "defaulterLeg", CdmRuntime.JSON.convertValue(CdmRuntime.JSON.valueToTree(d), Map.class),
                    "survivorLeg", CdmRuntime.JSON.convertValue(CdmRuntime.JSON.valueToTree(s), Map.class),
                    "survivor", x.survivor(), "variationMarginPaid", x.purchased() ? x.vmPaid() : 0, "residual", residual, "survivorAmount", amount));
        }
        BigDecimal fromIm = layer(loss, 0, r.im()), fromC = layer(loss, r.im(), r.contribution()),
                fromK = layer(loss, r.im() + r.contribution(), r.capital()), fromM = layer(loss, r.im() + r.contribution() + r.capital(), r.members());
        BigDecimal returned = loss.signum() < 0 ? BigDecimal.valueOf(r.im() + r.contribution()).subtract(loss)
                : BigDecimal.valueOf(r.im() + r.contribution()).subtract(fromIm).subtract(fromC);
        Map<String, Object> doc = o("rulebookHash", rulebookHash, "ccp", o("partyReference", party(ccp), "role", "ClearingOrganization"),
                "defaulter", defaulter, "eventOfDefaultDate", eventOfDefault.toString(), "closeOutDate", closeOut.toString(), "transaction", ts,
                "waterfall", o("loss", loss, "defaulterInitialMargin", r.im(), "defaulterContribution", r.contribution(), "ccpCapital", r.capital(),
                        "membersContribution", r.members(), "fromDefaulterInitialMargin", fromIm, "fromDefaulterContribution", fromC,
                        "fromCcpCapital", fromK, "fromMembersContribution", fromM, "returnedToDefaulter", returned));
        CcpDefaultManagement m = CdmRuntime.load(CcpDefaultManagement.class, doc);
        CdmRuntime.validate(m);
        String json = CdmRuntime.toJson(m);
        return new Management(m, json, Cdm.keccakHex(json));
    }

    static CcpDefaultManagement parseManagement(String json) {
        try {
            return CdmRuntime.JSON.readValue(json, CcpDefaultManagement.class);
        } catch (Exception e) {
            throw new IllegalStateException("not a CcpDefaultManagement document: " + e.getMessage(), e);
        }
    }

    // --- admission and porting (task-ccp-porting, wp-adr-ccp-porting) ---

    static final long ADMITTED_SHARE = 500_000;

    record Admission(CcpAdmission admission, String json, String hash) {
        long share() {
            return admission.getMember().getDefaultFundShare().getValue().longValueExact();
        }

        String member() {
            return CdmTriparty.name(admission.getMember().getParty());
        }
    }

    /** The CCP admits a member with the same agreement as the rulebook's members and a 500,000 USD share. */
    static Admission admission(String rulebookHash, String ccp, String member, LocalDate date) {
        Map<String, Object> m = o("party", party(member), "defaultFundShare", money(ADMITTED_SHARE),
                "agreement", o("agreementDate", date.toString(),
                        "legalAgreementIdentification", o("agreementName", o("agreementType", "Other", "otherAgreement", OTHER_AGREEMENT)),
                        "contractualParty", l(party(ccp), party(member))));
        CcpAdmission a = CdmRuntime.load(CcpAdmission.class, o("rulebookHash", rulebookHash,
                "ccp", o("partyReference", party(ccp), "role", "ClearingOrganization"), "member", m, "admissionDate", date.toString()));
        CdmRuntime.validate(a);
        String json = CdmRuntime.toJson(a);
        return new Admission(a, json, Cdm.keccakHex(json));
    }

    /** Check an admission: it parses and equals the one this party builds for the rulebook, the CCP, the member and the
     *  date it states. */
    static Admission verifyAdmission(String json, String rulebookHash, String ccp, String member) {
        CcpAdmission p;
        try {
            p = CdmRuntime.JSON.readValue(json, CcpAdmission.class);
        } catch (Exception e) {
            throw new IllegalStateException("not a CcpAdmission document: " + e.getMessage(), e);
        }
        Admission again = admission(rulebookHash, ccp, member, p.getAdmissionDate().toLocalDate());
        if (!again.json().equals(json)) throw new IllegalStateException("the admission differs from the admission this party builds");
        return again;
    }

    record Porting(CcpPorting porting, String json, String hash, TradeState newLeg) {
        long payment() {
            return porting.getPayment().longValueExact();
        }
    }

    /** CDM's party change of the leaving member's leg to the receiving member, intent Novation, keyed by CDM's
     *  GlobalKeyProcessStep as the clearing is. */
    static BusinessEvent portingEvent(TradeState leg, String from, String to, LocalDate date) {
        String role = null;
        for (var c : leg.getTrade().getCounterparty())
            if (from.equals(c.getPartyReference().getValue().getName().getValue())) role = c.getRole().toDisplayString();
        if (role == null) throw new IllegalStateException(from + " is not a counterparty to the leg");
        String tradeId = CdmRepo.terms(leg).tradeId() + "-P";
        PrimitiveInstruction pi = CdmRuntime.load(PrimitiveInstruction.class, o("partyChange", o("counterparty", o("role", role, "partyReference", party(to)),
                "tradeId", l(o("issuer", o("@data", CCP), "assignedIdentifier", l(o("identifier", o("@data", tradeId))))))));
        var ib = Instruction.builder().setBeforeValue(leg).setPrimitiveInstruction(pi);
        new GlobalKeyProcessStep(NonNullHashCollector::new).runProcessStep(Instruction.class, ib);
        Date on = Date.of(date);
        BusinessEvent ev = CdmRepo.resolved(BusinessEvent.class, CdmRuntime.fn(Create_BusinessEvent.class)
                .evaluate(new ArrayList<>(List.of(ib.build())), EventIntentEnum.NOVATION, on, null));
        var b = ev.toBuilder();
        for (var a : b.getAfter())
            if (a.getState() != null && a.getState().getClosedState() != null) a.getState().getClosedState().setActivityDate(on);
        return b.build();
    }

    /** The porting of the leaving member's leg at the feed price on the porting date, with the variation margin paid. */
    static Porting porting(String rulebookHash, String repoId, String ccp, String from, String to, boolean seller, LocalDate date,
                           TradeState leg, BigDecimal price, long vmPaid) {
        BusinessEvent ev = portingEvent(leg, from, to, date);
        CdmRepo.Terms t = CdmRepo.terms(leg);
        BigDecimal qty = BigDecimal.valueOf(t.quantity());
        BigDecimal rp = CdmRuntime.fn(GmraDefaultRepurchasePrice.class).evaluate(leg, Date.of(date), BigDecimal.ZERO, CdmRepo.CASH_PRECISION);
        BigDecimal mv = CdmRuntime.fn(GmraDefaultMarketValue.class).evaluate(qty, price, CdmRepo.CASH_PRECISION);
        BigDecimal vm = BigDecimal.valueOf(vmPaid);
        BigDecimal payment = seller ? mv.subtract(rp).add(vm) : rp.subtract(vm);
        Map<String, Object> doc = o("rulebookHash", rulebookHash, "repoId", repoId,
                "ccp", o("partyReference", party(ccp), "role", "ClearingOrganization"), "fromMember", from, "toMember", to, "seller", seller,
                "portingDate", date.toString(), "porting", CdmRuntime.JSON.convertValue(CdmRuntime.JSON.valueToTree(ev), Map.class),
                "quantity", qty, "price", price, "marketValue", mv, "repurchasePrice", rp, "variationMarginPaid", vm, "payment", payment);
        CcpPorting p = CdmRuntime.load(CcpPorting.class, doc);
        CdmRuntime.validate(p);
        String json = CdmRuntime.toJson(p);
        TradeState newLeg = null;
        for (TradeState a : ev.getAfter()) if (a.getState() == null || a.getState().getClosedState() == null) newLeg = reloaded(a);
        return new Porting(p, json, Cdm.keccakHex(json), newLeg);
    }

    static CcpPorting parsePorting(String json) {
        try {
            return CdmRuntime.JSON.readValue(json, CcpPorting.class);
        } catch (Exception e) {
            throw new IllegalStateException("not a CcpPorting document: " + e.getMessage(), e);
        }
    }

    /** Check a porting: it validates and equals the one this party builds from the leg, the stated date and price, and
     *  the variation margin paid. */
    static Porting verifyPorting(String json, String rulebookHash, String repoId, String ccp, String from, String to, boolean seller,
                                 TradeState leg, long vmPaid) {
        CcpPorting p = parsePorting(json);
        var failures = CdmRuntime.failures(p);
        if (!failures.isEmpty()) throw new IllegalStateException("the porting fails CDM validation: " + failures.get(0));
        Porting again = porting(rulebookHash, repoId, ccp, from, to, seller, p.getPortingDate().toLocalDate(), leg, p.getPrice(), vmPaid);
        if (!again.json().equals(json)) throw new IllegalStateException("the porting differs from the porting this party builds");
        return again;
    }
}
