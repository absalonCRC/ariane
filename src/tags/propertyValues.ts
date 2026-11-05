import type { PropertyValue, TagProperty } from '../contracts/lineProperties';
export function validPropertyValue(field: TagProperty, value: PropertyValue | undefined) {
  if (value == null) return true;
  if (field.type === 'text') return typeof value === 'string' && value.length <= 10000;
  if (field.type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (field.type === 'checkbox') return typeof value === 'boolean';
  if (field.type === 'date')
    return (
      typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value + 'T00:00:00Z')) &&
      new Date(value + 'T00:00:00Z').toISOString().startsWith(value)
    );
  return (
    Array.isArray(value) &&
    value.length <= 100 &&
    value.every((v) =>
      v.kind === 'source' ? !!v.id : v.kind === 'line' && !!v.section && !!v.node,
    )
  );
}
