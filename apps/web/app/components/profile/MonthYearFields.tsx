"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type MonthYearFieldsProps = {
  idPrefix: string;
  label: string;
  month: number | null;
  year: number | null;
  onMonthChange: (month: number | null) => void;
  onYearChange: (year: number | null) => void;
  hint?: string;
};

/**
 * Shared month + year field pair — used for every dated field across work
 * experience, education, certifications, and achievements (all four
 * resources are month/year granularity only, per ADR-0004).
 */
export default function MonthYearFields({
  idPrefix,
  label,
  month,
  year,
  onMonthChange,
  onYearChange,
  hint,
}: MonthYearFieldsProps) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`${idPrefix}-month`}>{label}</Label>
      <div className="grid grid-cols-2 gap-2">
        <Select
          value={month ? String(month) : undefined}
          onValueChange={(value) => onMonthChange(value ? Number(value) : null)}
        >
          <SelectTrigger id={`${idPrefix}-month`} className="w-full">
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((name, index) => (
              <SelectItem key={name} value={String(index + 1)}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          id={`${idPrefix}-year`}
          type="number"
          placeholder="Year"
          value={year ?? ""}
          onChange={(event) =>
            onYearChange(event.target.value ? Number(event.target.value) : null)
          }
        />
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
