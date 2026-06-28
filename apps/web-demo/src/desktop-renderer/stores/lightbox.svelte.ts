/**
 * Global image lightbox. Any view (composer thumbnails, thread messages) calls
 * `lightbox.open(src)` with a full image src (data URL); a single overlay
 * mounted at the app root renders the enlarged image.
 */
class LightboxStore {
  src = $state<string | null>(null);

  open(src: string): void {
    this.src = src;
  }

  close(): void {
    this.src = null;
  }
}

export const lightbox = new LightboxStore();
