package hk.eli.gateway.feedback;

import hk.eli.gateway.time.BusinessClock;
import hk.eli.gateway.web.Caller;
import java.sql.Timestamp;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

/** Launch feedback (R40). One rating per user and topic: a new rating replaces the earlier one. */
@Service
public class FeedbackService {
  public record FeedbackInput(String topic, String rating, String note) {}

  public record FeedbackEntry(String id, String topic, String rating, String note, String role, String at) {}

  public record TopicLine(String topic, int up, int down, int usefulPct, int notes) {}

  public record RoleLine(String role, int total, int usefulPct) {}

  public record WeeklyFeedback(String weekStart, String weekEnd, int total, int up, int down, int usefulPct, List<RoleLine> byRole, List<TopicLine> byTopic, List<FeedbackEntry> notes) {}

  private final JdbcClient jdbc;
  private final BusinessClock clock;

  public FeedbackService(JdbcClient jdbc, BusinessClock clock) {
    this.jdbc = jdbc;
    this.clock = clock;
  }

  public FeedbackEntry rate(FeedbackInput in, Caller caller) {
    if (in.topic() == null || in.topic().isBlank() || in.topic().length() > 300) {
      throw new IllegalArgumentException("Say what the feedback is about (up to 300 characters).");
    }
    if (!"up".equals(in.rating()) && !"down".equals(in.rating())) {
      throw new IllegalArgumentException("Rating must be up or down.");
    }
    String note = in.note() == null ? "" : in.note().trim();
    if (note.length() > 1000) {
      throw new IllegalArgumentException("Notes are limited to 1,000 characters.");
    }
    jdbc.sql("DELETE FROM feedback WHERE user_name = :u AND topic = :t").param("u", caller.user()).param("t", in.topic()).update();
    var e = new FeedbackEntry(UUID.randomUUID().toString(), in.topic(), in.rating(), note, caller.role(), Instant.now().toString());
    jdbc.sql("INSERT INTO feedback (id, topic, rating, note, role, user_name, at) VALUES (:id, :topic, :rating, :note, :role, :user, :at)")
        .param("id", e.id()).param("topic", e.topic()).param("rating", e.rating()).param("note", note).param("role", e.role())
        .param("user", caller.user()).param("at", Timestamp.from(Instant.parse(e.at())))
        .update();
    return e;
  }

  public void clear(String topic, Caller caller) {
    jdbc.sql("DELETE FROM feedback WHERE user_name = :u AND topic = :t").param("u", caller.user()).param("t", topic).update();
  }

  static String topicGroup(String topic) {
    return topic.startsWith("Chat answer:") ? "Chat answers" : topic;
  }

  private static int pct(int n, int d) {
    return d == 0 ? 0 : (int) Math.round(n * 100.0 / d);
  }

  /** The week (Monday to Friday) that holds {@code day}, least useful topics first. Same rules as summariseWeek in the web app. */
  public WeeklyFeedback week(LocalDate day) {
    LocalDate start = day == null ? clock.businessDate() : day;
    start = start.with(DayOfWeek.MONDAY);
    ZoneId zone = clock.zone();
    Instant from = start.atStartOfDay(zone).toInstant();
    Instant to = start.plusDays(7).atStartOfDay(zone).toInstant();
    List<FeedbackEntry> all = jdbc.sql("SELECT * FROM feedback WHERE at >= :from AND at < :to")
        .param("from", Timestamp.from(from)).param("to", Timestamp.from(to))
        .query((rs, i) -> new FeedbackEntry(rs.getString("id"), rs.getString("topic"), rs.getString("rating"), rs.getString("note"), rs.getString("role"),
            rs.getTimestamp("at").toInstant().toString()))
        .list();
    int up = (int) all.stream().filter(e -> e.rating().equals("up")).count();
    Map<String, List<FeedbackEntry>> byRole = new LinkedHashMap<>();
    Map<String, List<FeedbackEntry>> byTopic = new LinkedHashMap<>();
    for (var e : all) {
      byRole.computeIfAbsent(e.role(), k -> new ArrayList<>()).add(e);
      byTopic.computeIfAbsent(topicGroup(e.topic()), k -> new ArrayList<>()).add(e);
    }
    List<TopicLine> topics = new ArrayList<>(byTopic.entrySet().stream().map(en -> {
      var l = en.getValue();
      int u = (int) l.stream().filter(x -> x.rating().equals("up")).count();
      return new TopicLine(en.getKey(), u, l.size() - u, pct(u, l.size()), (int) l.stream().filter(x -> !x.note().isEmpty()).count());
    }).toList());
    topics.sort(Comparator.comparingInt(TopicLine::usefulPct).thenComparing(Comparator.comparingInt(TopicLine::down).reversed()).thenComparing(TopicLine::topic));
    return new WeeklyFeedback(start.toString(), start.plusDays(4).toString(), all.size(), up, all.size() - up, pct(up, all.size()),
        byRole.entrySet().stream().map(en -> new RoleLine(en.getKey(), en.getValue().size(),
            pct((int) en.getValue().stream().filter(x -> x.rating().equals("up")).count(), en.getValue().size()))).toList(),
        topics,
        all.stream().filter(e -> !e.note().isEmpty()).sorted(Comparator.comparing(FeedbackEntry::at).reversed()).toList());
  }
}
