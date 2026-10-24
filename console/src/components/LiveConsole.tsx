// Live party console: drives the real stack (collateral service -> ledger gateway -> Besu) for one participant,
// instead of the in-browser engine mock. One instance per party (route #/live/A, #/live/B). Polls the party's
// workflow service for on-chain call, proposal and balance state and offers the lifecycle actions for its role.
import { useCallback, useEffect, useState } from "react";
import { api, type LiveCall, type LiveContext, type LiveParty, type LiveState } from "../domain/liveApi";

const short = (h: string) => (h.length > 12 ? `${h.slice(0, 8)}…${h.slice(-4)}` : h);
const usd = (s: string) => "USD " + Number(s).toLocaleString("en-US");

export function LiveConsole({ party }: { party: LiveParty }) {
  const [ctx, setCtx] = useState<LiveContext | null>(null);
  const [state, setState] = useState<LiveState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState(5_000_000);
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
    const t = setInterval(() => live && refresh(), 2000);
    return () => {
      live = false;
      clearInterval(t);
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
          <h3>Issue initial-margin call</h3>
          <div className="row">
            <label>
              Amount (USD){" "}
              <input type="number" value={amount} step={500000} onChange={(e) => setAmount(Number(e.target.value))} />
            </label>
            <button disabled={busy} onClick={() => run(() => api.issueCall(party, other, amount, "IM"))}>
              Issue IM call → {other}
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <h3>Margin calls</h3>
        {!state?.calls.length && <div className="small">No calls yet.</div>}
        {state?.calls.map((c) => (
          <CallRow
            key={c.callId}
            call={c}
            party={party}
            isSecured={isSecured}
            busy={busy}
            token={token}
            qty={qty}
            setToken={setToken}
            setQty={setQty}
            run={run}
          />
        ))}
      </div>
    </div>
  );
}

function CallRow(props: {
  call: LiveCall;
  party: LiveParty;
  isSecured: boolean;
  busy: boolean;
  token: string;
  qty: number;
  setToken: (s: string) => void;
  setQty: (n: number) => void;
  run: (fn: () => Promise<unknown>) => void;
}) {
  const { call: c, party, isSecured, busy, token, qty, setToken, setQty, run } = props;
  const accepted = c.proposals.find((p) => p.state === "accepted");
  const proposed = c.proposals.find((p) => p.state === "proposed");
  const settled = c.state === "settled" || c.state === "settled (agreed part)";
  const canRespond = !isSecured && c.to === party && c.state === "issued" && c.kind !== "Return";
  const canPropose = !isSecured && c.to === party && (c.state === "agreed" || c.state === "partially agreed") && !proposed && !accepted;
  const canPledge = !isSecured && c.to === party && accepted && !settled;
  const canDecide = isSecured && c.from === party && !!proposed;

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
        {canRespond && <button disabled={busy} onClick={() => run(() => api.respond(party, c.callId, "full"))}>Agree in full</button>}
        {canPropose && (
          <>
            <select value={token} onChange={(e) => setToken(e.target.value)}>
              <option value="tUST">tUST</option>
              <option value="tMMF">tMMF</option>
            </select>
            <input type="number" value={qty} step={1000} onChange={(e) => setQty(Number(e.target.value))} style={{ width: 110 }} />
            <button disabled={busy} onClick={() => run(() => api.propose(party, c.callId, [{ token, qty }]))}>Propose collateral</button>
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
