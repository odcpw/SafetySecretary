import type { ComponentPropsWithoutRef, ReactNode } from "react";

type ControlSize = "sm" | "md" | "lg";
type CompactSize = "sm" | "md";
type FieldError = ReactNode;
type OptionValue = string;

type SelectOption = {
  value: OptionValue;
  label: ReactNode;
};

type TableColumn<Row> = {
  key: Extract<keyof Row, string> | string;
  header: ReactNode;
  cell?: Extract<keyof Row, string> | ((row: Row) => ReactNode);
  sortable?: boolean;
  className?: string;
};

type RowKey<Row> = Extract<keyof Row, string> | ((row: Row) => string | number);

type PaginationConfig = {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
};

export type DataTableLabels = {
  empty: ReactNode;
  nextPage: ReactNode;
  pageStatus: (currentPage: number, pageCount: number) => ReactNode;
  previousPage: ReactNode;
};

export interface ButtonProps
  extends Omit<
    ComponentPropsWithoutRef<"button">,
    "children" | "disabled" | "type"
  > {
  variant?: "primary" | "secondary" | "ghost" | "destructive";
  size?: ControlSize;
  disabled?: boolean;
  loading?: boolean;
  children: ReactNode;
  type?: "button" | "submit" | "reset";
}

export interface IconButtonProps
  extends Omit<
    ComponentPropsWithoutRef<"button">,
    "aria-label" | "children" | "disabled"
  > {
  icon: ReactNode;
  "aria-label": string;
  disabled?: boolean;
  size?: ControlSize;
  variant?: "default" | "ghost";
}

export interface InputProps
  extends Omit<
    ComponentPropsWithoutRef<"input">,
    "children" | "readOnly" | "size"
  > {
  label?: ReactNode;
  error?: FieldError;
  // Inventory says `readonly`; React uses the DOM prop name `readOnly`.
  readOnly?: boolean;
}

export interface TextareaProps
  extends Omit<
    ComponentPropsWithoutRef<"textarea">,
    "children" | "readOnly"
  > {
  label?: ReactNode;
  error?: FieldError;
  // Inventory says `readonly`; React uses the DOM prop name `readOnly`.
  readOnly?: boolean;
}

export interface SelectProps
  extends Omit<
    ComponentPropsWithoutRef<"button">,
    "children" | "disabled" | "onChange" | "value"
  > {
  label?: ReactNode;
  options: SelectOption[];
  value?: OptionValue;
  onChange?: (value: OptionValue) => void;
  disabled?: boolean;
  error?: FieldError;
  placeholder?: string;
}

export interface ComboBoxProps
  extends Omit<
    ComponentPropsWithoutRef<"input">,
    "children" | "disabled" | "onChange" | "value"
  > {
  label?: ReactNode;
  options: SelectOption[];
  value?: OptionValue;
  onChange?: (value: OptionValue) => void;
  disabled?: boolean;
  error?: FieldError;
  placeholder?: string;
  allowFreeText?: boolean;
  filterKey?: keyof SelectOption | string;
}

export interface SegmentedControlProps
  extends Omit<
    ComponentPropsWithoutRef<"div">,
    "children" | "onChange"
  > {
  options: SelectOption[];
  value: OptionValue;
  onChange?: (value: OptionValue) => void;
  disabled?: boolean;
  size?: CompactSize;
}

export interface BadgeProps
  extends Omit<ComponentPropsWithoutRef<"span">, "children"> {
  variant?: "neutral" | "info" | "warning" | "success" | "error";
  children: ReactNode;
}

export interface StatusBadgeProps
  extends Omit<ComponentPropsWithoutRef<"span">, "children"> {
  status: "open" | "in-progress" | "completed" | "blocked";
  label: ReactNode;
  size?: CompactSize;
}

export interface TooltipProps
  extends Omit<ComponentPropsWithoutRef<"span">, "children" | "content"> {
  content: ReactNode;
  children: ReactNode;
  placement?: "top" | "bottom" | "left" | "right";
  delay?: number;
}

export interface ToastProps
  extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
  message: ReactNode;
  variant?: "info" | "success" | "warning" | "error";
  duration?: number;
  actionLabel?: string;
  onAction?: () => void;
  id?: string;
}

export interface ModalProps
  extends Omit<ComponentPropsWithoutRef<"div">, "children" | "title"> {
  title: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "full";
  closeOnBackdrop?: boolean;
}

export interface DrawerProps
  extends Omit<ComponentPropsWithoutRef<"aside">, "children" | "title"> {
  title: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  closeOnBackdrop?: boolean;
}

export interface CardProps
  extends Omit<ComponentPropsWithoutRef<"section">, "children" | "title"> {
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  interactive?: boolean;
  selected?: boolean;
}

export interface TabsProps
  extends Omit<ComponentPropsWithoutRef<"div">, "children" | "onChange"> {
  tabs: Array<{
    value: OptionValue;
    label: ReactNode;
    content: ReactNode;
    disabled?: boolean;
  }>;
  activeValue: OptionValue;
  onChange?: (value: OptionValue) => void;
  placement?: "top" | "left";
}

export interface BreadcrumbsProps
  extends Omit<ComponentPropsWithoutRef<"nav">, "children"> {
  items: Array<{
    label: ReactNode;
    href: string;
    isCurrent?: boolean;
  }>;
  maxItems?: number;
  separator?: ReactNode;
}

export interface TableProps<Row = Record<string, unknown>>
  extends Omit<ComponentPropsWithoutRef<"table">, "children"> {
  columns: Array<TableColumn<Row>>;
  rows: Row[];
  sortable?: boolean;
  rowKey: RowKey<Row>;
  onRowClick?: (row: Row) => void;
  striped?: boolean;
  size?: CompactSize;
}

export interface DataTableProps<Row = Record<string, unknown>>
  extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
  columns: Array<TableColumn<Row>>;
  data: Row[];
  rowKey: RowKey<Row>;
  labels: DataTableLabels;
  pagination?: PaginationConfig;
  onRowSelect?: (row: Row) => void;
  loading?: boolean;
}

export interface SidebarNavProps
  extends Omit<ComponentPropsWithoutRef<"nav">, "children"> {
  items: Array<{
    label: ReactNode;
    icon?: ReactNode;
    href: string;
    active?: boolean;
    children?: SidebarNavProps["items"];
  }>;
  collapsed?: boolean;
  onToggle?: () => void;
}

export interface TopBarProps
  extends Omit<ComponentPropsWithoutRef<"header">, "children" | "title"> {
  title: ReactNode;
  searchPlaceholder?: string;
  notifications?: ReactNode;
  userMenu?: ReactNode;
  actions?: ReactNode;
  onSearch?: (query: string) => void;
}

export interface EmptyStateProps
  extends Omit<ComponentPropsWithoutRef<"section">, "children" | "title"> {
  icon?: ReactNode;
  title: ReactNode;
  description: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  size?: ControlSize;
}

export interface LoadingStateProps
  extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
  variant?: "skeleton" | "spinner";
  rows?: number;
  children?: ReactNode;
  fullscreen?: boolean;
}

export interface ErrorStateProps
  extends Omit<ComponentPropsWithoutRef<"section">, "children" | "title"> {
  title: ReactNode;
  message: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  code?: string;
  details?: ReactNode;
}
