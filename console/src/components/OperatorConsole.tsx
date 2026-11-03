// Market operator console (route #/live/operator): edits the oracle service's mock market data. A price edit is
// published to the on-chain oracle feed through the operator's gateway before the oracle keeps it
// (flow-revaluation-top-up transitions 1-4: operator-uses-console, console-to-oracle, oracle-to-market-data,
// oracle-to-gateway). Ratings are shown but stay off-chain (wp-adr-oracle-prices-on-request-ratings-offchain).
import { useCallback, useEffect, useState } from "react";
import { oracleApi, type MarketToken } from "../domain/liveApi";

export function OperatorConsole() {
  const [tokens, setTokens] = useState<MarketToken[] | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setTokens((await oracleApi.marketData()).tokens);
      setError(null);
    } catch (e) {
      setError(`oracle service unreachable: ${(e as Error).message}`);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const publish = async (symbol: string) => {
    const price = edits[symbol];
    if (!price) return;
    setBusy(true);
    setError(null);
    try {
      const out = await oracleApi.editPrice(symbol, price);
      setLast(`${symbol} published at USD ${out.priceUsd} (tx ${out.tx.txHash.slice(0, 10)}…)`);
      setEdits({ ...edits, [symbol]: "" });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="card" style={{ borderLeft: "4px solid #7c3aed" }}>
        <strong>Market operator</strong> · oracle service · publishes to the on-chain oracle feed
      </div>
      {error && <div className="card bad">{error}</div>}
      {last && <div className="card ok" role="status">{last}</div>}
      <div className="card">
        <h3>Market data (mock)</h3>
        <table className="tbl">
          <thead>
            <tr><th>Token</th><th>Price (USD)</th><th>Rating (off-chain)</th><th>New price (USD)</th><th></th></tr>
          </thead>
          <tbody>
            {tokens?.map((t) => (
              <tr key={t.symbol}>
                <td className="mono">{t.symbol}</td>
                <td>{t.priceUsd ?? "—"}</td>
                <td>{t.rating ?? "—"}</td>
                <td>
                  <input
                    aria-label={`New price ${t.symbol}`}
                    value={edits[t.symbol] ?? ""}
                    onChange={(e) => setEdits({ ...edits, [t.symbol]: e.target.value })}
                    style={{ width: 110 }}
                  />
                </td>
                <td>
                  <button disabled={busy || !edits[t.symbol]} onClick={() => publish(t.symbol)}>Publish {t.symbol}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
