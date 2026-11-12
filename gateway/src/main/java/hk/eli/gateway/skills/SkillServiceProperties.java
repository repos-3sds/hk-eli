package hk.eli.gateway.skills;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * The HK ELI skills service (Niharika's HK_ELI: Stork AI skill planner and typed eli.* skills). Off by default, so the
 * gateway answers from its own seed exactly as before.
 *
 * @param baseUrl where the service listens, e.g. http://127.0.0.1:8031
 * @param profile the service's local test profile to sign in as. Local runs only: the service accepts it from
 *     localhost alone. Behind the bank's gateway this becomes a signed caller identity (see the integration plan).
 * @param timeout how long one answer may take, submit to completed run
 * @param pollInterval how often to check a run
 */
@ConfigurationProperties(prefix = "eli.skills")
public record SkillServiceProperties(
    @DefaultValue("false") boolean enabled,
    @DefaultValue("http://127.0.0.1:8031") String baseUrl,
    @DefaultValue("synthetic-hk-rm") String profile,
    @DefaultValue("15s") Duration timeout,
    @DefaultValue("150ms") Duration pollInterval) {}
