package hk.eli.gateway.ai;

import java.util.Optional;

/** Something that rewords a computed answer. Stork AI in production (Gemini adapter for now); off in the demo. */
public interface WordingModel {
  /** Short name for the audit, e.g. "stork-ai/gemini" or "off". */
  String provider();

  boolean enabled();

  /** The model's wording, or empty when the call failed or timed out. Never throws. */
  Optional<String> reword(String systemPrompt, String userPrompt);
}
