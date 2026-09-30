import { useEffect, useRef, useState } from "react";
import { api, type IntakeWorkflowRecord } from "@/lib/api";

const editableFields = ["customerName","callerName","mob2","age","gender","district","language","businessType","metalType","grams","releaseGrossAmount","releasingAmount","pledgePlace","otherPledgePlace","differenceAmount","bankName","onlinePrice","pricePerGram","advertisement","lead","formStatus","branch","place","purpose","callbackStatus","quickNote","notes","statusFollowUpAt","followUpAction","smsSent"];
export function intakeDraftSignature(draft: Record<string,unknown>) {
  return JSON.stringify(editableFields.map((key) => key === "smsSent" ? Boolean(draft[key]) : String(draft[key] ?? "").trim()));
}
export function remainingIntakeSeconds(deadline: string | null | undefined, now = Date.now()) {
  return deadline ? Math.max(0,Math.ceil((Date.parse(deadline)-now)/1000)) : null;
}

export function usePostCallIntake(options: {
  callId: string; agentId: string; enabled: boolean; draft: Record<string,unknown>; hasLocalChanges: boolean;
  selectedDisposition?: string;
  onRestore: (draft: Record<string,unknown>) => void;
  onSubmitted: (workflow: IntakeWorkflowRecord) => void;
}) {
  const latest = useRef(options);
  latest.current = options;
  const [workflow,setWorkflow] = useState<IntakeWorkflowRecord | null>(null);
  const [ready,setReady] = useState(false);
  const [pending,setPending] = useState(false);
  const [saving,setSaving] = useState(false);
  const submitRef = useRef<() => Promise<boolean>>(async () => false);
  const saveDraftRef = useRef<() => Promise<boolean>>(async () => false);

  useEffect(() => {
    setWorkflow(null); setReady(false); setPending(false);
    if (!options.enabled || !options.callId || !options.agentId) { setReady(true); return; }
    const controller = new AbortController();
    const callId = options.callId;
    let timer: number | undefined;
    let busy = false;
    let initialized = false;
    let finished = false;
    let requestedSubmission: "submit" | null = null;
    let baseline = "";
    let current: IntakeWorkflowRecord | null = null;
    const valid = () => !controller.signal.aborted && latest.current.callId === callId;
    const publish = (row: IntakeWorkflowRecord) => {
      current = row;
      setWorkflow(row);
    };
    const complete = () => {
      if (!valid() || !current?.submittedAt || finished || intakeDraftSignature(latest.current.draft) !== baseline) return;
      finished = true;
      window.clearTimeout(timer);
      latest.current.onSubmitted(current);
    };
    const save = async (action: "draft" | "submit") => {
      if (!valid() || busy || !current || finished) return false;
      busy = true;
      if (action !== "draft") requestedSubmission = action;
      setSaving(true);
      const draft = latest.current.draft;
      const signature = intakeDraftSignature(draft);
      try {
        const response = await api.saveIntakeWorkflow({callId,agentId:options.agentId,intakeToken:current.intakeToken,revision:current.revision,action,draft,selectedDisposition:latest.current.selectedDisposition});
        if (!valid()) return false;
        if (!response.success || !response.workflow) throw new Error(response.error || "Pending Server Save");
        baseline = signature;
        publish(response.workflow);
        if (response.workflow.submittedAt) requestedSubmission = null;
        setPending(false);
        complete();
        return true;
      } catch {
        if (valid()) setPending(true);
        return false;
      } finally { busy = false; if (valid()) setSaving(false); }
    };
    submitRef.current = () => save("submit");
    saveDraftRef.current = () => save("draft");
    const poll = async () => {
      if (!valid() || finished) return;
      if (busy) { timer = window.setTimeout(poll,1000); return; }
      try {
        busy = true;
        const row = await api.getIntakeWorkflow(callId,options.agentId,controller.signal);
        busy = false;
        if (!valid()) return;
        setReady(true);
        if (!row) return;
        publish(row);
        if (!initialized) {
          initialized = true;
          baseline = intakeDraftSignature(row.draft);
          if (!latest.current.hasLocalChanges) {
            latest.current.onRestore(row.draft);
            return;
          }
        }
        const selected = latest.current.selectedDisposition?.trim();
        const needsSelectionSave = !row.dispositionSelectedAt && Boolean(selected && selected === latest.current.draft.callbackStatus
          && !/^(none|scheduled|pending|completed)$/i.test(selected));
        if (intakeDraftSignature(latest.current.draft) !== baseline || needsSelectionSave || (requestedSubmission && !row.submittedAt)) {
          await save(requestedSubmission || "draft");
        } else {
          setPending(row.pendingServerSave);
          complete();
        }
      } catch { if (valid()) setPending(true); }
      finally { busy = false; if (valid() && !finished) timer = window.setTimeout(poll,1000); }
    };
    void poll();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
      submitRef.current = async () => false;
      saveDraftRef.current = async () => false;
    };
  },[options.callId,options.agentId,options.enabled]);

  return {
    workflow,
    ready,
    pending,
    saving,
    remaining: null,
    saveDraft: () => saveDraftRef.current(),
    submit: () => submitRef.current(),
  };
}
