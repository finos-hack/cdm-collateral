import { apply } from "../domain/engine";
import type { State } from "../domain/types";
import type { Scenario } from "./scenarios";

/** State after the first k steps of a scenario; events are labelled with their step number. */
export function stateAt(sc: Scenario, k: number): State {
  let s = sc.init();
  for (let i = 0; i < k; i++) {
    s = { ...s, step: i + 1 };
    s = apply(s, sc.steps[i].action);
  }
  return s;
}
