package hk.eli.gateway.scope;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Scope (R38): whole business, district, branch, RM, segment, channel or underlying. Mirrors
 * web/src/app/core/models/scope.ts. Client-level data can be cut by every scope; aggregates kept by branch,
 * segment and channel cannot be cut by RM or underlying and fall back to the whole business.
 */
public record Scope(String kind, String value) {
  private static final Set<String> KINDS = Set.of("all", "district", "branch", "rm", "segment", "channel", "underlying");

  public static final Scope ALL = new Scope("all", "");

  public static Scope parse(String raw) {
    if (raw == null || raw.isBlank() || raw.equals("all")) {
      return ALL;
    }
    int i = raw.indexOf(':');
    if (i <= 0 || i == raw.length() - 1 || !KINDS.contains(raw.substring(0, i))) {
      throw new IllegalArgumentException("Unknown scope: " + raw);
    }
    return new Scope(raw.substring(0, i), raw.substring(i + 1));
  }

  public record Subject(String branch, String segment, String channel, String rmName, List<String> underlyings) {}

  public boolean matches(Subject s, Map<String, String> districtOfBranch) {
    return switch (kind) {
      case "all" -> true;
      case "district" -> s.branch() != null && value.equals(districtOfBranch.get(s.branch()));
      case "branch" -> value.equals(s.branch());
      case "rm" -> value.equals(s.rmName());
      case "segment" -> value.equals(s.segment());
      case "channel" -> value.equals(s.channel());
      case "underlying" -> s.underlyings() != null && s.underlyings().contains(value);
      default -> false;
    };
  }

  public boolean aggregatesCover() {
    return !kind.equals("rm") && !kind.equals("underlying");
  }

  public boolean matchesAggregate(String branch, String segment, String channel, Map<String, String> districtOfBranch) {
    if (!aggregatesCover()) {
      return true;
    }
    String ch = channel != null ? channel : ("Digibank".equals(branch) ? "digibank" : "advisory");
    return matches(new Subject(branch, segment, ch, null, null), districtOfBranch);
  }
}
