import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Building2, MapPin, Search, Clock, ExternalLink } from "lucide-react";
import TablePagination from "@/components/TablePagination";
import { useClientPagination } from "@/hooks/useClientPagination";
import { api, buildApiUrl, type NearbyBranchRecord, type RealBranchRecord } from "@/lib/api";
import { getBranchLocationUrl } from "@/lib/branchLocation";

type BranchSuggestion = string | {
  description: string;
  lat?: number;
  lng?: number;
};

export default function BranchesPage() {
  const [branches, setBranches] = useState<RealBranchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [nearbySearch, setNearbySearch] = useState("");
  const [nearbyBranches, setNearbyBranches] = useState<NearbyBranchRecord[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<BranchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    api.getBranches().then(data => {
      if (Array.isArray(data)) setBranches(data);
      setLoading(false);
    });
  }, []);

  const handleAutocomplete = async (val: string) => {
    setNearbySearch(val);
    if (val.length < 2) { setSuggestions([]); setShowSuggestions(false); return; }
    try {
      const r = await fetch(buildApiUrl(`/places/autocomplete?q=${encodeURIComponent(val)}`), {
        cache: "no-store",
      });
      const data = await r.json() as BranchSuggestion[];
      if (Array.isArray(data) && data.length > 0) {
        setSuggestions(data);
        setShowSuggestions(true);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    } catch {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = async (suggestion: BranchSuggestion) => {
    const desc = typeof suggestion === "string" ? suggestion : suggestion.description;
    setNearbySearch(desc);
    setShowSuggestions(false);
    setNearbyLoading(true);
    
    try {
      if (typeof suggestion !== "string" && suggestion.lat && suggestion.lng) {
        // Use coordinates directly from autocomplete
        const r = await fetch(buildApiUrl(`/branches/search-nearby?lat=${suggestion.lat}&lng=${suggestion.lng}`), {
          cache: "no-store",
        });
        const data = await r.json() as NearbyBranchRecord[];
        setNearbyBranches(data);
      } else {
        // Geocode then search
        const geoR = await fetch(buildApiUrl(`/places/geocode?address=${encodeURIComponent(desc)}`), {
          cache: "no-store",
        });
        const geo = await geoR.json() as { lat?: number; lng?: number };
        if (geo.lat && geo.lng) {
          const r = await fetch(buildApiUrl(`/branches/search-nearby?lat=${geo.lat}&lng=${geo.lng}`), {
            cache: "no-store",
          });
          setNearbyBranches(await r.json() as NearbyBranchRecord[]);
        } else {
          setNearbyBranches(await api.searchNearbyBranches(desc));
        }
      }
    } catch {
      setNearbyBranches(await api.searchNearbyBranches(desc));
    }
    setNearbyLoading(false);
  };

  const handleNearbySearch = async () => {
    if (!nearbySearch.trim()) return;
    setNearbyLoading(true);
    const results = await api.searchNearbyBranches(nearbySearch);
    setNearbyBranches(results);
    setNearbyLoading(false);
  };

  const filtered = branches.filter(b =>
    (b.name || "").toLowerCase().includes(search.toLowerCase()) ||
    (b.city || "").toLowerCase().includes(search.toLowerCase()) ||
    (b.state || "").toLowerCase().includes(search.toLowerCase()) ||
    (b.id || "").toLowerCase().includes(search.toLowerCase()) ||
    (b.area || "").toLowerCase().includes(search.toLowerCase())
  );
  const missingLocationCount = branches.filter((branch) => !getBranchLocationUrl(branch)).length;
  const branchPager = useClientPagination(filtered, { resetKey: search.trim().toLowerCase() });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">Directory</p>
        <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
          <Building2 className="h-6 w-6 text-accent" />Attica Gold Branches
        </h1>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input className="control-field pl-10" placeholder="Search by branch name, city, state..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <p className="text-sm text-muted-foreground">
          {filtered.length} branches
          {missingLocationCount > 0 ? ` · ${missingLocationCount} missing location link` : ""}
        </p>
      </div>

      
      {/* Nearby Branch Finder */}
        <div className="surface-panel p-5">
        <h2 className="mb-3 text-lg font-semibold flex items-center gap-2">
          <MapPin className="h-5 w-5 text-accent" />Find Nearest Branches
        </h2>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <input className="control-field w-full" placeholder="Type area, city or branch name..." 
              value={nearbySearch} onChange={e => handleAutocomplete(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { setShowSuggestions(false); handleNearbySearch(); } }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute left-0 top-full z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-xl border border-border bg-card shadow-2xl">
                {suggestions.map((s, i) => (
                  <button key={i} type="button" onMouseDown={() => selectSuggestion(s)}
                    className="w-full text-left px-4 py-2.5 hover:bg-muted/60 transition text-sm border-b border-border last:border-0">
                    <MapPin className="inline h-3.5 w-3.5 mr-2 text-accent" />{typeof s === "string" ? s : s.description}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={handleNearbySearch} disabled={nearbyLoading} className="action-gold">
            {nearbyLoading ? "Searching..." : "Find Nearby"}
          </button>
        </div>
        {nearbyBranches.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-sm text-muted-foreground">Showing {nearbyBranches.length} nearest branches to "{nearbySearch}"</p>
            <div className="grid gap-3 md:grid-cols-2">
              {nearbyBranches.map((b, i) => {
                const branchLocationUrl = getBranchLocationUrl(b);
                return (
                  <div key={b.id} className="flex items-start gap-3 rounded-xl border border-border p-3 hover:border-accent/30 transition">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-accent font-bold text-sm shrink-0">{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      {branchLocationUrl ? (
                        <a href={branchLocationUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-accent hover:underline">
                          {b.name}<ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <p className="font-semibold">{b.name}</p>
                      )}
                      <p className="text-xs text-muted-foreground">{b.address}</p>
                      <p className="text-sm">{b.area}, {b.city} - {b.pincode}</p>
                      <div className="mt-1 flex items-center gap-3">
                        {b.distance !== null && <span className="text-xs font-medium text-accent">{b.distance} km away</span>}
                        <span className="text-xs text-muted-foreground">{b.timings}</span>
                        {!branchLocationUrl && <span className="text-xs text-red-500">Location link missing</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="surface-panel p-8 text-center text-muted-foreground">Loading branches...</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {branchPager.pageItems.map(b => {
            const branchLocationUrl = getBranchLocationUrl(b);
            return (
              <div key={b.id} className="surface-panel p-4 hover:border-accent/30 transition">
                <div className="mb-2">
                  {branchLocationUrl ? (
                    <a href={branchLocationUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-accent hover:underline">
                      {b.name}<ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <p className="font-semibold">{b.name}</p>
                  )}
                  <p className="text-xs font-mono text-accent">{b.id}</p>
                  {!branchLocationUrl && <p className="mt-1 text-xs font-medium text-red-500">Location link missing</p>}
                </div>
                <p className="text-sm text-muted-foreground">{b.address}</p>
                <p className="text-sm">{b.area}, {b.city}</p>
                <p className="text-sm text-muted-foreground">{b.state} - {b.pincode}</p>
                <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />{b.timings}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!loading ? (
        <TablePagination
          page={branchPager.page}
          totalPages={branchPager.totalPages}
          totalItems={branchPager.totalItems}
          pageSize={branchPager.pageSize}
          onPageChange={branchPager.setPage}
        />
      ) : null}
    </motion.div>
  );
}
