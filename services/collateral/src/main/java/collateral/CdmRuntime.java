package collateral;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.inject.Guice;
import com.google.inject.Injector;
import com.regnosys.rosetta.common.validation.RosettaTypeValidator;
import com.regnosys.rosetta.common.validation.ValidationReport;
import com.rosetta.model.lib.RosettaModelObject;
import com.rosetta.model.lib.validation.ValidationResult;
import org.finos.cdm.CdmRuntimeModule;
import org.finos.rune.mapper.RuneJsonObjectMapper;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * CDM Java runtime for the collateral service (ADR wp-adr-java-cdm-stack, ASR concept-asr-cdm-data-layer): the Guice
 * injector with CDM's module, the Rune JSON mapper and the type validator. Mirrors the extension's test runtime
 * (cdm-ext/src/test/java/cdmx/Cdm.java) so the service builds, validates and serialises CDM objects the same way the
 * extension's own tests do. The injector and mapper are created once (CDM's module wiring is not cheap).
 */
public final class CdmRuntime {
    public static final Injector INJECTOR = Guice.createInjector(new CdmRuntimeModule());
    public static final ObjectMapper JSON = new RuneJsonObjectMapper();
    private static final RosettaTypeValidator VALIDATOR = INJECTOR.getInstance(RosettaTypeValidator.class);

    private CdmRuntime() {}

    public static <T> T fn(Class<T> function) {
        return INJECTOR.getInstance(function);
    }

    /** Load a Rune JSON document (an ordered map built with {@link #o}) as the given CDM type; adds the top-level @type. */
    public static <T> T load(Class<T> type, Map<String, Object> doc) {
        Map<String, Object> top = new LinkedHashMap<>();
        top.put("@type", type.getName()); // Java packages are the Rune namespaces
        top.putAll(doc);
        try {
            return JSON.readValue(JSON.writeValueAsString(top), type);
        } catch (Exception e) {
            throw new IllegalArgumentException("CDM load of " + type.getSimpleName() + " failed: " + e.getMessage(), e);
        }
    }

    public static String toJson(Object o) {
        try {
            return JSON.writeValueAsString(o);
        } catch (Exception e) {
            throw new IllegalArgumentException(e);
        }
    }

    /** CDM's full validation (the extension's and CDM's own conditions, cardinality and types), recursive. */
    @SuppressWarnings("unchecked")
    public static List<String> failures(RosettaModelObject o) {
        ValidationReport r = VALIDATOR.runProcessStep((Class<RosettaModelObject>) o.getType(), o);
        return r.validationFailures().stream().map(ValidationResult::toString).collect(Collectors.toList());
    }

    /** Validate a CDM object; throw with the failed conditions if any, so an invalid document never reaches the ledger. */
    public static void validate(RosettaModelObject o) {
        List<String> f = failures(o);
        if (!f.isEmpty()) throw new IllegalStateException("CDM validation failed: " + String.join("; ", f));
    }

    /** Ordered map literal: o("a", 1, "b", 2). */
    public static Map<String, Object> o(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    public static List<Object> l(Object... items) {
        return new ArrayList<>(Arrays.asList(items));
    }
}
