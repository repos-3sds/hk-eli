package hk.eli.gateway;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/** Hand-offs and feedback are stored (H2 in MariaDB mode here, MariaDB in production) through Flyway's schema. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("demo")
@DirtiesContext
class StorageTest {
  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;

  static final String ITEM = """
      {"items":[{"id":"i-1","clientId":"c-4821","clientName":"Chan Tai Man","ownerRm":"Mandy Chow","branch":"Kwun Tong",
        "reason":"USD 450k matures Thursday; rollover pocket below baseline","idea":{"title":"AMD / META worst-of · 6M","terms":"KI 65% · coupon 17.4%","pricedAt":"2026-11-03T09:05:00+08:00"},
        "underlyings":["AMD","META"],"from":"Today","addedAt":"2026-11-03T09:20:00+08:00"}]}""";

  @Test
  void sendsAHandoffAndRecordsTheOutcome() throws Exception {
    String body = mvc.perform(post("/handoffs").contentType(MediaType.APPLICATION_JSON).content(ITEM).header("X-Eli-User", "wms.ho").header("X-Eli-Role", "wms"))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.windowEnds").value("2026-11-17"))
        .andExpect(jsonPath("$.sentBy").value("wms.ho"))
        .andExpect(jsonPath("$.outcomes['i-1'].status").value("sent"))
        .andReturn().getResponse().getContentAsString();
    String id = json.readTree(body).get("id").asText();

    mvc.perform(patch("/handoffs/{id}/items/i-1", id).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"linked-trade\",\"note\":\"Trade T-88213, 5 Nov\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.outcomes['i-1'].status").value("linked-trade"))
        .andExpect(jsonPath("$.outcomes['i-1'].note").value("Trade T-88213, 5 Nov"))
        .andExpect(jsonPath("$.items[0].idea.terms").value("KI 65% · coupon 17.4%"));

    mvc.perform(get("/handoffs")).andExpect(jsonPath("$[0].id").value(id));
  }

  @Test
  void refusesABadHandoff() throws Exception {
    mvc.perform(post("/handoffs").contentType(MediaType.APPLICATION_JSON).content("{\"items\":[]}")).andExpect(status().isBadRequest());
    mvc.perform(patch("/handoffs/HO-NOPE/items/i-1").contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"sent\"}")).andExpect(status().isNotFound());
  }

  @Test
  void summarisesTheWeekLeastUsefulFirst() throws Exception {
    rate("u1", "pm", "Today's list", "up", "");
    rate("u2", "tsm", "Today's list", "up", "");
    rate("u1", "pm", "Chat answer: Who matures this week?", "down", "Missed a maturity on the 6th");
    rate("u2", "tsm", "Chat answer: Brief me on Chan", "up", "");
    // A second rating from the same user on the same topic replaces the first.
    rate("u1", "pm", "Today's list", "down", "");
    rate("u1", "pm", "Today's list", "up", "");

    mvc.perform(get("/feedback/week").param("day", java.time.LocalDate.now(java.time.ZoneId.of("Asia/Hong_Kong")).toString()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.total").value(4))
        .andExpect(jsonPath("$.usefulPct").value(75))
        .andExpect(jsonPath("$.byTopic[0].topic").value("Chat answers"))
        .andExpect(jsonPath("$.byTopic[0].usefulPct").value(50))
        .andExpect(jsonPath("$.notes[0].note").value("Missed a maturity on the 6th"));

    mvc.perform(delete("/feedback").param("topic", "Today's list").header("X-Eli-User", "u1")).andExpect(status().isNoContent());
    mvc.perform(post("/feedback").contentType(MediaType.APPLICATION_JSON).content("{\"topic\":\"x\",\"rating\":\"meh\"}")).andExpect(status().isBadRequest());
  }

  private void rate(String user, String role, String topic, String rating, String note) throws Exception {
    mvc.perform(post("/feedback").contentType(MediaType.APPLICATION_JSON).header("X-Eli-User", user).header("X-Eli-Role", role)
            .content(json.writeValueAsString(java.util.Map.of("topic", topic, "rating", rating, "note", note))))
        .andExpect(status().isCreated());
  }
}
