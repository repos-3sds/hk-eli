package hk.eli.gateway.ideas;

import java.math.BigDecimal;
import java.math.RoundingMode;

/** Number text the way the web app writes it, so both sides say "17.4%" and "15%", never "15.0%". */
public final class Num {
  private Num() {}

  public static String plain(double v) {
    BigDecimal b = BigDecimal.valueOf(v).stripTrailingZeros();
    return b.scale() < 0 ? b.setScale(0, RoundingMode.UNNECESSARY).toPlainString() : b.toPlainString();
  }

  public static String fixed(double v, int places) {
    return BigDecimal.valueOf(v).setScale(places, RoundingMode.HALF_UP).toPlainString();
  }

  public static double round1(double v) {
    return Math.round(v * 10) / 10.0;
  }
}
