import type { PdfPasswordRulesRepository } from './pdf-password-rules.repository';

/**
 * Matches a subject string against a simple glob-like pattern.
 * Supports '*' as wildcard (e.g. '*comgas*', 'CPFL*', '*enel').
 * Matching is case-insensitive.
 */
export function matchesSubjectPattern({ subject, pattern }: { subject: string; pattern: string }): boolean {
  const lowerSubject = subject.toLowerCase();
  const lowerPattern = pattern.toLowerCase();

  // Split by '*' and match each segment as a substring in order
  const parts = lowerPattern.split('*');

  if (parts.length === 1) {
    // No wildcard — exact contains match for simplicity
    return lowerSubject.includes(lowerPattern);
  }

  let cursor = 0;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    if (!part) {
      // Empty segment from leading/trailing/consecutive '*' — skip
      continue;
    }

    const idx = lowerSubject.indexOf(part, cursor);

    if (idx === -1) {
      return false;
    }

    // For the first non-empty part after no leading '*', it must start at 0
    if (i === 0 && !lowerPattern.startsWith('*') && idx !== 0) {
      return false;
    }

    cursor = idx + part.length;
  }

  // For the last non-empty part before no trailing '*', it must end at the string end
  const lastPart = parts[parts.length - 1];

  if (lastPart && !lowerPattern.endsWith('*')) {
    return lowerSubject.endsWith(lastPart);
  }

  return true;
}

export async function findMatchingPasswords({
  organizationId,
  subject,
  pdfPasswordRulesRepository,
}: {
  organizationId: string;
  subject: string;
  pdfPasswordRulesRepository: PdfPasswordRulesRepository;
}): Promise<string[]> {
  const { rules } = await pdfPasswordRulesRepository.findEnabledRulesByOrganization({ organizationId });

  const matchingPasswords = rules
    .filter(rule => matchesSubjectPattern({ subject, pattern: rule.subjectPattern }))
    .map(rule => rule.password);

  return matchingPasswords;
}
