package hk.eli.gateway.config;

import java.time.LocalDate;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Business settings, the same ones the web app reads from app-config.json.
 *
 * @param asOfDate pins "today" for demos and tests; empty means the real date in {@code timeZone}
 * @param scenario demo scenario: normal, empty or error (seed data only)
 */
@ConfigurationProperties(prefix = "eli")
public record EliProperties(
    LocalDate asOfDate,
    @DefaultValue("Asia/Hong_Kong") String timeZone,
    @DefaultValue("10") int businessDaysAhead,
    @DefaultValue("10") int maturingWindowBusinessDays,
    @DefaultValue List<LocalDate> marketHolidays,
    @DefaultValue("normal") String scenario,
    @DefaultValue("http://localhost:4200") List<String> allowedOrigins) {}
