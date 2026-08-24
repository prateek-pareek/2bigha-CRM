import { Types } from 'mongoose';

export type CrmFilterCriterion = {
  property: string;
  operator: string;
  value: string;
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function textRegex(value: string, flags = 'i'): RegExp {
  return new RegExp(escapeRegex(value.trim()), flags);
}

/** Case-insensitive exact match (anchored), for equals / not_equals on text. */
function textEqualsRegex(value: string, flags = 'i'): RegExp {
  return new RegExp(`^${escapeRegex(value.trim())}$`, flags);
}

function isPureNumericString(value: string): boolean {
  const trimmed = String(value || '').trim();
  return trimmed !== '' && /^-?\d+(\.\d+)?$/.test(trimmed);
}

/** Built-in CRM fields that are stored/compared as numbers. */
const NUMERIC_FIELDS = new Set([
  'annualRevenue',
  'probability',
]);

function parseLocalDate(value: string, endOfDay = false): Date | null {
  const raw = String(value || '').trim();
  if (!raw) return null;

  // Full ISO / RFC3339 instants (used by workspace day drill-down).
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw) || raw.endsWith('Z')) {
    const instant = new Date(raw);
    if (Number.isNaN(instant.getTime())) return null;
    return instant;
  }

  const parts = raw.split('-');
  if (parts.length !== 3) return null;
  const d = new Date(
    parseInt(parts[0], 10),
    parseInt(parts[1], 10) - 1,
    parseInt(parts[2], 10),
  );
  if (Number.isNaN(d.getTime())) return null;
  if (endOfDay) d.setHours(23, 59, 59, 999);
  else d.setHours(0, 0, 0, 0);
  return d;
}

function fieldsForProperty(property: string, module: string): string[] {
  if (property.startsWith('customFields.')) return [property];
  // Person records store given/family name separately; companies/clients use `name`.
  if (
    property === 'name' &&
    (module === 'leads' || module === 'contacts')
  ) {
    return ['firstName', 'lastName'];
  }
  return [property];
}

function emptyFieldCondition(
  fields: string[],
  exists: boolean,
): Record<string, unknown> {
  // Treat missing, null, '', and [] as empty (covers multiselect custom fields).
  const simpleEmpty = (f: string) => ({
    $or: [
      { [f]: { $exists: false } },
      { [f]: null },
      { [f]: '' },
      { [f]: [] },
    ],
  });
  const simpleNonEmpty = (f: string) => ({
    $and: [
      { [f]: { $exists: true } },
      { [f]: { $nin: [null, '', []] } },
    ],
  });

  if (exists) {
    return fields.length === 1
      ? simpleNonEmpty(fields[0])
      : { $or: fields.map(simpleNonEmpty) };
  }
  return fields.length === 1
    ? simpleEmpty(fields[0])
    : { $and: fields.map(simpleEmpty) };
}

/** UI-facing labels for the `leadVertical` select filter -> raw enum values stored on Lead. */
const LEAD_VERTICAL_LABEL_TO_VALUE: Record<string, string> = {
  'property listing': 'property_listing',
  'property management': 'property_management',
};

function criterionToMongo(
  criterion: CrmFilterCriterion,
  module: string,
): Record<string, unknown> | null {
  const { property, operator } = criterion;
  let { value } = criterion;
  if (property === 'leadVertical' && value) {
    const mapped = LEAD_VERTICAL_LABEL_TO_VALUE[value.trim().toLowerCase()];
    if (mapped) value = mapped;
  }

  const buildTextCondition = (
    op: string,
    raw: string,
  ): Record<string, unknown> | null => {
    const fields = fieldsForProperty(property, module);

    switch (op) {
      case 'is_empty':
        return emptyFieldCondition(fields, false);
      case 'is_not_empty':
        return emptyFieldCondition(fields, true);
      case 'equals': {
        if (!raw.trim()) return null;
        // FilterValueSelector may join multiple picks with || while operator stays "equals".
        if (raw.includes('||')) {
          const values = raw.split('||').map((v) => v.trim()).filter(Boolean);
          if (!values.length) return null;
          const clauses = values.flatMap((v) => {
            const rx = textEqualsRegex(v);
            return fields.length === 1
              ? [{ [fields[0]]: rx }]
              : fields.map((f) => ({ [f]: rx }));
          });
          return { $or: clauses };
        }
        const rx = textEqualsRegex(raw);
        if (fields.length === 1) return { [fields[0]]: rx };
        return { $or: fields.map((f) => ({ [f]: rx })) };
      }
      case 'not_equals': {
        if (!raw.trim()) return null;
        if (raw.includes('||')) {
          const values = raw.split('||').map((v) => v.trim()).filter(Boolean);
          if (!values.length) return null;
          const clauses = values.flatMap((v) => {
            const rx = textEqualsRegex(v);
            return fields.length === 1
              ? [{ [fields[0]]: { $not: rx } }]
              : fields.map((f) => ({ [f]: { $not: rx } }));
          });
          return { $and: clauses };
        }
        const rx = textEqualsRegex(raw);
        if (fields.length === 1) return { [fields[0]]: { $not: rx } };
        return { $and: fields.map((f) => ({ [f]: { $not: rx } })) };
      }
      case 'contains': {
        if (!raw.trim()) return null;
        const rx = textRegex(raw);
        if (fields.length === 1) return { [fields[0]]: rx };
        return { $or: fields.map((f) => ({ [f]: rx })) };
      }
      case 'in': {
        if (!raw.trim()) return null;
        const values = raw.split('||').map(v => v.trim()).filter(Boolean);
        if (values.length === 0) return null;
        const clauses = values.flatMap((v) => {
          const rx = textEqualsRegex(v);
          return fields.length === 1
            ? [{ [fields[0]]: rx }]
            : fields.map((f) => ({ [f]: rx }));
        });
        return { $or: clauses };
      }
      case 'not_contains': {
        if (!raw.trim()) return null;
        const rx = textRegex(raw);
        if (fields.length === 1) return { [fields[0]]: { $not: rx } };
        return { $and: fields.map((f) => ({ [f]: { $not: rx } })) };
      }
      default:
        return null;
    }
  };

  const field = fieldsForProperty(property, module)[0];

  if (operator === 'is_checked' || operator === 'is_not_checked') {
    const cfKey = field.startsWith('customFields.')
      ? field.replace('customFields.', '')
      : field;
    const cfPath = field.startsWith('customFields.')
      ? field
      : `customFields.${cfKey}`;
    const truthy = { $in: [true, 'true', 'yes', '1', 1] };
    if (operator === 'is_checked') {
      return { [cfPath]: truthy };
    }
    return { [cfPath]: { $nin: [true, 'true', 'yes', '1', 1] } };
  }

  // Numeric comparisons: gt/lt always; equals/not_equals only on known number fields.
  // (Previously ALL equals hit this path — text like firstName="sia" became NaN and was dropped.)
  if (!['createdAt', 'expectedClosureDate', 'closedDate'].includes(field)) {
    if (operator === 'greater_than' || operator === 'less_than') {
      const num = parseFloat(value);
      if (Number.isNaN(num)) return null;
      return operator === 'greater_than'
        ? { [field]: { $gt: num } }
        : { [field]: { $lt: num } };
    }
    if (
      NUMERIC_FIELDS.has(field) &&
      (operator === 'equals' || operator === 'not_equals') &&
      isPureNumericString(value)
    ) {
      const num = parseFloat(value.trim());
      return operator === 'equals'
        ? { [field]: num }
        : { [field]: { $ne: num } };
    }
  }

  const dateFields = ['createdAt', 'expectedClosureDate', 'closedDate'];
  if (dateFields.includes(field)) {
    switch (operator) {
      case 'is_empty':
        return { [field]: { $in: [null, ''] } };
      case 'is_not_empty':
        return { [field]: { $exists: true, $nin: [null, ''] } };
      case 'equals': {
        const d = parseLocalDate(value);
        if (!d) return null;
        const end = new Date(d);
        end.setHours(23, 59, 59, 999);
        return { [field]: { $gte: d, $lte: end } };
      }
      case 'before': {
        const d = parseLocalDate(value);
        return d ? { [field]: { $lt: d } } : null;
      }
      case 'after': {
        const d = parseLocalDate(value);
        if (!d) return null;
        d.setHours(23, 59, 59, 999);
        return { [field]: { $gt: d } };
      }
      case 'between': {
        const rawValue = String(value || '');
        const [start, end] = rawValue.split(',');
        const ds = parseLocalDate(start);
        const de = parseLocalDate(end, true);
        if (!ds || !de) return null;
        return { [field]: { $gte: ds, $lte: de } };
      }
      default:
        return null;
    }
  }

  return buildTextCondition(operator, value);
}

export function parseCrmFiltersQuery(
  filtersJson?: string,
): CrmFilterCriterion[] {
  if (!filtersJson?.trim()) return [];
  try {
    const parsed = JSON.parse(filtersJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (row) =>
          row &&
          typeof row === 'object' &&
          typeof (row as CrmFilterCriterion).property === 'string' &&
          typeof (row as CrmFilterCriterion).operator === 'string',
      )
      .map((row) => ({
        property: String((row as CrmFilterCriterion).property),
        operator: String((row as CrmFilterCriterion).operator),
        value: String((row as CrmFilterCriterion).value ?? ''),
      }));
  } catch {
    return [];
  }
}

export function appendCrmListFilters(
  filter: Record<string, unknown>,
  criteria: CrmFilterCriterion[],
  module: string,
): Record<string, unknown> {
  if (!criteria.length) return filter;

  const parts: Record<string, unknown>[] = [];
  for (const criterion of criteria) {
    const clause = criterionToMongo(criterion, module);
    if (clause) parts.push(clause);
  }
  if (!parts.length) return filter;

  if (filter && Object.keys(filter).length > 0) {
    if (Array.isArray((filter as any).$and)) {
      return { $and: [...(filter as any).$and, ...parts] };
    }
    return { $and: [filter, ...parts] };
  }
  return parts.length === 1 ? parts[0] : { $and: parts };
}
