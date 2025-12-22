import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useI18n } from "@/i18n/I18nContext";

interface LoadByIdConfig {
  label: string;
  placeholder: string;
  actionLabel: string;
  onLoad: (id: string) => void;
}

interface RecentCasesModalProps<T extends { id: string; updatedAt: string }> {
  open: boolean;
  title: string;
  subtitle: string;
  searchPlaceholder: string;
  items: T[];
  loading: boolean;
  error?: string | null;
  emptyText: string;
  loadingText: string;
  loadLabel: string;
  onClose: () => void;
  onSelect: (item: T) => void;
  getTitle: (item: T) => string;
  getMeta: (item: T) => string;
  getSearchText: (item: T) => string;
  getUpdatedLabel: (item: T) => string;
  loadById?: LoadByIdConfig;
}

export const RecentCasesModal = <T extends { id: string; updatedAt: string }>({
  open,
  title,
  subtitle,
  searchPlaceholder,
  items,
  loading,
  error,
  emptyText,
  loadingText,
  loadLabel,
  onClose,
  onSelect,
  getTitle,
  getMeta,
  getSearchText,
  getUpdatedLabel,
  loadById
}: RecentCasesModalProps<T>) => {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [idValue, setIdValue] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setIdValue("");
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    const timeout = window.setTimeout(() => {
      searchRef.current?.focus();
    }, 50);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.clearTimeout(timeout);
    };
  }, [open, onClose]);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) => getSearchText(item).toLowerCase().includes(normalized));
  }, [items, query, getSearchText]);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card recent-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header recent-modal__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            <p id={descriptionId} className="text-muted">
              {subtitle}
            </p>
          </div>
          <button type="button" className="btn-ghost btn-small" onClick={onClose}>
            {t("common.cancel")}
          </button>
        </header>

        <div className="recent-modal__search">
          <label htmlFor="recent-search">{searchPlaceholder}</label>
          <input
            id="recent-search"
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
          />
        </div>

        <div className="recent-modal__body">
          {loading && <p className="text-muted">{loadingText}</p>}
          {error && <p className="text-error">{error}</p>}
          {!loading && !error && filteredItems.length === 0 && <p className="text-muted">{emptyText}</p>}
          {!loading && filteredItems.length > 0 && (
            <ul className="recent-modal__list">
              {filteredItems.map((item) => (
                <li key={item.id} className="recent-modal__item">
                  <div className="recent-modal__meta">
                    <h3>{getTitle(item)}</h3>
                    <p className="text-muted">{getMeta(item)}</p>
                    <span className="status-pill">{getUpdatedLabel(item)}</span>
                  </div>
                  <div className="recent-modal__actions">
                    <button
                      type="button"
                      className="btn-outline btn-small"
                      onClick={() => {
                        onSelect(item);
                        onClose();
                      }}
                    >
                      {loadLabel}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {loadById && (
          <details className="recent-modal__advanced">
            <summary>{loadById.label}</summary>
            <div className="recent-modal__advanced-body">
              <label htmlFor="load-by-id">{loadById.label}</label>
              <input
                id="load-by-id"
                value={idValue}
                onChange={(event) => setIdValue(event.target.value)}
                placeholder={loadById.placeholder}
              />
              <button
                type="button"
                className="btn-outline btn-small"
                disabled={!idValue.trim()}
                onClick={() => {
                  const trimmed = idValue.trim();
                  if (!trimmed) return;
                  loadById.onLoad(trimmed);
                  onClose();
                }}
              >
                {loadById.actionLabel}
              </button>
            </div>
          </details>
        )}
      </div>
    </div>
  );
};
