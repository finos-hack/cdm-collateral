package cdmx;

import cdmx.collateral.ccp.CcpRulebook;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static cdmx.Cdm.*;
import static cdmx.Data.money;
import static org.junit.jupiter.api.Assertions.*;

/** The CCP rulebook (task-ccp-membership, wp-adr-ccp-membership): BANK-C clears for BANK-A and BANK-B with a 5% initial
 *  margin, daily variation margin, a 1,000,000 USD default fund of two 500,000 shares and 250,000 USD of its own capital. */
class CcpRulebookTest {
    static Map<String, Object> party(String name) {
        return o("partyId", l(o("identifier", o("@data", name))), "name", o("@data", name));
    }

    static Map<String, Object> rulebookDoc(String ccp, String role, List<String> members, List<Long> shares, long fund, String other) {
        Object[] member = new Object[members.size()];
        for (int i = 0; i < members.size(); i++)
            member[i] = o("party", party(members.get(i)), "defaultFundShare", money(shares.get(i)),
                    "agreement", o("agreementDate", "2026-11-12",
                            "legalAgreementIdentification", o("agreementName", o("agreementType", "Other", "otherAgreement", other)),
                            "contractualParty", l(party(ccp), party(members.get(i)))));
        return o("ccp", o("partyReference", party(ccp), "role", role),
                "member", l(member), "baseCurrency", "USD", "initialMarginRate", 0.05, "variationMarginPeriodDays", 1,
                "defaultFund", money(fund), "ccpCapital", money(250_000), "effectiveDate", "2026-11-12");
    }

    static Map<String, Object> baseline() {
        return rulebookDoc("BANK-C", "ClearingOrganization", List.of("BANK-A", "BANK-B"), List.of(500_000L, 500_000L), 1_000_000, "CCP rulebook");
    }

    @Test
    void theBaselineRulebookIsValidAndSerialisesTheSame() {
        CcpRulebook r = load(CcpRulebook.class, baseline());
        assertEquals("", failedText(r));
        assertEquals(2, r.getMember().size());
        assertEquals(toJson(r), toJson(load(CcpRulebook.class, baseline())));
    }

    @Test
    void theRulebookRefusesSharesThatMissTheFund() {
        assertTrue(failedText(load(CcpRulebook.class, rulebookDoc("BANK-C", "ClearingOrganization", List.of("BANK-A", "BANK-B"),
                List.of(500_000L, 400_000L), 1_000_000, "CCP rulebook"))).contains("SharesMakeTheFund"));
    }

    @Test
    void theRulebookRefusesTheCcpAsAMemberARepeatedMemberAnotherRoleOrAnotherAgreement() {
        assertTrue(failedText(load(CcpRulebook.class, rulebookDoc("BANK-C", "ClearingOrganization", List.of("BANK-A", "BANK-C"),
                List.of(500_000L, 500_000L), 1_000_000, "CCP rulebook"))).contains("MembersAreNotTheCcp"));
        assertTrue(failedText(load(CcpRulebook.class, rulebookDoc("BANK-C", "ClearingOrganization", List.of("BANK-A", "BANK-A"),
                List.of(500_000L, 500_000L), 1_000_000, "CCP rulebook"))).contains("DistinctMembers"));
        assertTrue(failedText(load(CcpRulebook.class, rulebookDoc("BANK-C", "TripartyAgent", List.of("BANK-A", "BANK-B"),
                List.of(500_000L, 500_000L), 1_000_000, "CCP rulebook"))).contains("CcpRole"));
        assertTrue(failedText(load(CcpRulebook.class, rulebookDoc("BANK-C", "ClearingOrganization", List.of("BANK-A", "BANK-B"),
                List.of(500_000L, 500_000L), 1_000_000, "Clearing agreement"))).contains("RulebookAgreement"));
    }

    @Test
    void eachMembersAgreementNamesTheCcpAndTheMember() {
        Map<String, Object> other = baseline();
        @SuppressWarnings("unchecked") Map<String, Object> first = (Map<String, Object>) ((List<Object>) other.get("member")).get(0);
        @SuppressWarnings("unchecked") Map<String, Object> agreement = (Map<String, Object>) first.get("agreement");
        agreement.put("contractualParty", l(party("BANK-X"), party("BANK-A")));
        assertTrue(failedText(load(CcpRulebook.class, other)).contains("CcpIsAContractualParty"));
        agreement.put("contractualParty", l(party("BANK-C"), party("BANK-X")));
        assertTrue(failedText(load(CcpRulebook.class, other)).contains("MemberIsAContractualParty"));
    }

    @Test
    void theRulebookRefusesARateOutsideZeroToOneAndAShareInAnotherCurrency() {
        Map<String, Object> rate = baseline();
        rate.put("initialMarginRate", 1.5);
        assertTrue(failedText(load(CcpRulebook.class, rate)).contains("PositiveRateAndAmounts"));
        Map<String, Object> ccy = baseline();
        @SuppressWarnings("unchecked") Map<String, Object> first = (Map<String, Object>) ((List<Object>) ccy.get("member")).get(0);
        first.put("defaultFundShare", money(500_000, "EUR"));
        assertTrue(failedText(load(CcpRulebook.class, ccy)).contains("OneCurrency"));
    }
}
