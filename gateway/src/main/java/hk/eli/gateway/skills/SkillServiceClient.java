package hk.eli.gateway.skills;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.net.http.HttpClient;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

/**
 * Talks to the HK ELI skills service. It sends a typed plan (the skills to run), not free text, so answers come from
 * the service's checked skills even in its offline fixture mode, with no model call. The service runs the plan
 * asynchronously: submit, then poll the run until it finishes.
 *
 * <p>The service needs a signed-in session and a CSRF token on every POST. Locally the gateway signs in with the
 * service's local test profile (it accepts that from localhost only) and keeps one session, signing in again when the
 * service rejects it.
 */
@Component
public class SkillServiceClient {
  private static final Logger log = LoggerFactory.getLogger(SkillServiceClient.class);

  /** One task in a plan: an eli.* skill and its inputs. */
  public record Task(String id, String skillId, Map<String, Object> parameters) {}

  /** Thrown when the service is off, unreachable, refuses the plan, fails the run or runs out of time. */
  public static class SkillServiceException extends RuntimeException {
    public SkillServiceException(String message) {
      super(message);
    }
  }

  private record Session(String cookie, String csrf) {}

  private final SkillServiceProperties props;
  private final ObjectMapper json;
  private final RestClient http;
  private volatile Session session;

  public SkillServiceClient(SkillServiceProperties props, ObjectMapper json, RestClient.Builder builder) {
    this.props = props;
    this.json = json;
    // The JDK client, so a refused POST is never retried behind our back (Apache HttpClient retries 429 and 503).
    var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(java.time.Duration.ofSeconds(2)).build());
    factory.setReadTimeout(props.timeout());
    this.http = builder.clone().baseUrl(props.baseUrl()).requestFactory(factory).build();
  }

  public boolean enabled() {
    return props.enabled();
  }

  /** Runs the plan and returns the completed run (its "answer" holds results, evidence and warnings). */
  public JsonNode run(String question, List<Task> tasks) {
    if (!enabled()) {
      throw new SkillServiceException("The skills service is switched off.");
    }
    JsonNode submitted = submit(question, tasks, true);
    String runId = submitted.path("run_id").asText();
    try {
      Instant deadline = Instant.now().plus(props.timeout());
      while (true) {
        JsonNode run = get("/api/v1/runs/" + runId);
        String status = run.path("status").asText();
        switch (status) {
          case "completed" -> {
            return run;
          }
          case "failed", "cancelled", "interrupted" -> throw new SkillServiceException(
              "The skills service could not finish this answer: " + run.path("error").path("message").asText(status) + ".");
          default -> {
            if (Instant.now().isAfter(deadline)) {
              throw new SkillServiceException("The skills service took longer than " + props.timeout().toSeconds() + " seconds.");
            }
            sleep();
          }
        }
      }
    } finally {
      forget(submitted.path("conversation_id").asText(null));
    }
  }

  /**
   * Each gateway question is self-contained, so its saved chat on the service is deleted once read. The service keeps
   * at most 20 chats per user and refuses new requests after that.
   */
  private void forget(String conversationId) {
    if (conversationId == null) {
      return;
    }
    try {
      Session s = session();
      http.delete().uri("/api/v1/conversations/" + conversationId).header(HttpHeaders.COOKIE, s.cookie()).header("X-CSRF-Token", s.csrf())
          .retrieve().toBodilessEntity();
    } catch (RuntimeException e) {
      log.warn("Could not delete skills-service chat {}: {}", conversationId, e.getMessage());
    }
  }

  private JsonNode submit(String question, List<Task> tasks, boolean retry) {
    Session s = session();
    List<Map<String, Object>> taskList = new ArrayList<>();
    for (Task t : tasks) {
      Map<String, Object> m = new LinkedHashMap<>();
      m.put("id", t.id());
      m.put("skill_id", t.skillId());
      m.put("parameters", t.parameters());
      taskList.add(m);
    }
    Map<String, Object> body = Map.of("question", question, "plan", Map.of("intent", Map.of("question", question), "tasks", taskList));
    try {
      JsonNode reply = http.post().uri("/api/v1/requests").contentType(MediaType.APPLICATION_JSON)
          .header(HttpHeaders.COOKIE, s.cookie()).header("X-CSRF-Token", s.csrf()).body(body)
          .retrieve().body(JsonNode.class);
      return reply;
    } catch (RestClientResponseException e) {
      if (e.getStatusCode().value() == 403 && retry) {
        session = null;
        return submit(question, tasks, false);
      }
      throw new SkillServiceException("The skills service refused the request (" + e.getStatusCode().value() + "): " + errorText(e) + ".");
    } catch (RestClientException e) {
      throw unreachable(e);
    }
  }

  private JsonNode get(String path) {
    try {
      return http.get().uri(path).header(HttpHeaders.COOKIE, session().cookie()).retrieve().body(JsonNode.class);
    } catch (RestClientResponseException e) {
      throw new SkillServiceException("The skills service answered " + e.getStatusCode().value() + ": " + errorText(e) + ".");
    } catch (RestClientException e) {
      throw unreachable(e);
    }
  }

  private Session session() {
    Session s = session;
    if (s != null) {
      return s;
    }
    synchronized (this) {
      if (session == null) {
        session = signIn();
      }
      return session;
    }
  }

  /** GET /api/session for a cookie and CSRF token, then POST /api/login with the local test profile. */
  private Session signIn() {
    try {
      var boot = http.get().uri("/api/session").retrieve().toEntity(JsonNode.class);
      String cookie = cookieOf(boot.getHeaders(), null);
      String csrf = boot.getBody().path("csrf").asText();
      var login = http.post().uri("/api/login").contentType(MediaType.APPLICATION_JSON).header(HttpHeaders.COOKIE, cookie)
          .header("X-CSRF-Token", csrf).body(Map.of("user_id", props.profile())).retrieve().toEntity(JsonNode.class);
      log.info("Signed in to the skills service at {} as {}", props.baseUrl(), props.profile());
      return new Session(cookieOf(login.getHeaders(), cookie), login.getBody().path("csrf").asText());
    } catch (RestClientResponseException e) {
      throw new SkillServiceException("The skills service would not sign the gateway in (" + e.getStatusCode().value() + "): " + errorText(e) + ".");
    } catch (RestClientException e) {
      throw unreachable(e);
    }
  }

  private static String cookieOf(HttpHeaders headers, String fallback) {
    List<String> set = headers.get(HttpHeaders.SET_COOKIE);
    if (set == null || set.isEmpty()) {
      return fallback;
    }
    return set.stream().map(c -> c.split(";", 2)[0]).reduce((a, b) -> a + "; " + b).orElse(fallback);
  }

  private String errorText(RestClientResponseException e) {
    try {
      JsonNode n = json.readTree(e.getResponseBodyAsString());
      return n.path("error").asText(n.path("code").asText("no detail"));
    } catch (Exception ignored) {
      HttpStatusCode code = e.getStatusCode();
      return "HTTP " + code.value();
    }
  }

  private SkillServiceException unreachable(RestClientException e) {
    session = null;
    log.warn("Skills service at {} not reachable: {}", props.baseUrl(), e.getMessage());
    return new SkillServiceException("The HK ELI skills service is not reachable.");
  }

  private void sleep() {
    try {
      Thread.sleep(props.pollInterval().toMillis());
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new SkillServiceException("Interrupted while waiting for the skills service.");
    }
  }
}
