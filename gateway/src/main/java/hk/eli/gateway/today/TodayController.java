package hk.eli.gateway.today;

import hk.eli.gateway.scope.Scope;
import hk.eli.gateway.today.TodayModels.*;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

/** Today endpoints. Paths match web/src/app/core/data/gateway-today-data-source.ts. */
@RestController
public class TodayController {
  private final TodayService today;

  public TodayController(TodayService today) {
    this.today = today;
  }

  @GetMapping("/freshness")
  public Freshness freshness() {
    return today.freshness();
  }

  @GetMapping("/today/moments")
  public MomentStrip moments(@RequestParam(defaultValue = "all") String scope) {
    return today.strip(Scope.parse(scope));
  }

  @GetMapping("/today/brief")
  public MorningBrief brief(@RequestParam(defaultValue = "all") String scope) {
    return today.brief(Scope.parse(scope));
  }

  @GetMapping("/clients/{clientId}/context")
  public ClientContext context(@PathVariable String clientId) {
    return today.context(clientId);
  }

  @GetMapping("/clients/{clientId}/ideas")
  public RolloverIdeas ideas(@PathVariable String clientId) {
    return today.ideas(clientId);
  }

  @GetMapping("/evidence")
  public List<EvidenceRow> evidence(@RequestParam("ref") String reference) {
    return today.evidence(reference);
  }

  public record QuoteRequest(@jakarta.validation.constraints.NotBlank String clientId, @jakarta.validation.constraints.NotBlank String ideaId) {}

  @PostMapping("/quotes/requests")
  @ResponseStatus(HttpStatus.CREATED)
  public QuoteRequestReceipt quote(@RequestBody @jakarta.validation.Valid QuoteRequest body) {
    return today.requestQuote(body.clientId(), body.ideaId());
  }

  @PostMapping("/leads/{leadId}/not-today")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void notToday(@PathVariable String leadId) {
    // Recorded with the outcome capture once lead outcomes are stored (R18); accepted and ignored in the demo.
  }
}
