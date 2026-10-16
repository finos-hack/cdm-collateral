import { useEffect, useState } from "react";
import { Grid } from "./components/Grid";
import { ScenarioView, type Mode } from "./components/ScenarioView";
import { scenarioById } from "./scenarios/scenarios";

// Hash routes: "#/" scenario grid; "#/s/<scenario>/<guided|free>" one scenario.
export type Route = { page: "grid" } | { page: "scenario"; id: string; mode: Mode };

export function parseRoute(hash: string): Route {
  const m = /^#\/s\/([\w-]+)\/(guided|free)$/.exec(hash);
  if (m && scenarioById(m[1])) return { page: "scenario", id: m[1], mode: m[2] as Mode };
  return { page: "grid" };
}

export const href = (r: Route) => (r.page === "grid" ? "#/" : `#/s/${r.id}/${r.mode}`);

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
          <span className="tag">mocked state, no backend yet</span>
          <span className="tag">test data</span>
        </div>
      </div>
      {route.page === "grid" ? <Grid /> : <ScenarioView key={route.id + route.mode} id={route.id} mode={route.mode} />}
    </div>
  );
}
