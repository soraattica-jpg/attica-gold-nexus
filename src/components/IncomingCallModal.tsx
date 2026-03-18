import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BellRing, PhoneIncoming } from "lucide-react";
import { useCallCenter } from "@/contexts/CallCenterContext";
import { visitPurposes } from "@/data/mockData";

const today = () => new Date().toISOString().slice(0, 10);

export default function IncomingCallModal() {
  const { incomingDialogOpen, incomingDraftPhone, branches, saveIncomingLead, skipIncomingLead } = useCallCenter();
  const defaultBranch = useMemo(() => branches[0]?.name ?? "", [branches]);
  const [form, setForm] = useState({
    phone: "",
    customerName: "",
    date: today(),
    place: "",
    branch: defaultBranch,
    purpose: visitPurposes[0],
    notes: "",
  });

  useEffect(() => {
    if (!incomingDialogOpen) return;
    setForm({
      phone: incomingDraftPhone,
      customerName: "",
      date: today(),
      place: "",
      branch: defaultBranch,
      purpose: visitPurposes[0],
      notes: "",
    });
  }, [defaultBranch, incomingDialogOpen, incomingDraftPhone]);

  return (
    <AnimatePresence>
      {incomingDialogOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-end bg-foreground/20 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            initial={{ x: 80, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 22 }}
            className="h-full w-full max-w-xl overflow-y-auto border-l border-border bg-card px-6 py-7 shadow-2xl"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="relative flex h-14 w-14 items-center justify-center rounded-full border border-destructive/30 bg-destructive/10 text-destructive">
                  <span className="absolute inset-0 rounded-full border border-destructive/40 animate-ring-ripple" />
                  <BellRing className="h-6 w-6 live-pulse" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">Incoming Call</p>
                  <h2 className="text-2xl font-semibold">Customer Intake Form</h2>
                </div>
              </div>
              <div className="live-badge">Ringing</div>
            </div>

            <div className="surface-panel space-y-4 p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm">
                  <span className="text-muted-foreground">Customer Phone Number</span>
                  <input
                    value={form.phone}
                    onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                    className="control-field"
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-muted-foreground">Customer Name</span>
                  <input
                    value={form.customerName}
                    onChange={(event) => setForm((prev) => ({ ...prev, customerName: event.target.value }))}
                    placeholder="Enter customer name"
                    className="control-field"
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-muted-foreground">Date</span>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
                    className="control-field"
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-muted-foreground">Place / City</span>
                  <input
                    value={form.place}
                    onChange={(event) => setForm((prev) => ({ ...prev, place: event.target.value }))}
                    placeholder="City or locality"
                    className="control-field"
                  />
                </label>
                <label className="space-y-2 text-sm md:col-span-2">
                  <span className="text-muted-foreground">Branch They Are Visiting</span>
                  <select
                    value={form.branch}
                    onChange={(event) => setForm((prev) => ({ ...prev, branch: event.target.value }))}
                    className="control-field"
                  >
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.name}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm md:col-span-2">
                  <span className="text-muted-foreground">Purpose of Visit</span>
                  <select
                    value={form.purpose}
                    onChange={(event) => setForm((prev) => ({ ...prev, purpose: event.target.value }))}
                    className="control-field"
                  >
                    {visitPurposes.map((purpose) => (
                      <option key={purpose} value={purpose}>
                        {purpose}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm md:col-span-2">
                  <span className="text-muted-foreground">Notes / Remarks</span>
                  <textarea
                    rows={4}
                    value={form.notes}
                    onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                    placeholder="Capture walk-in expectations, rate discussions, or requested documents"
                    className="control-field min-h-28 resize-none"
                  />
                </label>
              </div>

              <div className="flex flex-wrap justify-between gap-3 border-t border-border pt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <PhoneIncoming className="h-4 w-4 text-accent" />
                  Auto-saved into the customer call log
                </div>
                <div className="flex gap-3">
                  <button onClick={skipIncomingLead} className="action-outline">
                    Skip
                  </button>
                  <button
                    onClick={() => saveIncomingLead(form)}
                    className="action-gold"
                    disabled={!form.phone.trim() || !form.branch.trim()}
                  >
                    Save &amp; Continue
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
