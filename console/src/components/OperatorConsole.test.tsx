// Unit tests for the market operator console (flow-revaluation-top-up transitions 1-4). The oracle service is replaced
// by a fetch stub that serves /market-data and records every PUT.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OperatorConsole } from "./OperatorConsole";

let puts: { path: string; body: unknown }[] = [];

function serve() {
  puts = [];
  let tust = { price: "9840000000", priceUsd: "98.4" };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = url.replace(/^https?:\/\/[^/]+\/oracle\/v1/, "");
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body));
        puts.push({ path, body });
        tust = { price: "8900000000", priceUsd: body.price };
        return new Response(JSON.stringify({ symbol: "tUST", token: "0x1", ...tust, rating: "AA+", tx: { txHash: "0xabcdef0123456789" } }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          priceScale: "100000000",
          tokens: [
            { symbol: "tUST", token: "0x1", ...tust, rating: "AA+" },
            { symbol: "tMMF", token: "0x2", price: "100000000", priceUsd: "1", rating: "AAAm" },
          ],
        }),
        { status: 200 },
      );
    }),
  );
  render(<OperatorConsole />);
}

afterEach(() => vi.unstubAllGlobals());

it("shows the mock market data with off-chain ratings", async () => {
  serve();
  expect(await screen.findByText("98.4")).toBeInTheDocument();
  expect(screen.getByText("AA+")).toBeInTheDocument();
  expect(screen.getByText("AAAm")).toBeInTheDocument();
});

it("the operator edits a price, which the oracle publishes to the feed", async () => {
  const user = userEvent.setup();
  serve();
  await screen.findByText("98.4");
  expect(screen.getByRole("button", { name: "Publish tUST" })).toBeDisabled();
  await user.type(screen.getByLabelText("New price tUST"), "89");
  await user.click(screen.getByRole("button", { name: "Publish tUST" }));
  await waitFor(() => expect(puts).toEqual([{ path: "/market-data/tUST", body: { price: "89" } }]));
  expect(await screen.findByRole("status")).toHaveTextContent("tUST published at USD 89");
  expect(await screen.findByText("89")).toBeInTheDocument();
});
