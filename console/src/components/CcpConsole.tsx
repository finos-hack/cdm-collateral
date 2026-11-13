// CCP membership (task-ccp-membership, wp-adr-ccp-membership). The CCP BANK-C publishes its rulebook (cdm-ext
// CcpRulebook) and pays its capital from its own console (route #/live/C); BANK-A and BANK-B see the same card in their
// live consoles, check the rulebook against their own build, and join by paying their default fund share or leave.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ccpApi,
  serviceUrl,
  type LiveCcp,
  type LiveCcpClearing,
  type LiveCcpDefaults,
  type LiveCcpMargin,
  type ServiceParty,
} from "../domain/liveApi";

const usd = (n: number) => n.toLocaleString("en-US");
const short = (h: string) => (h.length > 14 ? `${h.slice(0, 8)}…${h.slice(-4)}` : h);

/** One repo submitted for clearing, with the steps open to the reading party (wp-adr-ccp-clearing). */
function ClearingRow({ party, c, busy, run }: { party: ServiceParty; c: LiveCcpClearing; busy: boolean; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const mine = c.role === "seller" ? c.sellerInstructed : c.role === "buyer" ? c.buyerInstructed : false;
  return (
    <div className="subcard" data-testid={`ccp-clearing-${c.repoId}`}>
      <div className="small">
        <span className="mono">{short(c.repoId)}</span> · BANK-{c.seller} sells {c.quantity.toLocaleString("en-US")} {c.security} to BANK-{c.buyer} for{" "}
        {usd(c.purchasePrice)} tUSD · <b data-testid="ccp-clearing-state">{c.state}</b> ·{" "}
        {c.verified ? <span className="ok">novation checked</span> : <span className="bad" data-testid="ccp-clearing-problem">{c.problem}</span>}
      </div>
      {c.legs && (
        <div className="small" data-testid="ccp-clearing-legs">
          legs: {c.legs.map((l) => `${l.seller} → ${l.buyer}`).join(", ")}
          {c.cleared !== undefined && <> · CDM cleared trade: {c.cleared ? "yes" : "no"}</>}
          {c.repurchaseDate && <> · Repurchase Date {c.repurchaseDate}</>}
        </div>
      )}
      {(c.state === "cleared" || c.state === "purchased") && (
        <div className="small">
          {c.phase}: BANK-{c.seller} {c.sellerInstructed ? "instructed" : "not instructed"}, BANK-{c.buyer} {c.buyerInstructed ? "instructed" : "not instructed"}
          {mine && " · waiting for the other member"}
          {c.vmBalance !== undefined && c.vmBalance !== 0 && <> · variation margin paid {usd(Math.abs(c.vmBalance))} tUSD by BANK-{c.vmBalance > 0 ? c.seller : c.buyer}</>}
        </div>
      )}
      {c.porting && (
        <div className="small" data-testid="ccp-porting">
          porting BANK-{c.porting.from} → BANK-{c.porting.to} · payment {usd(c.porting.payment)} tUSD · <b data-testid="ccp-porting-state">{c.porting.state}</b> ·{" "}
          {c.porting.verified ? <span className="ok">porting checked</span> : <span className="bad" data-testid="ccp-porting-problem">{c.porting.problem}</span>}
        </div>
      )}
      <div className="row">
        {c.canAffirm && <button disabled={busy} onClick={() => run(() => ccpApi.affirmClearing(party, c.repoId))}>Affirm the submission</button>}
        {c.canAccept && <button disabled={busy} onClick={() => run(() => ccpApi.acceptClearing(party, c.repoId))}>Accept for clearing</button>}
        {c.canRefuse && <button disabled={busy} onClick={() => run(() => ccpApi.refuseClearing(party, c.repoId, "refused by the CCP"))}>Refuse</button>}
        {c.canInstruct && (
          <button disabled={busy} onClick={() => run(() => ccpApi.instructCleared(party, c.repoId))}>
            Instruct the {c.phase} of my leg
          </button>
        )}
        {(c.canPortTo ?? []).map((to) => (
          <button key={to} disabled={busy} onClick={() => run(() => ccpApi.requestPorting(party, c.repoId, to))}>Port my leg to BANK-{to}</button>
        ))}
        {c.canAcceptPorting && <button disabled={busy} onClick={() => run(() => ccpApi.acceptPorting(party, c.repoId))}>Accept the porting</button>}
        {c.canApprovePorting && <button disabled={busy} onClick={() => run(() => ccpApi.approvePorting(party, c.repoId))}>Approve the porting</button>}
        {c.canRefusePorting && <button disabled={busy} onClick={() => run(() => ccpApi.refusePorting(party, c.repoId))}>Refuse the porting</button>}
      </div>
    </div>
  );
}

/** Margin rounds and member defaults (wp-adr-ccp-margin, wp-adr-ccp-default); reloaded whenever the card's data is. */
function CcpRisk({ party, ccp, busy, run }: { party: ServiceParty; ccp: LiveCcp; busy: boolean; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [margin, setMargin] = useState<LiveCcpMargin | null>(null);
  const [defaults, setDefaults] = useState<LiveCcpDefaults | null>(null);
  useEffect(() => {
    let live = true;
    ccpApi.margin(party).then((m) => live && setMargin(m && Array.isArray(m.rounds) ? m : null)).catch(() => live && setMargin(null));
    ccpApi.defaults(party).then((d) => live && setDefaults(d && Array.isArray(d.members) ? d : null)).catch(() => live && setDefaults(null));
    return () => {
      live = false;
    };
  }, [party, ccp]);
  return (
    <div>
      {margin && (margin.rounds.length > 0 || margin.preview || margin.previewProblem) && (
        <div data-testid="ccp-margin">
          <h4>Margin · business date {margin.businessDate}</h4>
          {margin.preview && margin.preview.length > 0 && (
            <div className="small" data-testid="ccp-margin-preview">
              today: {margin.preview.map((x) => `BANK-${x.party} VM ${usd(x.vm)} IM ${usd(x.im)} net ${usd(x.net)}`).join(" · ")}
            </div>
          )}
          {margin.previewProblem && <div className="bad small">{margin.previewProblem}</div>}
          {margin.canIssue && (
            <div className="row">
              <button disabled={busy} onClick={() => run(() => ccpApi.issueMargin(party))}>Issue today's margin calls</button>
            </div>
          )}
          {margin.rounds.map((r) => (
            <div className="subcard" key={r.roundId} data-testid={`ccp-round-${r.roundId}`}>
              <div className="small">
                round <span className="mono">{short(r.roundId)}</span> · {r.businessDate} · <b data-testid="ccp-round-state">{r.state}</b> ·{" "}
                {r.members.map((m) => `BANK-${m.party} net ${usd(m.net)}${m.paid ? " paid" : ""}`).join(", ")}
              </div>
              {r.mine && (
                <div className="small" data-testid="ccp-round-mine">
                  my statement: {r.mine.vm !== undefined && <>VM {usd(r.mine.vm)} · </>}{r.mine.im !== undefined && <>IM {usd(r.mine.im)} · </>}net {usd(r.mine.net)}
                  {r.mine.calls && r.mine.calls.length > 0 && <> · CDM calls {r.mine.calls.join(", ")}</>} ·{" "}
                  {r.mine.verified ? <span className="ok">statement checked</span> : <span className="bad" data-testid="ccp-round-problem">{r.mine.problem}</span>}
                </div>
              )}
              <div className="row">
                {r.mine?.canPay && <button disabled={busy} onClick={() => run(() => ccpApi.payMargin(party, r.roundId))}>Pay my margin</button>}
                {r.canCancel && <button disabled={busy} onClick={() => run(() => ccpApi.cancelMargin(party, r.roundId))}>Cancel the round</button>}
              </div>
            </div>
          ))}
        </div>
      )}
      {defaults && (defaults.defaults.length > 0 || defaults.members.some((m) => m.canDeclare)) && (
        <div data-testid="ccp-defaults">
          <h4>Member default</h4>
          <div className="row">
            {defaults.members.filter((m) => m.canDeclare).map((m) => (
              <button key={m.party} disabled={busy} onClick={() => run(() => ccpApi.declareDefault(party, m.party))}>
                Declare the default of BANK-{m.party} and close out
              </button>
            ))}
          </div>
          {defaults.defaults.map((d) => (
            <div className="subcard" key={d.closeOutHash} data-testid={`ccp-default-${d.defaulter}`}>
              <div className="small">
                BANK-{d.defaulter} closed out{d.closeOutDate && <> on {d.closeOutDate}</>} · loss {usd(d.loss)} tUSD · from its IM {usd(d.fromInitialMargin)}, its
                contribution {usd(d.fromDefaulterFund)}, CCP capital {usd(d.fromCapital)}, members {usd(d.fromMembersFund)} · returned {usd(d.returned)} ·{" "}
                {d.verified ? <span className="ok">close-out checked</span> : <span className="bad" data-testid="ccp-default-problem">{d.problem}</span>}
              </div>
              {d.transactions && (
                <div className="small" data-testid="ccp-default-survivors">
                  {d.transactions.map((t) => `${t.survivor} ${t.survivorAmount >= 0 ? "paid" : "owes"} ${usd(Math.abs(t.survivorAmount))}`).join(", ")}
                </div>
              )}
              {d.due.length > 0 && <div className="small">still owed to BANK-C: {d.due.map((x) => `BANK-${x.party} ${usd(x.amount)}`).join(", ")}</div>}
              {d.canPayDue && (
                <div className="row">
                  <button disabled={busy} onClick={() => run(() => ccpApi.payDefaultDue(party, d.closeOutHash))}>Pay the {usd(d.mineDue)} tUSD I owe on the close-out</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CcpCard({ party, ccp, clearings = [], clearable = [], busy, run }: {
  party: ServiceParty;
  ccp: LiveCcp;
  /** The clearings this party is named in. */
  clearings?: LiveCcpClearing[];
  /** This party's affirmed repos as seller that it may submit for clearing. */
  clearable?: { repoId: string; security: string; purchasePrice: string }[];
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const r = ccp.rulebook;
  return (
    <div className="card" data-testid="ccp-card">
      <h3>{ccp.ccp ? "CCP rulebook (CCP)" : "CCP membership"}</h3>
      {!r && (
        <div className="small">
          No rulebook published by BANK-C.
          {ccp.canPublish && (
            <div className="row">
              <button disabled={busy} onClick={() => run(() => ccpApi.publishRulebook(party))}>Publish the rulebook and pay the capital</button>
            </div>
          )}
        </div>
      )}
      {r && (
        <div>
          <div className="small">
            Rulebook <span className="mono">{short(r.rulebookHash)}</span> · <b data-testid="ccp-state">{r.state}</b> ·{" "}
            {r.verified ? <span className="ok">checked</span> : <span className="bad" data-testid="ccp-problem">{r.problem}</span>}
          </div>
          {r.rulebook && (
            <div className="small" data-testid="ccp-terms">
              {r.rulebook.ccp} as {r.rulebook.role} · initial margin {(Number(r.rulebook.initialMarginRate) * 100).toFixed(2)}% of the cash
              amount · variation margin every {r.rulebook.variationMarginPeriodDays} business day(s) · effective {r.rulebook.effectiveDate}
            </div>
          )}
          <div className="small" data-testid="ccp-fund">
            Capital {usd(r.capital)} tUSD · default fund paid in {usd(r.fund)} tUSD
            {r.rulebook && <> of {usd(r.rulebook.defaultFund)}</>}
          </div>
          <table>
            <thead>
              <tr><th>Member</th><th>Share (tUSD)</th><th>Paid</th><th>Contributed</th><th>IM held</th></tr>
            </thead>
            <tbody>
              {r.members.map((m) => (
                <tr key={m.bank} data-testid={`ccp-member-${m.party}`}>
                  <td>{m.bank}{m.admitted && " (admitted)"}</td><td>{usd(m.share)}</td><td>{m.paid ? "yes" : "no"}</td>
                  <td>{usd(m.contributed ?? 0)}</td><td>{usd(m.imHeld ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {r.state === "Effective" && clearable.length > 0 && (
            <div className="small">
              {clearable.map((x) => (
                <div className="row" key={x.repoId} data-testid={`ccp-clearable-${x.repoId}`}>
                  <span className="mono">{short(x.repoId)}</span> {x.security} for {usd(Number(x.purchasePrice))} tUSD
                  <button disabled={busy} onClick={() => run(() => ccpApi.submitClearing(party, x.repoId))}>Submit to BANK-C for clearing</button>
                </div>
              ))}
            </div>
          )}
          {clearings.length > 0 && (
            <div>
              <h4>Clearing</h4>
              {clearings.map((c) => <ClearingRow key={c.repoId} party={party} c={c} busy={busy} run={run} />)}
            </div>
          )}
          {r.state === "Effective" && <CcpRisk party={party} ccp={ccp} busy={busy} run={run} />}
          <div className="row">
            {(r.canAdmit ?? []).map((x) => (
              <button key={x} disabled={busy} onClick={() => run(() => ccpApi.admit(party, x))}>Admit BANK-{x} as a member</button>
            ))}
            {r.canJoin && <button disabled={busy} onClick={() => run(() => ccpApi.join(party))}>Affirm the rulebook and pay the share</button>}
            {r.canLeave && <button disabled={busy} onClick={() => run(() => ccpApi.leave(party))}>Leave and get the share back</button>}
          </div>
        </div>
      )}
    </div>
  );
}

/** The CCP BANK-C's console (route #/live/C). */
export function CcpConsole() {
  const [health, setHealth] = useState<{ address: string; role: string } | null>(null);
  const [ccp, setCcp] = useState<LiveCcp | null>(null);
  const [clearings, setClearings] = useState<LiveCcpClearing[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const live = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const c = await ccpApi.ccp("C");
      const cl = await ccpApi.clearings("C").catch(() => ({ clearings: [] as LiveCcpClearing[] }));
      if (live.current) {
        setCcp(c);
        setClearings(Array.isArray(cl?.clearings) ? cl.clearings : []);
        setError(null);
      }
    } catch (e) {
      if (live.current) setError(`service C unreachable: ${(e as Error).message}`);
    }
  }, []);

  useEffect(() => {
    live.current = true;
    ccpApi.health("C").then(setHealth).catch((e) => setError((e as Error).message));
    refresh();
    const es = new EventSource(serviceUrl("C") + "/api/v1/events");
    const onStep = () => refresh();
    es.addEventListener("step", onStep);
    const fallback = setInterval(refresh, 10000);
    return () => {
      live.current = false;
      es.removeEventListener("step", onStep);
      es.close();
      clearInterval(fallback);
    };
  }, [refresh]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!health) return <div className="card">Connecting to the C workflow service… {error && <span className="bad">{error}</span>}</div>;
  return (
    <div>
      <div className="card">
        <h3>BANK-C · {health.role}</h3>
        <div className="mono small">{health.address}</div>
        {error && <div className="bad" data-testid="ccp-error">{error}</div>}
      </div>
      {ccp && <CcpCard party="C" ccp={ccp} clearings={clearings} busy={busy} run={run} />}
    </div>
  );
}
