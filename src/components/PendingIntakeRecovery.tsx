import { useEffect, useRef, useState } from "react";
import { IsolatedCustomerIntakeForm } from "@/components/CustomerIntakeForm";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useCallCenter } from "@/contexts/CallCenterContext";
import { api } from "@/lib/api";
import { isBreakStatus } from "@/lib/agentStatus";

type PendingIntake = NonNullable<Awaited<ReturnType<typeof api.getPendingIntakeWorkflow>>>;

export default function PendingIntakeRecovery() {
  const { user } = useAuth();
  const center = useCallCenter();
  const eligible = user?.role === "agent" && center.callPhase === "idle"
    && !center.callWrapUpPending && !center.incomingDialogOpen && !center.autoDialAlertLead
    && !center.currentAutoDialLead && !isBreakStatus(center.agentStatus);
  const latest = useRef({eligible,agentId:user?.id});
  latest.current = {eligible,agentId:user?.id};
  const [pending,setPending] = useState<PendingIntake | null>(null);
  const [revision,setRevision] = useState(0);

  useEffect(() => {
    setPending(null);
    if (!eligible || !user?.id) return;
    const agentId = user.id;
    const controller = new AbortController();
    let timer: number | undefined;
    const valid = () => !controller.signal.aborted && latest.current.eligible && latest.current.agentId === agentId;
    const poll = async () => {
      let restored = false;
      try {
        const result = await api.getPendingIntakeWorkflow(agentId,controller.signal);
        if (!valid()) return;
        if (result) { setPending(result); restored = true; }
      } catch { /* Retry after a transient outage without releasing Wrap-Up. */ }
      finally { if (valid() && !restored) timer = window.setTimeout(poll,20000); }
    };
    void poll();
    return () => { controller.abort(); window.clearTimeout(timer); };
  },[eligible,user?.id,revision]);

  if (!eligible || !pending || pending.workflow.agentId !== user?.id) return null;
  const {call,workflow} = pending;
  return (
    <Dialog open>
      <DialogContent className="flex h-[min(820px,88vh)] max-h-[88vh] w-[min(1180px,88vw)] max-w-[1180px] flex-col overflow-hidden p-0 [&>button]:hidden max-md:h-full max-md:max-h-full max-md:w-full"
        onEscapeKeyDown={(event) => event.preventDefault()} onPointerDownOutside={(event) => event.preventDefault()}>
        <div className="shrink-0 border-b border-border px-3 py-2">
          <DialogTitle className="text-sm">Pending Customer Details</DialogTitle>
          <DialogDescription className="text-xs">Wrap-Up: {call.date} {call.time}. Disposition and submission are pending.</DialogDescription>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <IsolatedCustomerIntakeForm key={workflow.callId} inline callId={workflow.callId}
            phone={call.callerId} customerName={call.customerName} direction={call.direction}
            language={call.language} businessType={call.businessType} purpose={call.purpose}
            showCloseButton={false} showDraftCloseButton={false}
            liveCallSnapshot={call} getCurrentCall={(lookup) => lookup.callId === call.id || lookup.intakeToken === call.intakeToken ? call : null}
            callPhase="idle" agentStatus={center.agentStatus} followUps={center.followUps}
            addFollowUp={center.addFollowUp} closePendingFollowUpsForPhone={center.closePendingFollowUpsForPhone}
            syncCallRecord={center.syncCallRecord} startConferenceCall={center.startConferenceCall}
            getFinalizedCallSnapshot={center.getFinalizedCallSnapshot} getLiveCallSnapshot={center.getLiveCallSnapshot}
            onSave={() => {
              if (!latest.current.eligible || latest.current.agentId !== workflow.agentId) return;
              setPending(null);
              setRevision((value) => value+1);
            }} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
