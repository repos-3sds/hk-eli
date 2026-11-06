package hk.eli.gateway.chat;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

/** The Chat contract. Same shapes as web/src/app/core/chat/chat.models.ts: typed blocks, so figures are data. */
public final class ChatModels {
  private ChatModels() {}

  public record ChatQuestion(String text, String clientId) {}

  public sealed interface Block permits TextBlock, FactsBlock, ClientRowsBlock, ConcentrationBlock, IdeasBlock, BulletsBlock, TableBlock {
    String kind();
  }

  public record TextBlock(String kind, String text) implements Block {
    public TextBlock(String text) {
      this("text", text);
    }
  }

  public record Fact(String label, String value) {}

  public record FactsBlock(String kind, List<Fact> items) implements Block {
    public FactsBlock(List<Fact> items) {
      this("facts", items);
    }
  }

  public record ClientRow(String clientId, String name, String type, String when, Long amountUsd, String note) {}

  public record ClientRowsBlock(String kind, String title, List<ClientRow> rows) implements Block {
    public ClientRowsBlock(String title, List<ClientRow> rows) {
      this("clients", title, rows);
    }
  }

  public record Line(String underlying, double sharePct, double limitPct) {}

  public record ConcentrationBlock(String kind, String title, List<Line> lines) implements Block {
    public ConcentrationBlock(String title, List<Line> lines) {
      this("concentration", title, lines);
    }
  }

  public record IdeaLine(String id, String title, String tenor, double couponPct, double kiPct, String concentration) {}

  public record IdeasBlock(String kind, String clientId, String title, List<IdeaLine> ideas) implements Block {
    public IdeasBlock(String clientId, String title, List<IdeaLine> ideas) {
      this("ideas", clientId, title, ideas);
    }
  }

  public record BulletsBlock(String kind, String title, List<String> items) implements Block {
    public BulletsBlock(String title, List<String> items) {
      this("bullets", title, items);
    }
  }

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record TableBlock(String kind, String title, List<String> columns, List<Integer> numeric, List<List<String>> rows, List<Integer> flagged) implements Block {
    public TableBlock(String title, List<String> columns, List<Integer> numeric, List<List<String>> rows, List<Integer> flagged) {
      this("table", title, columns, numeric, rows, flagged);
    }
  }

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record Parity(String view, String status, String detail) {}

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record ChatAnswer(String id, List<Block> blocks, List<String> followUps, String businessDate, List<String> sources, boolean fallback, Parity parity) {
    public ChatAnswer withBlocks(List<Block> b) {
      return new ChatAnswer(id, b, followUps, businessDate, sources, fallback, parity);
    }
  }
}
