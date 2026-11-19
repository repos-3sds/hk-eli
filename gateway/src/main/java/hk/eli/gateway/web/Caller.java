package hk.eli.gateway.web;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Set;

/**
 * Who is calling. Demo: the widget sends X-Eli-User and X-Eli-Role. Behind the bank's API gateway these come from
 * the SSO token instead, and the headers are ignored.
 */
public record Caller(String user, String role) {
  private static final Set<String> ROLES = Set.of("wms", "pm", "tsm");

  public static Caller from(HttpServletRequest req) {
    String user = req.getHeader("X-Eli-User");
    String role = req.getHeader("X-Eli-Role");
    return new Caller(user == null || user.isBlank() ? "demo-user" : user.trim(), role != null && ROLES.contains(role) ? role : "wms");
  }
}
