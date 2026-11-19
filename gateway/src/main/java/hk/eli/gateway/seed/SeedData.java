package hk.eli.gateway.seed;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.Optional;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/** Loads the seed files once at start-up. A missing or malformed file stops the app rather than serving half a business. */
@Component
public class SeedData {
  private final Seed.Today today;
  private final Seed.Business business;
  private final Seed.Ideas ideas;

  public SeedData(ObjectMapper mapper) {
    ObjectMapper m = mapper.copy().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, true);
    this.today = read(m, "seed/today.json", Seed.Today.class);
    this.business = read(m, "seed/business.json", Seed.Business.class);
    this.ideas = read(m, "seed/ideas.json", Seed.Ideas.class);
  }

  private static <T> T read(ObjectMapper m, String path, Class<T> type) {
    try (InputStream in = new ClassPathResource(path).getInputStream()) {
      return m.readValue(in, type);
    } catch (IOException e) {
      throw new UncheckedIOException("Seed file " + path + " could not be read", e);
    }
  }

  public Seed.Today today() {
    return today;
  }

  public Seed.Business business() {
    return business;
  }

  public Seed.Ideas ideas() {
    return ideas;
  }

  public Optional<Seed.Client> client(String id) {
    return today.clients().stream().filter(c -> c.id().equals(id)).findFirst();
  }

  public Optional<Seed.Owner> owner(String clientId) {
    return today.owners().stream().filter(o -> o.clientId().equals(clientId)).findFirst();
  }
}
