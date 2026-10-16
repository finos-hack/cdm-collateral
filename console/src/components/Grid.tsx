import { COLS, ROWS, weakest, type Family } from "../domain/coverage";
import { PARTIES } from "../domain/reference";
import { scenarioById } from "../scenarios/scenarios";

export const scoreClass = (n: number) => (n >= 3 ? "s-ok" : n === 2 ? "s-warn" : "s-bad");

export function CoverageBadge({ fam, caps }: { fam: Family; caps: (number | string)[] }) {
  if (!caps.length) return null;
  const { min, infos, weak } = weakest(fam, caps);
  const ids = weak.map((w) => w.id);
  const label = ids.length === 1 ? `${ids[0]} ${weak[0].name}` : "rows " + (ids.length > 3 ? ids.slice(0, 3).join(", ") + " +" + (ids.length - 3) : ids.join(", "));
  const tip = "CDM 7.6.0 coverage, weakest of: " + infos.map((i) => `${i.id} ${i.name} = ${i.score}`).join("; ");
  return (
    <span className={`cov ${scoreClass(min)}`} title={tip} data-testid="coverage">
      CDM {min} · {label}
    </span>
  );
}

export function Grid() {
  return (
    <>
      <div className="intro">
        <h2>Scenarios</h2>
        <p>
          Pick an agreement and a flow. <b>Guided</b> walks you through each party's console step by step. <b>Free</b> starts from the same
          positions and lets you act as any party, including actions the contracts reject. The badge under each cell shows how far CDM 7.6.0
          supports that flow.
        </p>
      </div>
      <div className="gridbox">
        <table className="grid">
          <thead>
            <tr>
              <th>Agreement</th>
              {COLS.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.name}>
                <th>
                  {r.name}
                  <span className="sub">{r.sub}</span>
                </th>
                {r.cells.map((c, i) => {
                  if (c[0] === "go") {
                    const sc = scenarioById(c[1])!;
                    return (
                      <td key={i}>
                        <a className="cell-go" href={`#/s/${sc.id}/guided`} data-sc={sc.id}>
                          <b>{sc.title}</b>
                          <span>
                            {sc.steps.length} steps · {sc.parties.map((p) => PARTIES[p].name).join(", ")}
                          </span>
                        </a>
                        <a className="tag" style={{ display: "inline-block", marginTop: 5, textDecoration: "none" }} href={`#/s/${sc.id}/free`}>
                          free mode
                        </a>{" "}
                        <CoverageBadge fam={r.fam} caps={c[2]} />
                      </td>
                    );
                  }
                  if (c[0] === "plan")
                    return (
                      <td key={i}>
                        <span className="cell-plan">planned{c[1] ? " · " + c[1] : ""}</span>
                        <CoverageBadge fam={r.fam} caps={c[2]} />
                      </td>
                    );
                  return (
                    <td key={i}>
                      <span className="cell-na">n/a{c[1] ? " · " + c[1] : ""}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="legend">
        <span className="cov s-ok">CDM 3–5</span>executable (functions, events, samples)
        <span className="cov s-warn">CDM 2</span>data types only
        <span className="cov s-bad">CDM 0–1</span>absent or enum only
        <span>· the weakest capability the flow needs; hover for the list</span>
      </div>
      <p className="foot">
        All parties, tokens, prices and amounts are invented test data. State is held in the browser; the next step wires the console to the
        workflow services and the Besu ledger gateway.
      </p>
    </>
  );
}
