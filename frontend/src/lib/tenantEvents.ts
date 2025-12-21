type TenantUnavailableDetail = {
  message?: string;
};

const EVENT_NAME = "ss:tenant-unavailable";

export const notifyTenantUnavailable = (detail?: TenantUnavailableDetail) => {
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
};

export const onTenantUnavailable = (handler: (detail?: TenantUnavailableDetail) => void) => {
  const listener = (event: Event) => {
    const custom = event as CustomEvent<TenantUnavailableDetail>;
    handler(custom.detail);
  };
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
};
