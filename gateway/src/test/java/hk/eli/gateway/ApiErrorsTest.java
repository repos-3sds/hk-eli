package hk.eli.gateway;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/** Errors come back as RFC 9457 problem details with a plain message the widget can show. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("demo")
class ApiErrorsTest {
  @Autowired MockMvc mvc;

  @Test
  void unknownClientIs404() throws Exception {
    mvc.perform(get("/clients/c-0000/context")).andExpect(status().isNotFound()).andExpect(jsonPath("$.detail").value("No client c-0000"));
  }

  @Test
  void unknownScopeIs400() throws Exception {
    mvc.perform(get("/today/brief").param("scope", "planet:Mars")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("Unknown scope: planet:Mars"));
  }

  @Test
  void quoteRequestNeedsAnIdea() throws Exception {
    mvc.perform(post("/quotes/requests").contentType(MediaType.APPLICATION_JSON).content("{\"clientId\":\"c-4821\"}")).andExpect(status().isBadRequest());
  }

  @Test
  void healthIsUp() throws Exception {
    mvc.perform(get("/actuator/health")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("UP"));
  }
}
