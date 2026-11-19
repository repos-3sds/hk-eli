package hk.eli.gateway.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import hk.eli.gateway.audit.PromptAudit;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/** The model may only reword the lead sentence; the guardrails decide, and every call is audited. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("demo")
class AnswerWordingTest {
  static final AtomicReference<String> NEXT = new AtomicReference<>();

  @TestConfiguration
  static class StubModel {
    @Bean
    @Primary
    WordingModel stub() {
      return new WordingModel() {
        public String provider() {
          return "stub";
        }

        public boolean enabled() {
          return true;
        }

        public Optional<String> reword(String system, String user) {
          return Optional.ofNullable(NEXT.get());
        }
      };
    }
  }

  @Autowired MockMvc mvc;
  @Autowired PromptAudit audit;

  static final String ASK = "{\"text\":\"Where is rollover below 80% this month?\",\"clientId\":null}";

  @BeforeEach
  void reset() {
    NEXT.set(null);
  }

  @Test
  void showsTheModelWordingWhenItPasses() throws Exception {
    NEXT.set("3 pockets are below the 80% baseline this month; Kwun Tong · Treasures is lowest at 45% (5 of 11 rolled), with USD 3.80m maturing in the next 10 business days.");
    mvc.perform(post("/chat/answers").contentType(MediaType.APPLICATION_JSON).content(ASK).header("X-Eli-User", "pm.lee").header("X-Eli-Role", "pm"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.blocks[0].text").value(NEXT.get()))
        .andExpect(jsonPath("$.blocks[1].kind").value("table"))
        .andExpect(jsonPath("$.blocks[1].rows[0][3]").value("45%"));
    var last = audit.latest(1).get(0);
    assertThat(last.outcome()).isEqualTo("reworded");
    assertThat(last.user()).isEqualTo("pm.lee");
    assertThat(last.role()).isEqualTo("pm");
    assertThat(last.intent()).isEqualTo("rollover");
    assertThat(last.prompt()).contains("Use only the facts").contains("Kwun Tong");
  }

  @Test
  void keepsTheTemplateWhenTheGuardrailsBlock() throws Exception {
    NEXT.set("Rollover is 91% overall. We recommend calling Kwun Tong.");
    mvc.perform(post("/chat/answers").contentType(MediaType.APPLICATION_JSON).content(ASK))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.blocks[0].text").value(org.hamcrest.Matchers.startsWith("Rollover is above the 80% baseline overall")));
    var last = audit.latest(1).get(0);
    assertThat(last.outcome()).isEqualTo("blocked");
    assertThat(last.reason()).contains("91");
    assertThat(last.modelOutput()).contains("91%");
  }

  @Test
  void keepsTheTemplateWhenTheModelFails() throws Exception {
    mvc.perform(post("/chat/answers").contentType(MediaType.APPLICATION_JSON).content(ASK))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.blocks[0].text").value(org.hamcrest.Matchers.startsWith("Rollover is above")));
    assertThat(audit.latest(1).get(0).outcome()).isEqualTo("template");
  }

  @Test
  void neverSendsAQuestionItDidNotUnderstand() throws Exception {
    NEXT.set("Anything");
    mvc.perform(post("/chat/answers").contentType(MediaType.APPLICATION_JSON).content("{\"text\":\"What is the weather?\",\"clientId\":null}"))
        .andExpect(jsonPath("$.fallback").value(true));
    assertThat(audit.latest(1).get(0).outcome()).isEqualTo("skipped");
  }

  @Test
  void rejectsAnEmptyQuestion() throws Exception {
    mvc.perform(post("/chat/answers").contentType(MediaType.APPLICATION_JSON).content("{\"text\":\" \",\"clientId\":null}"))
        .andExpect(status().isBadRequest());
  }
}
