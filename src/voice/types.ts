export type VoiceButtonProps = {
  language: string;
  prepareInsertion: () => ((text: string) => boolean) & { before?: string; after?: string };
  projectPath?: string;
  panel: HTMLElement | null;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  retainContent?: boolean;
  onActivity?: (active: boolean) => void;
};
