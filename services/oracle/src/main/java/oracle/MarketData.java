package oracle;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Mock market data held by the oracle service (architecture relationship oracle-to-market-data): a price and a rating
 * per collateral token. Prices start from the values already on the oracle feed (the deployment publishes them), read
 * through the operator's gateway on first use, so the mock data and the chain agree until an operator edits a price.
 * Ratings are mock values for the prototype and stay off-chain: OracleFeed stores prices and default status only.
 * Prices are kept scaled by the registry's priceScale (OracleFeed.PRICE_SCALE).
 */
final class MarketData {
    /** Mock ratings, not sourced from a rating agency. Tokens without an entry have no rating. */
    private static final Map<String, String> MOCK_RATINGS = Map.of("tUST", "AA+", "tMMF", "AAAm", "tAGY", "AA+");

    record Entry(String symbol, String token, BigInteger price, String rating) {
        Map<String, Object> json(BigInteger scale) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("symbol", symbol);
            m.put("token", token);
            m.put("price", price == null ? null : price.toString());
            m.put("priceUsd", price == null ? null : new BigDecimal(price).divide(new BigDecimal(scale)).stripTrailingZeros().toPlainString());
            m.put("rating", rating);
            return m;
        }
    }

    private final OperatorGateway gateway;
    private final Map<String, Entry> entries = new LinkedHashMap<>();
    private BigInteger scale;

    MarketData(OperatorGateway gateway) {
        this.gateway = gateway;
    }

    /** Load the token list and current on-chain prices from the operator's gateway, once. */
    @SuppressWarnings("unchecked")
    private void load() {
        if (scale != null) return;
        Map<String, Object> res = gateway.prices();
        BigInteger s = new BigInteger(String.valueOf(res.get("priceScale")));
        for (Map<String, Object> p : (List<Map<String, Object>>) res.get("prices")) {
            String symbol = String.valueOf(p.get("symbol"));
            Object price = p.get("price");
            entries.put(symbol, new Entry(symbol, String.valueOf(p.get("token")),
                    price == null ? null : new BigInteger(String.valueOf(price)), MOCK_RATINGS.get(symbol)));
        }
        scale = s;
    }

    synchronized BigInteger scale() {
        load();
        return scale;
    }

    synchronized List<Entry> all() {
        load();
        return new ArrayList<>(entries.values());
    }

    synchronized Entry get(String symbol) {
        load();
        Entry e = entries.get(symbol);
        if (e == null) throw new IllegalArgumentException("unknown token symbol " + symbol + "; known: " + entries.keySet());
        return e;
    }

    synchronized Entry put(Entry e) {
        entries.put(e.symbol(), e);
        return e;
    }

    /** Convert a USD price such as "97.5" to the feed's scaled integer; rejects more decimals than the scale holds. */
    synchronized BigInteger toScaled(Object usd) {
        load();
        if (usd == null) throw new IllegalArgumentException("price is required");
        BigDecimal d;
        try {
            d = new BigDecimal(String.valueOf(usd));
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException("price must be a decimal number of USD, got " + usd);
        }
        if (d.signum() <= 0) throw new IllegalArgumentException("price must be positive, got " + usd);
        try {
            return d.multiply(new BigDecimal(scale)).setScale(0, RoundingMode.UNNECESSARY).toBigIntegerExact();
        } catch (ArithmeticException ex) {
            throw new IllegalArgumentException("price " + usd + " has more decimals than the feed's scale " + scale);
        }
    }
}
