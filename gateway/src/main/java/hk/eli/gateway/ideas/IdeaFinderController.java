package hk.eli.gateway.ideas;

import hk.eli.gateway.config.EliProperties;
import hk.eli.gateway.ideas.IdeaModels.*;
import hk.eli.gateway.seed.Seed;
import hk.eli.gateway.seed.SeedData;
import hk.eli.gateway.time.BusinessClock;
import java.util.List;
import org.springframework.web.bind.annotation.*;

/** Ideas endpoints. Paths match web/src/app/core/ideas/gateway-idea-finder-data-source.ts. */
@RestController
@RequestMapping("/ideas")
public class IdeaFinderController {
  private final SeedData seed;
  private final BusinessClock clock;
  private final EliProperties props;
  private final IdeaLogic logic;

  public IdeaFinderController(SeedData seed, BusinessClock clock, EliProperties props) {
    this.seed = seed;
    this.clock = clock;
    this.props = props;
    this.logic = new IdeaLogic(seed.ideas(), seed.business());
  }

  private List<Seed.WarehouseIdea> warehouse() {
    return "empty".equals(props.scenario()) ? List.of() : seed.ideas().warehouse();
  }

  private String pricedAt() {
    return clock.at(clock.today(), "09:05");
  }

  @PostMapping("/read")
  public ReadIntent read(@RequestBody ReadRequest body) {
    return logic.readIntent(body.text() == null ? "" : body.text(), seed.today().clients());
  }

  @PostMapping("/search")
  public IdeaResults search(@RequestBody IdeaQuery query) {
    Seed.Client client = query.filters().clientId() == null ? null : seed.client(query.filters().clientId()).orElse(null);
    var w = warehouse();
    var r = logic.rank(w, query, client, pricedAt());
    return new IdeaResults(r.passed(), IdeaLogic.blockers(w, query.filters()), w.size(), r.matches(), r.hiddenByLimits(), r.notionalUsd(), clock.businessDate().toString());
  }

  @PostMapping("/price")
  public CustomEliPrice price(@RequestBody CustomEliSpec spec) {
    if (spec.tenorMonths() <= 0) {
      throw new IllegalArgumentException("Tenor must be at least one month.");
    }
    Seed.Client client = spec.clientId() == null ? null : seed.client(spec.clientId()).orElse(null);
    long notional = client != null && client.maturingUsd() > 0 ? client.maturingUsd() : seed.ideas().defaultNotionalUsd();
    var solved = logic.solveCoupon(spec);
    var effect = client != null && !spec.underlyings().isEmpty() ? logic.effect(spec.underlyings(), client, notional) : null;
    return new CustomEliPrice(solved.couponPct(), solved.drivers(), notional, effect, pricedAt());
  }
}
