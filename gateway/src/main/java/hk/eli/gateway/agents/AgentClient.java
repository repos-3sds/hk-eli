package hk.eli.gateway.agents;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * Asks the HK ELI agent service one question. The service streams Server-Sent Events (start, tool_start, tool_end,
 * delta, final, error); the gateway reads the stream to its end and returns the final event, which carries the answer,
 * follow-ups, every tool result and the figure check.
 */
@Component
public class AgentClient {
  /** Thrown when the agents are off, unreachable, fail or run out of time. The message is shown to the user. */
  public static class AgentException extends RuntimeException {
    public AgentException(String message) {
      super(message);
    }
  }

  private final AgentProperties props;
  private final ObjectMapper json;
  private final HttpClient http;

  public AgentClient(AgentProperties props, ObjectMapper json) {
    this.props = props;
    this.json = json;
    this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
  }

  public boolean enabled() {
    return props.enabled();
  }

  /** Runs one agent turn for the caller's persona (wms, pm or tsm) and returns the final event. */
  public JsonNode ask(String question, String persona) {
    if (!enabled()) {
      throw new AgentException("The HK ELI agents are switched off.");
    }
    HttpResponse<java.io.InputStream> res;
    try {
      String body = json.writeValueAsString(Map.of("question", question, "persona", persona));
      HttpRequest req = HttpRequest.newBuilder(URI.create(props.baseUrl() + "/api/chat"))
          .timeout(props.timeout())
          .header("Content-Type", "application/json")
          .header("Accept", "text/event-stream")
          .POST(HttpRequest.BodyPublishers.ofString(body))
          .build();
      res = http.send(req, HttpResponse.BodyHandlers.ofInputStream());
    } catch (IOException e) {
      throw new AgentException("The HK ELI agents did not answer.");
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new AgentException("The HK ELI agents did not answer.");
    }
    if (res.statusCode() != 200) {
      throw new AgentException("The HK ELI agents refused the question (HTTP " + res.statusCode() + ").");
    }
    return readFinal(res.body());
  }

  /** Reads the event stream until a final or error event. Package-private for tests. */
  JsonNode readFinal(java.io.InputStream stream) {
    long deadline = System.nanoTime() + props.timeout().toNanos();
    try (var in = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
      String line;
      while ((line = in.readLine()) != null) {
        if (System.nanoTime() > deadline) {
          throw new AgentException("The HK ELI agents ran out of time.");
        }
        if (!line.startsWith("data:")) {
          continue;
        }
        JsonNode event = json.readTree(line.substring(5).trim());
        switch (event.path("type").asText()) {
          case "final" -> {
            return event;
          }
          case "error" -> throw new AgentException(event.path("message").asText("The HK ELI agents could not answer."));
          default -> {
            // start, tool_start, tool_end, delta, discard: progress only
          }
        }
      }
    } catch (IOException e) {
      throw new AgentException("The HK ELI agents stopped before answering.");
    }
    throw new AgentException("The HK ELI agents stopped before answering.");
  }
}
