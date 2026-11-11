// Live party console: drives the real stack (collateral service -> ledger gateway -> Besu) for one participant,
// instead of the in-browser engine mock. One instance per party (route #/live/A, #/live/B). Polls the party's
// workflow service for on-chain call, proposal and balance state and offers the lifecycle actions for its role.
// Actions are keyed on the call's from/to/kind/state (not the party's role), so the same row serves delivery calls
// (the pledgor acts on settlement) and return calls (the secured party agrees and releases). The secured party can
// also declare the pledgor's default and enforce against the pledged initial margin (flow-default-enforcement), or
// close out the netting set and apply the pledged collateral to the Early Termination Amount (flow-close-out-netting).
// The pledgor can ask to substitute pledged collateral, which the secured party consents to or refuses
// (flow-substitution). The secured party states the interest it owes on the pledgor's cash collateral
// (flow-interest-on-cash); the pledgor pays a negative amount. Either party reconciles its trade portfolio with the
// counterparty's and its CDM records with the chain, and can dispute an issued call citing the portfolio breaks
// (flow-reconciliation).
// Two-way initial margin (wp-adr-two-way-im): each party pledges on one leg and secures the other. The leg selector
// picks the leg the role-specific panels act on; it starts on the leg A pledges on.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  serviceUrl,
  type LiveCall,
  type LiveCloseOut,
  type LiveContext,
  type LiveInterest,
  type LiveLedgerReconciliation,
  type LivePortfolioReconciliation,
  type LiveNetting,
  type LiveNettingCandidates,
  type LiveAgreement,
  type LiveGmraTerms, type LiveRepo, type LiveRepoMargin, type LiveRepos,
  type LiveParty,
  type LiveRevaluation,
  type LiveState,
  type LiveSubstitution,
} from "../domain/liveApi";

const short = (h: string) => (h.length > 12 ? `${h.slice(0, 8)}…${h.slice(-4)}` : h);
const usd = (s: string) => "USD " + Number(s).toLocaleString("en-US");

export function LiveConsole({ party }: { party: LiveParty }) {
  const [ctx, setCtx] = useState<LiveContext | null>(null);
  const [state, setState] = useState<LiveState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState(5_000_000);
  const [issueKind, setIssueKind] = useState<"IM" | "VM">("IM");
  const [returnAmount, setReturnAmount] = useState(1_000_000);
  const [qty, setQty] = useState(60_000);
  const [token, setToken] = useState("tUST");

  const [reval, setReval] = useState<LiveRevaluation | null>(null);
  const [closeOuts, setCloseOuts] = useState<LiveCloseOut[]>([]);
  const [subs, setSubs] = useState<LiveSubstitution[]>([]);
  const [closeOutUsd, setCloseOutUsd] = useState(1_000_000);
  const [interest, setInterest] = useState<LiveInterest[]>([]);
  const [agreement, setAgreement] = useState<LiveAgreement | null>(null);
  const [gmra, setGmra] = useState<LiveGmraTerms | null>(null);
  const [repos, setRepos] = useState<LiveRepos | null>(null);
  const [repoMargin, setRepoMargin] = useState<LiveRepoMargin | null>(null);
  const [periodStart, setPeriodStart] = useState("2026-11-01");
  const [periodEnd, setPeriodEnd] = useState("2026-12-01");
  const [ratePct, setRatePct] = useState(4.3);
  const [holdForNetting, setHoldForNetting] = useState(false);
  const [candidates, setCandidates] = useState<LiveNettingCandidates | null>(null);
  const [nettings, setNettings] = useState<LiveNetting[]>([]);
  const [recons, setRecons] = useState<LivePortfolioReconciliation[]>([]);
  const [legPledgor, setLegPledgor] = useState<LiveParty>("A");

  // One refresh in flight at a time (task-live-read-latency): a refresh asked for while one runs (an SSE step, the
  // fallback poll, an action) is merged into one more pass after it, so requests do not pile up behind the browser's
  // per-host connection limit and an older pass cannot overwrite a newer one.
  const inFlight = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  const securedRef = useRef<boolean | null>(null);
  const legRef = useRef<LiveParty>("A");

  const refreshOnce = useCallback(async () => {
    try {
      const panels: Promise<unknown>[] = [];
      // Shown to the secured party only (render below); a failure here must not hide the call state.
      if (securedRef.current !== false) panels.push(api.revaluation(party, legRef.current).then(setReval).catch(() => setReval(null)));
      panels.push(
        api.closeOuts(party).then(setCloseOuts).catch(() => setCloseOuts([])),
        api.substitutions(party).then(setSubs).catch(() => setSubs([])),
        api.interest(party).then(setInterest).catch(() => setInterest([])),
        api.nettingCandidates(party).then((c) => setCandidates(Array.isArray(c?.movements) ? c : null)).catch(() => setCandidates(null)),
        api.nettings(party).then((n) => setNettings(Array.isArray(n) ? n : [])).catch(() => setNettings([])),
        api.reconciliations(party).then((r) => setRecons(Array.isArray(r) ? r : [])).catch(() => setRecons([])),
        api.agreement(party).then((a) => setAgreement(Array.isArray(a?.haircuts) && Array.isArray(a?.amendments) ? a : null)).catch(() => setAgreement(null)),
        api.gmraTerms(party).then((g) => setGmra(g?.elections && Array.isArray(g?.amendments) ? g : null)).catch(() => setGmra(null)),
        api.repos(party).then((r) => setRepos(r?.businessDate && Array.isArray(r?.repos) ? r : null)).catch(() => setRepos(null)),
        api.repoMargin(party).then((m) => setRepoMargin(m?.businessDate && Array.isArray(m?.exposures) ? m : null)).catch(() => setRepoMargin(null)),
      );
      setState(await api.state(party));
      setError(null);
      await Promise.all(panels);
    } catch (e) {
      setError(`service ${party} unreachable: ${(e as Error).message}`);
    }
  }, [party]);

  const refresh = useCallback((): Promise<void> => {
    if (inFlight.current) {
      again.current = true;
      return inFlight.current;
    }
    const loop = (async () => {
      do {
        again.current = false;
        await refreshOnce();
      } while (again.current);
    })().finally(() => { inFlight.current = null; });
    inFlight.current = loop;
    return loop;
  }, [refreshOnce]);


  useEffect(() => {
    let live = true;
    api.context(party).then((c) => {
      securedRef.current = legRef.current !== c.party;
      setCtx(c);
    }).catch((e) => setError((e as Error).message));
    refresh();
    // Push: subscribe to the service's live event stream (Besu ws -> gateway -> service -> here) and refresh on each
    // change signal, instead of a tight poll. A slow fallback poll covers any gap if the stream is unavailable.
    const es = new EventSource(serviceUrl(party) + "/api/v1/events");
    const onStep = () => live && refresh();
    es.addEventListener("step", onStep);
    const fallback = setInterval(() => live && refresh(), 10000);
    return () => {
      live = false;
      es.removeEventListener("step", onStep);
      es.close();
      clearInterval(fallback);
    };
  }, [party, refresh]);

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

  if (!ctx) return <div className="card">Connecting to the {party} workflow service… {error && <span className="bad">{error}</span>}</div>;

  // This party's role on the selected leg (wp-adr-two-way-im).
  const isSecured = legPledgor !== ctx.party;
  const role = isSecured ? "Secured Party" : "Pledgor";
  const other = ctx.counterparty;
  const pledgedOn = (b: { pledged: string; pledgedByLeg?: Partial<Record<LiveParty, string>> }, leg: LiveParty) =>
    Number(b.pledgedByLeg?.[leg] ?? (leg === "A" ? b.pledged : 0));
  const legHasPledged = (leg: LiveParty) => !!state?.balances.some((b) => pledgedOn(b, leg) > 0);
  const hasPledged = legHasPledged(legPledgor);
  const tusd = state?.balances.find((b) => b.token === "tUSD");
  const cashHeld = tusd ? pledgedOn(tusd, legPledgor) : 0;
  const inDefault = (["A", "B"] as LiveParty[]).filter((p) => state?.defaults?.[p]);
  const selectLeg = (leg: LiveParty) => {
    legRef.current = leg;
    securedRef.current = leg !== ctx.party;
    setReval(null);
    setLegPledgor(leg);
    refresh();
  };

  return (
    <div>
      <div className="card" style={{ borderLeft: `4px solid ${isSecured ? "#2563eb" : "#059669"}` }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <strong>{role}</strong> · party {ctx.party} · node {ctx.node}
            <div className="mono small">{ctx.address}</div>
          </div>
          <div className="small">
            counterparty {other} · live stack
            <div className="mono small">{ctx.agreement}</div>
          </div>
        </div>
      </div>

      <div className="card" data-testid="im-legs">
        <div className="row">
          <span className="small">Initial margin leg</span>
          {(["A", "B"] as LiveParty[]).map((pl) => (
            <button key={pl} aria-pressed={legPledgor === pl} className={legPledgor === pl ? "primary" : undefined} onClick={() => selectLeg(pl)}>
              {pl} pledges to {pl === "A" ? "B" : "A"}{pl === ctx.party ? " (you pledge)" : " (you secure)"}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="card bad">{error}</div>}

      {inDefault.length > 0 && (
        <div className="card bad" role="status">
          {inDefault.map((p) => (p === ctx.party ? `This party (${p})` : `Counterparty ${p}`)).join(", ")} in default on the oracle feed
        </div>
      )}

      <div className="card">
        <h3>Collateral balances (on-chain)</h3>
        <table className="tbl">
          <thead>
            <tr><th>Token</th><th>Free</th><th>Escrow: A pledged to B</th><th>Escrow: B pledged to A</th></tr>
          </thead>
          <tbody>
            {state?.balances.map((b) => (
              <tr key={b.token}>
                <td className="mono">{b.token}</td>
                <td>{Number(b.free).toLocaleString("en-US")}</td>
                <td>{pledgedOn(b, "A").toLocaleString("en-US")}</td>
                <td data-testid={`escrow-b-to-a-${b.token}`}>{pledgedOn(b, "B").toLocaleString("en-US")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isSecured && reval && (
        <div className="card" data-testid="revaluation">
          <h3>Revaluation (oracle feed prices after haircuts)</h3>
          <table className="tbl">
            <tbody>
              <tr><td>Required IM (settled calls less returns)</td><td>{usd(reval.requiredUsd)}</td></tr>
              <tr><td>Pledged collateral value</td><td>{usd(reval.valueUsd)}</td></tr>
              <tr><td>Shortfall</td><td data-testid="shortfall" className={Number(reval.shortfallUsd) > 0 ? "bad" : undefined}>{usd(reval.shortfallUsd)}</td></tr>
              <tr><td>Top-up call (MTA {usd(reval.mtaUsd)}, rounded up to {usd(reval.roundingUsd)})</td><td data-testid="top-up">{usd(reval.topUpUsd)}</td></tr>
            </tbody>
          </table>
          {Number(reval.topUpUsd) > 0 && (
            <button disabled={busy} onClick={() => run(() => api.issueCall(party, other, Number(reval.topUpUsd), "IM", "top-up"))}>
              Issue top-up IM call → {other}
            </button>
          )}
        </div>
      )}

      {isSecured && (
        <div className="card">
          <h3>Issue margin call</h3>
          <div className="row">
            <label>
              Type{" "}
              <select value={issueKind} onChange={(e) => setIssueKind(e.target.value as "IM" | "VM")}>
                <option value="IM">IM (pledge into escrow)</option>
                <option value="VM">VM (title transfer)</option>
              </select>
            </label>
            <label>
              Amount (USD){" "}
              <input type="number" value={amount} step={500000} onChange={(e) => setAmount(Number(e.target.value))} />
            </label>
            <button disabled={busy} onClick={() => run(() => api.issueCall(party, other, amount, issueKind))}>
              Issue {issueKind} call → {other}
            </button>
          </div>
        </div>
      )}

      {!isSecured && (
        <div className="card">
          <h3>Call for a return</h3>
          <div className="row">
            <label>
              Amount (USD){" "}
              <input type="number" value={returnAmount} step={250000} onChange={(e) => setReturnAmount(Number(e.target.value))} />
            </label>
            <button disabled={busy} onClick={() => run(() => api.issueCall(party, other, returnAmount, "Return"))}>
              Call return → {other}
            </button>
          </div>
          <div className="small">The secured party agrees, then releases escrowed IM or transfers equivalent VM back.</div>
        </div>
      )}

      {isSecured && (
        <div className="card" data-testid="close-out">
          <h3>Close-out on default</h3>
          <div className="row">
            <label>
              Close-out Amount (USD){" "}
              <input aria-label="Close-out Amount (USD)" type="number" value={closeOutUsd} step={250000} onChange={(e) => setCloseOutUsd(Number(e.target.value))} />
            </label>
            <button disabled={busy || !hasPledged} onClick={() => run(() => api.closeOut(party, closeOutUsd))}>
              Declare default &amp; close out {other}
            </button>
          </div>
          <div className="small">
            ISDA 2002 MA Section 6(e): the Early Termination Amount is netted, the pledged collateral is applied to it and the
            surplus is returned to {other}.
          </div>
        </div>
      )}

      {!isSecured && inDefault.includes(other) && hasPledged && (
        <div className="card" data-testid="reclaim">
          <h3>Reclaim on the secured party's default</h3>
          <div className="row">
            <button disabled={busy} onClick={() => run(() => api.reclaim(party))}>Reclaim my IM from {other}</button>
          </div>
          <div className="small">
            {other} is in default on the oracle feed. Your initial margin is segregated, so the control contract returns
            your whole escrow on this leg.
          </div>
        </div>
      )}

      {closeOuts.length > 0 && (
        <div className="card">
          <h3>Close-out statements</h3>
          <table className="tbl">
            <thead>
              <tr><th>Close-out</th><th>Close-out Amount</th><th>Early Termination Amount</th><th>Collateral held</th><th>Applied</th><th>Payable</th><th>CDM</th></tr>
            </thead>
            <tbody>
              {closeOuts.map((o) => (
                <tr key={o.closeOutId} data-testid={`close-out-${o.closeOutId}`}>
                  <td className="mono">{short(o.closeOutId)}</td>
                  <td>{o.closeOutAmountUsd ? usd(o.closeOutAmountUsd) : "—"}</td>
                  <td>{o.earlyTerminationAmountUsd ? usd(o.earlyTerminationAmountUsd) : "—"}</td>
                  <td>{o.collateralHeldUsd ? usd(o.collateralHeldUsd) : "—"}</td>
                  <td title={`on-chain, whole units: ${usd(o.appliedUsd)}`}>{o.collateralAppliedUsd ? usd(o.collateralAppliedUsd) : "—"}</td>
                  <td>{o.amountPayableUsd ? usd(o.amountPayableUsd) : "—"}</td>
                  <td>{o.verified ? <span className="ok">statement verified ✓</span> : <span className="bad">{o.error ?? "unverified"}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isSecured && (
        <div className="card" data-testid="interest">
          <h3>Interest on cash collateral</h3>
          <div className="row">
            <label>
              Period start <input aria-label="Period start" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </label>
            <label>
              Period end <input aria-label="Period end" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </label>
            <label>
              Rate (%) <input aria-label="Observed rate (%)" type="number" value={ratePct} step={0.05} onChange={(e) => setRatePct(Number(e.target.value))} />
            </label>
            <label>
              <input type="checkbox" checked={holdForNetting} onChange={(e) => setHoldForNetting(e.target.checked)} /> Hold for settlement netting
            </label>
            <button disabled={busy || cashHeld === 0} onClick={() => run(() => api.stateInterest(party, periodStart, periodEnd, ratePct, holdForNetting))}>
              State interest → {other}
            </button>
          </div>
          <div className="small">
            Interest on the {cashHeld.toLocaleString("en-US")} tUSD {other} has in escrow, every day of the period at the observed
            rate, ACT/360, rounded to whole USD. A positive amount is paid to {other} at once; {other} pays a negative one. Held
            for settlement netting, the amount settles with the day's VM calls and returns.
          </div>
        </div>
      )}

      {interest.length > 0 && (
        <div className="card">
          <h3>Interest statements</h3>
          <table className="tbl">
            <thead>
              <tr><th>Interest</th><th>Period</th><th>Cash held</th><th>Rate</th><th>Interest Amount</th><th>State</th><th>CDM</th></tr>
            </thead>
            <tbody>
              {interest.map((i) => (
                <tr key={i.interestId} data-testid={`interest-${i.interestId}`}>
                  <td className="mono">{short(i.interestId)}</td>
                  <td>{i.periodStart ? `${i.periodStart} to ${i.periodEnd} (${i.days} days)` : "—"}</td>
                  <td>{i.balanceUsd ? usd(i.balanceUsd) : "—"}</td>
                  <td>{i.ratePct ? `${i.ratePct}%` : "—"}</td>
                  <td>{usd(i.amountUsd)}</td>
                  <td>
                    {i.state === "settled" ? <span className="ok">paid on-chain ✓</span> : i.state}
                    {i.state === "stated" && (Number(i.amountUsd) < 0 ? !isSecured : isSecured) && (
                      <button disabled={busy} onClick={() => run(() => api.payInterest(party, i.interestId))}>Pay interest</button>
                    )}
                  </td>
                  <td>{i.verified ? <span className="ok">statement verified ✓</span> : <span className="bad">{i.error ?? "unverified"}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {candidates && <NettingCard party={party} candidates={candidates} nettings={nettings} busy={busy} run={run} />}

      {agreement && <AgreementTerms party={party} other={other} agreement={agreement} busy={busy} run={run} />}

      {gmra && <GmraTermsCard party={party} other={other} gmra={gmra} busy={busy} run={run} />}

      {repos && <ReposCard party={party} other={other} repos={repos} defaultMarginRatio={gmra?.elections.defaultMarginRatio ?? "1.02"} busy={busy} run={run} />}
      {repoMargin && <RepoMarginCard party={party} other={other} margin={repoMargin} busy={busy} run={run} />}

      <ReconciliationCard party={party} other={other} latest={recons[0] ?? null} busy={busy} run={run} />

      {!isSecured && <SubstitutionRequest party={party} other={other} busy={busy} hasPledged={hasPledged} run={run} />}

      {subs.length > 0 && (
        <div className="card">
          <h3>Substitutions</h3>
          {subs.map((s) => (
            <SubstitutionRow key={s.substitutionId} s={s} party={party} busy={busy} run={run} />
          ))}
        </div>
      )}

      <div className="card">
        <h3>Margin calls</h3>
        {!state?.calls.length && <div className="small">No calls yet.</div>}
        {state?.calls.map((c) => (
          <CallRow key={c.callId} call={c} party={party} hasPledged={c.leg ? legHasPledged(c.leg) : hasPledged} busy={busy} token={token} qty={qty} setToken={setToken} setQty={setQty} run={run} reconciliation={recons[0] ?? null} />
        ))}
      </div>
    </div>
  );
}

function CallRow(props: {
  call: LiveCall;
  party: LiveParty;
  hasPledged: boolean;
  busy: boolean;
  token: string;
  qty: number;
  setToken: (s: string) => void;
  setQty: (n: number) => void;
  run: (fn: () => Promise<unknown>) => void;
  /** The latest portfolio reconciliation; a dispute can cite it when it has breaks (flow-reconciliation). */
  reconciliation?: LivePortfolioReconciliation | null;
}) {
  const { call: c, party, hasPledged, busy, token, qty, setToken, setQty, run, reconciliation } = props;
  const [partialUsd, setPartialUsd] = useState(0);
  const [staged, setStaged] = useState<{ token: string; qty: number }[]>([]); // multi-asset proposal basket
  const [allocNote, setAllocNote] = useState<string | null>(null); // result of "Suggest allocation" (flow-allocation)
  const [cancelReason, setCancelReason] = useState("");
  const [replacementUsd, setReplacementUsd] = useState(Number(c.amountUsd));
  const accepted = c.proposals.find((p) => p.state === "accepted");
  const proposed = c.proposals.find((p) => p.state === "proposed");
  const agreedOpen = c.state === "agreed" || c.state === "partially agreed";
  const settled = c.state === "settled" || c.state === "settled (agreed part)";

  // Actions follow the call's parties: the called party (c.to) responds and, for a delivery, delivers on settlement;
  // the caller (c.from) decides proposals. A return call is agreed and released by the secured party (c.to).
  // Cancellation (task-csa-call-cancellation): while a request is pending the call takes no other step.
  const pending = c.cancellationRequestedBy ?? null;
  const acts = c.to === party && !pending;
  const canRespond = acts && c.state === "issued";
  const canPropose = acts && agreedOpen && c.kind !== "Return" && !proposed && !accepted;
  const canDecide = c.from === party && !!proposed && !pending;
  const canWithdraw = c.from === party && c.state === "issued";
  const canRequestCancel = !pending && (agreedOpen || c.state === "disputed");
  const canDecideCancel = !!pending && pending !== party;
  const canReplace = c.from === party && c.state === "cancelled" && !c.replacedBy; // task-csa-call-replacement
  const canPledge = acts && c.kind === "IM" && accepted && !settled;
  const canTransfer = acts && c.kind === "VM" && accepted && !settled;
  const canReturn = acts && c.kind === "Return" && agreedOpen && !settled;
  // Enforcement seizes everything the pledgor has in escrow with this secured party, so it is offered on a settled IM
  // call the party issued while anything is still pledged.
  const canEnforce = c.from === party && c.kind === "IM" && settled && !c.enforced && hasPledged;

  return (
    <div className="subcard">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <span className="mono">{short(c.callId)}</span> · {c.kind} · {c.from} → {c.to} · <strong>{c.state}</strong>
          {c.replaces && <span className="small"> · replaces <span className="mono">{short(c.replaces)}</span></span>}
          {c.replacedBy && <span className="small"> · replaced by <span className="mono">{short(c.replacedBy)}</span></span>}
          {c.nettedIn && <span className="small"> · settled in netting <span className="mono">{short(c.nettedIn)}</span></span>}
        </div>
        <div className="small">{usd(c.amountUsd)} {Number(c.disputedUsd) > 0 && <span className="bad">· disputed {usd(c.disputedUsd)}</span>}</div>
      </div>

      {c.proposals.length > 0 && (
        <ul className="small">
          {c.proposals.map((p) => (
            <li key={p.proposalId}>
              proposal {p.proposalId}: <strong>{p.state}</strong> — {p.assets.map((a) => `${a.token} ${Number(a.qty).toLocaleString("en-US")}`).join(" + ")}
            </li>
          ))}
        </ul>
      )}

      <div className="row">
        {canRespond && (
          <>
            <button disabled={busy} onClick={() => run(() => api.respond(party, c.callId, "full"))}>Agree in full</button>
            {c.kind !== "Return" && (
              <>
                <input type="number" value={partialUsd} step={250000} onChange={(e) => setPartialUsd(Number(e.target.value))} style={{ width: 120 }} title="Partial agreed amount (USD)" />
                <button disabled={busy || !(partialUsd > 0 && partialUsd < Number(c.amountUsd))} onClick={() => run(() => api.respond(party, c.callId, "partial", partialUsd))}>Agree part</button>
                <button disabled={busy} onClick={() => run(() => api.respond(party, c.callId, "dispute"))}>Dispute</button>
                {reconciliation && reconciliation.breaks.length > 0 && (
                  <button
                    disabled={busy}
                    title={`Dispute the call, citing reconciliation ${reconciliation.reconciliationId} and its ${reconciliation.breaks.length} breaks`}
                    onClick={() => run(() => api.respond(party, c.callId, "dispute", undefined, reconciliation.reconciliationId))}
                  >
                    Dispute citing reconciliation
                  </button>
                )}
              </>
            )}
          </>
        )}
        {canPropose && (
          <>
            <select value={token} onChange={(e) => setToken(e.target.value)}>
              <option value="tUST">tUST</option>
              <option value="tMMF">tMMF</option>
              <option value="tUSD">tUSD</option>
            </select>
            <input type="number" value={qty} step={1000} onChange={(e) => setQty(Number(e.target.value))} style={{ width: 110 }} />
            <button disabled={busy} onClick={() => setStaged([...staged, { token, qty }])}>Add asset</button>
            <button
              disabled={busy}
              title="Fill the basket from your holdings, eligible tokens in registry order, the last one rounded up to whole units"
              onClick={() =>
                run(() =>
                  api.allocate(party, c.callId).then((r) => {
                    setStaged(r.assets);
                    setAllocNote(r.covers ? `suggested: ${usd(r.valueUsd)} after haircuts` : "holdings do not cover the agreed amount");
                  }),
                )
              }
            >
              Suggest allocation
            </button>
            {allocNote && <span className="small">{allocNote}</span>}
            {staged.length > 0 && <span className="small">basket: {staged.map((a) => `${a.token} ${a.qty.toLocaleString("en-US")}`).join(" + ")}</span>}
            <button
              disabled={busy}
              onClick={() => run(() => api.propose(party, c.callId, staged.length ? staged : [{ token, qty }]).then(() => { setStaged([]); setAllocNote(null); }))}
            >
              Propose collateral{staged.length ? ` (${staged.length})` : ""}
            </button>
          </>
        )}
        {canDecide && proposed && (
          <>
            <button disabled={busy} onClick={() => run(() => api.decide(party, c.callId, proposed.proposalId, true))}>Accept proposal</button>
            <button disabled={busy} onClick={() => run(() => api.decide(party, c.callId, proposed.proposalId, false))}>Reject</button>
          </>
        )}
        {canPledge && accepted && (
          <button disabled={busy} onClick={() => run(() => api.pledge(party, c.callId, accepted.proposalId))}>Pledge accepted collateral</button>
        )}
        {canTransfer && accepted && (
          <button disabled={busy} onClick={() => run(() => api.transfer(party, c.callId, accepted.proposalId))}>Transfer title</button>
        )}
        {canReturn && (
          <>
            <select value={token} onChange={(e) => setToken(e.target.value)}>
              <option value="tUST">tUST</option>
              <option value="tMMF">tMMF</option>
              <option value="tUSD">tUSD</option>
            </select>
            <input type="number" value={qty} step={1000} onChange={(e) => setQty(Number(e.target.value))} style={{ width: 110 }} />
            <button disabled={busy} onClick={() => run(() => api.returnSettle(party, c.callId, "release", [{ token, qty }]))}>Release escrow</button>
            <button disabled={busy} onClick={() => run(() => api.returnSettle(party, c.callId, "transfer", [{ token, qty }]))}>Return by transfer</button>
          </>
        )}
        {canEnforce && (
          <button disabled={busy} onClick={() => run(() => api.enforce(party, c.callId))}>Declare default &amp; enforce</button>
        )}
        {(canWithdraw || canRequestCancel || canDecideCancel) && (
          <input aria-label="Cancellation reason" placeholder="reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} style={{ width: 160 }} />
        )}
        {canWithdraw && (
          <button disabled={busy} onClick={() => run(() => api.withdrawCall(party, c.callId, cancelReason))}>Withdraw call</button>
        )}
        {canRequestCancel && (
          <button disabled={busy} onClick={() => run(() => api.requestCancellation(party, c.callId, cancelReason))}>Request cancellation</button>
        )}
        {pending && <span className="small">cancellation requested by {pending}</span>}
        {canDecideCancel && (
          <>
            <button disabled={busy} onClick={() => run(() => api.decideCancellation(party, c.callId, true, cancelReason))}>Accept cancellation</button>
            <button disabled={busy} onClick={() => run(() => api.decideCancellation(party, c.callId, false, cancelReason))}>Refuse cancellation</button>
          </>
        )}
        {c.state === "cancelled" && <span className="bad">cancelled on-chain ✓</span>}
        {canReplace && (
          <>
            <input aria-label="Replacement amount (USD)" type="number" value={replacementUsd} onChange={(e) => setReplacementUsd(Number(e.target.value))} style={{ width: 120 }} />
            <button disabled={busy || !(replacementUsd > 0)} onClick={() => run(() => api.replaceCall(party, c.callId, replacementUsd))}>Issue replacement call</button>
          </>
        )}
        {settled && <span className="ok">settled on-chain ✓</span>}
        {c.enforced && <span className="bad">enforced ✓</span>}
      </div>

      {c.messages.length > 0 && (
        <details className="small">
          <summary>CDM messages ({c.messages.length}) — stored in this party's workflow store</summary>
          {c.messages.map((m, i) => (
            <div key={i} className="mono small">{m.msgType} [{m.direction}] hash {short(m.cdmHash)}</div>
          ))}
        </details>
      )}
    </div>
  );
}

const TOKENS = ["tUST", "tMMF", "tUSD"];

// Settlement netting (flow-settlement-netting): the day's agreed VM calls, VM returns and held Interest Amounts
// between the two parties, settled by one transfer of tUSD by the party that owes the net.
const MOVEMENT: Record<string, string> = { DeliveryAmount: "VM delivery", ReturnAmount: "VM return", InterestAmount: "Interest Amount" };

function NettingCard(props: { party: LiveParty; candidates: LiveNettingCandidates; nettings: LiveNetting[]; busy: boolean; run: (fn: () => Promise<unknown>) => void }) {
  const { party, candidates: c, nettings, busy, run } = props;
  const hasCall = c.movements.some((m) => m.type !== "InterestAmount");
  const canSettle = c.movements.length >= 2 && hasCall && (c.payer === party || c.payer === null);
  if (c.movements.length === 0 && nettings.length === 0) return null;
  return (
    <div className="card" data-testid="settlement-netting">
      <h3>Settlement netting</h3>
      {c.movements.length > 0 && (
        <>
          <table className="tbl">
            <thead>
              <tr><th>Movement</th><th>Call or statement</th><th>Payer → receiver</th><th>Amount</th></tr>
            </thead>
            <tbody>
              {c.movements.map((m) => (
                <tr key={m.id}>
                  <td>{MOVEMENT[m.type] ?? m.type}</td>
                  <td className="mono">{short(m.id)}</td>
                  <td>{m.payer} → {m.receiver}</td>
                  <td>{usd(m.amountUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row">
            <span data-testid="netting-net">
              {c.payer ? `Net: ${c.payer} pays ${usd(c.netUsd)} in tUSD` : "Net: the movements offset; nothing moves"}
            </span>
            {canSettle && (
              <button disabled={busy} onClick={() => run(() => api.settleNetting(party))}>Settle netted</button>
            )}
          </div>
          {!canSettle && c.movements.length >= 2 && hasCall && <div className="small">{c.payer} owes the net and settles.</div>}
        </>
      )}
      {nettings.map((n) => (
        <div key={n.nettingId} className="subcard" data-testid={`netting-${n.nettingId}`}>
          <span className="mono">{short(n.nettingId)}</span> · {n.settlementDate ?? ""} · {n.movements?.length ?? "?"} movements ·{" "}
          {Number(n.amountUsd) > 0 ? `${n.settledBy} paid ${usd(n.amountUsd ?? "0")} to ${n.counterparty}` : "offset, nothing moved"} ·{" "}
          {n.verified ? <span className="ok">statement verified ✓</span> : <span className="bad">{n.error ?? "unverified"}</span>}
        </div>
      ))}
    </div>
  );
}

const pct = (bps: number) => `${(bps / 100).toFixed(2)}%`;

/** The IM CSA terms in force, the amendment form and the pair's amendments (flow-agreement-amendment). */
function AgreementTerms(props: { party: LiveParty; other: LiveParty; agreement: LiveAgreement; busy: boolean; run: (fn: () => Promise<unknown>) => void }) {
  const { party, other, agreement: a, busy, run } = props;
  const [mta, setMta] = useState<string>("");
  const [hcToken, setHcToken] = useState("tMMF");
  const [hcEligible, setHcEligible] = useState(true);
  const [hcBps, setHcBps] = useState(1000);
  const haircuts = hcToken ? [{ token: hcToken, eligible: hcEligible, haircutBps: hcEligible ? hcBps : 0 }] : [];
  return (
    <div className="card" data-testid="agreement">
      <h3>Agreement terms</h3>
      <div className="small">{a.agreement} · secured party {a.securedParty} · pledgor {a.pledgor}</div>
      <div className="row">
        <span data-testid="agreement-mta">Minimum Transfer Amount (pledgor) {usd(a.mtaUsd)}</span>
        <span>Rounding {usd(a.roundingUsd)}</span>
        <span>{a.agreedAmendments} agreed amendment{a.agreedAmendments === 1 ? "" : "s"}</span>
        <span data-testid="agreement-verified">
          {a.verified ? <span className="ok">terms verified against the chain ✓</span> : <span className="bad">{a.problem ?? "terms do not match the chain"}</span>}
        </span>
      </div>
      <table className="tbl">
        <thead>
          <tr><th>Token</th><th>ISIN</th><th>Haircut (CDM schedule)</th><th>Haircut (on-chain)</th></tr>
        </thead>
        <tbody>
          {a.haircuts.map((h) => (
            <tr key={h.token} data-testid={`haircut-${h.token}`}>
              <td>{h.token}</td>
              <td className="mono">{h.isin}</td>
              <td>{h.eligible ? pct(h.haircutBps) : "not eligible"}</td>
              <td>{h.onChainHaircutBps == null ? "—" : h.onChainHaircutBps >= 10000 ? "not eligible" : pct(h.onChainHaircutBps)} {h.matches ? "" : <span className="bad">mismatch</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <label>
          New MTA (USD) <input aria-label="New MTA (USD)" type="number" value={mta} placeholder="unchanged" step={50000} onChange={(e) => setMta(e.target.value)} style={{ width: 120 }} />
        </label>
        <label>
          Haircut of{" "}
          <select aria-label="Amended token" value={hcToken} onChange={(e) => setHcToken(e.target.value)}>
            <option value="">(none)</option>
            {a.haircuts.map((h) => <option key={h.token} value={h.token}>{h.token}</option>)}
          </select>
        </label>
        <label>
          <input aria-label="Eligible" type="checkbox" checked={hcEligible} onChange={(e) => setHcEligible(e.target.checked)} /> eligible
        </label>
        <label>
          bps <input aria-label="Haircut (bps)" type="number" value={hcBps} step={50} onChange={(e) => setHcBps(Number(e.target.value))} style={{ width: 80 }} />
        </label>
        <button
          disabled={busy || !!a.pendingAmendment || !a.verified}
          onClick={() => run(() => api.proposeAmendment(party, mta === "" ? null : Number(mta), haircuts))}
        >
          Propose amendment → {other}
        </button>
      </div>
      {a.amendments.length > 0 && (
        <table className="tbl">
          <thead>
            <tr><th>Amendment</th><th>Proposer</th><th>MTA</th><th>Haircuts</th><th>State</th></tr>
          </thead>
          <tbody>
            {a.amendments.map((m) => (
              <tr key={m.amendmentId} data-testid={`amendment-${m.amendmentId}`}>
                <td className="mono">{short(m.amendmentId)}</td>
                <td>{m.proposer}</td>
                <td>{m.mtaUsd ? usd(m.mtaUsd) : "unchanged"}</td>
                <td>{m.haircuts.map((h) => `${h.token} ${h.eligible ? pct(h.haircutBps) : "not eligible"}`).join(", ") || "unchanged"}</td>
                <td>
                  {m.state === "agreed" ? <span className="ok">agreed on-chain ✓</span> : m.state}
                  {m.state === "proposed" && !m.mine && (
                    <>
                      <button disabled={busy} onClick={() => run(() => api.decideAmendment(party, m.amendmentId, true))}>Consent</button>
                      <button disabled={busy} onClick={() => run(() => api.decideAmendment(party, m.amendmentId, false))}>Refuse</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** The GMRA terms in force, the amendment form and the pair's GMRA amendments (wp-adr-repo-gmra-terms). */
function GmraTermsCard(props: { party: LiveParty; other: LiveParty; gmra: LiveGmraTerms; busy: boolean; run: (fn: () => Promise<unknown>) => void }) {
  const { party, other, gmra: g, busy, run } = props;
  const [mtaParty, setMtaParty] = useState<LiveParty>("B");
  const [mta, setMta] = useState<string>("");
  const [ratio, setRatio] = useState<string>("");
  const e = g.elections;
  return (
    <div className="card" data-testid="gmra-terms">
      <h3>GMRA terms</h3>
      <div className="small">{g.agreement} · Party1 {g.party1} · Party2 {g.party2}</div>
      <div className="row">
        <span>{g.agreedAmendments} agreed amendment{g.agreedAmendments === 1 ? "" : "s"}</span>
        <span className="mono small" data-testid="gmra-hash">terms hash {short(g.termsHash)}</span>
        <span data-testid="gmra-verified">
          {g.verified ? <span className="ok">GMRA terms verified against the chain ✓</span> : <span className="bad">{g.problem ?? "GMRA terms do not match the chain"}</span>}
        </span>
      </div>
      <table className="tbl">
        <tbody>
          <tr><th>Base Currency</th><td>{e.baseCurrency}</td></tr>
          <tr><th>Margin Ratio</th><td>{e.marginRatioBasis}; default {e.defaultMarginRatio}</td></tr>
          <tr data-testid="gmra-mta"><th>Minimum transfer amount</th><td>A {usd(e.mtaUsd.A)} · B {usd(e.mtaUsd.B)}</td></tr>
          <tr><th>Margin transfer</th><td>{e.marginTransfer}</td></tr>
          <tr><th>Net Margin interest</th><td>{e.netMarginInterest}</td></tr>
          <tr><th>Income (paragraph 5)</th><td>{e.incomePayment}</td></tr>
          <tr><th>Default valuation (paragraph 10)</th><td>{e.defaultValuation}</td></tr>
        </tbody>
      </table>
      <div className="row">
        <label>
          MTA of{" "}
          <select aria-label="GMRA MTA party" value={mtaParty} onChange={(ev) => setMtaParty(ev.target.value as LiveParty)}>
            <option value="A">A</option>
            <option value="B">B</option>
          </select>
        </label>
        <label>
          New MTA (USD) <input aria-label="New GMRA MTA (USD)" type="number" value={mta} placeholder="unchanged" step={50000} onChange={(ev) => setMta(ev.target.value)} style={{ width: 120 }} />
        </label>
        <label>
          Default Margin Ratio <input aria-label="New default Margin Ratio" value={ratio} placeholder="unchanged" onChange={(ev) => setRatio(ev.target.value)} style={{ width: 80 }} />
        </label>
        <button
          disabled={busy || !!g.pendingAmendment || !g.verified || (mta === "" && ratio === "")}
          onClick={() => run(() => api.proposeGmraAmendment(party, { party: mtaParty, mtaUsd: mta === "" ? null : Number(mta), defaultMarginRatio: ratio === "" ? null : ratio }))}
        >
          Propose GMRA amendment → {other}
        </button>
      </div>
      {g.amendments.length > 0 && (
        <table className="tbl">
          <thead>
            <tr><th>Amendment</th><th>Proposer</th><th>Changes</th><th>MTA after</th><th>State</th></tr>
          </thead>
          <tbody>
            {g.amendments.map((m) => (
              <tr key={m.amendmentId} data-testid={`gmra-amendment-${m.amendmentId}`}>
                <td className="mono">{short(m.amendmentId)}</td>
                <td>{m.proposer}</td>
                <td>{m.changed?.join(", ") ?? "—"}</td>
                <td>{m.after ? `A ${usd(m.after.mtaUsd.A)} · B ${usd(m.after.mtaUsd.B)}` : "—"}</td>
                <td>
                  {m.state === "agreed" ? <span className="ok">agreed on-chain ✓</span> : m.state}
                  {m.state === "proposed" && !m.mine && (
                    <>
                      <button disabled={busy} onClick={() => run(() => api.decideGmraAmendment(party, m.amendmentId, true))}>Consent to GMRA amendment</button>
                      <button disabled={busy} onClick={() => run(() => api.decideGmraAmendment(party, m.amendmentId, false))}>Refuse GMRA amendment</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Term repos under the GMRA (wp-adr-repo-purchase-repurchase): the seller books, the buyer affirms, and each party
 *  settles the purchase and, from the Repurchase Date, the repurchase, delivery versus payment. */
function ReposCard(props: { party: LiveParty; other: LiveParty; repos: LiveRepos; defaultMarginRatio: string; busy: boolean; run: (fn: () => Promise<unknown>) => void }) {
  const { party, other, repos: r, defaultMarginRatio, busy, run } = props;
  const [security, setSecurity] = useState("tUST");
  const [purchasePrice, setPurchasePrice] = useState(1_000_000);
  const [ratePercent, setRatePercent] = useState("4.5");
  const [termDays, setTermDays] = useState(7);
  const [marginRatio, setMarginRatio] = useState("");
  const [buySellBack, setBuySellBack] = useState(false);
  const [date, setDate] = useState("");
  const action = (p: LiveRepo) => {
    if (!p.verified) return null;
    if (p.state === "booked")
      return p.role === "buyer" ? <button disabled={busy} onClick={() => run(() => api.affirmRepo(party, p.repoId))}>Affirm repo</button> : "awaiting affirmation";
    const phase = p.state === "affirmed" ? "purchase" : p.state === "purchased" ? "repurchase" : null;
    if (!phase) return null;
    if (p.instructedByMe) return `${phase} instructed, awaiting ${other}`;
    if (phase === "repurchase" && !p.repurchaseDue) return `repurchase from ${p.repurchaseDate}`;
    return (
      <button disabled={busy} onClick={() => run(() => api.settleRepo(party, p.repoId, phase))}>
        {phase === "purchase" ? "Settle purchase" : "Settle repurchase"}
      </button>
    );
  };
  const substitution = (p: LiveRepo) => {
    if (!p.verified || p.state !== "purchased") return null;
    const offer = p.substituteSecurity ? `${Number(p.substituteQuantity).toLocaleString("en-US")} ${p.substituteSecurity}` : "another security";
    if (p.substitutionPending === "requested") return <span data-testid={`repo-substitution-${p.repoId}`}>substitution by {offer} requested</span>;
    if (p.substitutionPending === "toDecide")
      return (
        <>
          <button disabled={busy} onClick={() => run(() => api.agreeRepoSubstitution(party, p.repoId))}>Agree substitution by {offer}</button>
          <button disabled={busy} onClick={() => run(() => api.refuseRepoSubstitution(party, p.repoId))}>Refuse substitution</button>
        </>
      );
    if (p.role !== "seller" || p.repurchaseDue || p.instructedByMe || p.interimPending || p.incomePending) return null;
    const substitute = p.security === "tUST" ? "tMMF" : "tUST";
    return <button disabled={busy} onClick={() => run(() => api.requestRepoSubstitution(party, p.repoId, substitute))}>Substitute {substitute}</button>;
  };
  const payment = (p: LiveRepo) => {
    if (!p.verified || p.state !== "purchased") return null;
    if (p.interimPending === "requested") return <span data-testid={`repo-payment-${p.repoId}`}>interim interest USD {p.interimAmount} offered</span>;
    if (p.interimPending === "toDecide")
      return (
        <>
          <button disabled={busy} onClick={() => run(() => api.agreeRepoInterimInterest(party, p.repoId))}>Agree interim interest USD {p.interimAmount}</button>
          <button disabled={busy} onClick={() => run(() => api.refuseRepoInterimInterest(party, p.repoId))}>Refuse interim interest</button>
        </>
      );
    // A buy/sell-back's income lowers the Sell Back Price by the income plus interest; no cash moves (wp-adr-repo-buy-sell-back).
    const lower = p.buySellBack ? `, sell-back price lower by ${usd(p.incomeSellBackDeduction ?? "0")}` : "";
    if (p.incomePending === "requested") return <span data-testid={`repo-payment-${p.repoId}`}>income USD {p.incomeAmount} offered{lower}</span>;
    if (p.incomePending === "toDecide")
      return (
        <>
          <button disabled={busy} onClick={() => run(() => api.agreeRepoIncome(party, p.repoId))}>Agree income USD {p.incomeAmount}{lower}</button>
          <button disabled={busy} onClick={() => run(() => api.refuseRepoIncome(party, p.repoId))}>Refuse income</button>
        </>
      );
    if (p.substitutionPending || p.repurchaseDue || p.instructedByMe) return null;
    // A buy/sell-back has no interim interest: its forward price is fixed at trade.
    if (p.role === "seller") return p.buySellBack ? null : <button disabled={busy} onClick={() => run(() => api.payRepoInterimInterest(party, p.repoId))}>Pay accrued interest</button>;
    return <RepoIncomeEntry disabled={busy} label={p.buySellBack ? "Enter income" : "Pay income"} onPay={(income) => run(() => api.payRepoIncome(party, p.repoId, income))} />;
  };
  const rollAction = (p: LiveRepo) => {
    if (!p.verified || p.state !== "purchased") return null;
    if (p.rollPending === "requested") return <span data-testid={`repo-roll-${p.repoId}`}>roll to {p.rollToDate} at {p.rollRatePercent}% proposed</span>;
    if (p.rollPending === "toDecide")
      return (
        <>
          <button disabled={busy} onClick={() => run(() => api.agreeRepoRoll(party, p.repoId))}>Agree roll to {p.rollToDate} at {p.rollRatePercent}%</button>
          <button disabled={busy} onClick={() => run(() => api.refuseRepoRoll(party, p.repoId))}>Refuse roll</button>
        </>
      );
    if (p.repurchaseDate !== r.businessDate || p.instructedByMe || p.instructedByCounterparty || p.substitutionPending || p.interimPending || p.incomePending || p.pairOffPending) return null;
    return <RepoRollEntry disabled={busy} ratePercent={p.ratePercent ?? ""} onRoll={(roll) => run(() => api.proposeRepoRoll(party, p.repoId, roll))} />;
  };
  const pairOffNet = (net?: string) => (net === undefined ? "" : net.startsWith("-") ? `, pay ${usd(net.slice(1))}` : net === "0" ? ", no cash" : `, receive ${usd(net)}`);
  const pairOffAction = (p: LiveRepo) => {
    if (!p.verified || p.state !== "purchased") return null;
    if (p.pairOffPending === "requested")
      return <span data-testid={`repo-pairoff-${p.repoId}`}>pair-off with {short(p.pairOffWith ?? "")} proposed{pairOffNet(p.pairOffNet)}{p.pairOffProblem ? ` (${p.pairOffProblem})` : ""}</span>;
    if (p.pairOffPending === "toDecide")
      return (
        <>
          {p.pairOffProblem ? (
            <span className="bad" data-testid={`repo-pairoff-${p.repoId}`}>{p.pairOffProblem}</span>
          ) : (
            <button disabled={busy} onClick={() => run(() => api.agreeRepoPairOff(party, p.repoId))}>Agree pair-off with {short(p.pairOffWith ?? "")}{pairOffNet(p.pairOffNet)}</button>
          )}
          <button disabled={busy} onClick={() => run(() => api.refuseRepoPairOff(party, p.repoId))}>Refuse pair-off</button>
        </>
      );
    if (p.repurchaseDate !== r.businessDate || p.instructedByMe || p.instructedByCounterparty || p.substitutionPending || p.interimPending || p.incomePending || p.rollPending) return null;
    // Full pair-off only (wp-adr-repo-pair-off): the same pair in the opposite direction, security, quantity and Repurchase Date.
    const offsetting = r.repos.filter(
      (q) => q.repoId !== p.repoId && q.verified && q.state === "purchased" && q.role !== p.role && q.counterparty === p.counterparty
        && q.security === p.security && q.quantity === p.quantity && q.repurchaseDate === p.repurchaseDate && !q.pairOffPending && !q.rollPending
        && !!q.buySellBack === !!p.buySellBack, // only trades of the same type (wp-adr-repo-buy-sell-back)
    );
    return (
      <>
        {offsetting.map((q) => (
          <button key={q.repoId} disabled={busy} onClick={() => run(() => api.proposeRepoPairOff(party, p.repoId, q.repoId))}>Pair off with {short(q.repoId)}</button>
        ))}
      </>
    );
  };
  return (
    <div className="card" data-testid="repos">
      <h3>Repos</h3>
      <div className="row">
        <span data-testid="business-date">business date {r.businessDate}</span>
        <label>
          Set business date <input aria-label="Business date" type="date" value={date} onChange={(ev) => setDate(ev.target.value)} />
        </label>
        <button disabled={busy || date === ""} onClick={() => run(() => api.setBusinessDate(party, date))}>Set business date</button>
      </div>
      <div className="row">
        <label>
          Type{" "}
          <select aria-label="Repo type" value={buySellBack ? "bsb" : "repo"} onChange={(ev) => setBuySellBack(ev.target.value === "bsb")}>
            <option value="repo">Repo</option>
            <option value="bsb">Buy/sell-back</option>
          </select>
        </label>
        <label>
          Sell{" "}
          <select aria-label="Repo security" value={security} onChange={(ev) => setSecurity(ev.target.value)}>
            <option value="tUST">tUST</option>
            <option value="tMMF">tMMF</option>
          </select>
        </label>
        <label>
          Purchase Price (tUSD) <input aria-label="Purchase Price (tUSD)" type="number" value={purchasePrice} step={100000} onChange={(ev) => setPurchasePrice(Number(ev.target.value))} style={{ width: 120 }} />
        </label>
        <label>
          Repo rate (% p.a.) <input aria-label="Repo rate (% p.a.)" value={ratePercent} onChange={(ev) => setRatePercent(ev.target.value)} style={{ width: 60 }} />
        </label>
        <label>
          Term (days) <input aria-label="Term (days)" type="number" value={termDays} min={1} onChange={(ev) => setTermDays(Number(ev.target.value))} style={{ width: 60 }} />
        </label>
        <label>
          Margin Ratio <input aria-label="Repo Margin Ratio" value={marginRatio} placeholder={defaultMarginRatio} onChange={(ev) => setMarginRatio(ev.target.value)} style={{ width: 60 }} />
        </label>
        <button
          disabled={busy || purchasePrice <= 0 || termDays < 1 || ratePercent === ""}
          onClick={() => run(() => api.bookRepo(party, { security, purchasePrice, ratePercent, termDays, marginRatio: marginRatio === "" ? null : marginRatio, buySellBack }))}
        >
          {buySellBack ? "Book buy/sell-back" : "Book repo"}: sell to {other}
        </button>
      </div>
      {r.repos.length > 0 && (
        <table className="tbl">
          <thead>
            <tr><th>Repo</th><th>Role</th><th>Securities</th><th>Purchase Price</th><th>Repurchase Price</th><th>Dates</th><th>State</th><th></th></tr>
          </thead>
          <tbody>
            {r.repos.map((p) => (
              <tr key={p.repoId} data-testid={`repo-${p.repoId}`}>
                <td className="mono">{short(p.repoId)}</td>
                <td>{p.buySellBack ? "buy/sell-back · " : ""}{p.role} · {p.counterparty}</td>
                <td>{Number(p.quantity).toLocaleString("en-US")} {p.security}{p.price ? ` at ${p.price}` : ""}</td>
                <td>{usd(p.purchasePrice)}</td>
                <td data-testid={`repo-price-${p.repoId}`}>
                  {usd(p.repurchasePrice)}{p.ratePercent ? ` (${p.ratePercent}%)` : ""}
                  {p.buySellBack && p.incomeDeduction && p.incomeDeduction !== "0" ? `, sell back ${usd(p.sellBackPrice ?? p.repurchasePrice)}` : ""}
                </td>
                <td>{p.purchaseDate ? `${p.purchaseDate} → ${p.repurchaseDate}` : "—"}</td>
                <td data-testid={`repo-state-${p.repoId}`}>
                  {p.verified ? <span className="ok">{p.state} ✓</span> : <span className="bad">{p.problem ?? "not verified"}</span>}
                </td>
                <td>{action(p)} {substitution(p)} {payment(p)} {rollAction(p)} {pairOffAction(p)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** A party proposes rolling a repo on its Repurchase Date (wp-adr-repo-roll). The rate starts at the current one. */
function RepoRollEntry(props: { disabled: boolean; ratePercent: string; onRoll: (roll: { newRepurchaseDate: string; ratePercent: string }) => void }) {
  const [newRepurchaseDate, setNewRepurchaseDate] = useState("");
  const [ratePercent, setRatePercent] = useState(props.ratePercent);
  return (
    <>
      <input aria-label="New Repurchase Date" type="date" value={newRepurchaseDate} onChange={(ev) => setNewRepurchaseDate(ev.target.value)} />
      <input aria-label="Roll rate (%)" value={ratePercent} onChange={(ev) => setRatePercent(ev.target.value)} style={{ width: 60 }} />
      <button disabled={props.disabled || newRepurchaseDate === "" || ratePercent === ""} onClick={() => props.onRoll({ newRepurchaseDate, ratePercent })}>Roll repo</button>
    </>
  );
}

/** The Buyer enters income on the purchased securities by hand (wp-adr-repo-income); on a buy/sell-back it lowers the
 *  Sell Back Price instead of being paid (wp-adr-repo-buy-sell-back). */
function RepoIncomeEntry(props: { disabled: boolean; label: string; onPay: (income: { incomePerUnit: string; incomeDate: string }) => void }) {
  const [incomePerUnit, setIncomePerUnit] = useState("");
  const [incomeDate, setIncomeDate] = useState("");
  return (
    <>
      <input aria-label="Income per unit" value={incomePerUnit} onChange={(ev) => setIncomePerUnit(ev.target.value)} style={{ width: 60 }} />
      <input aria-label="Income date" type="date" value={incomeDate} onChange={(ev) => setIncomeDate(ev.target.value)} />
      <button disabled={props.disabled || incomePerUnit === "" || incomeDate === ""} onClick={() => props.onPay({ incomePerUnit, incomeDate })}>{props.label}</button>
    </>
  );
}

/** Repo margin under the GMRA (wp-adr-repo-margin-maintenance): Net Exposure across the pair's repos, the margin call
 *  it allows, settled by title transfer in the calls list, and the interest on Cash Margin. */
function RepoMarginCard(props: { party: LiveParty; other: LiveParty; margin: LiveRepoMargin; busy: boolean; run: (fn: () => Promise<unknown>) => void }) {
  const { party, other, margin: m, busy, run } = props;
  const pending = m.repriceOffered + m.repriceToAgree + m.adjustOffered + m.adjustToAgree + m.substitutionsPending + m.paymentsPending;
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [ratePct, setRatePct] = useState("");
  return (
    <div className="card" data-testid="repo-margin">
      <h3>Repo margin (GMRA)</h3>
      <div className="row">
        <span data-testid="repo-net-exposure">Net Exposure USD {m.netExposureUsd}</span>
        <span>Net Margin held USD {m.netMarginHeldUsd} (cash {m.cashMarginHeldUsd})</span>
        <span>minimum transfer USD {m.minimumTransferAmountUsd}</span>
        {m.callOpen ? (
          <span>a margin call is open</span>
        ) : (
          <button disabled={busy || m.callableUsd === "0" || pending > 0} onClick={() => run(() => api.callRepoMargin(party))}>
            {m.callableUsd === "0" ? "Nothing to call" : `Call margin from ${other}: USD ${m.callableUsd}`}
          </button>
        )}
        {m.repriceToAgree > 0 && (
          <button disabled={busy} onClick={() => run(() => api.agreeRepoReprice(party))}>
            Agree reprice with {other}: {m.repriceToAgree} repo(s)
          </button>
        )}
        {m.adjustToAgree > 0 && (
          <button disabled={busy} onClick={() => run(() => api.agreeRepoAdjustment(party))}>
            Agree adjustment with {other}: {m.adjustToAgree} repo(s)
          </button>
        )}
        {m.repriceOffered > 0 && <span data-testid="repo-reprice-offered">reprice offered to {other}</span>}
        {m.adjustOffered > 0 && <span data-testid="repo-adjust-offered">adjustment offered to {other}</span>}
        {pending === 0 && !m.callOpen && m.callableUsd !== "0" && (
          <>
            <button disabled={busy} onClick={() => run(() => api.proposeRepoReprice(party))}>
              Reprice open repos with {other}
            </button>
            <button disabled={busy} onClick={() => run(() => api.proposeRepoAdjustment(party))}>
              Adjust open repos with {other}
            </button>
          </>
        )}
      </div>
      {m.exposures.length > 0 && (
        <table className="tbl">
          <thead>
            <tr><th>Repo</th><th>Role</th><th>Price</th><th>Exposure</th></tr>
          </thead>
          <tbody>
            {m.exposures.map((e) => (
              <tr key={e.repoId} data-testid={`repo-exposure-${e.repoId}`}>
                <td className="mono">{short(e.repoId)}</td>
                <td>{e.role}</td>
                <td>{e.price}</td>
                <td>{e.exposureUsd}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {Number(m.cashMarginHeldUsd) > 0 && (
        <div className="row">
          <label>
            Interest from <input aria-label="Net Margin period start" type="date" value={periodStart} onChange={(ev) => setPeriodStart(ev.target.value)} />
          </label>
          <label>
            to <input aria-label="Net Margin period end" type="date" value={periodEnd} onChange={(ev) => setPeriodEnd(ev.target.value)} />
          </label>
          <label>
            Overnight rate (%) <input aria-label="Net Margin rate" value={ratePct} onChange={(ev) => setRatePct(ev.target.value)} style={{ width: 60 }} />
          </label>
          <button
            disabled={busy || periodStart === "" || periodEnd === "" || ratePct === ""}
            onClick={() => run(() => api.payRepoMarginInterest(party, { periodStart, periodEnd, observedRatePct: ratePct }))}
          >
            Pay Net Margin interest to {other}
          </button>
        </div>
      )}
      {m.interest.map((i) => (
        <div key={i.interestId} data-testid={`repo-margin-interest-${i.interestId}`}>
          {i.verified ? <span className="ok">USD {i.amountUsd} paid by {i.payer} ✓</span> : <span className="bad">{i.error ?? "not verified"}</span>}
        </div>
      ))}
    </div>
  );
}

function SubstitutionRequest(props: { party: LiveParty; other: LiveParty; busy: boolean; hasPledged: boolean; run: (fn: () => Promise<unknown>) => void }) {
  const { party, other, busy, hasPledged, run } = props;
  const [origToken, setOrigToken] = useState("tUST");
  const [origQty, setOrigQty] = useState(1_000);
  const [subToken, setSubToken] = useState("tUSD");
  const [subQty, setSubQty] = useState(100_000);
  return (
    <div className="card" data-testid="substitution-request">
      <h3>Substitute pledged collateral</h3>
      <div className="row">
        <label>
          Return{" "}
          <select aria-label="Original token" value={origToken} onChange={(e) => setOrigToken(e.target.value)}>
            {TOKENS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <input aria-label="Original quantity" type="number" value={origQty} step={1000} onChange={(e) => setOrigQty(Number(e.target.value))} style={{ width: 110 }} />
        <label>
          for{" "}
          <select aria-label="Substitute token" value={subToken} onChange={(e) => setSubToken(e.target.value)}>
            {TOKENS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <input aria-label="Substitute quantity" type="number" value={subQty} step={1000} onChange={(e) => setSubQty(Number(e.target.value))} style={{ width: 120 }} />
        <button
          disabled={busy || !hasPledged}
          onClick={() => run(() => api.requestSubstitution(party, [{ token: origToken, qty: origQty }], [{ token: subToken, qty: subQty }]))}
        >
          Request substitution → {other}
        </button>
      </div>
      <div className="small">ISDA CSA Paragraph 4(d): the substitute must be worth at least the items returned; {other}'s consent is required.</div>
    </div>
  );
}

function SubstitutionRow(props: { s: LiveSubstitution; party: LiveParty; busy: boolean; run: (fn: () => Promise<unknown>) => void }) {
  const { s, party, busy, run } = props;
  const list = (xs: { token: string; qty: string }[]) => xs.map((a) => `${a.token} ${Number(a.qty).toLocaleString("en-US")}`).join(" + ");
  return (
    <div className="subcard" data-testid={`substitution-${s.substitutionId}`}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <span className="mono">{short(s.substitutionId)}</span> · {s.pledgor} → {s.securedParty} · <strong>{s.state}</strong>
        </div>
        <div className="small">return {list(s.original)} for {list(s.substitute)}</div>
      </div>
      <div className="row">
        {s.securedParty === party && s.state === "requested" && (
          <>
            <button disabled={busy} onClick={() => run(() => api.decideSubstitution(party, s.substitutionId, true))}>Consent</button>
            <button disabled={busy} onClick={() => run(() => api.decideSubstitution(party, s.substitutionId, false, "Refused by the secured party"))}>Refuse</button>
          </>
        )}
        {s.pledgor === party && s.state === "consented" && (
          <button disabled={busy} onClick={() => run(() => api.settleSubstitution(party, s.substitutionId))}>Settle substitution</button>
        )}
        {s.state === "settled" && <span className="ok">substituted on-chain ✓</span>}
        {s.cdm.converged && s.cdm.qualifiers && (
          <span className="small mono">CDM: {s.cdm.qualifiers[s.cdm.qualifiers.length - 1]}</span>
        )}
        {s.cdm.error && <span className="bad small">{s.cdm.error}</span>}
      </div>
    </div>
  );
}

const BREAK: Record<string, string> = {
  MissingFromSecond: "missing at the second party",
  MissingFromFirst: "missing at the first party",
  EconomicTermsDiffer: "economic terms differ",
  ValuationDiffers: "valuations differ",
};

/** Reconciliation (flow-reconciliation): trade portfolios with the counterparty, and this party's records with the chain. */
function ReconciliationCard(props: { party: LiveParty; other: LiveParty; latest: LivePortfolioReconciliation | null; busy: boolean; run: (fn: () => Promise<unknown>) => void }) {
  const { party, other, latest: r, busy, run } = props;
  const [ledger, setLedger] = useState<LiveLedgerReconciliation | null>(null);
  return (
    <div className="card" data-testid="reconciliation">
      <h3>Reconciliation</h3>
      <div className="row">
        <button disabled={busy} onClick={() => run(() => api.reconcilePortfolio(party))}>Reconcile portfolios → {other}</button>
        <button disabled={busy} onClick={() => run(() => api.reconcileWithLedger(party).then(setLedger))}>Reconcile with ledger</button>
      </div>
      <div className="small">
        The trade snapshots go service to service; only their hashes and each party's result hash are recorded on-chain.
      </div>
      {r && (
        <div className="subcard" data-testid={`reconciliation-${r.reconciliationId}`}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <span className="mono">{short(r.reconciliationId)}</span> · {r.firstParty} with {r.secondParty} ·{" "}
              <strong data-testid="reconciliation-status">{r.reconciled ? "reconciled" : `${r.breaks.length} break${r.breaks.length === 1 ? "" : "s"}`}</strong> ·{" "}
              {r.matchedTrades} matched
            </div>
            <div className="small" data-testid="reconciliation-onchain">
              {r.onChain.state === "agreed" ? <span className="ok">both results agree on-chain ✓</span> : r.onChain.state === "disagreed" ? <span className="bad">results differ on-chain</span> : r.onChain.state}
            </div>
          </div>
          <div className="small">
            exposure {r.firstParty} {usd(r.firstExposureUsd)} · {r.secondParty} {usd(r.secondExposureUsd)} · difference{" "}
            <span data-testid="exposure-difference">{usd(r.exposureDifferenceUsd)}</span> · tolerance {usd(r.toleranceUsd)} a trade
          </div>
          {r.breaks.length > 0 && (
            <table className="tbl">
              <thead>
                <tr><th>UTI</th><th>Break</th><th>{r.firstParty} value</th><th>{r.secondParty} value</th><th>Difference</th></tr>
              </thead>
              <tbody>
                {r.breaks.map((b) => (
                  <tr key={`${b.uti}-${b.type}`} data-testid={`break-${b.uti}`}>
                    <td className="mono">{b.uti}</td>
                    <td>{BREAK[b.type] ?? b.type}{b.terms.length > 0 ? `: ${b.terms.join(", ")}` : ""}</td>
                    <td>{b.firstValuationUsd ? usd(b.firstValuationUsd) : "—"}</td>
                    <td>{b.secondValuationUsd ? usd(b.secondValuationUsd) : "—"}</td>
                    <td>{b.differenceUsd ? usd(b.differenceUsd) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {ledger && (
        <div className="subcard" data-testid="ledger-reconciliation">
          <strong>{ledger.reconciled ? <span className="ok">records match the ledger ✓</span> : <span className="bad">{ledger.breaks.length} differences from the ledger</span>}</strong>{" "}
          <span className="small">· {ledger.calls} calls, {ledger.checkedFacts} facts checked</span>
          {ledger.escrow && (
            <div className="small" data-testid="ledger-escrow">
              escrow ({ledger.escrow.record.replace(/^escrow /, "")}):{" "}
              {Object.keys(ledger.escrow.ledger).length === 0 ? "none" : Object.entries(ledger.escrow.ledger).map(([t, q]) => `${t} ${q.toLocaleString("en-US")}`).join(", ")}
            </div>
          )}
          {ledger.breaks.length > 0 && (
            <ul className="small">
              {ledger.breaks.map((b) => (
                <li key={`${b.record}-${b.attribute}`}>
                  <span className="mono">{short(b.record)}</span> {b.attribute}: {b.type} (records {b.recorded ?? "—"}, ledger {b.ledger ?? "—"})
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
