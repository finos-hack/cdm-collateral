// CCP membership (task-ccp-membership, wp-adr-ccp-membership). The CCP BANK-C publishes its rulebook (cdm-ext
// CcpRulebook) and pays its capital from its own console (route #/live/C); BANK-A and BANK-B see the same card in their
// live consoles, check the rulebook against their own build, and join by paying their default fund share or leave.
import { useCallback, useEffect, useRef, useState } from "react";
import { ccpApi, serviceUrl, type LiveCcp, type ServiceParty } from "../domain/liveApi";

const usd = (n: number) => n.toLocaleString("en-US");
const short = (h: string) => (h.length > 14 ? `${h.slice(0, 8)}…${h.slice(-4)}` : h);

export function CcpCard({ party, ccp, busy, run }: {
  party: ServiceParty;
  ccp: LiveCcp;
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const live = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const c = await ccpApi.ccp("C");
      if (live.current) {
        setCcp(c);
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
      {ccp && <CcpCard party="C" ccp={ccp} busy={busy} run={run} />}
    </div>
  );
}
