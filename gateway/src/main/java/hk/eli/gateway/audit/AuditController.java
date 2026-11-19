package hk.eli.gateway.audit;

import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** GET /audit: the latest prompt-audit entries, for the product manager and for review. Restrict by role in production. */
@RestController
public class AuditController {
  private final PromptAudit audit;

  public AuditController(PromptAudit audit) {
    this.audit = audit;
  }

  @GetMapping("/audit")
  public List<PromptAudit.Entry> latest(@RequestParam(defaultValue = "50") int limit) {
    return audit.latest(limit);
  }
}
