package hk.eli.gateway.feedback;

import hk.eli.gateway.web.Caller;
import jakarta.servlet.http.HttpServletRequest;
import java.time.LocalDate;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/feedback")
public class FeedbackController {
  private final FeedbackService feedback;

  public FeedbackController(FeedbackService feedback) {
    this.feedback = feedback;
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public FeedbackService.FeedbackEntry rate(@RequestBody FeedbackService.FeedbackInput in, HttpServletRequest req) {
    return feedback.rate(in, Caller.from(req));
  }

  @DeleteMapping
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void clear(@RequestParam String topic, HttpServletRequest req) {
    feedback.clear(topic, Caller.from(req));
  }

  @GetMapping("/week")
  public FeedbackService.WeeklyFeedback week(@RequestParam(required = false) LocalDate day) {
    return feedback.week(day);
  }
}
