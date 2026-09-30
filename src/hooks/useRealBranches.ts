import { useEffect, useState } from "react";
import { api, type RealBranchRecord } from "@/lib/api";

export type RealBranch = RealBranchRecord;

let cachedBranches: RealBranch[] = [];

export function clearRealBranchesCache() {
  cachedBranches = [];
}

export function useRealBranches() {
  const [branches, setBranches] = useState<RealBranch[]>(cachedBranches);
  const [loading, setLoading] = useState(cachedBranches.length === 0);

  useEffect(() => {
    let cancelled = false;

    const loadBranches = async () => {
      if (cachedBranches.length > 0) {
        setBranches(cachedBranches);
        setLoading(false);
        return;
      }

      const data = await api.getBranches();
      if (!cancelled && Array.isArray(data)) {
        cachedBranches = data;
        setBranches(data);
      }
      if (!cancelled) {
        setLoading(false);
      }
    };

    void loadBranches();

    return () => {
      cancelled = true;
    };
  }, []);

  return { branches, loading };
}
