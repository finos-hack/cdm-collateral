package cdmx;

import cdm.event.common.TransferState;
import cdm.event.common.TransferStatusEnum;
import cdm.event.common.UnscheduledTransfer;
import cdmx.collateral.event.CollateralEvent;
import cdmx.collateral.event.functions.Create_CollateralEvent;
import cdmx.collateral.margincall.IssueCallInstruction;
import cdmx.collateral.margincall.MarginCallState;
import com.rosetta.model.lib.records.Date;
import org.junit.jupiter.api.Test;

import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static cdmx.Cdm.*;
import static cdmx.Data.*;
import static org.junit.jupiter.api.Assertions.*;

/** Margin call events (G1) with qualification and CDM transfers on settlement (G4). Port of tests/test_event.py. */
class EventTest {
    static final ZonedDateTime T0 = ZonedDateTime.of(2026, 10, 16, 9, 0, 0, 0, ZoneOffset.UTC);
    static final Date D0 = Date.of(2026, 10, 16);

    /** Applies steps in order as events, as a workflow service would, and keeps them. */
    static class Events {
        final List<CollateralEvent> events = new ArrayList<>();

        MarginCallState state() {
            return events.isEmpty() ? null : events.get(events.size() - 1).getAfter();
        }

        Events apply(String step, Object value) {
            int n = events.size() + 1;
            events.add(fn(Create_CollateralEvent.class).evaluate(state(), "S-" + n, D0, T0.plusMinutes(n), instruction(step, value)));
            return this;
        }

        CollateralEvent last() {
            return events.get(events.size() - 1);
        }

        List<String> qualifiers() {
            return events.stream().map(CollateralEvent::getEventQualifier).collect(Collectors.toList());
        }
    }

    static Events issued(Number amount, String direction, String caller) {
        return new Events().apply("issue", o("issuance", issuanceDoc(amount, caller), "direction", direction));
    }

    /** payer, receiver, quantity, ISIN, settlement date, status of a TransferState. */
    static List<String> leg(TransferState t) {
        UnscheduledTransfer u = t.getTransfer().getUnscheduledTransfer();
        return List.of(
            u.getPayerReceiver().getPayerPartyReference().getValue().getPartyId().get(0).getIdentifier().getValue(),
            u.getPayerReceiver().getReceiverPartyReference().getValue().getPartyId().get(0).getIdentifier().getValue(),
            u.getQuantity().getValue().stripTrailingZeros().toPlainString(),
            u.getAsset().getInstrument().getSecurity().getIdentifier().get(0).getIdentifier().getValue(),
            u.getSettlementDate().getAdjustedDate().getValue().toString(),
            t.getTransferStatus().name());
    }

    @Test
    void deliveryEventsAndTransfer() {  // console scenario im-call
        Events e = issued(12_400_000, "Delivery", "BANK-B").apply("respond", responseDoc("AgreeinFull", 12_400_000)).apply("propose", proposalDoc());
        e.apply("decide", o("proposalId", "P-1", "accept", true)).apply("settle", o("proposalId", "P-1"));
        assertEquals(List.of("MarginCallIssued", "MarginCallAgreed", "CollateralProposed", "CollateralProposalAccepted", "CollateralDelivered"), e.qualifiers());
        for (CollateralEvent ev : e.events.subList(0, 4)) assertTrue(ev.getTransfer() == null || ev.getTransfer().isEmpty());  // absent list: null
        assertEquals(List.of(List.of("BANK-A", "BANK-B", "128589", "XS0000TUST01", "2026-10-16", "SETTLED")),
            e.last().getTransfer().stream().map(EventTest::leg).collect(Collectors.toList()));
        assertEquals(TransferStatusEnum.SETTLED, e.last().getTransfer().get(0).getTransferStatus());
        assertNull(e.events.get(0).getBefore());
        for (int i = 1; i < e.events.size(); i++) assertEquals(e.events.get(i - 1).getAfter(), e.events.get(i).getBefore());
        for (CollateralEvent ev : e.events) assertEquals("", failedText(ev));  // all conditions, CDM's included
        writeInterop("settled-event.json", e.last());
    }

    /** Writes Rune JSON for the cross-language check (cdm-ext/README.md, Java build). */
    static void writeInterop(String name, Object o) {
        try {
            java.nio.file.Path dir = java.nio.file.Path.of("target", "interop");
            java.nio.file.Files.createDirectories(dir);
            java.nio.file.Files.writeString(dir.resolve(name), toJson(o));
        } catch (java.io.IOException ex) {
            throw new java.io.UncheckedIOException(ex);
        }
    }

    @Test
    void partialAgreementAndRejectionAreQualified() {  // console scenario im-dispute
        Events e = issued(12_400_000, "Delivery", "BANK-B").apply("respond", responseDoc("PartiallyAgree", 11_900_000));
        e.apply("propose", proposalDoc("P-1", 11_900_001)).apply("decide", o("proposalId", "P-1", "accept", false, "reason", "limit"));
        assertEquals(List.of("MarginCallPartiallyAgreed", "CollateralProposed", "CollateralProposalRejected"), e.qualifiers().subList(1, 4));
    }

    @Test
    void disputeIsQualified() {
        assertEquals("MarginCallDisputed",
            issued(12_400_000, "Delivery", "BANK-B").apply("respond", responseDoc("Dispute", 0)).last().getEventQualifier());
    }

    @Test
    void returnTransfersGoFromSecuredPartyToPledgor() {  // console scenario im-return
        Events e = issued(4_300_000, "Return", "BANK-A").apply("respond", responseDoc("AgreeinFull", 4_300_000, "Return", 128_589));
        e.apply("settle", o("releasedValue", money(4_299_999), "releasedCollateral", l(position(44_000), position(1_000, "XS0000TMMF01"))));
        assertEquals("CollateralReturned", e.last().getEventQualifier());
        assertEquals(List.of(List.of("BANK-B", "BANK-A", "44000", "XS0000TUST01"), List.of("BANK-B", "BANK-A", "1000", "XS0000TMMF01")),
            e.last().getTransfer().stream().map(t -> leg(t).subList(0, 4)).collect(Collectors.toList()));
    }

    @Test
    void callMustNamePledgorAndSecuredParty() {
        Map<String, Object> doc = issuanceDoc(12_400_000, "BANK-B");
        doc.put("partyRole", l(((List<?>) callBase("C-0001", "BANK-B").get("partyRole")).get(0)));
        IssueCallInstruction issue = load(IssueCallInstruction.class, o("issuance", doc, "direction", "Delivery"));
        assertTrue(failedText(issue).contains("PledgorAndSecuredParty"), failedText(issue));
    }
}
