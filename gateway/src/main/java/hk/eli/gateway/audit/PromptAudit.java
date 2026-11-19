package hk.eli.gateway.audit;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Every wording call is recorded: who asked, what the model was sent, what came back, and what was shown. */
@Repository
public class PromptAudit {
  public record Entry(
      String id, Instant at, String user, String role, String question, String intent, String provider, String prompt,
      String modelOutput, String outcome, String reason, long latencyMs, String traceId) {}

  private final JdbcClient jdbc;

  public PromptAudit(JdbcClient jdbc) {
    this.jdbc = jdbc;
  }

  public Entry record(Entry e) {
    Entry saved = new Entry(UUID.randomUUID().toString(), Instant.now(), e.user(), e.role(), cut(e.question(), 1000), e.intent(), e.provider(), e.prompt(),
        e.modelOutput(), e.outcome(), cut(e.reason(), 500), e.latencyMs(), e.traceId());
    jdbc.sql("""
        INSERT INTO prompt_audit (id, at, user_name, role, question, intent, provider, prompt, model_output, outcome, reason, latency_ms, trace_id)
        VALUES (:id, :at, :user, :role, :question, :intent, :provider, :prompt, :output, :outcome, :reason, :latency, :trace)""")
        .param("id", saved.id()).param("at", Timestamp.from(saved.at())).param("user", saved.user()).param("role", saved.role())
        .param("question", saved.question()).param("intent", saved.intent()).param("provider", saved.provider()).param("prompt", saved.prompt())
        .param("output", saved.modelOutput()).param("outcome", saved.outcome()).param("reason", saved.reason())
        .param("latency", saved.latencyMs()).param("trace", saved.traceId())
        .update();
    return saved;
  }

  public List<Entry> latest(int limit) {
    return jdbc.sql("SELECT * FROM prompt_audit ORDER BY at DESC LIMIT :limit")
        .param("limit", Math.max(1, Math.min(limit, 500)))
        .query((rs, i) -> new Entry(rs.getString("id"), rs.getTimestamp("at").toInstant(), rs.getString("user_name"), rs.getString("role"),
            rs.getString("question"), rs.getString("intent"), rs.getString("provider"), rs.getString("prompt"), rs.getString("model_output"),
            rs.getString("outcome"), rs.getString("reason"), rs.getLong("latency_ms"), rs.getString("trace_id")))
        .list();
  }

  private static String cut(String s, int max) {
    return s == null || s.length() <= max ? s : s.substring(0, max);
  }
}
