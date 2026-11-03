import { Moment } from '../../../core/models/today.models';
import { offsetLabel, shortDate } from '../../../core/time/business-calendar';

/** The words on a lead's moment chip: "Matures Thu 6 Nov · T-3". */
export function momentText(m: Moment): string {
  const when = `${shortDate(m.date)} · ${offsetLabel(m.offset)}`;
  switch (m.type) {
    case 'maturity':
      return `Matures ${when}`;
    case 'knockout':
      return `Likely knock-out ${when}`;
    case 'exercised':
      return `Stock delivered ${when}`;
    case 'idle':
      return 'Idle 90+ days';
    case 'rfq':
      return `Open RFQ · ${offsetLabel(m.offset)}`;
  }
}

/** "Chan" from "Chan Tai Man": how the RM addresses the client on a button. */
export function callName(fullName: string): string {
  return fullName.split(' ')[0] ?? fullName;
}
