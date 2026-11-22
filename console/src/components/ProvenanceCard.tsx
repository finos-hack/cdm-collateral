// Provenance of the deployment's tokens (task-document-provenance, wp-adr-document-provenance): for each token, the
// links of its path back to its asset (issuance, token terms, custody record or register statement, constitution,
// valuation and, for a Registered or Claim token, the control agreement), whether each is anchored, unaltered and
// attested by its record keeper, and every break. The check is read on demand: it reads every anchor and record.
// Seeding writes the fixture provenance of tUST and tMMF (synthetic documents and record keepers) once.
import { useCallback, useEffect, useState } from "react";
import { api, type LiveParty, type LiveProvenance } from "../domain/liveApi";

const RELATION: Record<string, string> = {
  "cdmx:IssuedAgainst": "Issuance",
  "cdmx:TokenTerms": "Token terms",
  "cdmx:Custody": "Custody record",
  "cdmx:Register": "Register statement",
  "cdmx:Constitution": "Constitution",
  "cdmx:Valuation": "Valuation",
  "cdmx:ControlAgreement": "Control agreement",
};

const NODE: Record<LiveParty, string> = { A: "bank-a", B: "bank-b" };

const short = (s?: string | null) => (s ? (s.length > 18 ? `${s.slice(0, 10)}…${s.slice(-6)}` : s) : "—");

export function ProvenanceCard({ party, legPledgor }: { party: LiveParty; legPledgor: LiveParty }) {
  const securedParty = NODE[legPledgor === "A" ? "B" : "A"];
  const [prov, setProv] = useState<LiveProvenance | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    setBusy(true);
    try {
      setProv(await api.provenance(party, securedParty));
      setError(null);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  }, [party, securedParty]);

  useEffect(() => {
    void check();
  }, [check]);

  const seed = async () => {
    setBusy(true);
    try {
      await api.seedProvenance(party, NODE[legPledgor], securedParty);
      setProv(await api.provenance(party, securedParty));
      setError(null);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  if (prov && !prov.deployed) return null;
  return (
    <div className="card" data-testid="provenance">
      <h3>Provenance</h3>
      <div className="small">
        Each token's path back to its asset; pledge to {securedParty}. {prov ? `${prov.anchors} anchors on the ledger.` : ""}
      </div>
      <div className="row">
        <button disabled={busy} onClick={() => void check()} data-testid="provenance-check">Check provenance</button>
        {prov && prov.anchors === 0 && (
          <button disabled={busy} onClick={() => void seed()} data-testid="provenance-seed">Seed fixture provenance (tUST, tMMF)</button>
        )}
      </div>
      {error && <div className="bad">{error}</div>}
      {prov?.tokens.filter((t) => t.anchors > 0 || t.symbol === "tUST" || t.symbol === "tMMF").map((t) => (
        <div key={t.symbol} className="subcard" data-testid={`provenance-${t.symbol}`}>
          <span className="mono">{t.symbol}</span> · {t.authoritativeRecord}
          {t.recordKeeper ? ` · kept by ${t.recordKeeper}` : ""} ·{" "}
          {t.complete ? (
            <span className="ok">provenance complete ✓</span>
          ) : (
            <span className="bad">{t.breaks.length} provenance {t.breaks.length === 1 ? "break" : "breaks"}</span>
          )}
          <table className="tbl">
            <thead>
              <tr><th>Link</th><th>Record</th><th>Record keeper</th><th>Status</th></tr>
            </thead>
            <tbody>
              {t.links.map((l) => (
                <tr key={l.relation} data-testid={`provenance-${t.symbol}-${l.relation.replace("cdmx:", "")}`}>
                  <td>{RELATION[l.relation] ?? l.relation}</td>
                  <td className="mono">{short(l.recordHash)}</td>
                  <td className="mono">{short(l.recordKeeper)}</td>
                  <td>{l.ok ? <span className="ok">✓</span> : <span className="bad">{l.breaks.map((b) => b.kind).join(", ")}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {t.tokensOnAsset.length > 1 && (
            <div className="bad small">Also issued against the same asset: {t.tokensOnAsset.filter((x) => x !== t.token).join(", ")}</div>
          )}
        </div>
      ))}
    </div>
  );
}
