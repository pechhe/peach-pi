/**
 * Global text-attachment viewer. The composer calls `textViewer.open(name,
 * content)` for a pasted-text attachment; a single overlay mounted at the app
 * root renders the content as markdown in a dialog.
 */
class TextViewerStore {
  name = $state<string | null>(null);
  content = $state("");

  open(name: string, content: string): void {
    this.name = name;
    this.content = content;
  }

  close(): void {
    this.name = null;
    this.content = "";
  }
}

export const textViewer = new TextViewerStore();
