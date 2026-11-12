package hk.eli.gateway.chat;

import hk.eli.gateway.ai.AnswerWording;
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
 * POST /chat/answers. Book-level questions go to the HK ELI skills service when it is switched on
 * (eli.skills.enabled); everything else, and every question while it is off, is computed here. Either way the wording
 * model may only reword the lead sentence.
 */
@RestController
public class ChatController {
  private static final Logger log = LoggerFactory.getLogger(ChatController.class);

  private final ChatService chat;
  private final AnswerWording wording;
  private final SkillRouter router;
  private final SkillServiceClient skills;
  private final SkillAnswerMapper mapper;
  private final AtomicInteger counter = new AtomicInteger();

  public ChatController(ChatService chat, AnswerWording wording, SkillRouter router, SkillServiceClient skills, SkillAnswerMapper mapper) {
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
