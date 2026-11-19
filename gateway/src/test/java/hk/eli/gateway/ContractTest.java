package hk.eli.gateway;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.net.URI;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.RequestBuilder;

/**
 * The gateway serves the same JSON as the web app's mock data sources, request for request. The goldens are written
 * by the web app itself (npm run export-golden), so a change on either side that breaks the contract fails here.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("demo")
class ContractTest {
  /** Fields that are per-call by design: chat answer ids count up per session. */
  private static final List<String> IGNORED = List.of("$.id");

  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;

  @TestFactory
  Stream<DynamicTest> gatewayMatchesWebMock() throws Exception {
    JsonNode goldens;
    try (InputStream in = getClass().getResourceAsStream("/golden/contract.json")) {
      goldens = json.readTree(in);
    }
    List<DynamicTest> tests = new ArrayList<>();
    for (Iterator<Map.Entry<String, JsonNode>> it = goldens.fields(); it.hasNext(); ) {
      var e = it.next();
      JsonNode g = e.getValue();
      tests.add(DynamicTest.dynamicTest(e.getKey(), () -> {
        URI uri = URI.create(g.get("path").asText());
        RequestBuilder req = g.get("method").asText().equals("GET")
            ? get(uri)
            : post(uri).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(g.get("body")));
        String body = mvc.perform(req).andReturn().getResponse().getContentAsString();
        JsonNode actual = json.readTree(body);
        List<String> diffs = new ArrayList<>();
        compare("$", g.get("response"), actual, diffs);
        assertThat(diffs).as("differences from the web mock for %s", e.getKey()).isEmpty();
      }));
    }
    return tests.stream();
  }

  /** Structural compare. Numbers compare by value (15 equals 15.0); absent equals null, as JSON.parse reads both as no value. */
  static void compare(String path, JsonNode expected, JsonNode actual, List<String> diffs) {
    if (IGNORED.contains(path) || diffs.size() > 10) {
      return;
    }
    boolean expNull = expected == null || expected.isNull() || expected.isMissingNode();
    boolean actNull = actual == null || actual.isNull() || actual.isMissingNode();
    if (expNull || actNull) {
      if (expNull != actNull) {
        diffs.add(path + ": expected " + expected + " but was " + actual);
      }
      return;
    }
    if (expected.isNumber() && actual.isNumber()) {
      if (Math.abs(expected.doubleValue() - actual.doubleValue()) > 1e-9) {
        diffs.add(path + ": expected " + expected + " but was " + actual);
      }
      return;
    }
    if (expected.isObject() && actual.isObject()) {
      var names = new java.util.TreeSet<String>();
      expected.fieldNames().forEachRemaining(names::add);
      actual.fieldNames().forEachRemaining(names::add);
      for (String n : names) {
        compare(path + "." + n, expected.get(n), actual.get(n), diffs);
      }
      return;
    }
    if (expected.isArray() && actual.isArray()) {
      if (expected.size() != actual.size()) {
        diffs.add(path + ": expected " + expected.size() + " items but was " + actual.size());
        return;
      }
      for (int i = 0; i < expected.size(); i++) {
        compare(path + "[" + i + "]", expected.get(i), actual.get(i), diffs);
      }
      return;
    }
    if (!expected.equals(actual)) {
      diffs.add(path + ": expected " + expected + " but was " + actual);
    }
  }

}
