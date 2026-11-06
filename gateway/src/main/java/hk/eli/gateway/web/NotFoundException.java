package hk.eli.gateway.web;

/** A client, idea or record that does not exist: answered as 404 with a plain message. */
public class NotFoundException extends RuntimeException {
  public NotFoundException(String message) {
    super(message);
  }
}
