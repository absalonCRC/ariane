export interface AnnotationRecorder {
  begin(deliver: (text: string) => Promise<void>): void;
  finish(): Promise<void>;
}
export type VoiceButtonProps = {
  ref?: React.Ref<AnnotationRecorder>;
  needsInstall?: boolean;
  onInstall?: () => void;
  beforeRecording?: () => Promise<void>;
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
