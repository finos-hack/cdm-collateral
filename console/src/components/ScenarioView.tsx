import { useMemo, useState } from "react";
import { capInfo } from "../domain/coverage";
import { apply, EngineError, type Action } from "../domain/engine";
import { AGREEMENTS, PARTIES } from "../domain/reference";
import type { PartyId, State } from "../domain/types";
import { scenarioById, type Scenario } from "../scenarios/scenarios";
import { stateAt } from "../scenarios/run";
import { Console } from "./Console";
import { scoreClass } from "./Grid";
import { Timeline } from "./Timeline";

export type Mode = "guided" | "free";

export function ScenarioView({ id, mode }: { id: string; mode: Mode }) {
  const sc = scenarioById(id)!;
  return (
    <>
      <div className="scbar">
        <a className="btn" href="#/" style={{ textDecoration: "none" }}>
          ← Scenarios
        </a>
        <h2 style={{ flex: "1 1 280px" }}>{sc.title}</h2>
        <span className="tag">{AGREEMENTS[sc.kind].label}</span>
        <span className="tag">{sc.flow}</span>
        <nav className="modes" aria-label="Mode">
          <a href={`#/s/${sc.id}/guided`} aria-current={mode === "guided" ? "page" : undefined}>
            Guided
          </a>
          <a href={`#/s/${sc.id}/free`} aria-current={mode === "free" ? "page" : undefined}>
            Free
          </a>
        </nav>
      </div>
      {mode === "guided" ? <Guided sc={sc} /> : <Free sc={sc} />}
    </>
  );
}

function Track({ sc, k }: { sc: Scenario; k: number }) {
  return (
    <div className="track">
      <div className="eyebrow">Steps</div>
      <ol>
        {sc.steps.map((st, i) => (
          <li key={i} className={i < k ? "done" : i === k ? "cur" : ""}>
            <span className="n">{i + 1}</span>
            <span>
              {st.say} <span className={`party p-${st.actor}`}>{PARTIES[st.actor].name}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Guided({ sc }: { sc: Scenario }) {
  const [k, setK] = useState(0);
  const s = useMemo(() => stateAt(sc, k), [sc, k]);
  const step = sc.steps[k];
  return (
    <>
      <div className="scbar">
        <button className="btn" onClick={() => setK(k - 1)} disabled={k === 0}>
          Undo step
        </button>
        <button className="btn" onClick={() => setK(0)} disabled={k === 0}>
          Restart
        </button>
      </div>
      {step ? (
        <div className="guide" role="region" aria-label="Guide">
          <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
            <div className="who">
              <span className="eyebrow">
                Step {k + 1} of {sc.steps.length}
              </span>
              <span className={`party p-${step.actor}`}>
                {PARTIES[step.actor].name} · {AGREEMENTS[sc.kind].roles[step.actor]}
              </span>
              <span className="ref">CALM {step.calm}</span>
            </div>
            <p className="say">
              {step.say} <span className="muted">· use the highlighted button in {PARTIES[step.actor].name}'s console</span>
            </p>
            <p className="why">{step.why}</p>
            <div className="refs">
              {step.refs.map((r) => (
                <span key={r} className="ref">
                  {r}
                </span>
              ))}
            </div>
            {step.caps.length > 0 && (
              <div className="capchips">
                <span className="eyebrow">CDM 7.6.0 coverage</span>
                {step.caps.map((c) => {
                  const i = capInfo(sc.kind, c);
                  return (
                    <span key={i.id} className={`cov ${scoreClass(i.score)}`} style={{ marginTop: 0 }}>
                      {i.id} {i.name} · {i.score}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          <Track sc={sc} k={k} />
        </div>
      ) : (
        <div className="guide">
          <div className="done-box">
            <h3>Scenario complete</h3>
            <p>{sc.outcome}</p>
            <div className="scbar">
              <a className="btn" href="#/" style={{ textDecoration: "none" }}>
                Back to scenarios
              </a>
              <button className="btn" onClick={() => setK(0)}>
                Run again
              </button>
              <a className="btn" href={`#/s/${sc.id}/free`} style={{ textDecoration: "none" }}>
                Try it in free mode
              </a>
            </div>
          </div>
          <Track sc={sc} k={k} />
        </div>
      )}
      <div className="consoles">
        {sc.parties.map((p) => (
          <Console key={p} s={s} party={p} sc={sc} step={step} onStep={() => setK(k + 1)} />
        ))}
      </div>
      <Timeline s={s} />
    </>
  );
}

function Free({ sc }: { sc: Scenario }) {
  const [history, setHistory] = useState<State[]>(() => [sc.init()]);
  const s = history[history.length - 1];
  const parties: PartyId[] = sc.kind === "IM" ? ["A", "B", "M"] : ["A", "B"];
  const onAct = (a: Action): string | null => {
    try {
      const next = apply({ ...s, step: history.length }, a);
      setHistory([...history, next]);
      return null;
    } catch (e) {
      if (e instanceof EngineError) return e.message;
      throw e;
    }
  };
  return (
    <>
      <div className="free-intro">
        <p>
          <b>Free mode.</b> Same starting positions as the guided scenario. Act as any party: issue calls, respond, propose, decide, pledge,
          move prices. The engine applies the contract rules, so actions the contracts would reject show the reason in that party's console.
        </p>
        <p className="note">Suggested sequence: {sc.steps.map((st) => `${PARTIES[st.actor].name}: ${st.say.toLowerCase()}`).join(" → ")}.</p>
        <div className="scbar">
          <button className="btn" onClick={() => setHistory(history.slice(0, -1))} disabled={history.length === 1}>
            Undo
          </button>
          <button className="btn" onClick={() => setHistory([sc.init()])} disabled={history.length === 1}>
            Reset
          </button>
        </div>
      </div>
      <div className="consoles">
        {parties.map((p) => (
          <Console key={p} s={s} party={p} sc={sc} onAct={onAct} />
        ))}
      </div>
      <Timeline s={s} />
    </>
  );
}
