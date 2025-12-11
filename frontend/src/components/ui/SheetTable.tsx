import type { ComponentProps } from "react";

export const SheetTable = ({ className, ...props }: ComponentProps<"table">) => (
    <div className="sheet-table-wrapper">
        <table className={`sheet-table sheet-table--grid ${className ?? ""}`} {...props} />
    </div>
);

export const SheetHead = (props: ComponentProps<"thead">) => <thead {...props} />;

export const SheetBody = (props: ComponentProps<"tbody">) => <tbody {...props} />;

export const SheetRow = ({
    children,
    className = "",
    ...props
}: React.HTMLAttributes<HTMLTableRowElement>) => (
    <tr className={`group hover:bg-slate-50/50 ${className}`} {...props}>
        {children}
    </tr>
);

export const SheetAddRow = ({
    children,
    className = "",
    ...props
}: React.HTMLAttributes<HTMLTableRowElement>) => (
    <tr className={`bg-slate-50/80 border-t-2 border-slate-100 ${className}`} {...props}>
        {children}
    </tr>
);

export const SheetFooter = ({
    children,
    className = "",
    ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) => (
    <tfoot className={`bg-slate-50 font-medium text-slate-500 ${className}`} {...props}>
        {children}
    </tfoot>
);

export const SheetHeaderCell = (props: ComponentProps<"th">) => <th {...props} />;

export const SheetCell = ({ className, ...props }: ComponentProps<"td">) => (
    <td className={`sheet-cell ${className ?? ""}`} {...props} />
);

export const SheetInput = ({ className, ...props }: ComponentProps<"input">) => (
    <input className={`sheet-input ${className ?? ""}`} {...props} />
);

export const SheetTextarea = ({ className, ...props }: ComponentProps<"textarea">) => (
    <textarea className={`sheet-textarea ${className ?? ""}`} {...props} />
);

export const SheetSelect = ({ className, ...props }: ComponentProps<"select">) => (
    <select className={`sheet-select ${className ?? ""}`} {...props} />
);

export const SheetButton = ({
    variant = "default",
    className,
    ...props
}: ComponentProps<"button"> & { variant?: "default" | "primary" | "danger" | "icon" | "move" | "duplicate" }) => {
    const variantClass = {
        default: "sheet-button",
        primary: "sheet-button sheet-button--primary",
        danger: "sheet-button sheet-button--danger",
        icon: "sheet-button sheet-button--icon",
        move: "sheet-button sheet-button--move",
        duplicate: "sheet-button sheet-button--duplicate"
    }[variant];

    return <button type="button" className={`${variantClass} ${className ?? ""}`} {...props} />;
};
