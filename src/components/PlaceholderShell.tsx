import type { ReactNode } from "react";

type PlaceholderShellProps = {
  title: string;
  description?: string;
  children?: ReactNode;
};

export default function PlaceholderShell({
  title,
  description,
  children,
}: PlaceholderShellProps) {
  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        gap: "0.5rem",
        fontFamily: "var(--font-sans)",
        color: "var(--color-text)",
      }}
    >
      <h1
        style={{
          fontSize: "var(--text-xl)",
          fontWeight: 500,
          margin: 0,
        }}
      >
        {title}
      </h1>
      {description && (
        <p
          style={{
            fontSize: "var(--text-sm)",
            color: "var(--color-muted)",
            margin: 0,
          }}
        >
          {description}
        </p>
      )}
      {children}
    </main>
  );
}
