import { createRoot } from "react-dom/client";

function Options() {
  return (
    <div style={{ padding: "24px", fontFamily: "system-ui, sans-serif", maxWidth: "480px" }}>
      <h1 style={{ fontSize: "18px", marginBottom: "8px" }}>OpenCode Hub</h1>
      <p style={{ color: "#666", fontSize: "14px" }}>
        Configure your OpenCode Hub connection in the sidebar settings panel.
        Click the extension icon to open the sidebar.
      </p>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Options />);
