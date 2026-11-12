package hk.eli.gateway.skills;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import hk.eli.gateway.skills.SkillServiceClient.SkillServiceException;
import java.io.InputStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Chat answers from the skills service, using runs recorded from the real service on our SQLite book. The service
 * itself is mocked here; scripts/smoke-test.sh exercises the live one.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("demo")
class SkillsChatTest {
  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;
  @Autowired SkillRouter router;
  @MockitoBean SkillServiceClient skills;

  @BeforeEach
  void on() {
    when(skills.enabled()).thenReturn(true);
  }

  JsonNode recorded(String skill) throws Exception {
    try (InputStream in = getClass().getResourceAsStream("/skills/sample-" + skill + ".json")) {
      return json.readTree(in);
    }
  }

  /** A Q6 run: maturity as t0 and rollover as t1, as the service returns a two-task plan. */
  JsonNode q6() throws Exception {
    ObjectNode run = (ObjectNode) recorded("eli.maturity.analyze").deepCopy();
    JsonNode roll = recorded("eli.rollover.opportunity");
    ObjectNode results = (ObjectNode) run.path("answer").path("analysis").path("results");
    results.set("t1", roll.path("answer").path("analysis").path("results").path("t0"));
    ((ArrayNode) run.path("answer").path("evidence")).addAll((ArrayNode) roll.path("answer").path("evidence"));
    return run;
  }

  String ask(String text) throws Exception {
    return json.writeValueAsString(java.util.Map.of("text", text));
  }

  @Test
  void concentrationComesFromTheSkillsWithEvidenceAndLabels() throws Exception {
    when(skills.run(anyString(), anyList())).thenReturn(recorded("eli.risk.concentration"));
    mvc.perform(post("/chat/answers").contentType(MediaType.APPLICATION_JSON).content(ask("Top concentrations against limit")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.blocks[0].text").value(org.hamcrest.Matchers.startsWith("NVDA is 24.63% of all ELI outstanding against a 25% limit")))
        .andExpect(jsonPath("$.blocks[1].kind").value("concentration"))
        .andExpect(jsonPath("$.blocks[1].lines[0].sharePct").value(24.63))
        .andExpect(jsonPath("$.blocks[1].lines[4].underlying").value("0700.HK"))
        .andExpect(jsonPath("$.blocks[2].kind").value("table"))
        .andExpect(jsonPath("$.sourceMode").value("MOCK"))
        .andExpect(jsonPath("$.status").value("complete"))
        .andExpect(jsonPath("$.businessDate").value("2026-11-02"))
        .andExpect(jsonPath("$.evidence[0].label").value("notional · NVDA"))
        .andExpect(jsonPath("$.evidence[0].value").value("147780000"))
        .andExpect(jsonPath("$.limitations[0]").value("Demo data. The metric definitions are not yet approved by the business."))
        .andExpect(jsonPath("$.runId").isNotEmpty());
  }

  @Test
  void bookMaturitiesUseQ6() throws Exception {
    when(skills.run(anyString(), anyList())).thenReturn(q6());
    mvc.perform(post("/chat/answers").contentType(MediaType.APPLICATION_JSON).content(ask("Maturities and rollovers across the book")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.blocks[0].text").value(org.hamcrest.Matchers.containsString("22 of 44 deals eligible for a rollover have been contacted")))
        .andExpect(jsonPath("$.blocks[1].kind").value("facts"))
        .andExpect(jsonPath("$.blocks[3].title").value("Rollover status of eligible maturities"))
        .andExpect(jsonPath("$.limitations[?(@ =~ /Whole HK book.*/)]").exists());
  }

  @Test
  void concentrationFallsBackToTheGatewayWhenTheServiceIsDown() throws Exception {
    when(skills.run(anyString(), anyList())).thenThrow(new SkillServiceException("The skills service at http://127.0.0.1:8031 is not reachable."));
    mvc.perform(post("/chat/answers").contentType(MediaType.APPLICATION_JSON).content(ask("Top concentrations against limit")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.blocks[1].kind").value("concentration"))
        .andExpect(jsonPath("$.sourceMode").doesNotExist())
        .andExpect(jsonPath("$.limitations[0]").value(org.hamcrest.Matchers.containsString("comes from the gateway's own data instead")));
  }

  @Test
  void skillOnlyQuestionsSayTheServiceIsDown() throws Exception {
    when(skills.run(anyString(), anyList())).thenThrow(new SkillServiceException("The skills service at http://127.0.0.1:8031 is not reachable."));
    mvc.perform(post("/chat/answers").contentType(MediaType.APPLICATION_JSON).content(ask("Maturities and rollovers across the book")))
        .andExpect(status().isServiceUnavailable())
        .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("not reachable")));
  }

  @Test
  void clientQuestionsAndAdviceStayLocal() throws Exception {
    mvc.perform(post("/chat/answers").contentType(MediaType.APPLICATION_JSON).content(ask("Should the client buy NVDA?")))
        .andExpect(status().isOk());
    mvc.perform(post("/chat/answers").contentType(MediaType.APPLICATION_JSON).content(ask("Who matures this week?")))
        .andExpect(status().isOk());
    verify(skills, never()).run(anyString(), any());
  }

  @Test
  void routesMatchTheScenarios() {
    assertThat(router.route("Top concentrations against limit", false)).get().extracting(SkillRouter.Route::scenario).isEqualTo("Q1");
    assertThat(router.route("Concentration by branch", false)).get().extracting(SkillRouter.Route::scenario).isEqualTo("Q7");
    assertThat(router.route("Maturities and rollovers across the book", false)).get().extracting(SkillRouter.Route::scenario).isEqualTo("Q6");
    assertThat(router.route("Regional performance by district", false)).get().extracting(SkillRouter.Route::scenario).isEqualTo("Q8");
    assertThat(router.route("Digibank journey this month", false)).get().extracting(SkillRouter.Route::scenario).isEqualTo("Q9");
    assertThat(router.route("Coupons by product", false)).get().extracting(SkillRouter.Route::scenario).isEqualTo("Q4");
    assertThat(router.route("Who matures this week?", false)).isEmpty();
    assertThat(router.route("Should we sell TSLA?", false)).isEmpty();
    // Demo "today" is Tue 3 Nov 2026; the window ends 10 business days later (Tue 17 Nov); the data date is 2 Nov.
    assertThat(router.windowDays()).isEqualTo(15);
  }
}
