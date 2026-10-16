import { useState } from "react";
import { assetsValue, evaluateProposal, haircut, pledgedValue, type Action } from "../domain/engine";
import { AGREEMENTS, PARTIES, px, qty, TOKENS, usd } from "../domain/reference";
import type { Asset, MarginCall, PartyId, State, TokenId } from "../domain/types";
import type { Scenario, Step } from "../scenarios/scenarios";

const chipFor = (state: string) =>
  /settled/.test(state) || state === "accepted" ? "s-ok" : /rejected/.test(state) ? "s-bad" : /partial|disputed/.test(state) ? "s-warn" : "s-info";

export interface ConsoleProps {
  s: State;
  party: PartyId;
  sc: Scenario;
  /** Guided mode: the current step, and what to do when its button is pressed. */
  step?: Step;
  onStep?: () => void;
  /** Free mode: submit an action; returns an error message or null. */
  onAct?: (a: Action) => string | null;
}

export function Console({ s, party, sc, step, onStep, onAct }: ConsoleProps) {
  const [error, setError] = useState<string | null>(null);
  const act = onAct ? (a: Action) => setError(onAct(a)) : undefined;
  const role = AGREEMENTS[sc.kind].roles[party];
  const p = PARTIES[party];
  return (
    <section className={`console ${party}`} aria-label={`${p.name} console`}>
      <header>
        <div className="row">
          <h3>{p.name}</h3>
          <span className={`party p-${party}`}>{role}</span>
        </div>
        <span className="note mono">
          stack {p.stack} · Besu node {p.node}
        </span>
      </header>
      <div className="body">
        {step && step.actor === party && onStep && <NextAction s={s} step={step} onStep={onStep} />}
        {step && step.actor !== party && <div className="waiting">Waiting for {PARTIES[step.actor].name}</div>}
        {error && (
          <div className="err" role="alert">
            {error}
          </div>
        )}
        {party === "M" ? (
          <Market s={s} act={act} />
        ) : (
          <>
            <AgreementBox sc={sc} party={party} />
            {act && <PartyForms s={s} party={party} act={act} />}
            <Calls s={s} party={party} act={act} />
            <Positions s={s} party={party} />
          </>
        )}
      </div>
    </section>
  );
}

function NextAction({ s, step, onStep }: { s: State; step: Step; onStep: () => void }) {
  let checks: { ok: boolean; text: string }[] = [];
  if (step.action.type === "decideProposal") {
    const a = step.action;
    const c = s.calls.find((x) => x.id === a.callId);
    const pr = c?.proposals.find((x) => x.id === a.proposalId);
    if (c && pr) checks = evaluateProposal(s, c, pr);
  }
  return (
    <div className="next">
      <div className="eyebrow">Your next action</div>
      <b>{step.say}</b>
      {step.display && (
        <div className="tscroll">
          <table className="t">
            <tbody>
              {step.display.map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td className="r num">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {checks.length > 0 && <Checks checks={checks} />}
      <button className="go" id="go" onClick={onStep}>
        {step.label}
      </button>
    </div>
  );
}

function Checks({ checks }: { checks: { ok: boolean; text: string }[] }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 2, fontSize: ".84rem" }}>
      {checks.map((c, i) => (
        <li key={i} className={c.ok ? "check-ok" : "check-bad"}>
          {c.text}
        </li>
      ))}
    </ul>
  );
}

function AgreementBox({ sc, party }: { sc: Scenario; party: PartyId }) {
  const a = AGREEMENTS[sc.kind];
  return (
    <details className="sect">
      <summary className="eyebrow">Agreement · {a.roles[party]}</summary>
      <p className="note">{a.doc}</p>
      <dl className="kv">
        {a.terms.map(([k, v]) => (
          <div key={k} style={{ display: "contents" }}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="tscroll">
        <table className="t">
          <thead>
            <tr>
              <th>Eligible</th>
              <th className="r">Haircut</th>
              <th>Limit</th>
            </tr>
          </thead>
          <tbody>
            {a.eligible.map((e) => (
              <tr key={e.token}>
                <td>{e.token}</td>
                <td className="r">{Math.round(e.haircut * 100)}%</td>
                <td>{e.concentration ? `max ${Math.round(e.concentration * 100)}%` : "none"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

const num = (v: string) => Number(v.replace(/[,\s]/g, ""));

function PartyForms({ s, party, act }: { s: State; party: PartyId; act: (a: Action) => void }) {
  const [amount, setAmount] = useState("");
  const [req, setReq] = useState("");
  const [tq, setTq] = useState("");
  const counterparty: PartyId = party === "A" ? "B" : "A";
  const callKind = s.kind === "IM" ? (party === "B" ? "IM" : "Return") : party === "B" ? "VM" : "Return";
  return (
    <div className="sect">
      <div className="eyebrow">Actions</div>
      <form
        className="form"
        aria-label={`Issue ${callKind === "Return" ? "return " : ""}call`}
        onSubmit={(e) => {
          e.preventDefault();
          act({ type: "issueCall", by: party, to: counterparty, kind: callKind, amount: num(amount), deadline: "2026-10-19", requirement: req ? num(req) : undefined });
        }}
      >
        <b>{callKind === "Return" ? "Call for a return" : `Issue ${callKind} call`}</b>
        <div className="row2">
          <label>
            Amount (USD)
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder={callKind === "Return" ? "4,300,000" : "12,400,000"} />
          </label>
          <label>
            {s.kind === "IM" ? "New requirement" : "New exposure"} (optional)
            <input value={req} onChange={(e) => setReq(e.target.value)} inputMode="numeric" />
          </label>
          <button className="btn2" type="submit">
            Issue
          </button>
        </div>
      </form>
      {s.kind === "VM" && party === "B" && (
        <form
          className="form"
          aria-label="Move cash to treasury"
          onSubmit={(e) => {
            e.preventDefault();
            act({ type: "transfer", by: party, token: "tUSD", qty: num(tq), to: "BANK-B treasury" });
          }}
        >
          <b>Move cash to treasury (reuse)</b>
          <div className="row2">
            <label>
              tUSD
              <input value={tq} onChange={(e) => setTq(e.target.value)} inputMode="numeric" />
            </label>
            <button className="btn2" type="submit">
              Move
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function Calls({ s, party, act }: { s: State; party: PartyId; act?: (a: Action) => void }) {
  const mine = s.calls.filter((c) => c.from === party || c.to === party).slice().reverse();
  return (
    <div className="sect">
      <div className="eyebrow">Margin calls</div>
      {mine.length === 0 && <p className="empty">No calls yet.</p>}
      {mine.map((c) => (
        <div className="callcard" key={c.id} data-call={c.id}>
          <div className="row">
            <b className="mono">{c.id}</b>
            <span className={`chip ${chipFor(c.state)}`}>{c.state}</span>
          </div>
          <dl className="kv">
            <dt>
              {c.kind === "Return" ? "Return call" : c.kind + " call"}, {c.from === party ? "sent to " + PARTIES[c.to].name : "from " + PARTIES[c.from].name}
            </dt>
            <dd className="num">{usd(c.amount)}</dd>
            {c.agreed > 0 && (
              <>
                <dt>Agreed</dt>
                <dd className="num">{usd(c.agreed)}</dd>
              </>
            )}
            {c.disputed > 0 && (
              <>
                <dt>Disputed (off-chain)</dt>
                <dd className="num">{usd(c.disputed)}</dd>
              </>
            )}
            <dt>Deadline</dt>
            <dd className="num">{c.deadline}</dd>
          </dl>
          {c.proposals.map((pr) => (
            <div className="row" key={pr.id}>
              <span className="mono">
                {pr.id}: {pr.assets.map(([t, q]) => qty(q) + " " + t).join(" + ")}
              </span>
              <span className={`chip ${chipFor(pr.state)}`} title={pr.reason}>
                {pr.state}
              </span>
            </div>
          ))}
          {act && <CallActions s={s} c={c} party={party} act={act} />}
        </div>
      ))}
    </div>
  );
}

function CallActions({ s, c, party, act }: { s: State; c: MarginCall; party: PartyId; act: (a: Action) => void }) {
  const [resp, setResp] = useState<"full" | "partial" | "dispute">("full");
  const [agreed, setAgreed] = useState("");
  const [prop, setProp] = useState<Record<TokenId, string>>({ tUST: "", tMMF: "", tUSD: "" });
  const [reason, setReason] = useState("");
  const open = c.state === "agreed" || c.state === "partially agreed";
  const pending = c.proposals.find((p) => p.state === "proposed");
  const accepted = c.proposals.find((p) => p.state === "accepted");
  const tokens = (Object.keys(TOKENS) as TokenId[]).filter((t) => party !== "M" && s.wallet[party as "A" | "B"][t] > 0);
  const defaultRelease = (() => {
    const h = haircut(s, "tUST") ?? 0;
    return Math.floor(c.amount / (s.feed.tUST * (1 - h)));
  })();
  const forms: JSX.Element[] = [];

  if (c.to === party && c.state === "issued" && c.kind !== "Return")
    forms.push(
      <form key="respond" className="form" aria-label={`Respond to ${c.id}`} onSubmit={(e) => { e.preventDefault(); act({ type: "respond", by: party, callId: c.id, response: resp, agreed: num(agreed) }); }}>
        <div className="row2">
          <label>
            Response
            <select value={resp} onChange={(e) => setResp(e.target.value as typeof resp)}>
              <option value="full">Agree in full</option>
              <option value="partial">Partially agree</option>
              <option value="dispute">Dispute</option>
            </select>
          </label>
          {resp === "partial" && (
            <label>
              Agreed (USD)
              <input value={agreed} onChange={(e) => setAgreed(e.target.value)} inputMode="numeric" />
            </label>
          )}
          <button className="btn2" type="submit">Respond</button>
        </div>
      </form>,
    );

  if (c.to === party && c.state === "issued" && c.kind === "Return" && s.kind === "IM")
    forms.push(
      <form key="release" className="form" aria-label={`Agree and release ${c.id}`} onSubmit={(e) => { e.preventDefault(); act({ type: "agreeReturn", by: party, callId: c.id, release: [["tUST", num(prop.tUST || String(defaultRelease))]] }); }}>
        <div className="row2">
          <label>
            Release tUST
            <input value={prop.tUST} placeholder={qty(defaultRelease)} onChange={(e) => setProp({ ...prop, tUST: e.target.value })} inputMode="numeric" />
          </label>
          <button className="btn2" type="submit">Agree and release</button>
        </div>
      </form>,
    );

  if (c.to === party && c.state === "issued" && c.kind === "Return" && s.kind === "VM")
    forms.push(
      <form key="repay" className="form" aria-label={`Agree and transfer ${c.id}`} onSubmit={(e) => { e.preventDefault(); act({ type: "agreeReturnTransfer", by: party, callId: c.id, assets: [["tUSD", c.amount]] }); }}>
        <div className="row2">
          <span className="note">Pay back {usd(c.amount)} in tUSD</span>
          <button className="btn2" type="submit">Agree and transfer</button>
        </div>
      </form>,
    );

  if (c.to === party && open && !pending && !accepted && c.kind !== "Return") {
    const assets: Asset[] = tokens.filter((t) => num(prop[t]) > 0).map((t) => [t, num(prop[t])]);
    forms.push(
      <form key="propose" className="form" aria-label={`Propose collateral for ${c.id}`} onSubmit={(e) => { e.preventDefault(); act({ type: "propose", by: party, callId: c.id, assets }); }}>
        <b>Propose collateral</b>
        <div className="row2">
          {tokens.map((t) => (
            <label key={t}>
              {t} (holds {qty(s.wallet[party as "A" | "B"][t])})
              <input value={prop[t]} onChange={(e) => setProp({ ...prop, [t]: e.target.value })} inputMode="numeric" />
            </label>
          ))}
          <button className="btn2" type="submit">Propose</button>
        </div>
        <span className="note">Value after haircuts: {usd(assetsValue(s, assets))} of {usd(c.agreed)} agreed</span>
      </form>,
    );
  }

  if (c.from === party && pending)
    forms.push(
      <div key="decide" className="form" aria-label={`Decide on ${pending.id}`}>
        <b>Decide on {pending.id}</b>
        <Checks checks={evaluateProposal(s, c, pending)} />
        <div className="row2">
          <button className="btn2" onClick={() => act({ type: "decideProposal", by: party, callId: c.id, proposalId: pending.id, accept: true })}>Accept</button>
          <label>
            Reason
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <button className="btn2 danger" onClick={() => act({ type: "decideProposal", by: party, callId: c.id, proposalId: pending.id, accept: false, reason: reason || undefined })}>Reject</button>
        </div>
      </div>,
    );

  // Offered whenever the call is open, so the contract's own checks can be tried (and seen to reject).
  if (c.to === party && open && c.kind !== "Return") {
    const pid = (accepted ?? pending ?? c.proposals[c.proposals.length - 1])?.id;
    if (pid)
      forms.push(
        <div key="settle" className="form">
          <div className="row2">
            <button className="btn2" onClick={() => act(s.kind === "IM" ? { type: "pledge", by: party, callId: c.id, proposalId: pid } : { type: "settleByTransfer", by: party, callId: c.id, proposalId: pid })}>
              {s.kind === "IM" ? `Pledge ${pid}` : `Transfer ${pid}`}
            </button>
          </div>
        </div>,
      );
  }

  if (c.from === party && s.kind === "IM" && c.kind === "IM" && s.pledges.some((p) => p.state === "pledged"))
    forms.push(
      <div key="enforce" className="form">
        <div className="row2">
          <button className="btn2 danger" onClick={() => act({ type: "enforce", by: party, callId: c.id })}>Enforce</button>
          <span className="note">The contract checks the default status on the oracle feed.</span>
        </div>
      </div>,
    );
  return <>{forms}</>;
}

function Positions({ s, party }: { s: State; party: PartyId }) {
  if (party === "M") return null;
  const w = s.wallet[party];
  const rows = (Object.keys(w) as TokenId[]).filter((t) => w[t] > 0 || (s.kind === "VM" ? t === "tUSD" : t !== "tUSD"));
  const live = s.pledges.filter((x) => x.state !== "returned");
  const v = pledgedValue(s);
  return (
    <>
      <div className="sect">
        <div className="eyebrow">Wallet</div>
        <div className="tscroll">
          <table className="t">
            <thead>
              <tr>
                <th>Token</th>
                <th className="r">Quantity</th>
                <th className="r">Price</th>
                <th className="r">Market value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t} data-wallet={`${party}-${t}`}>
                  <td title={TOKENS[t].name}>{t}</td>
                  <td className="r num">{qty(w[t])}</td>
                  <td className="r num">{px(s.feed[t])}</td>
                  <td className="r num">{usd(w[t] * s.feed[t])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {s.kind === "IM" ? (
        <div className="sect">
          <div className="eyebrow">{party === "A" ? "Pledged to BANK-B (control contract)" : "Pledged to us by BANK-A (control contract)"}</div>
          {live.length ? (
            <div className="tscroll">
              <table className="t">
                <thead>
                  <tr>
                    <th>Token</th>
                    <th className="r">Quantity</th>
                    <th className="r">After haircut</th>
                    <th>State</th>
                  </tr>
                </thead>
                <tbody>
                  {live.map((x, i) => (
                    <tr key={i}>
                      <td>{x.token}</td>
                      <td className="r num">{qty(x.qty)}</td>
                      <td className="r num">{usd(assetsValue(s, [[x.token, x.qty]]))}</td>
                      <td>
                        <span className={`chip ${x.state === "pledged" ? "s-ok" : "s-bad"}`}>{x.state}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty">Nothing pledged.</p>
          )}
          {s.req > 0 && (
            <dl className="kv" data-testid={`coverage-${party}`}>
              <dt>Required above threshold</dt>
              <dd className="num">{usd(s.req)}</dd>
              <dt>Collateral after haircuts</dt>
              <dd className="num">{usd(v)}</dd>
              <dt>Coverage</dt>
              <dd>
                <span className={`chip ${v >= s.req ? "s-ok" : "s-warn"}`}>{v >= s.req ? "covered" : "short " + usd(s.req - v)}</span>
              </dd>
            </dl>
          )}
          {party === "B" && <p className="note">Segregated: BANK-B cannot reuse these tokens.</p>}
        </div>
      ) : (
        <div className="sect">
          <div className="eyebrow">Credit support balance</div>
          <dl className="kv">
            <dt>{party === "A" ? "Transferred to BANK-B" : "Received from BANK-A (title passed)"}</dt>
            <dd className="num">{usd(s.held)}</dd>
            <dt>Exposure (MTM)</dt>
            <dd className="num">{usd(s.req)}</dd>
          </dl>
          {party === "B" && s.reused > 0 && <p className="note">{usd(s.reused)} moved to BANK-B treasury (reuse allowed).</p>}
        </div>
      )}
    </>
  );
}

function Market({ s, act }: { s: State; act?: (a: Action) => void }) {
  const [price, setPrice] = useState<Record<TokenId, string>>({ tUST: "", tMMF: "", tUSD: "" });
  return (
    <>
      <div className="sect">
        <div className="eyebrow">Market data</div>
        <div className="tscroll">
          <table className="t">
            <thead>
              <tr>
                <th>Asset</th>
                <th className="r">Mock source</th>
                <th className="r">On-chain feed</th>
                {act && <th />}
              </tr>
            </thead>
            <tbody>
              {(["tUST", "tMMF"] as TokenId[]).map((t) => (
                <tr key={t}>
                  <td title={TOKENS[t].name}>{t}</td>
                  <td className="r num">{px(s.mock[t])}</td>
                  <td className="r num">{px(s.feed[t])}</td>
                  {act && (
                    <td>
                      <form className="row2" style={{ display: "flex", gap: 4, flexWrap: "wrap" }} aria-label={`Set ${t} price`} onSubmit={(e) => { e.preventDefault(); act({ type: "setMockPrice", by: "M", token: t, price: Number(price[t]) }); }}>
                        <input style={{ width: "5rem" }} value={price[t]} onChange={(e) => setPrice({ ...price, [t]: e.target.value })} placeholder={px(s.mock[t])} aria-label={`${t} price`} />
                        <button className="btn2" type="submit">Set</button>
                        <button className="btn2" type="button" onClick={() => act({ type: "publishPrice", by: "M", token: t })}>Publish</button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="sect">
        <div className="eyebrow">Default status on feed</div>
        <dl className="kv">
          {(["A", "B"] as PartyId[]).map((p) => (
            <div key={p} style={{ display: "contents" }}>
              <dt>{PARTIES[p].name}</dt>
              <dd>
                <span className={`chip ${s.defaulted.includes(p) ? "s-bad" : "s-ok"}`}>{s.defaulted.includes(p) ? "in default" : "performing"}</span>
              </dd>
            </div>
          ))}
        </dl>
        {act && (
          <div className="form">
            <div className="row2">
              <button className="btn2 danger" onClick={() => act({ type: "publishDefault", by: "M", party: "A" })}>Publish BANK-A default</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
