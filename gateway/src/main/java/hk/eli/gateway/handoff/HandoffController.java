package hk.eli.gateway.handoff;

import hk.eli.gateway.web.Caller;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/handoffs")
public class HandoffController {
  private final HandoffService handoffs;

  public HandoffController(HandoffService handoffs) {
    this.handoffs = handoffs;
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public HandoffService.HandoffRecord send(@RequestBody HandoffService.SendRequest req, HttpServletRequest http) {
    return handoffs.send(req, Caller.from(http));
  }

  @GetMapping
  public List<HandoffService.HandoffRecord> list() {
    return handoffs.list();
  }

  @GetMapping("/{id}")
  public HandoffService.HandoffRecord get(@PathVariable String id) {
    return handoffs.get(id);
  }

  @PatchMapping("/{id}/items/{itemId}")
  public HandoffService.HandoffRecord outcome(@PathVariable String id, @PathVariable String itemId, @RequestBody HandoffService.OutcomeRequest req, HttpServletRequest http) {
    return handoffs.recordOutcome(id, itemId, req, Caller.from(http));
  }
}
