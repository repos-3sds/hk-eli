package hk.eli.gateway.chat;

import hk.eli.gateway.ai.AnswerWording;
import hk.eli.gateway.chat.ChatModels.ChatAnswer;
import hk.eli.gateway.chat.ChatModels.ChatQuestion;
import hk.eli.gateway.web.Caller;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** POST /chat/answers: compute the answer, then let the wording model reword only its lead sentence. */
@RestController
public class ChatController {
  private final ChatService chat;
  private final AnswerWording wording;

  public ChatController(ChatService chat, AnswerWording wording) {
    this.chat = chat;
    this.wording = wording;
  }

  @PostMapping("/chat/answers")
  public ChatAnswer answer(@RequestBody ChatQuestion question, HttpServletRequest req) {
    if (question.text() == null || question.text().isBlank()) {
      throw new IllegalArgumentException("Ask a question.");
    }
    if (question.text().length() > 1000) {
      throw new IllegalArgumentException("Questions are limited to 1,000 characters.");
    }
    ChatAnswer computed = chat.answer(question);
    String intent = ChatService.intentOf(question.text(), question.clientId() != null, true);
    if (computed.fallback() && !intent.equals("advice")) {
      intent = "fallback";
    }
    return wording.word(computed, question.text(), intent, Caller.from(req));
  }
}
