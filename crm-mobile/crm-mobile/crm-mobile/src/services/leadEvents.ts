type LeadRefreshListener = () => void;

const leadRefreshListeners = new Set<LeadRefreshListener>();

export const onLeadsRefresh = (listener: LeadRefreshListener) => {
  leadRefreshListeners.add(listener);
  return () => leadRefreshListeners.delete(listener);
};

export const emitLeadsRefresh = () => {
  leadRefreshListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Ignore listener errors to avoid breaking the event chain.
    }
  });
};
