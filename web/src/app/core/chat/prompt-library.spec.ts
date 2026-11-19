import { LAUNCH_ROLES } from '../session/session.service';
import { PROMPT_LIBRARY, libraryFor } from './prompt-library';

describe('prompt library', () => {
  it('gives every persona its own library of at least 8 questions', () => {
    const sets = LAUNCH_ROLES.map((r) => libraryFor(r).flatMap((c) => c.prompts.map((p) => p.question)));
    sets.forEach((s) => expect(s.length).toBeGreaterThanOrEqual(8));
    expect(new Set(sets.map((s) => s.join('|'))).size).toBe(3);
  });

  it('names a Tableau view and at least one persona for every question', () => {
    for (const p of PROMPT_LIBRARY.flatMap((c) => c.prompts)) {
      expect(p.view).toBeTruthy();
      expect(p.roles.length).toBeGreaterThan(0);
    }
  });
});
