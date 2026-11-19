package hk.eli.gateway.agents;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.startsWith;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import hk.eli.gateway.agents.AgentClient.AgentException;
import hk.eli.gateway.chat.ChatModels.BulletsBlock;
import hk.eli.gateway.chat.ChatModels.TableBlock;
import hk.eli.gateway.chat.ChatModels.TextBlock;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
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
 * Chat answers from the HK ELI agents, using final events recorded from the real agent service (Gemini) on our SQLite
 * book. The agent service is mocked here; scripts/smoke-test.sh exercises the live one.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("demo")
class AgentChatTest {
  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;
  @MockitoBean AgentClient agents;

  @BeforeEach
  void on() {
    when(agents.enabled()).thenReturn(true);
  }

  JsonNode recorded(String name) throws Exception {
    try (InputStream in = getClass().getResourceAsStream("/agents/final-" + name + ".json")) {
      return json.readTree(in);
    }
  }

  String ask(String text) throws Exception {
    return json.writeValueAsString(Map.of("text", text));
  }

  @Test
  void bookQuestionIsAnsweredByTheAgentsWithTableEvidenceAndOrigin() throws Exception {
    when(agents.ask(anyString(), anyString())).thenReturn(recorded("concentration"));
    mvc.perform(post("/chat/answers").contentType(MediaType.APPLICATION_JSON).header("X-Eli-Role", "pm").content(ask("Top concentrations against limit")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.blocks[0].kind").value("text"))
        .andExpect(jsonPath("$.blocks[0].text").value(startsWith("As of 2026-11-02, NVDA has the highest concentration at 24.63%")))
        .andExpect(jsonPath("$.blocks[1].kind").value("table"))
        .andExpect(jsonPath("$.blocks[1].title").value("Top underlyings by exposure relative to their concentration limits"))
        .andExpect(jsonPath("$.blocks[1].rows[0][0]").value("NVDA"))
        .andExpect(jsonPath("$.blocks[1].numeric[0]").value(1))
        .andExpect(jsonPath("$.sourceMode").value("MOCK"))
        .andExpect(jsonPath("$.status").value("complete"))
        .andExpect(jsonPath("$.businessDate").value("2026-11-02"))
        .andExpect(jsonPath("$.evidence[0].source").value("HK_ELI skill eli.risk.concentration"))
        .andExpect(jsonPath("$.origin").value(containsString("written by AI (gemini-3.5-flash) from 1 lookup · figures checked by code: 24 of 24")))
        .andExpect(jsonPath("$.followUps.length()").value(3));
    verify(agents).ask("Top concentrations against limit", "pm");
  }

  @Test
  void unmatchedFiguresAreListedUnderTheAnswer() throws Exception {
    when(agents.ask(anyString(), anyString())).thenReturn(recorded("knockouts"));
    mvc.perform(post("/chat/answers").contentType(MediaType.APPLICATION_JSON).content(ask("Which knock-outs are close to the barrier?")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.blocks[1].kind").value("bullets"))
        .andExpect(jsonPath("$.blocks[1].items[0]").value(startsWith("Wong Ka Lok (RM: Jason Yu)")))
        .andExpect(jsonPath("$.limitations[0]").value("Not found as-is in the data (worked out by the model, or a slip), check before use: 5%."));
  }

  @Test
  void agentFailureFallsBackToTheGatewayAndSaysSo() throws Exception {
    when(agents.ask(anyString(), anyString())).thenThrow(new AgentException("The HK ELI agents did not answer."));
    mvc.perform(post("/chat/answers").contentType(MediaType.APPLICATION_JSON).content(ask("Who matures this week?")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.limitations[0]").value("The HK ELI agents did not answer. This answer comes from the gateway instead."))
        .andExpect(jsonPath("$.blocks[0].kind").value("text"));
  }

  @Test
  void pickedClientAndAdviceStayWithTheGateway() throws Exception {
    mvc.perform(post("/chat/answers").contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(Map.of("text", "What did they trade in the last 90 days?", "clientId", "c-4821"))))
        .andExpect(status().isOk());
    mvc.perform(post("/chat/answers").contentType(MediaType.APPLICATION_JSON).content(ask("Will NVDA go up next week? Should I buy?")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.fallback").value(true));
    verify(agents, never()).ask(anyString(), anyString());
  }

  @Test
  void markdownBecomesTypedBlocks() {
    var blocks = AgentAnswerMapper.blocksFromMarkdown("""
        **Lead** sentence with `code`.

        ## Pockets
        | Branch | Rollover |
        |---|---:|
        | Kwun Tong | 72% |
        | Central | 91% |

        Next steps:
        - Call *Chan*
        1. Check [limits](http://x)
        """, "Fallback title");
    assertThat(blocks).hasSize(3);
    assertThat(((TextBlock) blocks.get(0)).text()).isEqualTo("Lead sentence with code.");
    TableBlock t = (TableBlock) blocks.get(1);
    assertThat(t.title()).isEqualTo("Pockets");
    assertThat(t.numeric()).containsExactly(1);
    assertThat(t.rows()).hasSize(2);
    BulletsBlock b = (BulletsBlock) blocks.get(2);
    assertThat(b.title()).isEqualTo("Next steps");
    assertThat(b.items()).containsExactly("Call Chan", "Check limits");
  }

  @Test
  void clientReadsTheFinalEventAndSurfacesErrors() {
    var client = new AgentClient(new AgentProperties(true, "http://127.0.0.1:1", Duration.ofSeconds(5)), json);
    String ok = "event: start\ndata: {\"type\": \"start\"}\n\nevent: final\ndata: {\"type\": \"final\", \"answer\": \"Hi\"}\n\n";
    assertThat(client.readFinal(stream(ok)).path("answer").asText()).isEqualTo("Hi");
    String err = "event: error\ndata: {\"type\": \"error\", \"message\": \"Model quota used up.\"}\n\n";
    org.assertj.core.api.Assertions.assertThatThrownBy(() -> client.readFinal(stream(err))).isInstanceOf(AgentException.class).hasMessage("Model quota used up.");
    org.assertj.core.api.Assertions.assertThatThrownBy(() -> client.readFinal(stream("event: start\ndata: {\"type\": \"start\"}\n\n")))
        .isInstanceOf(AgentException.class).hasMessage("The HK ELI agents stopped before answering.");
  }

  private static InputStream stream(String s) {
    return new ByteArrayInputStream(s.getBytes(StandardCharsets.UTF_8));
  }

}
