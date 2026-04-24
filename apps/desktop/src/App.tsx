import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { WorkspaceList } from "./components/WorkspaceList";
import { WorkspaceDetail } from "./components/WorkspaceDetail";
import { CreateWorkspace } from "./components/CreateWorkspace";
import { Settings } from "./components/Settings";
import { Header } from "./components/Header";

type View = "list" | "detail" | "create" | "settings";

export function App() {
  const [view, setView] = useState<View>("list");
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    null,
  );

  const navigateToDetail = (id: string) => {
    setSelectedWorkspaceId(id);
    setView("detail");
  };

  const navigateToCreate = () => setView("create");
  const navigateToList = () => setView("list");

  // Listen for tray menu "Settings..." navigation event
  useEffect(() => {
    const unlisten = listen<string>("navigate", (event) => {
      if (event.payload === "settings") {
        setView("settings");
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <div className="flex flex-col h-screen w-[360px] overflow-hidden">
      <Header
        view={view}
        onBack={view !== "list" ? navigateToList : undefined}
        onCreate={view === "list" ? navigateToCreate : undefined}
        onSettings={view === "list" ? () => setView("settings") : undefined}
      />

      <main className="flex-1 overflow-y-auto">
        {view === "list" && (
          <WorkspaceList onSelect={navigateToDetail} />
        )}
        {view === "detail" && selectedWorkspaceId && (
          <WorkspaceDetail
            workspaceId={selectedWorkspaceId}
            onBack={navigateToList}
          />
        )}
        {view === "create" && (
          <CreateWorkspace onCreated={navigateToList} onCancel={navigateToList} />
        )}
        {view === "settings" && (
          <Settings onBack={navigateToList} />
        )}
      </main>
    </div>
  );
}
