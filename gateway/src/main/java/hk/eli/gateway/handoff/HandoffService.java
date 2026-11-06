package hk.eli.gateway.handoff;

import static hk.eli.gateway.time.BusinessCalendar.addBusinessDays;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import hk.eli.gateway.time.BusinessClock;
import hk.eli.gateway.web.Caller;
import hk.eli.gateway.web.NotFoundException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.*;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Hand-off lists (R38). Launch users hand lists to the owning RM or branch; the record lets a later trade be linked to
 * it within the window (linked, not caused). Same shapes as web/src/app/core/handoff/handoff.models.ts.
 */
@Service
public class HandoffService {
  public static final int LINK_WINDOW_BUSINESS_DAYS = 10;
  static final Set<String> STATUSES = Set.of("sent", "linked-trade", "window-closed", "desk-declined");
  static final String NO_CLIENT = "No client named, so no trade can be linked";
  static final Set<String> FROM = Set.of("Today", "Ideas", "Chat");

  public record Idea(String title, String terms, String pricedAt) {}

  public record Item(String id, String clientId, String clientName, String ownerRm, String branch, String reason, Idea idea, List<String> underlyings, String from, String addedAt) {}

  public record Outcome(String status, String note) {}

  public record HandoffRecord(String id, String sentAt, String sentBy, String role, String windowEnds, List<Item> items, Map<String, Outcome> outcomes) {}

  public record SendRequest(List<Item> items) {}

  public record OutcomeRequest(String status, String note) {}

  private final JdbcClient jdbc;
  private final BusinessClock clock;
  private final ObjectMapper json;

  public HandoffService(JdbcClient jdbc, BusinessClock clock, ObjectMapper json) {
    this.jdbc = jdbc;
    this.clock = clock;
    this.json = json;
  }

  @Transactional
  public HandoffRecord send(SendRequest req, Caller caller) {
    if (req.items() == null || req.items().isEmpty()) {
      throw new IllegalArgumentException("A hand-off needs at least one item.");
    }
    if (req.items().size() > 200) {
      throw new IllegalArgumentException("A hand-off is limited to 200 items.");
    }
    for (Item i : req.items()) {
      if (i.id() == null || i.id().isBlank() || i.reason() == null || i.reason().isBlank() || i.ownerRm() == null || !FROM.contains(i.from())) {
        throw new IllegalArgumentException("Each item needs an id, an owner, a reason and where it came from (Today, Ideas or Chat).");
      }
    }
    String id = "HO-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(Locale.ROOT);
    Instant now = clock.now().toInstant();
    LocalDate windowEnds = addBusinessDays(clock.today(), LINK_WINDOW_BUSINESS_DAYS, clock.holidays());
    jdbc.sql("INSERT INTO handoff (id, sent_at, sent_by, role, window_ends, items_json) VALUES (:id, :at, :by, :role, :ends, :items)")
        .param("id", id).param("at", Timestamp.from(now)).param("by", caller.user()).param("role", caller.role())
        .param("ends", windowEnds).param("items", write(req.items()))
        .update();
    Map<String, Outcome> outcomes = new LinkedHashMap<>();
    for (Item i : req.items()) {
      String note = i.clientId() == null ? NO_CLIENT : null;
      setOutcome(id, i.id(), "sent", note, caller.user());
      outcomes.put(i.id(), new Outcome("sent", note));
    }
    return new HandoffRecord(id, now.toString(), caller.user(), caller.role(), windowEnds.toString(), req.items(), outcomes);
  }

  public List<HandoffRecord> list() {
    return jdbc.sql("SELECT * FROM handoff ORDER BY sent_at DESC")
        .query((rs, n) -> new HandoffRecord(rs.getString("id"), rs.getTimestamp("sent_at").toInstant().toString(), rs.getString("sent_by"),
            rs.getString("role"), rs.getDate("window_ends").toLocalDate().toString(), read(rs.getString("items_json")), new LinkedHashMap<>()))
        .list()
        .stream()
        .map(r -> new HandoffRecord(r.id(), r.sentAt(), r.sentBy(), r.role(), r.windowEnds(), r.items(), outcomes(r.id())))
        .toList();
  }

  public HandoffRecord get(String id) {
    return list().stream().filter(r -> r.id().equals(id)).findFirst().orElseThrow(() -> new NotFoundException("No hand-off " + id));
  }

  public HandoffRecord recordOutcome(String id, String itemId, OutcomeRequest req, Caller caller) {
    HandoffRecord r = get(id);
    if (r.items().stream().noneMatch(i -> i.id().equals(itemId))) {
      throw new NotFoundException("No item " + itemId + " in hand-off " + id);
    }
    if (!STATUSES.contains(req.status())) {
      throw new IllegalArgumentException("Status must be one of " + STATUSES);
    }
    if (req.note() != null && req.note().length() > 500) {
      throw new IllegalArgumentException("Notes are limited to 500 characters.");
    }
    setOutcome(id, itemId, req.status(), req.note(), caller.user());
    return get(id);
  }

  private void setOutcome(String id, String itemId, String status, String note, String by) {
    int updated = jdbc.sql("UPDATE handoff_outcome SET status = :s, note = :n, updated_at = :at, updated_by = :by WHERE handoff_id = :id AND item_id = :item")
        .param("s", status).param("n", note).param("at", Timestamp.from(Instant.now())).param("by", by).param("id", id).param("item", itemId)
        .update();
    if (updated == 0) {
      jdbc.sql("INSERT INTO handoff_outcome (handoff_id, item_id, status, note, updated_at, updated_by) VALUES (:id, :item, :s, :n, :at, :by)")
          .param("s", status).param("n", note).param("at", Timestamp.from(Instant.now())).param("by", by).param("id", id).param("item", itemId)
          .update();
    }
  }

  private Map<String, Outcome> outcomes(String id) {
    Map<String, Outcome> out = new LinkedHashMap<>();
    jdbc.sql("SELECT item_id, status, note FROM handoff_outcome WHERE handoff_id = :id").param("id", id)
        .query(rs -> {
          out.put(rs.getString("item_id"), new Outcome(rs.getString("status"), rs.getString("note")));
        });
    return out;
  }

  private String write(List<Item> items) {
    try {
      return json.writeValueAsString(items);
    } catch (JsonProcessingException e) {
      throw new IllegalStateException(e);
    }
  }

  private List<Item> read(String s) {
    try {
      return json.readValue(s, new TypeReference<>() {});
    } catch (JsonProcessingException e) {
      throw new IllegalStateException(e);
    }
  }
}
