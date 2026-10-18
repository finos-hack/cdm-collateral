package cdmx;

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

/** CDM Java runtime for the tests: Guice injector with CDM's module, Rune JSON mapper, type validator. */
public final class Cdm {
    public static final Injector INJECTOR = Guice.createInjector(new CdmRuntimeModule());
    public static final ObjectMapper JSON = new RuneJsonObjectMapper();
    private static final RosettaTypeValidator VALIDATOR = INJECTOR.getInstance(RosettaTypeValidator.class);

    private Cdm() {}

    public static <T> T fn(Class<T> function) {
        return INJECTOR.getInstance(function);
    }

    /** Loads a Rune JSON document (a Map built with {@link #o}) as the given type; adds the top-level @type. */
    public static <T> T load(Class<T> type, Map<String, Object> doc) {
        Map<String, Object> top = new LinkedHashMap<>();
        top.put("@type", type.getName());  // Java packages are the Rune namespaces
        top.putAll(doc);
        try {
            return JSON.readValue(JSON.writeValueAsString(top), type);
        } catch (Exception e) {
            throw new IllegalArgumentException(e);
        }
    }

    public static String toJson(Object o) {
        try {
            return JSON.writeValueAsString(o);
        } catch (Exception e) {
            throw new IllegalArgumentException(e);
        }
    }

    /** All failed validations (CDM's and the extension's conditions, cardinality, types), recursively. */
    public static List<String> failures(RosettaModelObject o) {
        @SuppressWarnings("unchecked")
        ValidationReport r = VALIDATOR.runProcessStep((Class<RosettaModelObject>) o.getType(), o);
        return r.validationFailures().stream().map(ValidationResult::toString).collect(Collectors.toList());
    }

    public static String failedText(RosettaModelObject o) {
        return String.join("\n", failures(o));
    }

    /** Runs a call that must fail a Rune condition; returns the condition's description (Java names no condition). */
    public static String rejected(org.junit.jupiter.api.function.Executable call) {
        return org.junit.jupiter.api.Assertions.assertThrows(
            com.rosetta.model.lib.functions.ConditionValidator.ConditionException.class, call).getMessage();
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
