// Triparty terms (task-triparty-terms-profile, wp-adr-triparty-terms-profile). A and B see a "Triparty terms" card in
// their live console; the agent BANK-T has its own console (route #/live/T) with the same card. The giver proposes the
// baseline terms with the counterparty as the receiver and BANK-T as the agent; the receiver and the agent each affirm
// them after their service has checked the document; the giver or the receiver terminates terms in effect.
//
// Trade start (task-triparty-trade-start, wp-adr-triparty-trade-start): under terms in effect the giver deposits tokens
// with the agent, each with its rank, and requests a repo; the receiver affirms the request; the agent allocates in its
// console; the receiver settles the purchase against the allocation, or refuses it; the giver withdraws free collateral.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  serviceUrl,
  tripartyApi,
  type LiveParty,
  type LiveTriparty,
  type LiveTripartyRepo,
  type LiveTripartyRevaluation,
  type LiveTripartyTerms,
  type TripartyParty,
} from "../domain/liveApi";

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
                  <td>{e.concentrationLimit === null ? "none" : `at most ${Math.round(Number(e.concentrationLimit) * 100)}% of the Purchase Price`}</td>
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
      {t.state === "effective" && <TradeStart party={party} t={t} busy={busy} run={run} />}
    </div>
  );
}

const usd = (v: string | number) => Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 });

const OUTCOME: Record<string, string> = {
  TopUp: "topped up from the giver's free account",
  Release: "excess released to the giver's free account",
  Unchanged: "worth the required value: nothing moved",
  Uncovered: "short, and the free account cannot cover it: nothing moved",
};

/** The agent's revaluations of a settled repo (wp-adr-triparty-revaluation), newest first. */
function Revaluations(props: { rs: LiveTripartyRevaluation[] }) {
  const latest = [...props.rs].reverse();
  return (
    <div data-testid="triparty-revaluations">
      {latest.map((x, i) => {
        const v = x.revaluation;
        return (
          <div className="small" key={x.revaluationHash} data-testid={i === 0 ? "triparty-revaluation-latest" : `triparty-revaluation-${x.revaluationHash}`}>
            {v ? (
              <>
                <span data-testid="triparty-revaluation-outcome">Revaluation {v.revaluationDate}: {OUTCOME[v.outcome] ?? v.outcome}</span>
                {" · "}{usd(v.valueBefore)} after haircuts for {usd(v.requiredValue)} required
                {v.movements.map((m) => (
                  <span key={m.isin} data-testid={`triparty-revaluation-move-${m.token ?? m.isin}`}>
                    {" · "}{m.direction === "TopUp" ? "+" : "−"}{m.units} {m.token ?? m.isin}
                  </span>
                ))}
                {v.movements.length > 0 && <> {" · "}now {usd(v.valueAfter)}</>}
                {v.breaches.map((b) => (
                  <span key={b.isin} className="bad" data-testid={`triparty-revaluation-breach-${b.token ?? b.isin}`}>
                    {" · "}{b.token ?? b.isin} at {(Number(b.percentage) * 100).toFixed(2)}%, over its {(Number(b.limit) * 100).toFixed(0)}% limit
                  </span>
                ))}
              </>
            ) : <span>revaluation {short(x.revaluationHash)}</span>}
            {" "}
            <span data-testid="triparty-revaluation-verified">
              {x.verified ? <span className="ok">recomputed from the chain ✓</span> : <span className="bad">{x.problem ?? "revaluation does not check"}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function RepoRow(props: { party: TripartyParty; r: LiveTripartyRepo; busy: boolean; run: (fn: () => Promise<unknown>) => void }) {
  const { party, r, busy, run } = props;
  const a = r.allocation;
  return (
    <div className="card" data-testid={`triparty-repo-${r.repoId}`} data-state={r.state}>
      <div className="row">
        <span data-testid="triparty-repo-state">{r.state === "settled" ? <span className="ok">purchase settled on-chain ✓</span> : r.state}</span>
        <span>{r.tradeId ?? short(r.repoId)} · Purchase Price {usd(r.purchasePrice)} tUSD{r.ratePercent ? ` · ${r.ratePercent}%` : ""}
          {r.purchaseDate ? ` · ${r.purchaseDate} to ${r.repurchaseDate}` : ""}</span>
        <span data-testid="triparty-request-verified">
          {r.requestVerified ? <span className="ok">request checked ✓</span> : <span className="bad">{r.requestProblem ?? "request does not check"}</span>}
        </span>
      </div>
      {a && (
        <>
          <div className="small" data-testid="triparty-allocation-covers">
            {a.covers
              ? <span className="ok">allocation covers the Purchase Price after haircuts ✓ ({usd(a.allocatedValue)} for {usd(a.requiredValue)}{a.cdmRepo ? "; CDM repo booked" : ""})</span>
              : <span className="bad">the deposit cannot cover the Purchase Price within the profile: nothing allocated</span>}
          </div>
          {a.positions.length > 0 && (
            <table className="tbl" data-testid="triparty-allocation">
              <thead>
                <tr><th>Allocated</th><th>Units</th><th>Price</th><th>Haircut</th><th>Value after haircut</th><th>Share of Purchase Price</th></tr>
              </thead>
              <tbody>
                {a.positions.map((p) => (
                  <tr key={p.isin} data-testid={`triparty-allocation-${p.token ?? p.isin}`}>
                    <td>{p.token ?? p.isin}</td><td>{p.units}</td><td>{p.unitPrice}</td><td>{(p.haircutBps / 100).toFixed(2)}%</td>
                    <td>{usd(p.valueAfterHaircuts)}</td><td>{(Number(p.share) * 100).toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      {r.allocationVerified !== undefined && (
        <div className="small" data-testid="triparty-allocation-verified">
          {r.allocationVerified ? <span className="ok">allocation recomputed by this party ✓</span> : <span className="bad">{r.allocationProblem ?? "allocation does not check"}</span>}
        </div>
      )}
      {r.revaluations && r.revaluations.length > 0 && <Revaluations rs={r.revaluations} />}
      <div className="row">
        {r.canRevalue && <button disabled={busy} onClick={() => run(() => tripartyApi.revalueTripartyRepo(party, r.repoId))}>Revalue collateral</button>}
        {r.canAffirm && <button disabled={busy} onClick={() => run(() => tripartyApi.affirmTripartyRequest(party, r.repoId))}>Affirm triparty repo request</button>}
        {r.canAllocate && <button disabled={busy} onClick={() => run(() => tripartyApi.allocateTripartyRepo(party, r.repoId))}>Allocate collateral</button>}
        {r.canSettle && <button disabled={busy} onClick={() => run(() => tripartyApi.settleTripartyPurchase(party, r.repoId))}>Settle purchase against the allocation</button>}
        {r.canRefuseAllocation && <button disabled={busy} onClick={() => run(() => tripartyApi.refuseTripartyAllocation(party, r.repoId))}>Refuse allocation</button>}
        {r.canCancel && <button disabled={busy} onClick={() => run(() => tripartyApi.cancelTripartyRepo(party, r.repoId))}>Cancel triparty repo</button>}
      </div>
    </div>
  );
}

/** Deposits, the giver's free account and the repos under terms in effect. */
function TradeStart(props: { party: TripartyParty; t: LiveTripartyTerms; busy: boolean; run: (fn: () => Promise<unknown>) => void }) {
  const { party, t, busy, run } = props;
  const [token, setToken] = useState("tUST");
  const [amount, setAmount] = useState("1000");
  const [rank, setRank] = useState("1");
  const [price, setPrice] = useState("500000");
  const [rate, setRate] = useState("5");
  const [days, setDays] = useState("7");
  const giver = party as LiveParty;
  const free = t.free ?? [];
  return (
    <div data-testid="triparty-trade-start">
      <table className="tbl" data-testid="triparty-free">
        <thead>
          <tr><th>Free at the agent</th><th>Units</th><th>Giver's rank</th><th></th></tr>
        </thead>
        <tbody>
          {free.length === 0 && <tr><td colSpan={4} className="small">nothing deposited</td></tr>}
          {free.map((h) => (
            <tr key={h.token} data-testid={`triparty-free-${h.token}`}>
              <td>{h.token}</td><td>{h.amount}</td><td>{h.rank}</td>
              <td>{t.canDeposit && h.amount > 0 && (
                <button disabled={busy} onClick={() => run(() => tripartyApi.withdrawTriparty(giver, t.termsId, h.token))}>Withdraw free {h.token}</button>
              )}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {t.canDeposit && (
        <div className="row">
          <select data-testid="triparty-deposit-token" value={token} onChange={(e) => setToken(e.target.value)}>
            <option value="tUST">tUST</option>
            <option value="tAGY">tAGY</option>
            <option value="tMMF">tMMF</option>
          </select>
          <input data-testid="triparty-deposit-amount" value={amount} onChange={(e) => setAmount(e.target.value)} size={8} />
          <label className="small">rank <input data-testid="triparty-deposit-rank" value={rank} onChange={(e) => setRank(e.target.value)} size={2} /></label>
          <button disabled={busy} onClick={() => run(() => tripartyApi.depositTriparty(giver, t.termsId, token, Number(amount), Number(rank)))}>Deposit with BANK-T</button>
        </div>
      )}
      {t.canRequest && (
        <div className="row">
          <label className="small">Purchase Price <input data-testid="triparty-request-price" value={price} onChange={(e) => setPrice(e.target.value)} size={9} /></label>
          <label className="small">rate % <input data-testid="triparty-request-rate" value={rate} onChange={(e) => setRate(e.target.value)} size={4} /></label>
          <label className="small">days <input data-testid="triparty-request-days" value={days} onChange={(e) => setDays(e.target.value)} size={3} /></label>
          <button disabled={busy} onClick={() => run(() => tripartyApi.requestTripartyRepo(giver, t.termsId, Number(price), rate, Number(days)))}>Request triparty repo</button>
        </div>
      )}
      {(t.repos ?? []).filter((r) => r.state !== "cancelled").map((r) => <RepoRow key={r.repoId} party={party} r={r} busy={busy} run={run} />)}
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
