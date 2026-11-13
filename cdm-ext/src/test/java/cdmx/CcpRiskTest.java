package cdmx;

import cdm.event.common.BusinessEvent;
import cdm.event.common.EventIntentEnum;
import cdm.event.common.Instruction;
import cdm.event.common.PrimitiveInstruction;
import cdm.event.common.TradeState;
import cdm.event.common.functions.Create_BusinessEvent;
import cdm.event.qualification.functions.Qualify_Novation;
import cdmx.collateral.ccp.CcpAdmission;
import cdmx.collateral.ccp.CcpDefaultManagement;
import cdmx.collateral.ccp.CcpMarginStatement;
import cdmx.collateral.ccp.CcpPorting;
import cdmx.collateral.ccp.functions.CcpInitialMarginRequired;
import cdmx.collateral.ccp.functions.CcpRepoExposure;
import cdmx.collateral.ccp.functions.CcpWaterfallLayer;
import cdmx.collateral.repo.GmraDefaultTransactionValue;
import cdmx.collateral.repo.functions.GmraDefaultMarketValue;
import cdmx.collateral.repo.functions.GmraDefaultRepurchasePrice;
import cdmx.collateral.repo.functions.RepoTransactionExposure;
import com.regnosys.rosetta.common.hashing.GlobalKeyProcessStep;
import com.regnosys.rosetta.common.hashing.NonNullHashCollector;
import com.rosetta.model.lib.records.Date;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static cdmx.Cdm.*;
import static cdmx.CcpNovationTest.bilateral;
import static cdmx.CcpNovationTest.clearing;
import static cdmx.CcpNovationTest.fromJson;
import static cdmx.CcpNovationTest.party;
import static cdmx.RepoTest.resolved;
import static org.junit.jupiter.api.Assertions.*;

/** The CCP's margin, member default and porting over the cleared repo of CcpNovationTest (BANK-A sells 1,020 tUST to
 *  BANK-B through BANK-C for 98,400 at 4.5%, Margin Ratio 1.02): task-ccp-margin, task-ccp-default, task-ccp-porting. */
class CcpRiskTest {
    static final Date DAY = Date.of(2026, 11, 10);
    static final BigDecimal QTY = new BigDecimal(1_020), RATIO = new BigDecimal("1.02"), PRICE = new BigDecimal("96");

    /** The cleared legs: the seller BANK-A against BANK-C, then BANK-C against the buyer BANK-B. */
    static List<TradeState> legs() {
        BusinessEvent ev = clearing(bilateral(), "BANK-C", true);
        List<TradeState> out = new ArrayList<>();
        for (int i = 0; i < 2; i++) out.add(resolved(TradeState.class, load(TradeState.class, fromJson(toJson(ev.getAfter().get(i))))));
        return out;
    }

    static Map<String, Object> ccp() {
        return o("partyReference", party("BANK-C"), "role", "ClearingOrganization");
    }

    // --- margin ---

    static BigDecimal exposure(TradeState leg, BigDecimal price) {
        return fn(CcpRepoExposure.class).evaluate(leg, DAY, QTY, price, RATIO, 0);
    }

    static Map<String, Object> call(String member, String type, BigDecimal amount) {
        return o("instructionType", o("callType", "MarginCall"),
                "callIdentifier", o("issuer", o("@data", "BANK-C"), "assignedIdentifier", l(o("identifier", o("@data", "CCP-" + type + "-" + member)))),
                "callAgreementType", o("agreementType", "Other", "otherAgreement", "CCP rulebook"),
                "regMarginType", type,
                "partyRole", l(o("partyReference", o("partyId", l(o("identifier", o("@data", member)))), "role", "Pledgor"),
                        o("partyReference", o("partyId", l(o("identifier", o("@data", "BANK-C")))), "role", "SecuredParty")),
                "callAmountInBaseCurrency", o("value", amount, "unit", o("currency", o("@data", "USD"))));
    }

    static Map<String, Object> statement(String member, BigDecimal e, BigDecimal previous, BigDecimal held, boolean withCalls) {
        BigDecimal change = e.subtract(previous);
        BigDecimal vm = member.equals("BANK-A") ? change : change.negate();
        BigDecimal required = fn(CcpInitialMarginRequired.class).evaluate(new BigDecimal(98_400), new BigDecimal("0.05"));
        BigDecimal im = required.subtract(held);
        List<Object> calls = new ArrayList<>();
        if (withCalls && vm.signum() > 0) calls.add(call(member, "VM", vm));
        if (withCalls && im.signum() > 0) calls.add(call(member, "NonRegIM", im));
        return o("rulebookHash", "0x" + "44".repeat(32), "ccp", ccp(), "member", member, "businessDate", "2026-11-10",
                "initialMarginRate", new BigDecimal("0.05"),
                "line", l(o("repoId", "REPO-1", "seller", "BANK-A", "buyer", "BANK-B", "repurchased", false, "quantity", QTY, "price", PRICE,
                        "marginRatio", RATIO, "exposure", e, "previousVariationMargin", previous, "variationMargin", change)),
                "variationMarginAmount", vm, "initialMarginBase", new BigDecimal(98_400), "initialMarginRequired", required,
                "initialMarginHeld", held, "initialMarginAmount", im, "netAmount", vm.add(im), "call", calls);
    }

    @Test
    void theExposureIsGmraTransactionExposureRoundedAndTheSameOnBothLegs() {
        List<TradeState> legs = legs();
        BigDecimal raw = fn(RepoTransactionExposure.class).evaluate(legs.get(0), DAY, QTY, PRICE, RATIO);
        assertEquals(raw.setScale(0, RoundingMode.HALF_UP).compareTo(exposure(legs.get(0), PRICE)), 0);
        assertEquals(0, exposure(legs.get(0), PRICE).compareTo(exposure(legs.get(1), PRICE)));
        assertTrue(exposure(legs.get(0), PRICE).signum() > 0); // the securities fell: the seller owes
        assertEquals(0, new BigDecimal(4_920).compareTo(fn(CcpInitialMarginRequired.class).evaluate(new BigDecimal(98_400), new BigDecimal("0.05"))));
    }

    @Test
    void theSellerIsCalledForVariationAndInitialMarginTheBuyerOnlyForInitialMargin() {
        BigDecimal e = exposure(legs().get(0), PRICE);
        CcpMarginStatement a = load(CcpMarginStatement.class, statement("BANK-A", e, BigDecimal.ZERO, BigDecimal.ZERO, true));
        assertEquals("", failedText(a));
        assertEquals(2, a.getCall().size());
        assertEquals(0, a.getNetAmount().compareTo(e.add(new BigDecimal(4_920))));
        CcpMarginStatement b = load(CcpMarginStatement.class, statement("BANK-B", e, BigDecimal.ZERO, BigDecimal.ZERO, true));
        assertEquals("", failedText(b));
        assertEquals(1, b.getCall().size());
        assertEquals(0, b.getVariationMarginAmount().compareTo(e.negate()));
        // The next day with the initial margin posted and the variation margin paid: only the change is called.
        CcpMarginStatement next = load(CcpMarginStatement.class, statement("BANK-A", e.add(BigDecimal.TEN), e, new BigDecimal(4_920), true));
        assertEquals("", failedText(next));
        assertEquals(0, next.getNetAmount().compareTo(BigDecimal.TEN));
    }

    @Test
    void aStatementWithoutItsCallsOrWithTheWrongInitialMarginFails() {
        BigDecimal e = exposure(legs().get(0), PRICE);
        assertTrue(failedText(load(CcpMarginStatement.class, statement("BANK-A", e, BigDecimal.ZERO, BigDecimal.ZERO, false))).contains("VariationMarginCall"));
        Map<String, Object> wrong = statement("BANK-A", e, BigDecimal.ZERO, BigDecimal.ZERO, true);
        wrong.put("initialMarginRequired", new BigDecimal(4_000));
        assertTrue(failedText(load(CcpMarginStatement.class, wrong)).contains("InitialMarginRequired"));
        Map<String, Object> other = statement("BANK-T", e, BigDecimal.ZERO, BigDecimal.ZERO, true);
        assertTrue(failedText(load(CcpMarginStatement.class, other)).contains("MemberOnEachLine"));
    }

    // --- default ---

    static GmraDefaultTransactionValue value(TradeState leg, String price) {
        BigDecimal rp = fn(GmraDefaultRepurchasePrice.class).evaluate(leg, DAY, BigDecimal.ZERO, 0);
        BigDecimal dmv = fn(GmraDefaultMarketValue.class).evaluate(QTY, new BigDecimal(price), 0);
        String seller = null, buyer = null;
        for (var c : leg.getTrade().getCounterparty()) {
            String name = c.getPartyReference().getValue().getName().getValue();
            if (c.getRole() == cdm.base.staticdata.party.CounterpartyRoleEnum.PARTY_1) seller = name; else buyer = name;
        }
        return GmraDefaultTransactionValue.builder().setRepoId("REPO-1").setTermination(DefaultCloseOutTest.termination(leg, DAY))
                .setSeller(seller).setBuyer(buyer).setBuySellBack(false).setRepurchasePrice(rp).setSecurity(RepoTest.TUST)
                .setQuantity(QTY).setPrice(new BigDecimal(price)).setDefaultMarketValue(dmv).build();
    }

    static BigDecimal layer(BigDecimal loss, long before, long available) {
        return fn(CcpWaterfallLayer.class).evaluate(loss, new BigDecimal(before), new BigDecimal(available));
    }

    /** BANK-A, the seller, defaults; BANK-B is the survivor. */
    static Map<String, Object> management(String price, long vmPaid, long im, long contribution, long capital, long members) {
        List<TradeState> legs = legs();
        GmraDefaultTransactionValue d = value(legs.get(0), price), s = value(legs.get(1), price);
        BigDecimal residual = s.getRepurchasePrice().subtract(s.getDefaultMarketValue()).subtract(new BigDecimal(vmPaid));
        BigDecimal loss = residual; // the survivor is the buyer
        BigDecimal fromIm = layer(loss, 0, im), fromC = layer(loss, im, contribution), fromK = layer(loss, im + contribution, capital),
                fromM = layer(loss, im + contribution + capital, members);
        BigDecimal returned = loss.signum() < 0 ? new BigDecimal(im + contribution).subtract(loss)
                : new BigDecimal(im + contribution).subtract(fromIm).subtract(fromC);
        return o("rulebookHash", "0x" + "44".repeat(32), "ccp", ccp(), "defaulter", "BANK-A", "eventOfDefaultDate", "2026-11-10",
                "closeOutDate", "2026-11-10",
                "transaction", l(o("repoId", "REPO-1", "purchased", true, "defaulterLeg", fromJson(toJson(d)), "survivorLeg", fromJson(toJson(s)),
                        "survivor", "BANK-B", "variationMarginPaid", vmPaid, "residual", residual, "survivorAmount", residual)),
                "waterfall", o("loss", loss, "defaulterInitialMargin", im, "defaulterContribution", contribution, "ccpCapital", capital,
                        "membersContribution", members, "fromDefaulterInitialMargin", fromIm, "fromDefaulterContribution", fromC,
                        "fromCcpCapital", fromK, "fromMembersContribution", fromM, "returnedToDefaulter", returned));
    }

    @Test
    void aDefaultersLossIsCoveredInTheRulebooksOrder() {
        CcpDefaultManagement m = load(CcpDefaultManagement.class, management("90", 0, 4_920, 500_000, 250_000, 500_000));
        assertEquals("", failedText(m));
        var w = m.getWaterfall();
        assertTrue(w.getLoss().signum() > 0);
        assertEquals(0, w.getFromDefaulterInitialMargin().compareTo(new BigDecimal(4_920)));
        assertEquals(0, w.getFromDefaulterContribution().compareTo(w.getLoss().subtract(new BigDecimal(4_920))));
        assertEquals(0, w.getFromCcpCapital().signum());
        assertEquals(0, layer(new BigDecimal(800_000), 504_920, 250_000).compareTo(new BigDecimal(250_000)));
        assertEquals(0, layer(new BigDecimal(800_000), 754_920, 500_000).compareTo(new BigDecimal(45_080)));
    }

    @Test
    void aGainIsReturnedToTheDefaulterAndAWrongLayerFails() {
        CcpDefaultManagement gain = load(CcpDefaultManagement.class, management("100", 0, 4_920, 500_000, 250_000, 500_000));
        assertEquals("", failedText(gain));
        assertTrue(gain.getWaterfall().getLoss().signum() < 0);
        assertTrue(gain.getWaterfall().getReturnedToDefaulter().compareTo(new BigDecimal(504_920)) > 0);
        Map<String, Object> wrong = management("90", 0, 4_920, 500_000, 250_000, 500_000);
        @SuppressWarnings("unchecked") Map<String, Object> w = (Map<String, Object>) wrong.get("waterfall");
        w.put("fromCcpCapital", new BigDecimal(1));
        assertTrue(failedText(load(CcpDefaultManagement.class, wrong)).contains("InOrder"));
    }

    // --- admission and porting ---

    @Test
    void theCcpAdmitsAMemberWithItsAgreementAndShare() {
        Map<String, Object> member = o("party", party("BANK-T"), "defaultFundShare", o("value", 500_000, "unit", o("currency", o("@data", "USD"))),
                "agreement", o("agreementDate", "2026-11-10",
                        "legalAgreementIdentification", o("agreementName", o("agreementType", "Other", "otherAgreement", "CCP rulebook")),
                        "contractualParty", l(party("BANK-C"), party("BANK-T"))));
        Map<String, Object> doc = o("rulebookHash", "0x" + "44".repeat(32), "ccp", ccp(), "member", member, "admissionDate", "2026-11-10");
        assertEquals("", failedText(load(CcpAdmission.class, doc)));
        doc.put("member", o("party", party("BANK-C"), "defaultFundShare", member.get("defaultFundShare"), "agreement", member.get("agreement")));
        assertTrue(failedText(load(CcpAdmission.class, doc)).contains("MemberIsNotTheCcp"));
    }

    static BusinessEvent porting(TradeState leg, String from, String to) {
        String role = leg.getTrade().getCounterparty().stream()
                .filter(c -> from.equals(c.getPartyReference().getValue().getName().getValue())).findFirst().orElseThrow()
                .getRole().toDisplayString();
        PrimitiveInstruction pi = load(PrimitiveInstruction.class, o("partyChange", o("counterparty", o("role", role, "partyReference", party(to)),
                "tradeId", l(o("issuer", o("@data", "BANK-C"), "assignedIdentifier", l(o("identifier", o("@data", "REPO-1-S-P"))))))));
        var ib = Instruction.builder().setBeforeValue(leg).setPrimitiveInstruction(pi);
        new GlobalKeyProcessStep(NonNullHashCollector::new).runProcessStep(Instruction.class, ib);
        BusinessEvent ev = resolved(BusinessEvent.class, fn(Create_BusinessEvent.class)
                .evaluate(new ArrayList<>(List.of(ib.build())), EventIntentEnum.NOVATION, DAY, null));
        var b = ev.toBuilder();
        for (var a : b.getAfter())
            if (a.getState() != null && a.getState().getClosedState() != null) a.getState().getClosedState().setActivityDate(DAY);
        return b.build();
    }

    static Map<String, Object> portingDoc(BusinessEvent ev, long vmPaid, BigDecimal payment) {
        TradeState leg = legs().get(0);
        BigDecimal rp = fn(GmraDefaultRepurchasePrice.class).evaluate(leg, DAY, BigDecimal.ZERO, 0);
        BigDecimal mv = fn(GmraDefaultMarketValue.class).evaluate(QTY, PRICE, 0);
        return o("rulebookHash", "0x" + "44".repeat(32), "repoId", "REPO-1", "ccp", ccp(), "fromMember", "BANK-A", "toMember", "BANK-T",
                "seller", true, "portingDate", "2026-11-10", "porting", fromJson(toJson(ev)), "quantity", QTY, "price", PRICE,
                "marketValue", mv, "repurchasePrice", rp, "variationMarginPaid", vmPaid,
                "payment", payment != null ? payment : mv.subtract(rp).add(new BigDecimal(vmPaid)));
    }

    @Test
    void theSellersLegMovesToAnotherMemberByCdmsPartyChangeWithTheNovationIntent() {
        BusinessEvent ev = porting(legs().get(0), "BANK-A", "BANK-T");
        CcpPorting p = load(CcpPorting.class, portingDoc(ev, 2_000, null));
        assertEquals("", failedText(p));
        assertFalse(fn(Qualify_Novation.class).evaluate(ev)); // as the CDM check found
        assertTrue(failedText(load(CcpPorting.class, portingDoc(ev, 2_000, BigDecimal.ONE))).contains("Payment"));
        assertTrue(failedText(load(CcpPorting.class, portingDoc(porting(legs().get(0), "BANK-A", "BANK-X"), 2_000, null))).contains("ReceivingMemberOnTheLeg"));
    }
}
