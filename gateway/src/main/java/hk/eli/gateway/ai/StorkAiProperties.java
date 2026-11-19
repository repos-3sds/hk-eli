package hk.eli.gateway.ai;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Stork AI orchestrator settings. The API key comes from Vault (spring.cloud.vault, path secret/hk-eli) or the
 * environment, never from a file in the repo.
 *
 * @param endpoint the orchestrator's completion URL; the request shape is our best reading until the Stork AI
 *     team confirms it (open item)
 */
@ConfigurationProperties(prefix = "eli.stork")
public record StorkAiProperties(
    @DefaultValue("false") boolean enabled,
    String endpoint,
    String apiKey,
    @DefaultValue("gemini") String adapter,
    @DefaultValue("gemini-default") String model,
    @DefaultValue("4s") Duration timeout) {}
