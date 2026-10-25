// Live party console: drives the real stack (collateral service -> ledger gateway -> Besu) for one participant,
// instead of the in-browser engine mock. One instance per party (route #/live/A, #/live/B). Polls the party's
// workflow service for on-chain call, proposal and balance state and offers the lifecycle actions for its role.
// Actions are keyed on the call's from/to/kind/state (not the party's role), so the same row serves delivery calls
// (the pledgor acts on settlement) and return calls (the secured party agrees and releases).
import { useCallback, useEffect, useState } from "react";
import { api, serviceUrl, type LiveCall, type LiveContext, type LiveParty, type LiveState } from "../domain/liveApi";

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

  const refresh = useCallback(async () => {
    try {
      setState(await api.state(party));
      setError(null);
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

      <div className="card">
        <h3>Margin calls</h3>
        {!state?.calls.length && <div className="small">No calls yet.</div>}
        {state?.calls.map((c) => (
          <CallRow key={c.callId} call={c} party={party} busy={busy} token={token} qty={qty} setToken={setToken} setQty={setQty} run={run} />
        ))}
      </div>
    </div>
  );
}

function CallRow(props: {
  call: LiveCall;
  party: LiveParty;
  busy: boolean;
  token: string;
  qty: number;
  setToken: (s: string) => void;
  setQty: (n: number) => void;
  run: (fn: () => Promise<unknown>) => void;
}) {
  const { call: c, party, busy, token, qty, setToken, setQty, run } = props;
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
        {settled && <span className="ok">settled on-chain ✓</span>}
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
