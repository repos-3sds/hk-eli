-- HK ELI gateway storage. MariaDB in production; H2 in MariaDB mode for local runs and tests.

-- Hand-off lists (R38): the minimum record settled on 4 Nov, so a later trade can be linked (linked, not caused).
CREATE TABLE handoff (
  id           VARCHAR(40)  NOT NULL PRIMARY KEY,
  sent_at      TIMESTAMP    NOT NULL,
  sent_by      VARCHAR(120) NOT NULL,
  role         VARCHAR(20)  NOT NULL,
  window_ends  DATE         NOT NULL,
  items_json   TEXT         NOT NULL
);

CREATE TABLE handoff_outcome (
  handoff_id   VARCHAR(40)  NOT NULL,
  item_id      VARCHAR(80)  NOT NULL,
  status       VARCHAR(20)  NOT NULL,
  note         VARCHAR(500),
  updated_at   TIMESTAMP    NOT NULL,
  updated_by   VARCHAR(120) NOT NULL,
  PRIMARY KEY (handoff_id, item_id),
  CONSTRAINT fk_outcome_handoff FOREIGN KEY (handoff_id) REFERENCES handoff (id)
);

-- Launch feedback (R40): read every week; good feedback is the gate for going wider.
CREATE TABLE feedback (
  id           VARCHAR(40)  NOT NULL PRIMARY KEY,
  topic        VARCHAR(300) NOT NULL,
  rating       VARCHAR(4)   NOT NULL,
  note         VARCHAR(1000),
  role         VARCHAR(20)  NOT NULL,
  user_name    VARCHAR(120) NOT NULL,
  at           TIMESTAMP    NOT NULL
);
CREATE INDEX ix_feedback_at ON feedback (at);

-- Prompt audit: every call to the wording model, what it was sent, what came back and whether the guardrails let it through.
CREATE TABLE prompt_audit (
  id             VARCHAR(40)   NOT NULL PRIMARY KEY,
  at             TIMESTAMP     NOT NULL,
  user_name      VARCHAR(120)  NOT NULL,
  role           VARCHAR(20)   NOT NULL,
  question       VARCHAR(1000) NOT NULL,
  intent         VARCHAR(40)   NOT NULL,
  provider       VARCHAR(40)   NOT NULL,
  prompt         TEXT,
  model_output   TEXT,
  outcome        VARCHAR(20)   NOT NULL,
  reason         VARCHAR(500),
  latency_ms     BIGINT        NOT NULL,
  trace_id       VARCHAR(64)
);
CREATE INDEX ix_audit_at ON prompt_audit (at);
