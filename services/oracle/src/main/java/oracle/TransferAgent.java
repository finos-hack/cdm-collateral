package oracle;

import java.math.BigInteger;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * The record keeper of the tokens whose authoritative record is kept off the ledger (cdm-ext AuthoritativeRecordEnum
 * Registered or Claim): the fund's transfer agent for tMMF in the prototype, run by the market operator with the mkt
 * key (task-authoritative-record-settlement-enforcement). It keeps its own register of who holds each such token and,
 * for every ledger transaction that moves one, updates the register and confirms on chain (RecordKeeperRegister) that
 * the register now shows the movement. Interim rules REG-1, REG-2 and REG-4 (project owner, 2026-11-21): a Registered
 * or Claim transfer or enforcement is complete only after this confirmation (task-sme-registered-asset-completion).
 *
 * <p>The register is rebuilt at start from the transfers already confirmed, then kept in memory. A paused agent
 * confirms nothing, so a test can show a step that waits for the record keeper.
 */
final class TransferAgent {
    private static final String ZERO = "0x0000000000000000000000000000000000000000";

    private final OperatorGateway gateway;
    private final AtomicBoolean paused = new AtomicBoolean(false);
    private final AtomicInteger references = new AtomicInteger();
    /** symbol -> holder -> units, as the register shows them. */
    private final Map<String, Map<String, BigInteger>> register = new TreeMap<>();
    /** symbol -> token address. */
    private final Map<String, String> tokens = new TreeMap<>();
    /** token -> transaction hashes already applied to the register. */
    private final Map<String, Set<String>> applied = new LinkedHashMap<>();
    private volatile String lastError;
    private ScheduledExecutorService timer;

    TransferAgent(OperatorGateway gateway) {
        this.gateway = gateway;
    }

    void start(long periodMillis) {
        timer = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "transfer-agent");
            t.setDaemon(true);
            return t;
        });
        timer.scheduleWithFixedDelay(this::tickQuietly, periodMillis, periodMillis, TimeUnit.MILLISECONDS);
    }

    void setPaused(boolean p) {
        paused.set(p);
    }

    boolean paused() {
        return paused.get();
    }

    private void tickQuietly() {
        try {
            tick();
            lastError = null;
        } catch (RuntimeException e) {
            lastError = e.getMessage(); // the gateway or chain may not be up yet; the next tick retries
        }
    }

    /** One pass: apply and confirm every transfer of a register token that the register does not show yet. */
    synchronized void tick() {
        for (Map<String, Object> t : gateway.registerTokens()) {
            String symbol = (String) t.get("symbol");
            String token = ((String) t.get("token")).toLowerCase();
            tokens.put(symbol, token);
            Map<String, BigInteger> holdings = register.computeIfAbsent(symbol, s -> new TreeMap<>());
            Set<String> done = applied.computeIfAbsent(token, k -> new LinkedHashSet<>());
            // Group the token's Transfer logs by transaction: one confirmation covers all movements of the token in it.
            Map<String, List<Map<String, Object>>> byTx = new LinkedHashMap<>();
            Map<String, Boolean> confirmed = new LinkedHashMap<>();
            for (Map<String, Object> x : gateway.registerTransfers(token)) {
                String tx = ((String) x.get("txHash")).toLowerCase();
                byTx.computeIfAbsent(tx, k -> new ArrayList<>()).add(x);
                confirmed.put(tx, Boolean.TRUE.equals(x.get("confirmed")));
            }
            for (var e : byTx.entrySet()) {
                String tx = e.getKey();
                if (done.contains(tx)) continue;
                boolean alreadyConfirmed = confirmed.get(tx);
                if (!alreadyConfirmed && paused.get()) continue;
                for (Map<String, Object> x : e.getValue()) move(holdings, (String) x.get("from"), (String) x.get("to"), new BigInteger((String) x.get("value")));
                done.add(tx);
                if (!alreadyConfirmed) gateway.confirmRegister(tx, token, "TA-" + symbol + "-" + references.incrementAndGet());
            }
        }
    }

    private static void move(Map<String, BigInteger> holdings, String from, String to, BigInteger units) {
        if (!ZERO.equalsIgnoreCase(from)) holdings.merge(from.toLowerCase(), units.negate(), BigInteger::add);
        if (!ZERO.equalsIgnoreCase(to)) holdings.merge(to.toLowerCase(), units, BigInteger::add);
        holdings.values().removeIf(v -> v.signum() == 0);
    }

    /** The register of one token: who holds how many units, as the record keeper's own record shows. */
    synchronized Map<String, Object> holdings(String symbol) {
        if (!tokens.containsKey(symbol)) throw new IllegalArgumentException("no register is kept for " + symbol);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("symbol", symbol);
        out.put("token", tokens.get(symbol));
        Map<String, String> h = new TreeMap<>();
        register.getOrDefault(symbol, Map.of()).forEach((k, v) -> h.put(k, v.toString()));
        out.put("holdings", h);
        out.put("paused", paused.get());
        if (lastError != null) out.put("lastError", lastError);
        return out;
    }

    synchronized List<String> symbols() {
        return new ArrayList<>(tokens.keySet());
    }
}
