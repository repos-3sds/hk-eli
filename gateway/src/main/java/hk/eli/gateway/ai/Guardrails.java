package hk.eli.gateway.ai;

import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Checks the model's wording before anyone sees it. The model may only reword: every figure must already be in the
 * computed text, nothing may read as advice or a promise, and it may not add names. Anything else is rejected and
 * the template wording is shown instead.
 */
public final class Guardrails {
  private Guardrails() {}

  public record Verdict(boolean ok, String reason) {
    static final Verdict OK = new Verdict(true, null);

    static Verdict no(String reason) {
      return new Verdict(false, reason);
    }
  }

  private static final Pattern NUMBER = Pattern.compile("\\d+(?:[.,]\\d+)*");
  private static final Pattern NAME = Pattern.compile("\\b[A-Z][a-z]+\\b");
  private static final List<Pattern> ADVICE = List.of(
      Pattern.compile("\\b(you|they|the client|clients) should (buy|sell|invest|trade|switch|add)\\b"),
      Pattern.compile("\\b(i|we) (recommend|advise|suggest you)\\b"),
      Pattern.compile("\\brecommend(ed|ation)?\\b"),
      Pattern.compile("\\bguarantee(d|s)?\\b"),
      Pattern.compile("\\b(risk[- ]free|no risk|can't lose|cannot lose|sure thing)\\b"),
      Pattern.compile("\\bwill (rise|fall|go up|go down|outperform|recover)\\b"),
      Pattern.compile("\\b(best|ideal|perfect) (product|choice|investment) for\\b"));
  static final int MAX_GROWTH = 2;

  static Set<String> numbers(String s) {
    Set<String> out = new HashSet<>();
    Matcher m = NUMBER.matcher(s);
    while (m.find()) {
      out.add(m.group().replace(",", ""));
    }
    return out;
  }

  static Set<String> names(String s) {
    Set<String> out = new HashSet<>();
    Matcher m = NAME.matcher(s);
    while (m.find()) {
      out.add(m.group());
    }
    return out;
  }

  public static Verdict check(String original, String reworded) {
    if (reworded == null || reworded.isBlank()) {
      return Verdict.no("Empty wording");
    }
    if (reworded.length() > original.length() * MAX_GROWTH + 80) {
      return Verdict.no("Wording is much longer than the computed text");
    }
    Set<String> known = numbers(original);
    for (String n : numbers(reworded)) {
      if (!known.contains(n)) {
        return Verdict.no("Figure not in the computed data: " + n);
      }
    }
    String lower = reworded.toLowerCase(Locale.ROOT);
    for (Pattern p : ADVICE) {
      Matcher m = p.matcher(lower);
      if (m.find()) {
        return Verdict.no("Reads as advice or a promise: \"" + m.group() + "\"");
      }
    }
    // A capitalised word that is new is allowed at the start of a sentence; anywhere else it may be a new name.
    Set<String> knownNames = names(original);
    Matcher m = NAME.matcher(reworded);
    while (m.find()) {
      String w = m.group();
      boolean sentenceStart = m.start() == 0 || reworded.substring(0, m.start()).stripTrailing().matches(".*[.:;!?]$");
      if (!knownNames.contains(w) && !sentenceStart) {
        return Verdict.no("Adds a name not in the computed text: " + w);
      }
    }
    return Verdict.OK;
  }
}
