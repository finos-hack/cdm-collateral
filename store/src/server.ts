// Content-addressed store for CDM payloads (ADR wp-adr-cdm-payload-carrier). The margin-call lifecycle keeps each
// step's CDM document off-chain here, keyed by its keccak-256 hash; the on-chain cdmHash is both the retrieval key and
// the integrity check. One shared store serves the prototype's participants (content addressing gives a global
// namespace by hash).
//
// First-cycle reductions: the reader allowlist is enforced on an asserted `X-Party` header, not an authenticated
// identity — production would authenticate the caller (e.g. mutual TLS or signed requests). A single shared instance
// stands in for a production shared content-addressed store / IPFS with access control (or per-party stores).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { keccak256, toHex } from "viem";

const PORT = Number(process.env.PORT ?? 8300);
const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

interface Entry {
  document: string; // the canonical Rune JSON, byte-for-byte what was hashed
  parties: string[]; // lowercased addresses allowed to read (the call's counterparties)
  createdAt: string;
}

const norm = (a: string) => a.toLowerCase();
const file = (hash: string) => path.join(DATA_DIR, hash.toLowerCase() + ".json");

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

  // GET a document by hash; the caller asserts its identity in X-Party and must be on the document's allowlist.
  const getMatch = url.pathname.match(/^\/store\/v1\/docs\/(0x[0-9a-fA-F]{64})$/);
  if (req.method === "GET" && getMatch) {
    const hash = getMatch[1];
    const entry = load(hash);
    if (!entry) return void send(404, { error: "not found" });
    const party = norm(String(req.headers["x-party"] ?? ""));
    if (!party || !entry.parties.includes(party)) return void send(403, { error: "forbidden" });
    return void send(200, { hash, document: entry.document });
  }

  // POST { hash, document, parties } — store a step's CDM document; the store verifies content addressing.
  if (req.method === "POST" && url.pathname === "/store/v1/docs") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        const b = JSON.parse(raw || "{}");
        if (!b.hash || typeof b.document !== "string" || !Array.isArray(b.parties)) {
          return void send(400, { error: "hash, document, parties required" });
        }
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

server.listen(PORT, () => console.log(`cdm payload store on http://localhost:${PORT}/store/v1 (data: ${DATA_DIR})`));
