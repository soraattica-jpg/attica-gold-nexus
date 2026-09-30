import { useState, useRef, useEffect, useMemo } from "react";
import { Building2, Search, X } from "lucide-react";
import { useRealBranches } from "@/hooks/useRealBranches";
import type { RealBranchRecord } from "@/lib/api";

interface BranchSelectorProps {
  value: string;
  onChange: (branchName: string, branchId?: string, branch?: RealBranchRecord) => void;
  placeholder?: string;
  className?: string;
  preferredBranches?: RealBranchRecord[];
  preferredLoading?: boolean;
  preferredLabel?: string;
}

export default function BranchSelector({
  value,
  onChange,
  placeholder = "Select Branch",
  className = "",
  preferredBranches = [],
  preferredLoading = false,
  preferredLabel = "",
}: BranchSelectorProps) {
  const { branches, loading } = useRealBranches();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const orderedBranches = useMemo(() => {
    if (preferredBranches.length === 0) return branches;

    const seen = new Set<string>();
    const merged: RealBranchRecord[] = [];
    const pushBranch = (branch: RealBranchRecord) => {
      const key = String(branch.id || branch.name || "").trim().toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      merged.push(branch);
    };

    preferredBranches.forEach(pushBranch);
    branches.forEach(pushBranch);

    return merged;
  }, [branches, preferredBranches]);

  const preferredKeys = useMemo(() => (
    new Set(preferredBranches.map((branch) => String(branch.id || branch.name || "").trim().toLowerCase()).filter(Boolean))
  ), [preferredBranches]);

  const filtered = orderedBranches.filter(b =>
    (b.name || "").toLowerCase().includes(search.toLowerCase()) ||
    (b.city || "").toLowerCase().includes(search.toLowerCase()) ||
    (b.id || "").toLowerCase().includes(search.toLowerCase()) ||
    (b.area || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={ref} className={"relative " + className}>
      <button type="button" onClick={() => setOpen(!open)}
        className="control-field min-h-11 w-full text-left text-sm flex items-center justify-between gap-2">
        <span className={value ? "" : "text-muted-foreground"}>
          {value || placeholder}
        </span>
        <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full max-h-64 overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
          <div className="sticky top-0 bg-card p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search branches..." className="control-field min-h-10 pl-8 text-sm w-full" />
            </div>
            {preferredLoading ? (
              <p className="mt-2 text-xs text-muted-foreground">Finding nearest branches...</p>
            ) : preferredLabel ? (
              <p className="mt-2 text-xs text-muted-foreground">{preferredLabel}</p>
            ) : null}
          </div>
          <div className="max-h-48 overflow-y-auto">
            {loading ? (
              <p className="p-3 text-sm text-muted-foreground text-center">Loading...</p>
            ) : filtered.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground text-center">No branches found</p>
            ) : filtered.map((b) => {
              const branchKey = String(b.id || b.name || "").trim().toLowerCase();
              const isPreferred = preferredKeys.has(branchKey);
              return (
                <button key={b.id} type="button"
                  onClick={() => { onChange(b.name, b.id, b); setOpen(false); setSearch(""); }}
                  className={"w-full text-left px-3 py-2 hover:bg-muted/60 transition text-sm " + (value === b.name ? "bg-accent/10 text-accent font-medium" : "")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{b.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[b.area, b.city, b.state].filter(Boolean).join(", ") || b.id}
                        {b.id ? ` · ${b.id}` : ""}
                      </p>
                    </div>
                    {isPreferred && b.distance != null ? (
                      <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
                        {b.distance} km
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
