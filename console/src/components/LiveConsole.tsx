// Live party console: drives the real stack (collateral service -> ledger gateway -> Besu) for one participant,
// instead of the in-browser engine mock. One instance per party (route #/live/A, #/live/B). Polls the party's
// workflow service for on-chain call, proposal and balance state and offers the lifecycle actions for its role.
// Actions are keyed on the call's from/to/kind/state (not the party's role), so the same row serves delivery calls
// (the pledgor acts on settlement) and return calls (the secured party agrees and releases). The secured party can
// also declare the pledgor's default and enforce against the pledged initial margin (flow-default-enforcement), or
// close out the netting set and apply the pledged collateral to the Early Termination Amount (flow-close-out-netting).
// The pledgor can ask to substitute pledged collateral, which the secured party consents to or refuses
// (flow-substitution).
import { useCallback, useEffect, useState } from "react";
import {
  api,
  serviceUrl,
  type LiveCall,
  type LiveCloseOut,
  type LiveContext,
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

  const refresh = useCallback(async () => {
    try {
      setState(await api.state(party));
      setError(null);
      // Shown to the secured party only (render below); a failure here must not hide the call state.
      api.revaluation(party).then(setReval).catch(() => setReval(null));
      api.closeOuts(party).then(setCloseOuts).catch(() => setCloseOuts([]));
      api.substitutions(party).then(setSubs).catch(() => setSubs([]));
    } catch (e) {
      setError(`service ${party} unreachable: ${(e as Error).message}`);
    }
  }, [party]);

  useEffect(() => {
    let live = true;
    api.context(party).then(setCtx).catch((e) => setError((e as Error).message));
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

  const isSecured = ctx.role === "Secured Party";
  const other = ctx.counterparty;
  const hasPledged = !!state?.balances.some((b) => Number(b.pledged) > 0);
  const inDefault = (["A", "B"] as LiveParty[]).filter((p) => state?.defaults?.[p]);

  return (
    <div>
      <div className="card" style={{ borderLeft: `4px solid ${isSecured ? "#2563eb" : "#059669"}` }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <strong>{ctx.role}</strong> · party {ctx.party} · node {ctx.node}
            <div className="mono small">{ctx.address}</div>
          </div>
          <div className="small">
            counterparty {other} · live stack
            <div className="mono small">{ctx.agreement}</div>
          </div>
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
            <tr><th>Token</th><th>Free</th><th>Pledged (escrow)</th></tr>
          </thead>
          <tbody>
            {state?.balances.map((b) => (
              <tr key={b.token}>
                <td className="mono">{b.token}</td>
                <td>{Number(b.free).toLocaleString("en-US")}</td>
                <td>{Number(b.pledged).toLocaleString("en-US")}</td>
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
          <CallRow key={c.callId} call={c} party={party} hasPledged={hasPledged} busy={busy} token={token} qty={qty} setToken={setToken} setQty={setQty} run={run} />
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
}) {
  const { call: c, party, hasPledged, busy, token, qty, setToken, setQty, run } = props;
  const [partialUsd, setPartialUsd] = useState(0);
  const [staged, setStaged] = useState<{ token: string; qty: number }[]>([]); // multi-asset proposal basket
  const accepted = c.proposals.find((p) => p.state === "accepted");
  const proposed = c.proposals.find((p) => p.state === "proposed");
  const agreedOpen = c.state === "agreed" || c.state === "partially agreed";
  const settled = c.state === "settled" || c.state === "settled (agreed part)";

  // Actions follow the call's parties: the called party (c.to) responds and, for a delivery, delivers on settlement;
  // the caller (c.from) decides proposals. A return call is agreed and released by the secured party (c.to).
  const acts = c.to === party;
  const canRespond = acts && c.state === "issued";
  const canPropose = acts && agreedOpen && c.kind !== "Return" && !proposed && !accepted;
  const canDecide = c.from === party && !!proposed;
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
            {staged.length > 0 && <span className="small">basket: {staged.map((a) => `${a.token} ${a.qty.toLocaleString("en-US")}`).join(" + ")}</span>}
            <button
              disabled={busy}
              onClick={() => run(() => api.propose(party, c.callId, staged.length ? staged : [{ token, qty }]).then(() => setStaged([])))}
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
