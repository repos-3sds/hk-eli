/** What the chat can and cannot answer, in the words the user sees. The gateway (ChatService.java) uses the same sentences. */

/** What the chat can answer, said the same way in the empty state, the fallback and the decline. */
export const CAN_ANSWER =
  'maturities this week or next, knock-outs near the barrier, rollover by branch, concentration against limits, what was quoted and not traded, and a brief or trade history for one client';

export const FALLBACK_TEXT = `I can't answer that one yet. I can answer ${CAN_ANSWER}.`;
export const DECLINE_TEXT =
  "HK ELI Chatbot doesn't forecast prices or say what a client should buy or sell. Suitability and advice stay with the owning RM. Here is what the data can show instead.";
