package hk.eli.gateway.ai;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.web.client.ClientHttpRequestFactories;
import org.springframework.boot.web.client.ClientHttpRequestFactorySettings;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * Calls the Stork AI orchestrator with the Gemini adapter. Off unless eli.stork.enabled is true and an endpoint is
 * set; then every answer keeps its template wording. Any failure or timeout also falls back to the template.
 */
@Component
public class StorkAiClient implements WordingModel {
  private static final Logger log = LoggerFactory.getLogger(StorkAiClient.class);

  private final StorkAiProperties props;
  private final RestClient http;

  public StorkAiClient(StorkAiProperties props, RestClient.Builder builder) {
    this.props = props;
    var settings = ClientHttpRequestFactorySettings.DEFAULTS.withConnectTimeout(props.timeout()).withReadTimeout(props.timeout());
    this.http = builder.requestFactory(ClientHttpRequestFactories.get(settings)).build();
  }

  @Override
  public String provider() {
    return enabled() ? "stork-ai/" + props.adapter() : "off";
  }

  @Override
  public boolean enabled() {
    return props.enabled() && props.endpoint() != null && !props.endpoint().isBlank();
  }

  record Reply(String text) {}

  @Override
  public Optional<String> reword(String systemPrompt, String userPrompt) {
    if (!enabled()) {
      return Optional.empty();
    }
    try {
      Reply reply = http.post()
          .uri(props.endpoint())
          .contentType(MediaType.APPLICATION_JSON)
          .headers(h -> {
            if (props.apiKey() != null && !props.apiKey().isBlank()) {
              h.setBearerAuth(props.apiKey());
            }
          })
          .body(Map.of(
              "adapter", props.adapter(),
              "model", props.model(),
              "temperature", 0,
              "messages", List.of(Map.of("role", "system", "content", systemPrompt), Map.of("role", "user", "content", userPrompt))))
          .retrieve()
          .body(Reply.class);
      return Optional.ofNullable(reply).map(Reply::text).filter(t -> !t.isBlank());
    } catch (RuntimeException e) {
      log.warn("Stork AI call failed, keeping template wording: {}", e.getMessage());
      return Optional.empty();
    }
  }
}
