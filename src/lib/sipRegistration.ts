export type SipRegistrationSource = {
  state: string;
  stateChange: {
    addListener: (listener: (state: string) => void) => void;
    removeListener: (listener: (state: string) => void) => void;
  };
};

export function observeSipRegistration(
  registerer: SipRegistrationSource,
  isTransportConnected: () => boolean,
  onChange: (registered: boolean, state: string) => void,
) {
  const update = (state: string) => onChange(state === "Registered" && isTransportConnected(), state);
  registerer.stateChange.addListener(update);
  update(registerer.state);
  return {
    refresh: () => update(registerer.state),
    dispose: () => registerer.stateChange.removeListener(update),
  };
}

export function canRebuildSipClient(callPhase: string, sessionState?: unknown) {
  return callPhase === "idle" && (sessionState == null || sessionState === "Terminated");
}
