/**
 * Test harness — bootstraps the SidebarView with mocked Obsidian APIs.
 *
 * Vite resolves `obsidian` imports via the alias in vite.config.ts,
 * redirecting them to ./obsidian-mock.ts.
 */
import { WorkspaceLeaf } from "obsidian";
import { SidebarView } from "../src/sidebar-view";
import { createMockPlugin } from "./mock-plugin";

async function main() {
  const container = document.getElementById("sidebar-container")!;

  // Create mock leaf
  const leaf = new WorkspaceLeaf();

  // Create mock plugin
  const plugin = createMockPlugin();

  // Create the view
  const view = new SidebarView(leaf, plugin);

  // Replicate Obsidian's real DOM structure:
  //   .workspace-leaf-content[data-type="opencode-hub-sidebar"]
  //     .view-header  (children[0])
  //     .view-content (children[1]) — Obsidian sets padding + overflow on this
  const leafContent = document.createElement("div");
  leafContent.className = "workspace-leaf-content";
  leafContent.dataset.type = "opencode-hub-sidebar";

  const viewHeader = document.createElement("div"); // children[0]
  viewHeader.className = "view-header";
  viewHeader.style.display = "none"; // Obsidian hides this in sidebar

  const viewContent = document.createElement("div"); // children[1]
  viewContent.className = "view-content";
  viewContent.style.height = "100%";
  // Simulate Obsidian's default .view-content styles that break us:
  viewContent.style.padding = "12px 12px 24px";
  viewContent.style.overflow = "auto";

  leafContent.appendChild(viewHeader);
  leafContent.appendChild(viewContent);
  container.appendChild(leafContent);

  // Replace the view's containerEl AND contentEl
  (view as any).containerEl = leafContent;
  (view as any).contentEl = viewContent;

  // Open the view
  await view.onOpen();

  // Expose for the controls panel
  (window as any).__view = view;

  console.log("[harness] SidebarView mounted");
}

main().catch(console.error);
