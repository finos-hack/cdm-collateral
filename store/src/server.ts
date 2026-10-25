// Content-addressed store for CDM payloads (ADR wp-adr-cdm-payload-carrier). The margin-call lifecycle keeps each
// step's CDM document off-chain here, keyed by its keccak-256 hash; the on-chain cdmHash is both the retrieval key and
// the integrity check. One shared store serves the prototype's participants (content addressing gives a global
// namespace by hash).
//
// Callers authenticate with a per-party bearer token: `PARTY_TOKENS` maps each token to the party address it stands
// for, and the store resolves the `Authorization: Bearer <token>` header to that identity rather than trusting an
// asserted party header. A party can therefore read only documents on whose allowlist its own address appears. This is
// a shared-secret scheme (the store is the trusted verifier); production would use mutual TLS or signed requests.
// A single shared instance stands in for a production shared content-addressed store / IPFS with access control (or
// per-party stores). The store fails closed: with no tokens configured, every docs request is unauthorized.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { keccak256, toHex } from "viem";

const PORT = Number(process.env.PORT ?? 8300);
const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

// token -> lowercased party address. Provisioned by the orchestrator (orchestrate.mjs) from the deployment registry.
const TOKENS: Record<string, string> = (() => {
  try {
    const raw = process.env.PARTY_TOKENS;
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return Object.fromEntries(Object.entries(parsed).map(([t, addr]) => [t, addr.toLowerCase()]));
  } catch {
    return {};
  }
})();

interface Entry {
  document: string; // the canonical Rune JSON, byte-for-byte what was hashed
  parties: string[]; // lowercased addresses allowed to read (the call's counterparties)
  createdAt: string;
}

const norm = (a: string) => a.toLowerCase();
const file = (hash: string) => path.join(DATA_DIR, hash.toLowerCase() + ".json");

/** Resolve the caller's authenticated party address from its bearer token, or null if absent/unknown. */
function authedParty(req: http.IncomingMessage): string | null {
  const m = String(req.headers["authorization"] ?? "").match(/^Bearer\s+(.+)$/i);
  return m ? (TOKENS[m[1]] ?? null) : null;
}

function load(hash: string): Entry | null {
  try {
    return JSON.parse(fs.readFileSync(file(hash), "utf8")) as Entry;
  } catch {
    return null;
  }
}

/** Store a document under its keccak-256 hash, verifying the body hashes to the claimed key (content addressing). */
function put(hash: string, document: string, parties: string[]): void {
  const computed = keccak256(toHex(document));
  if (computed.toLowerCase() !== hash.toLowerCase()) {
    const e: any = new Error(`hash mismatch: body hashes to ${computed}, not ${hash}`);
    e.status = 400;
    throw e;
  }
  const existing = load(hash);
  const merged = existing ? Array.from(new Set([...existing.parties, ...parties.map(norm)])) : parties.map(norm);
  const entry: Entry = { document, parties: merged, createdAt: existing?.createdAt ?? new Date().toISOString() };
  fs.writeFileSync(file(hash), JSON.stringify(entry));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const send = (status: number, body: unknown) =>
    res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));

  if (req.method === "GET" && url.pathname === "/store/v1/health") {
    const count = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json")).length;
    return void send(200, { ok: true, count });
  }

  // GET a document by hash; the caller's bearer token is resolved to a party that must be on the document's allowlist.
  const getMatch = url.pathname.match(/^\/store\/v1\/docs\/(0x[0-9a-fA-F]{64})$/);
  if (req.method === "GET" && getMatch) {
    const party = authedParty(req);
    if (!party) return void send(401, { error: "unauthorized" });
    const hash = getMatch[1];
    const entry = load(hash);
    if (!entry) return void send(404, { error: "not found" });
    if (!entry.parties.includes(party)) return void send(403, { error: "forbidden" });
    return void send(200, { hash, document: entry.document });
  }

  // POST { hash, document, parties } — store a step's CDM document; the store verifies content addressing, and the
  // authenticated caller must be one of the parties it names (a party writes documents it is itself a counterparty to).
  if (req.method === "POST" && url.pathname === "/store/v1/docs") {
    const party = authedParty(req);
    if (!party) return void send(401, { error: "unauthorized" });
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        const b = JSON.parse(raw || "{}");
        if (!b.hash || typeof b.document !== "string" || !Array.isArray(b.parties)) {
          return void send(400, { error: "hash, document, parties required" });
        }
        if (!b.parties.map(norm).includes(party)) return void send(403, { error: "forbidden" });
        put(b.hash, b.document, b.parties);
        send(200, { ok: true, hash: b.hash });
      } catch (e: any) {
        send(e?.status ?? 400, { error: (e as Error).message });
      }
    });
    return;
  }

  send(404, { error: "not found" });
});

server.listen(PORT, () => {
  console.log(`cdm payload store on http://localhost:${PORT}/store/v1 (data: ${DATA_DIR})`);
  if (Object.keys(TOKENS).length === 0) {
    console.warn("store: no PARTY_TOKENS configured — every docs request will be rejected (401). Set PARTY_TOKENS to a token→address map.");
  }
});
