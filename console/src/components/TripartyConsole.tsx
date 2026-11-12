// Triparty terms (task-triparty-terms-profile, wp-adr-triparty-terms-profile). A and B see a "Triparty terms" card in
// their live console; the agent BANK-T has its own console (route #/live/T) with the same card. The giver proposes the
// baseline terms with the counterparty as the receiver and BANK-T as the agent; the receiver and the agent each affirm
// them after their service has checked the document; the giver or the receiver terminates terms in effect.
import { useCallback, useEffect, useRef, useState } from "react";
import { serviceUrl, tripartyApi, type LiveTriparty, type LiveTripartyTerms, type TripartyParty } from "../domain/liveApi";

const short = (h: string) => (h.length > 12 ? `${h.slice(0, 8)}…${h.slice(-4)}` : h);
const bank = (p: TripartyParty) => (p === "T" ? "BANK-T" : `BANK-${p}`);

function TermsRow(props: { party: TripartyParty; t: LiveTripartyTerms; busy: boolean; run: (fn: () => Promise<unknown>) => void }) {
  const { party, t, busy, run } = props;
  const affirmed = (p: TripartyParty) => (p === t.giver ? "proposed" : p === t.receiver ? (t.receiverAffirmed ? "affirmed" : "not yet") : t.agentAffirmed ? "affirmed" : "not yet");
  return (
    <div className="card" data-testid={`triparty-terms-${t.termsId}`} data-state={t.state}>
      <div className="row">
        <span data-testid="triparty-state">
          {t.state === "effective" ? <span className="ok">in effect on-chain ✓</span> : t.state}
        </span>
        <span className="mono small">terms {short(t.termsId)} · hash {short(t.termsHash)}</span>
        <span data-testid="triparty-verified">
          {t.verified ? <span className="ok">terms checked against this party's own build ✓</span> : <span className="bad">{t.problem ?? "terms do not check"}</span>}
        </span>
      </div>
      <div className="small">
        giver {bank(t.giver)} ({affirmed(t.giver)}) · receiver {bank(t.receiver)} ({affirmed(t.receiver)}) · agent {bank(t.agent)} ({affirmed(t.agent)})
      </div>
      {t.terms && (
        <>
          <div className="small">
            Base Currency {t.terms.baseCurrency} · effective {t.terms.effectiveDate} · GMRA terms <span className="mono">{short(t.terms.gmraTermsHash)}</span>
          </div>
          <table className="tbl" data-testid="triparty-profile">
            <thead>
              <tr><th>Profile asset</th><th>Eligible</th><th>Haircut</th><th>Concentration limit</th></tr>
            </thead>
            <tbody>
              {t.terms.profile.map((e) => (
                <tr key={e.isin} data-testid={`triparty-profile-${e.token ?? e.isin}`}>
                  <td>{e.token ?? ""} <span className="mono small">{e.isin}</span></td>
                  <td>{e.eligible ? "yes" : "no"}</td>
                  <td>{e.haircutBps === null ? "—" : `${(e.haircutBps / 100).toFixed(2)}%`}</td>
                  <td>{e.concentrationLimit === null ? "none" : `at most ${Math.round(Number(e.concentrationLimit) * 100)}% of the allocated value`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <div className="row">
        {t.canAffirm && <button disabled={busy} onClick={() => run(() => tripartyApi.affirmTripartyTerms(party, t.termsId))}>Affirm triparty terms</button>}
        {t.canRefuse && <button disabled={busy} onClick={() => run(() => tripartyApi.refuseTripartyTerms(party, t.termsId))}>{party === t.giver ? "Withdraw triparty terms" : "Refuse triparty terms"}</button>}
        {t.canTerminate && <button disabled={busy} onClick={() => run(() => tripartyApi.terminateTripartyTerms(party, t.termsId))}>Terminate triparty terms</button>}
      </div>
    </div>
  );
}

/** The triparty terms this party is named in: the open set first, earlier sets below. */
export function TripartyTermsCard(props: { party: TripartyParty; triparty: LiveTriparty; busy: boolean; run: (fn: () => Promise<unknown>) => void }) {
  const { party, triparty: tp, busy, run } = props;
  const open = tp.terms.filter((t) => t.state === "proposed" || t.state === "effective");
  const earlier = tp.terms.filter((t) => t.state !== "proposed" && t.state !== "effective");
  return (
    <div className="card" data-testid="triparty">
      <h3>{tp.agent ? "Triparty (agent)" : "Triparty terms"}</h3>
      <div className="small">cdm-ext TripartyTerms over a GMRA repo; the profile is CDM's EligibleCollateralSpecification; held on TripartySettlement</div>
      {party !== "T" && (
        <div className="row">
          <button disabled={busy || !tp.canPropose} onClick={() => run(() => tripartyApi.proposeTripartyTerms(party))}>
            Propose triparty terms (giver {bank(party)}, agent BANK-T)
          </button>
        </div>
      )}
      {open.length === 0 && <div className="small" data-testid="triparty-none">No triparty terms proposed or in effect.</div>}
      {open.map((t) => <TermsRow key={t.termsId} party={party} t={t} busy={busy} run={run} />)}
      {earlier.length > 0 && (
        <table className="tbl" data-testid="triparty-earlier">
          <thead>
            <tr><th>Earlier terms</th><th>Giver</th><th>Receiver</th><th>State</th></tr>
          </thead>
          <tbody>
            {earlier.map((t) => (
              <tr key={t.termsId}><td className="mono">{short(t.termsId)}</td><td>{t.giver}</td><td>{t.receiver}</td><td>{t.state}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** The triparty agent BANK-T's console (route #/live/T). */
export function AgentConsole() {
  const [health, setHealth] = useState<{ address: string; role: string } | null>(null);
  const [triparty, setTriparty] = useState<LiveTriparty | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const live = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const tp = await tripartyApi.triparty("T");
      if (live.current) {
        setTriparty(tp);
        setError(null);
      }
    } catch (e) {
      if (live.current) setError(`service T unreachable: ${(e as Error).message}`);
    }
  }, []);

  useEffect(() => {
    live.current = true;
    tripartyApi.health("T").then(setHealth).catch((e) => setError((e as Error).message));
    refresh();
    const es = new EventSource(serviceUrl("T") + "/api/v1/events");
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

  if (!health) return <div className="card">Connecting to the T workflow service… {error && <span className="bad">{error}</span>}</div>;
  return (
    <div>
      <div className="card">
        <h3>BANK-T · {health.role}</h3>
        <div className="mono small">{health.address}</div>
        {error && <div className="bad" data-testid="agent-error">{error}</div>}
      </div>
      {triparty && <TripartyTermsCard party="T" triparty={triparty} busy={busy} run={run} />}
    </div>
  );
}
