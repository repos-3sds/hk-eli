package hk.eli.gateway.agents;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * The HK ELI agents (chatbot/, Python): the model picks tools over the HK_ELI skills and the SQLite book, code runs
 * them, the model writes the answer and code checks every figure. Stork AI with the Gemini adapter in the office,
 * public Gemini or local Ollama here. Off by default, so the gateway answers exactly as before.
 *
 * @param baseUrl where the agent service listens, e.g. http://127.0.0.1:8040
 * @param timeout how long one answer may take, all tool rounds included
 */
@ConfigurationProperties(prefix = "eli.agents")
public record AgentProperties(
    @DefaultValue("false") boolean enabled,
    @DefaultValue("http://127.0.0.1:8040") String baseUrl,
    @DefaultValue("60s") Duration timeout) {}
