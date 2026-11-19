package hk.eli.gateway.chat;

import hk.eli.gateway.agents.AgentAnswerMapper;
import hk.eli.gateway.agents.AgentClient;
import hk.eli.gateway.agents.AgentClient.AgentException;
import hk.eli.gateway.ai.AnswerWording;
import hk.eli.gateway.audit.PromptAudit;
import hk.eli.gateway.chat.ChatModels.ChatAnswer;
import hk.eli.gateway.chat.ChatModels.ChatQuestion;
import hk.eli.gateway.skills.SkillAnswerMapper;
import hk.eli.gateway.skills.SkillRouter;
import hk.eli.gateway.skills.SkillServiceClient;
import hk.eli.gateway.skills.SkillServiceClient.SkillServiceException;
import hk.eli.gateway.web.Caller;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * POST /chat/answers. Order, when switched on:
 *
 * <ol>
 *   <li>Book-level questions go to the HK ELI agents (eli.agents.enabled): the model picks tools over the HK_ELI
 *       skills and the SQLite book, code runs them and checks every figure in the answer.</li>
 *   <li>If the agents are off or fail, the typed skills plans (eli.skills.enabled) answer the questions they cover.</li>
 *   <li>Everything else, questions about one picked client, and advice or forecasts, are computed here; the wording
 *       model may only reword the lead sentence.</li>
 * </ol>
 */
@RestController
public class ChatController {
  private static final Logger log = LoggerFactory.getLogger(ChatController.class);

  private final ChatService chat;
  private final AnswerWording wording;
  private final SkillRouter router;
  private final SkillServiceClient skills;
  private final SkillAnswerMapper mapper;
  private final AgentClient agents;
  private final AgentAnswerMapper agentMapper;
  private final PromptAudit audit;
  private final AtomicInteger counter = new AtomicInteger();

  public ChatController(ChatService chat, AnswerWording wording, SkillRouter router, SkillServiceClient skills, SkillAnswerMapper mapper,
      AgentClient agents, AgentAnswerMapper agentMapper, PromptAudit audit) {
    this.agents = agents;
    this.agentMapper = agentMapper;
    this.audit = audit;
    this.chat = chat;
    this.wording = wording;
    this.router = router;
    this.skills = skills;
    this.mapper = mapper;
  }

  @PostMapping("/chat/answers")
  public ChatAnswer answer(@RequestBody ChatQuestion question, HttpServletRequest req) {
    if (question.text() == null || question.text().isBlank()) {
      throw new IllegalArgumentException("Ask a question.");
    }
    if (question.text().length() > 1000) {
      throw new IllegalArgumentException("Questions are limited to 1,000 characters.");
    }
    String agentFailure = null;
    if (agents.enabled() && agentsTake(question, chat.findClient(question.text().toLowerCase(java.util.Locale.ROOT)) != null)) {
      Caller caller = Caller.from(req);
      long start = System.nanoTime();
      try {
        var fin = agents.ask(question.text(), caller.role());
        ChatAnswer mapped = agentMapper.map("a" + counter.incrementAndGet(), fin);
        auditAgent(question.text(), caller, fin.path("model").asText(fin.path("provider").asText()), fin.path("answer").asText(), "agent",
            fin.path("check").path("status").asText(null), start);
        return mapped;
      } catch (AgentException e) {
        log.warn("Agent answer failed: {}", e.getMessage());
        auditAgent(question.text(), caller, "agents", null, "failed", e.getMessage(), start);
        agentFailure = e.getMessage() + " This answer comes from the gateway instead.";
      }
    }
    ChatAnswer answer = skillsOrLocal(question, req);
    if (agentFailure != null && !answer.fallback()) {
      List<String> notes = new java.util.ArrayList<>(answer.limitations() == null ? List.of() : answer.limitations());
      notes.add(0, agentFailure);
      return answer.withLimitations(notes);
    }
    return answer;
  }

  /**
   * The agents answer book-level questions. A picked or named client (so the client brief keeps its ideas and hand-off
   * actions) and advice or forecasts stay with the gateway's own answers.
   */
  static boolean agentsTake(ChatQuestion question, boolean namesClient) {
    return question.clientId() == null && !namesClient && !ChatService.intentOf(question.text(), false, false).equals("advice");
  }

  private void auditAgent(String question, Caller caller, String provider, String output, String outcome, String reason, long start) {
    audit.record(new PromptAudit.Entry(null, null, caller.user(), caller.role(), question, "agents", "agents:" + provider,
        "persona=" + caller.role(), output, outcome, reason, (System.nanoTime() - start) / 1_000_000, null));
  }

  private ChatAnswer skillsOrLocal(ChatQuestion question, HttpServletRequest req) {
    if (skills.enabled()) {
      var route = router.route(question.text(), question.clientId() != null);
      if (route.isPresent()) {
        try {
          var run = skills.run(question.text(), route.get().tasks());
          ChatAnswer mapped = mapper.map("s" + counter.incrementAndGet(), route.get(), run);
          return wording.word(mapped, question.text(), "skills:" + route.get().kind(), Caller.from(req));
        } catch (SkillServiceException e) {
          log.warn("Skills service answer failed for {}: {}", route.get().scenario(), e.getMessage());
          if (!route.get().localFallback()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, e.getMessage() + " Try again in a moment.");
          }
          ChatAnswer local = localAnswer(question, req);
          return local.withLimitations(List.of(e.getMessage() + " This answer comes from the gateway's own data instead."));
        }
      }
    }
    return localAnswer(question, req);
  }

  private ChatAnswer localAnswer(ChatQuestion question, HttpServletRequest req) {
    ChatAnswer computed = chat.answer(question);
    String intent = ChatService.intentOf(question.text(), question.clientId() != null, true);
    if (computed.fallback() && !intent.equals("advice")) {
      intent = "fallback";
    }
    return wording.word(computed, question.text(), intent, Caller.from(req));
  }
}
