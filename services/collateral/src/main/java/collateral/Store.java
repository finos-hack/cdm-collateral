package collateral;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Per-participant workflow store (architecture node workflow-store): one SQLite file per participant. Holds this
 * party's CDM message log and call bookkeeping. The chain is the shared source of call and pledge state; the store
 * keeps the CDM content and its on-chain hash so this party can reconcile and (later) check a peer's CDM content
 * against the recorded hash. "Rudimentary datastore" for the first end-to-end cycle.
 */
public final class Store implements AutoCloseable {
    private final Connection conn;

    public Store(String dbPath) {
        try {
            Path p = Path.of(dbPath).toAbsolutePath();
            if (p.getParent() != null) Files.createDirectories(p.getParent());
            this.conn = DriverManager.getConnection("jdbc:sqlite:" + p);
            try (var st = conn.createStatement()) {
                st.execute("""
                    CREATE TABLE IF NOT EXISTS messages (
                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                      call_id TEXT NOT NULL,
                      msg_type TEXT NOT NULL,
                      direction TEXT NOT NULL,
                      cdm_hash TEXT NOT NULL,
                      cdm_json TEXT NOT NULL,
                      created_at TEXT NOT NULL
                    )""");
                st.execute("""
                    CREATE TABLE IF NOT EXISTS call_seq (
                      party TEXT PRIMARY KEY,
                      n INTEGER NOT NULL
                    )""");
                st.execute("""
                    CREATE TABLE IF NOT EXISTS ledger_events (
                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                      event TEXT NOT NULL,
                      call_id TEXT,
                      party TEXT,
                      block TEXT NOT NULL,
                      log_index INTEGER NOT NULL,
                      detail_json TEXT NOT NULL,
                      created_at TEXT NOT NULL,
                      UNIQUE(event, block, log_index)
                    )""");
                st.execute("""
                    CREATE TABLE IF NOT EXISTS margin_call_state (
                      call_id TEXT PRIMARY KEY,
                      state_json TEXT NOT NULL,
                      updated_at TEXT NOT NULL
                    )""");
            }
        } catch (Exception e) {
            throw new RuntimeException("store init failed: " + e.getMessage(), e);
        }
    }

    public synchronized long nextCallNumber(String party) {
        try {
            try (PreparedStatement up = conn.prepareStatement(
                    "INSERT INTO call_seq(party, n) VALUES(?, 1) ON CONFLICT(party) DO UPDATE SET n = n + 1")) {
                up.setString(1, party);
                up.executeUpdate();
            }
            try (PreparedStatement q = conn.prepareStatement("SELECT n FROM call_seq WHERE party = ?")) {
                q.setString(1, party);
                ResultSet rs = q.executeQuery();
                return rs.next() ? rs.getLong(1) : 1;
            }
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    public void recordMessage(String callId, String msgType, String direction, Cdm cdm) {
        try (PreparedStatement ins = conn.prepareStatement(
                "INSERT INTO messages(call_id, msg_type, direction, cdm_hash, cdm_json, created_at) VALUES(?,?,?,?,?,?)")) {
            ins.setString(1, callId);
            ins.setString(2, msgType);
            ins.setString(3, direction);
            ins.setString(4, cdm.hash);
            ins.setString(5, cdm.json);
            ins.setString(6, Instant.now().toString());
            ins.executeUpdate();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    /** Upsert the folded MarginCallState Rune JSON for a call (the off-chain CDM record, wp-adr-cdm-payload-carrier). */
    public void saveState(String callId, String stateJson) {
        try (PreparedStatement up = conn.prepareStatement(
                "INSERT INTO margin_call_state(call_id, state_json, updated_at) VALUES(?,?,?) " +
                        "ON CONFLICT(call_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at")) {
            up.setString(1, callId);
            up.setString(2, stateJson);
            up.setString(3, Instant.now().toString());
            up.executeUpdate();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    /**
     * Record a settlement or oracle-feed event pushed by this party's gateway (Returned, Enforced, DefaultPublished).
     * An event is identified by its chain position (block, log index), so a replay after a reconnect is ignored.
     */
    public synchronized void recordEvent(String event, String callId, String party, String block, long logIndex, String detailJson) {
        try (PreparedStatement ins = conn.prepareStatement(
                "INSERT OR IGNORE INTO ledger_events(event, call_id, party, block, log_index, detail_json, created_at) VALUES(?,?,?,?,?,?,?)")) {
            ins.setString(1, event);
            ins.setString(2, callId == null ? null : callId.toLowerCase());
            ins.setString(3, party == null ? null : party.toLowerCase());
            ins.setString(4, block);
            ins.setLong(5, logIndex);
            ins.setString(6, detailJson);
            ins.setString(7, java.time.Instant.now().toString());
            ins.executeUpdate();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    /** The names of the events recorded for a call, oldest first (e.g. whether a call was enforced). */
    public List<String> eventsFor(String callId) {
        List<String> out = new ArrayList<>();
        try (PreparedStatement q = conn.prepareStatement("SELECT event FROM ledger_events WHERE call_id = ? ORDER BY id")) {
            q.setString(1, callId.toLowerCase());
            ResultSet rs = q.executeQuery();
            while (rs.next()) out.add(rs.getString(1));
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        return out;
    }

    public List<Map<String, Object>> messagesFor(String callId) {
        List<Map<String, Object>> out = new ArrayList<>();
        try (PreparedStatement q = conn.prepareStatement(
                "SELECT msg_type, direction, cdm_hash, cdm_json, created_at FROM messages WHERE call_id = ? ORDER BY id")) {
            q.setString(1, callId);
            ResultSet rs = q.executeQuery();
            while (rs.next()) {
                var m = new LinkedHashMap<String, Object>();
                m.put("msgType", rs.getString(1));
                m.put("direction", rs.getString(2));
                m.put("cdmHash", rs.getString(3));
                m.put("cdmJson", rs.getString(4));
                m.put("createdAt", rs.getString(5));
                out.add(m);
            }
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        return out;
    }

    @Override
    public void close() {
        try {
            conn.close();
        } catch (Exception ignored) {
        }
    }
}
