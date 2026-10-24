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
