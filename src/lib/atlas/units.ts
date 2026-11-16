import UNIT_DATA from "../../../data/research/labels-batch22/unit_labels.json";

type UnitForms = { hide: true } | { ar: { one: string; few: string; many: string }; en: { one: string; other: string } };
const units: Record<string, UnitForms> = UNIT_DATA.units as Record<string, UnitForms>;

/** Display only: never modify the underlying fact value or unit. */
export function formatFactValue(value: string, unit: string | null | undefined, language: "ar" | "en"): string {
  if (!unit) return value;
  const forms = Object.hasOwn(units, unit) ? units[unit] : undefined;
  if (!forms) return `${value} ${unit}`;
  if ("hide" in forms) return value;
  // Integers only: decimals, ranges, dates and prose must use the many/other form.
  const integer = /^[0-9٠-٩۰-۹]+$/.test(value)
    ? Number(value.replace(/[٠-٩۰-۹]/g, (digit) => String(digit.charCodeAt(0) - (digit <= "٩" ? 0x660 : 0x6f0))))
    : NaN;
  const label = language === "ar"
    ? forms.ar[integer === 1 ? "one" : integer >= 2 && integer <= 10 ? "few" : "many"]
    : forms.en[integer === 1 ? "one" : "other"];
  return `${value} ${label}`;
}
