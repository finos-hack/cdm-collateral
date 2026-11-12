// CCP membership (task-ccp-membership, wp-adr-ccp-membership). The CCP BANK-C publishes its rulebook (cdm-ext
// CcpRulebook) and pays its capital from its own console (route #/live/C); BANK-A and BANK-B see the same card in their
// live consoles, check the rulebook against their own build, and join by paying their default fund share or leave.
import { useCallback, useEffect, useRef, useState } from "react";
import { ccpApi, serviceUrl, type LiveCcp, type LiveCcpClearing, type ServiceParty } from "../domain/liveApi";

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
      </div>
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
              <tr><th>Member</th><th>Share (tUSD)</th><th>Paid</th></tr>
            </thead>
            <tbody>
              {r.members.map((m) => (
                <tr key={m.bank} data-testid={`ccp-member-${m.party}`}>
                  <td>{m.bank}</td><td>{usd(m.share)}</td><td>{m.paid ? "yes" : "no"}</td>
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
          <div className="row">
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
