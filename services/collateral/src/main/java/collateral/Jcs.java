package collateral;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

/**
 * JSON Canonicalization Scheme (RFC 8785) for the provenance records and credentials of task-document-provenance
 * (wp-adr-document-provenance). A record's hash, and the input to a credential's ecdsa-jcs-2019 proof, are computed over
 * this canonical form, so any party that holds the same JSON computes the same bytes.
 *
 * <p>Object members are sorted by the UTF-16 code units of their names; strings are escaped as ECMAScript's
 * JSON.stringify escapes them. Numbers are limited to integers: the records carry amounts as strings, and RFC 8785's
 * serialisation of non-integral numbers (ECMAScript Number.prototype.toString) is not implemented, so a non-integral
 * number is rejected rather than serialised differently from other implementations.
 */
public final class Jcs {
    private Jcs() {}

    /** The canonical form of a JSON value. */
    public static String canonical(JsonNode n) {
        StringBuilder sb = new StringBuilder();
        write(n, sb);
        return sb.toString();
    }

    private static void write(JsonNode n, StringBuilder sb) {
        if (n == null || n.isNull() || n.isMissingNode()) {
            sb.append("null");
        } else if (n.isBoolean()) {
            sb.append(n.booleanValue() ? "true" : "false");
        } else if (n.isIntegralNumber()) {
            if (!n.canConvertToLong() || Math.abs(n.longValue()) > (1L << 53))
                throw new IllegalArgumentException("integer outside the IEEE 754 double range RFC 8785 allows: " + n);
            sb.append(n.longValue());
        } else if (n.isNumber()) {
            double d = n.doubleValue();
            if (d != Math.rint(d) || Double.isInfinite(d))
                throw new IllegalArgumentException("non-integral numbers are not supported; carry the value as a string: " + n);
            sb.append((long) d);
        } else if (n.isTextual()) {
            string(n.textValue(), sb);
        } else if (n.isArray()) {
            sb.append('[');
            for (int i = 0; i < n.size(); i++) {
                if (i > 0) sb.append(',');
                write(n.get(i), sb);
            }
            sb.append(']');
        } else if (n.isObject()) {
            List<String> names = new ArrayList<>();
            for (Iterator<String> it = n.fieldNames(); it.hasNext(); ) names.add(it.next());
            names.sort(String::compareTo); // String.compareTo compares UTF-16 code units, as RFC 8785 section 3.2.3 requires
            sb.append('{');
            for (int i = 0; i < names.size(); i++) {
                if (i > 0) sb.append(',');
                string(names.get(i), sb);
                sb.append(':');
                write(n.get(names.get(i)), sb);
            }
            sb.append('}');
        } else {
            throw new IllegalArgumentException("unsupported JSON node: " + n.getNodeType());
        }
    }

    private static void string(String s, StringBuilder sb) {
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\b' -> sb.append("\\b");
                case '\f' -> sb.append("\\f");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
                }
            }
        }
        sb.append('"');
    }
}
