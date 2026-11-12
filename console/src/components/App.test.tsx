import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App, parseRoute } from "../App";
import { SCENARIOS } from "../scenarios/scenarios";

function go(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

beforeEach(() => {
  window.location.hash = "#/";
  window.scrollTo = () => {};
});

it("parses routes and falls back to the grid", () => {
  expect(parseRoute("#/s/im-call/free")).toEqual({ page: "scenario", id: "im-call", mode: "free" });
  expect(parseRoute("#/s/nope/guided")).toEqual({ page: "grid" });
  expect(parseRoute("#/live/T")).toEqual({ page: "agent" });
  expect(parseRoute("#/live/B")).toEqual({ page: "live", party: "B" });
  expect(parseRoute("#/live/operator")).toEqual({ page: "operator" });
});

it("shows the scenario grid with coverage badges", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "Scenarios" })).toBeInTheDocument();
  expect(screen.getAllByTestId("coverage").length).toBeGreaterThan(30);
  for (const sc of SCENARIOS) expect(document.querySelector(`[data-sc="${sc.id}"]`)).not.toBeNull();
});

for (const sc of SCENARIOS) {
  it(`guided mode completes ${sc.id} by clicking the highlighted actions`, async () => {
    const user = userEvent.setup();
    render(<App />);
    go(`#/s/${sc.id}/guided`);
    for (let i = 0; i < sc.steps.length; i++) {
      await user.click(screen.getByRole("button", { name: sc.steps[i].label }));
    }
    expect(screen.getByText("Scenario complete")).toBeInTheDocument();
  });
}

it("free mode shows the control contract rejecting a pledge before acceptance", async () => {
  const user = userEvent.setup();
  render(<App />);
  go("#/s/im-call/free");
  const b = screen.getByRole("region", { name: "BANK-B console" });
  await user.type(within(b).getByLabelText("Amount (USD)"), "12400000");
  await user.click(within(b).getByRole("button", { name: "Issue" }));
  const a = screen.getByRole("region", { name: "BANK-A console" });
  await user.click(within(a).getByRole("button", { name: "Respond" }));
  await user.type(within(a).getByLabelText(/^tUST/), "128589");
  await user.click(within(a).getByRole("button", { name: "Propose" }));
  await user.click(within(a).getByRole("button", { name: "Pledge P-1" }));
  expect(within(a).getByRole("alert")).toHaveTextContent("Control contract: P-1 has not been accepted by BANK-B");
  await user.click(within(b).getByRole("button", { name: "Accept" }));
  await user.click(within(a).getByRole("button", { name: "Pledge P-1" }));
  expect(within(a).queryByRole("alert")).toBeNull();
  expect(within(a).getAllByText("settled").length).toBeGreaterThan(0);
});

it("free mode rejects a call below the minimum transfer amount", async () => {
  const user = userEvent.setup();
  render(<App />);
  go("#/s/im-call/free");
  const b = screen.getByRole("region", { name: "BANK-B console" });
  await user.type(within(b).getByLabelText("Amount (USD)"), "100000");
  await user.click(within(b).getByRole("button", { name: "Issue" }));
  expect(within(b).getByRole("alert")).toHaveTextContent("below the minimum transfer amount");
});
