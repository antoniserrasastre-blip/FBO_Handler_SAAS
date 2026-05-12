"use client";

interface Props<T extends string> {
  value: T | string | null | undefined;
  options: readonly T[];
  labels: Record<string, string>;
  onSave: (v: T) => void;
  className?: string;
}

/**
 * Compact select that PATCHes onChange. No "edit mode" — always rendered as
 * a select for one-click editing in dense forms.
 */
export function InlineSelect<T extends string>({ value, options, labels, onSave, className = "" }: Props<T>) {
  return (
    <select
      value={value ?? ""}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        e.stopPropagation();
        onSave(e.target.value as T);
      }}
      className={`rounded border border-transparent bg-transparent px-1 py-0.5 text-xs hover:border-gray-300 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 ${className}`}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {labels[o] ?? o}
        </option>
      ))}
    </select>
  );
}
