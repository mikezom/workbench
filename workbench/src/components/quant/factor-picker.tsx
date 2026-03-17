"use client";

import { useEffect, useState, useMemo } from "react";

interface Factor {
  id: string;
  name: string;
  category: string;
  description: string | null;
}

interface FactorPickerProps {
  selected: string[];
  onChange: (selected: string[]) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  price: "Price",
  volume: "Volume",
  fundamental: "Fundamental",
  technical: "Technical",
};

export default function FactorPicker({ selected, onChange }: FactorPickerProps) {
  const [factors, setFactors] = useState<Factor[]>([]);

  useEffect(() => {
    fetch("/api/quant/factors")
      .then((r) => r.json())
      .then(setFactors)
      .catch(console.error);
  }, []);

  const grouped = useMemo(() => {
    const map: Record<string, Factor[]> = {};
    for (const f of factors) {
      (map[f.category] ??= []).push(f);
    }
    return map;
  }, [factors]);

  const toggle = (id: string) => {
    onChange(
      selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]
    );
  };

  const toggleCategory = (category: string) => {
    const ids = grouped[category]?.map((f) => f.id) ?? [];
    const allSelected = ids.every((id) => selected.includes(id));
    if (allSelected) {
      onChange(selected.filter((s) => !ids.includes(s)));
    } else {
      onChange([...new Set([...selected, ...ids])]);
    }
  };

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium">
        Factors ({selected.length} selected)
      </div>
      {Object.entries(CATEGORY_LABELS).map(([cat, label]) => {
        const items = grouped[cat] ?? [];
        if (items.length === 0) return null;
        const allSelected = items.every((f) => selected.includes(f.id));
        const someSelected = items.some((f) => selected.includes(f.id));

        return (
          <div key={cat} className="border border-neutral-200 dark:border-neutral-700 rounded p-3">
            <label className="flex items-center gap-2 mb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected && !allSelected;
                }}
                onChange={() => toggleCategory(cat)}
                className="rounded"
              />
              <span className="text-sm font-medium">{label}</span>
              <span className="text-xs text-neutral-400">({items.length})</span>
            </label>
            <div className="grid grid-cols-2 gap-1 ml-5">
              {items.map((f) => (
                <label key={f.id} className="flex items-center gap-1.5 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(f.id)}
                    onChange={() => toggle(f.id)}
                    className="rounded"
                  />
                  <span className="truncate" title={f.description ?? f.name}>
                    {f.name}
                  </span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
