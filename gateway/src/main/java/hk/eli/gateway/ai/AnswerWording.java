package hk.eli.gateway.ai;

import hk.eli.gateway.audit.PromptAudit;
import hk.eli.gateway.chat.ChatModels.Block;
import hk.eli.gateway.chat.ChatModels.ChatAnswer;
import hk.eli.gateway.chat.ChatModels.TextBlock;
import hk.eli.gateway.web.Caller;
import io.micrometer.tracing.Tracer;
import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

/**
 * The only place AI touches an answer. Figures, tables and lists are computed and never sent for rewording; only the
 * lead sentence is, with the computed text as the sole source. The result passes {@link Guardrails} or the template
 * wording stays. Every call is written to the prompt audit, including when the model is off.
 */
@Component
public class AnswerWording {
  static final String SYSTEM_PROMPT = """
      You reword one short answer for bank staff who sell equity-linked investments (ELIs) in Hong Kong.
      Rules:
      - Use only the facts in the text you are given. Do not add, round or change any figure, date or name.
      - Plain, neutral English in one or two sentences. No advice, no recommendations, no predictions, no promises.
      - Internal use only: write for bank staff, never for clients.
      Return only the reworded text.""";

  private final WordingModel model;
  private final PromptAudit audit;
  private final ObjectProvider<Tracer> tracer;

  public AnswerWording(WordingModel model, PromptAudit audit, ObjectProvider<Tracer> tracer) {
    this.model = model;
    this.audit = audit;
    this.tracer = tracer;
  }

  public ChatAnswer word(ChatAnswer answer, String question, String intent, Caller caller) {
    int index = -1;
    for (int i = 0; i < answer.blocks().size(); i++) {
      if (answer.blocks().get(i) instanceof TextBlock) {
        index = i;
        break;
      }
    }
    String original = index < 0 ? "" : ((TextBlock) answer.blocks().get(index)).text();
    String prompt = "Question: " + question + "\nComputed answer: " + original;
    long start = System.nanoTime();
    String output = null;
    String outcome;
    String reason = null;
    ChatAnswer result = answer;
    if (answer.fallback() || index < 0) {
      outcome = "skipped";
      reason = answer.fallback() ? "Question not understood; suggestions only" : "No text to word";
    } else if (!model.enabled()) {
      outcome = "template";
      reason = "Wording model off";
    } else {
      output = model.reword(SYSTEM_PROMPT, prompt).map(String::trim).orElse(null);
      if (output == null) {
        outcome = "template";
        reason = "Model call failed or timed out";
      } else {
        var verdict = Guardrails.check(original, output);
        if (verdict.ok()) {
          outcome = "reworded";
          List<Block> blocks = new ArrayList<>(answer.blocks());
          blocks.set(index, new TextBlock(output));
          result = answer.withBlocks(blocks);
        } else {
          outcome = "blocked";
          reason = verdict.reason();
        }
      }
    }
    long latency = (System.nanoTime() - start) / 1_000_000;
    Tracer t = tracer.getIfAvailable();
    String traceId = t != null && t.currentSpan() != null ? t.currentSpan().context().traceId() : null;
    audit.record(new PromptAudit.Entry(null, null, caller.user(), caller.role(), question, intent, model.provider(),
        model.enabled() ? SYSTEM_PROMPT + "\n---\n" + prompt : prompt, output, outcome, reason, latency, traceId));
    return result;
  }
}
