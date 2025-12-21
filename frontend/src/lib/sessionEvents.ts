type SessionExpiredDetail = {
  message?: string;
};

const EVENT_NAME = "ss:session-expired";

export const notifySessionExpired = (detail?: SessionExpiredDetail) => {
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
};

export const onSessionExpired = (handler: (detail?: SessionExpiredDetail) => void) => {
  const listener = (event: Event) => {
    const custom = event as CustomEvent<SessionExpiredDetail>;
    handler(custom.detail);
  };
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
};
