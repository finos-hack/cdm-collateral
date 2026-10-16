import { PARTIES, qty } from "../domain/reference";
import type { State } from "../domain/types";

export function Timeline({ s }: { s: State }) {
  const on = s.ev.filter((e) => e.lane === "on").slice().reverse();
  const off = s.ev.filter((e) => e.lane === "off").slice().reverse();
  return (
    <div className="timeline">
      <div className="lane" aria-label="Off-chain messages">
        <header>
          <h3>Off-chain messages</h3>
          <span className="note">CDM content between the parties' services</span>
        </header>
        <ol>
          {off.length === 0 && <li className="empty">Nothing yet.</li>}
          {off.map((e, i) =>
            e.lane === "off" ? (
              <li key={i} className={`ev ${e.step === s.step ? "fresh" : ""}`}>
                <span className="when">step {e.step}</span>
                <span className="what">
                  <span>
                    <span className={`party p-${e.from}`}>{PARTIES[e.from].name}</span>
                    {e.from !== e.to && (
                      <>
                        {" → "}
                        <span className={`party p-${e.to}`}>{PARTIES[e.to].name}</span>
                      </>
                    )}{" "}
                    <b>{e.what}</b>
                  </span>
                  <span className="muted">{e.text}</span>
                </span>
              </li>
            ) : null,
          )}
        </ol>
      </div>
      <div className="lane" aria-label="On-chain transactions">
        <header>
          <h3>On-chain (Besu, QBFT)</h3>
          <span className="note">each transaction final in its block</span>
        </header>
        <ol>
          {on.length === 0 && <li className="empty">Nothing yet.</li>}
          {on.map((e) =>
            e.lane === "on" ? (
              <li key={e.block} className={`ev ${e.step === s.step ? "fresh" : ""}`}>
                <span className="when">#{qty(e.block)}</span>
                <span className="what">
                  <span className="fn">{e.fn}</span>
                  <span>
                    <span className={`party p-${e.signer}`}>{PARTIES[e.signer].name}</span> {e.text}
                  </span>
                </span>
              </li>
            ) : null,
          )}
        </ol>
      </div>
    </div>
  );
}
