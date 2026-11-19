package hk.eli.gateway.web;

import hk.eli.gateway.config.EliProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** CORS for the widget's dev server only; behind the API gateway the widget and the API share an origin. */
@Configuration
public class WebConfig implements WebMvcConfigurer {
  private final EliProperties props;

  public WebConfig(EliProperties props) {
    this.props = props;
  }

  @Override
  public void addCorsMappings(CorsRegistry registry) {
    registry.addMapping("/**")
        .allowedOrigins(props.allowedOrigins().toArray(String[]::new))
        .allowedMethods("GET", "POST", "PATCH", "DELETE")
        .allowedHeaders("Content-Type", "traceparent", "X-Eli-Role", "X-Eli-User");
  }
}
