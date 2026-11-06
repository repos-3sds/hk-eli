package hk.eli.gateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/**
 * The HK ELI Chatbot gateway. It serves the widget's API: Today, Ideas, Chat, hand-offs, feedback and the
 * prompt audit. Every figure is computed here from data; Stork AI (Gemini adapter) only words the answers.
 */
@SpringBootApplication
@ConfigurationPropertiesScan
public class GatewayApplication {
  public static void main(String[] args) {
    SpringApplication.run(GatewayApplication.class, args);
  }
}
