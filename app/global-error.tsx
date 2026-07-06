"use client";

// Root error boundary: catches errors thrown in the root layout itself. It
// replaces the whole document, so it cannot rely on the layout or global CSS
// and carries its own minimal inline styles.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "1.5rem",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#f6f1e7",
          color: "#2b2b2b",
        }}
      >
        <h1 style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0 }}>Something went wrong</h1>
        <p style={{ fontSize: "0.875rem", color: "#6b6b6b", maxWidth: "26rem", margin: 0 }}>
          The app hit an unexpected error. Your progress and recordings are safe. Please reload.
        </p>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button
            onClick={reset}
            style={{
              borderRadius: "0.5rem",
              border: "none",
              background: "#0f766e",
              color: "#fff",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          <button
            onClick={() => location.reload()}
            style={{
              borderRadius: "0.5rem",
              border: "1px solid rgba(0,0,0,0.15)",
              background: "transparent",
              color: "#2b2b2b",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
