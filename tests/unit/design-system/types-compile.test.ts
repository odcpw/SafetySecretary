import type {
  BadgeProps,
  BreadcrumbsProps,
  ButtonProps,
  CardProps,
  ComboBoxProps,
  DataTableLabels,
  DataTableProps,
  DrawerProps,
  EmptyStateProps,
  ErrorStateProps,
  IconButtonProps,
  InputProps,
  LoadingStateProps,
  ModalProps,
  SegmentedControlProps,
  SelectProps,
  SidebarNavProps,
  StatusBadgeProps,
  TableProps,
  TabsProps,
  TextareaProps,
  ToastProps,
  TooltipProps,
  TopBarProps,
} from "../../../src/components/ui/types";

type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends <
  Value,
>() => Value extends Right ? 1 : 2
  ? true
  : false;

type Expect<Condition extends true> = Condition;

type RequiredKeys<T> = {
  [Key in keyof T]-?: Record<never, never> extends Pick<T, Key>
    ? never
    : Key;
}[keyof T];

type HasRequiredKey<T, Key extends PropertyKey> = Key extends RequiredKeys<T>
  ? true
  : false;

type AllComponentProps = [
  ButtonProps,
  IconButtonProps,
  InputProps,
  TextareaProps,
  SelectProps,
  ComboBoxProps,
  SegmentedControlProps,
  BadgeProps,
  StatusBadgeProps,
  TooltipProps,
  ToastProps,
  ModalProps,
  DrawerProps,
  CardProps,
  TabsProps,
  BreadcrumbsProps,
  TableProps,
  DataTableProps,
  SidebarNavProps,
  TopBarProps,
  EmptyStateProps,
  LoadingStateProps,
  ErrorStateProps,
];

type _TwentyThreeProps = Expect<Equal<AllComponentProps["length"], 23>>;

type _ButtonVariant = Expect<
  Equal<
    NonNullable<ButtonProps["variant"]>,
    "primary" | "secondary" | "ghost" | "destructive"
  >
>;
type _ButtonSize = Expect<
  Equal<NonNullable<ButtonProps["size"]>, "sm" | "md" | "lg">
>;
type _ButtonType = Expect<
  Equal<NonNullable<ButtonProps["type"]>, "button" | "submit" | "reset">
>;
type _ButtonChildrenRequired = Expect<HasRequiredKey<ButtonProps, "children">>;

const buttonProps: ButtonProps = {
  children: "Save",
  form: "hira-form",
  loading: true,
  size: "md",
  type: "submit",
  variant: "primary",
};

const _buttonRejectsUnknownVariant: ButtonProps = {
  children: "Save",
  // @ts-expect-error inventory limits button variants to four values.
  variant: "tertiary",
};

type _IconButtonVariant = Expect<
  Equal<NonNullable<IconButtonProps["variant"]>, "default" | "ghost">
>;
type _IconButtonLabelRequired = Expect<
  HasRequiredKey<IconButtonProps, "aria-label">
>;
type _IconButtonIconRequired = Expect<HasRequiredKey<IconButtonProps, "icon">>;

const iconButtonProps: IconButtonProps = {
  "aria-label": "Close details",
  icon: "x",
  size: "sm",
  variant: "ghost",
};

// @ts-expect-error icon-only buttons require an accessible label.
const _iconButtonRequiresLabel: IconButtonProps = {
  icon: "x",
};

const inputProps: InputProps = {
  label: "Activity name",
  maxLength: 120,
  onChange(event) {
    event.currentTarget.value.toUpperCase();
  },
  readOnly: true,
  required: true,
  value: "Pallet handling",
};

const _inputUsesReactReadOnlyName: InputProps = {
  label: "Activity name",
  // @ts-expect-error inventory says readonly, but React's DOM prop is readOnly.
  readonly: true,
};

const textareaProps: TextareaProps = {
  error: "Required",
  label: "Hazard description",
  rows: 4,
  value: "Manual handling",
};

const selectProps: SelectProps = {
  label: "Severity",
  onChange(value) {
    value.toUpperCase();
  },
  options: [{ label: "A - catastrophic", value: "A" }],
  placeholder: "Choose severity",
  value: "A",
};

const _selectRejectsDomChangeHandler: SelectProps = {
  // @ts-expect-error custom Select onChange receives the selected value.
  onChange(event: Event) {
    event.preventDefault();
  },
  options: [{ label: "A", value: "A" }],
};

const comboBoxProps: ComboBoxProps = {
  allowFreeText: true,
  filterKey: "label",
  label: "Owner",
  onChange(value) {
    value.trim();
  },
  options: [{ label: "Maintenance", value: "maintenance" }],
};

const segmentedControlProps: SegmentedControlProps = {
  onChange(value) {
    value.toLowerCase();
  },
  options: [
    { label: "Baseline", value: "baseline" },
    { label: "Residual", value: "residual" },
  ],
  size: "sm",
  value: "baseline",
};

type _BadgeVariant = Expect<
  Equal<
    NonNullable<BadgeProps["variant"]>,
    "neutral" | "info" | "warning" | "success" | "error"
  >
>;
const badgeProps: BadgeProps = {
  children: "Hazard",
  className: "category-badge",
  variant: "info",
};

type _StatusBadgeStatus = Expect<
  Equal<
    StatusBadgeProps["status"],
    "open" | "in-progress" | "completed" | "blocked"
  >
>;
const statusBadgeProps: StatusBadgeProps = {
  label: "In progress",
  size: "md",
  status: "in-progress",
};

const _statusBadgeRejectsUnknownStatus: StatusBadgeProps = {
  label: "Done",
  // @ts-expect-error inventory status union does not include done.
  status: "done",
};

type _TooltipPlacement = Expect<
  Equal<
    NonNullable<TooltipProps["placement"]>,
    "top" | "bottom" | "left" | "right"
  >
>;
const tooltipProps: TooltipProps = {
  children: "HIRA",
  content: "Hazard Identification and Risk Assessment",
  delay: 250,
  placement: "top",
};

type _ToastVariant = Expect<
  Equal<NonNullable<ToastProps["variant"]>, "info" | "success" | "warning" | "error">
>;
const toastProps: ToastProps = {
  actionLabel: "Undo",
  id: "toast-1",
  message: "HIRA saved successfully",
  onAction() {},
  variant: "success",
};

const modalProps: ModalProps = {
  children: "Delete this hazard?",
  closeOnBackdrop: true,
  isOpen: true,
  onClose() {},
  size: "lg",
  title: "Confirm delete",
};

const drawerProps: DrawerProps = {
  children: "Hazard details",
  isOpen: true,
  onClose() {},
  size: "md",
  title: "Hazard",
};

const cardProps: CardProps = {
  children: "Summary",
  footer: "Updated today",
  interactive: true,
  onClick() {},
  selected: true,
  title: "HIRA summary",
};

type _TabsPlacement = Expect<
  Equal<NonNullable<TabsProps["placement"]>, "top" | "left">
>;
const tabsProps: TabsProps = {
  activeValue: "hazards",
  onChange(value) {
    value.toLowerCase();
  },
  placement: "top",
  tabs: [
    { content: "Hazard list", label: "Hazards", value: "hazards" },
    {
      content: "Controls",
      disabled: true,
      label: "Controls",
      value: "controls",
    },
  ],
};

const breadcrumbsProps: BreadcrumbsProps = {
  items: [
    { href: "/workspace", label: "Dashboard" },
    { href: "/workspace/hiras", label: "HIRAs" },
    { href: "/workspace/hiras/1", isCurrent: true, label: "Pallet handling" },
  ],
  maxItems: 3,
  separator: ">",
};

type HazardRow = {
  id: string;
  hazard: string;
  severity: "A" | "B" | "C" | "D" | "E";
};

const tableProps: TableProps<HazardRow> = {
  columns: [
    { header: "Hazard", key: "hazard" },
    { cell: (row) => row.severity, header: "Severity", key: "severity" },
  ],
  onRowClick(row) {
    row.id.toUpperCase();
  },
  rowKey: "id",
  rows: [{ hazard: "Manual handling", id: "row-1", severity: "B" }],
  size: "md",
  sortable: true,
  striped: true,
};

const dataTableLabels: DataTableLabels = {
  empty: "No rows",
  nextPage: "Next page",
  pageStatus(currentPage, pageCount) {
    return `Page ${currentPage} of ${pageCount}`;
  },
  previousPage: "Previous page",
};

const dataTableProps: DataTableProps<HazardRow> = {
  columns: [{ header: "Severity", key: "severity" }],
  data: [{ hazard: "Manual handling", id: "row-1", severity: "B" }],
  labels: dataTableLabels,
  loading: false,
  onRowSelect(row) {
    row.hazard.toLowerCase();
  },
  pagination: { page: 1, pageSize: 25, totalItems: 1 },
  rowKey: "id",
};

const _dataTableRejectsBehaviorState: DataTableProps<HazardRow> = {
  columns: [{ header: "Severity", key: "severity" }],
  data: [{ hazard: "Manual handling", id: "row-1", severity: "B" }],
  labels: dataTableLabels,
  rowKey: "id",
  // @ts-expect-error DataTable does not own workbench filtering state.
  filter: { severity: ["A", "B"] },
};

const sidebarNavProps: SidebarNavProps = {
  collapsed: false,
  items: [
    {
      active: true,
      children: [{ href: "/workspace/hiras/open", label: "Open" }],
      href: "/workspace/hiras",
      icon: "H",
      label: "HIRAs",
    },
  ],
  onToggle() {},
};

const topBarProps: TopBarProps = {
  actions: "New HIRA",
  notifications: "1",
  onSearch(query) {
    query.trim();
  },
  searchPlaceholder: "Search",
  title: "Safety Secretary",
  userMenu: "Alex",
};

const emptyStateProps: EmptyStateProps = {
  actionLabel: "Add hazard",
  description: "Start by adding a hazard for this process step.",
  icon: "empty",
  onAction() {},
  size: "lg",
  title: "No hazards identified",
};

type _LoadingVariant = Expect<
  Equal<NonNullable<LoadingStateProps["variant"]>, "skeleton" | "spinner">
>;
const loadingStateProps: LoadingStateProps = {
  children: "Loaded content",
  fullscreen: false,
  rows: 5,
  variant: "skeleton",
};

const errorStateProps: ErrorStateProps = {
  code: "fetch_failed",
  details: "The HIRA could not be loaded.",
  message: "Try again in a moment.",
  onRetry() {},
  retryLabel: "Retry",
  title: "Unable to load HIRA",
};

void [
  buttonProps,
  iconButtonProps,
  inputProps,
  textareaProps,
  selectProps,
  comboBoxProps,
  segmentedControlProps,
  badgeProps,
  statusBadgeProps,
  tooltipProps,
  toastProps,
  modalProps,
  drawerProps,
  cardProps,
  tabsProps,
  breadcrumbsProps,
  tableProps,
  dataTableProps,
  sidebarNavProps,
  topBarProps,
  emptyStateProps,
  loadingStateProps,
  errorStateProps,
];
