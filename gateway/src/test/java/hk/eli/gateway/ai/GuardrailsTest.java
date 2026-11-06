package hk.eli.gateway.ai;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class GuardrailsTest {
  static final String ORIGINAL = "Rollover is above the 80% baseline overall, but 3 pockets are below it this month. Kwun Tong · Treasures is lowest at 45% (5 of 11 rolled), with USD 3.80m maturing in the next 10 business days.";

  @Test
  void letsAPlainRewordThrough() {
    var v = Guardrails.check(ORIGINAL, "3 pockets sit below the 80% rollover baseline this month. The lowest is Kwun Tong · Treasures at 45% (5 of 11 rolled), and USD 3.80m matures there in the next 10 business days.");
    assertThat(v.ok()).as(v.reason()).isTrue();
  }

  @Test
  void blocksAFigureThatIsNotInTheData() {
    var v = Guardrails.check(ORIGINAL, "Rollover is 82% overall, with 3 pockets below the 80% baseline.");
    assertThat(v.ok()).isFalse();
    assertThat(v.reason()).contains("82");
  }

  @Test
  void blocksAdviceAndPromises() {
    assertThat(Guardrails.check(ORIGINAL, "We recommend calling Kwun Tong about the 3 pockets.").ok()).isFalse();
    assertThat(Guardrails.check(ORIGINAL, "Clients should buy more; 45% is guaranteed to recover.").ok()).isFalse();
    assertThat(Guardrails.check(ORIGINAL, "Kwun Tong at 45% will rise next month.").reason()).contains("will rise");
  }

  @Test
  void blocksANewName() {
    var v = Guardrails.check(ORIGINAL, "3 pockets are below the 80% baseline, led by Kwun Tong and Sha Tin.");
    assertThat(v.ok()).isFalse();
    assertThat(v.reason()).contains("Sha");
  }

  @Test
  void blocksEmptyOrRunawayText() {
    assertThat(Guardrails.check(ORIGINAL, " ").ok()).isFalse();
    assertThat(Guardrails.check("3 pockets.", "3 pockets. ".repeat(30)).ok()).isFalse();
  }
}
