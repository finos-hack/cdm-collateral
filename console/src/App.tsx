import { useEffect, useState } from "react";
import { Grid } from "./components/Grid";
import { LiveConsole } from "./components/LiveConsole";
import { OperatorConsole } from "./components/OperatorConsole";
import { AgentConsole } from "./components/TripartyConsole";
import { ScenarioView, type Mode } from "./components/ScenarioView";
import type { LiveParty } from "./domain/liveApi";
import { scenarioById } from "./scenarios/scenarios";

// Hash routes: "#/" scenario grid; "#/s/<scenario>/<guided|free>" one scenario;
// "#/live/<A|B>" the live party console wired to that party's running workflow service;
// "#/live/T" the triparty agent BANK-T's console (wp-adr-triparty-terms-profile);
// "#/live/operator" the market operator console wired to the oracle service.
export type Route =
  | { page: "grid" }
  | { page: "scenario"; id: string; mode: Mode }
  | { page: "live"; party: LiveParty }
  | { page: "agent" }
  | { page: "operator" };

export function parseRoute(hash: string): Route {
  const m = /^#\/s\/([\w-]+)\/(guided|free)$/.exec(hash);
  if (m && scenarioById(m[1])) return { page: "scenario", id: m[1], mode: m[2] as Mode };
  const l = /^#\/live\/(A|B)$/.exec(hash);
  if (l) return { page: "live", party: l[1] as LiveParty };
  if (hash === "#/live/T") return { page: "agent" };
  if (hash === "#/live/operator") return { page: "operator" };
  return { page: "grid" };
}

export const href = (r: Route) =>
  r.page === "grid"
    ? "#/"
    : r.page === "live"
      ? `#/live/${r.party}`
      : r.page === "agent"
        ? "#/live/T"
        : r.page === "operator"
          ? "#/live/operator"
          : `#/s/${r.id}/${r.mode}`;

export function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parseRoute(window.location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return (
    <div className="wrap">
      <div className="top">
        <div>
          <div className="eyebrow">CDM collateral prototype</div>
          <h1>Collateral Console</h1>
        </div>
        <div className="tags">
          {route.page === "live" || route.page === "operator" || route.page === "agent" ? (
            <span className="tag">live stack · service → gateway → Besu</span>
          ) : (
            <span className="tag">mocked state, no backend</span>
          )}
          <span className="tag">test data</span>
        </div>
      </div>
      <nav className="row" style={{ marginBottom: 12, gap: 12 }}>
        <a href="#/">Scenarios (mock)</a>
        <a href="#/live/A">Live · BANK-A (Pledgor)</a>
        <a href="#/live/B">Live · BANK-B (Secured Party)</a>
        <a href="#/live/T">Live · BANK-T (Triparty agent)</a>
        <a href="#/live/operator">Live · Market operator</a>
      </nav>
      {route.page === "grid" ? (
        <Grid />
      ) : route.page === "operator" ? (
        <OperatorConsole />
      ) : route.page === "agent" ? (
        <AgentConsole />
      ) : route.page === "live" ? (
        <LiveConsole key={route.party} party={route.party} />
      ) : (
        <ScenarioView key={route.id + route.mode} id={route.id} mode={route.mode} />
      )}
    </div>
  );
}
