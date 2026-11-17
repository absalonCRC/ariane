export interface CaptureSelection {
  anchor: number;
  head: number;
}
export interface CaptureDestination {
  operationId: string;
  projectPath: string;
  projectId: string;
  branchId: string;
  sectionId: string;
  title: string;
  fingerprint: string;
}
export interface InboxCapture {
  id: string;
  revision: number;
  text: string;
  createdAt: string;
  updatedAt: string;
  status: 'draft' | 'ready' | 'filed';
  selection: CaptureSelection;
  destination: CaptureDestination | null;
  pendingDestination?: CaptureDestination | null;
  mirrorPending?: boolean;
}
export interface CapturePreferences {
  shortcut: string | null;
  volume: number;
  sound: boolean;
  typewriter: boolean;
}
export interface CaptureTransfer {
  operationId: string;
  captureId: string;
  captureRevision: number;
  projectPath: string;
  projectId: string;
  branchId: string;
  title: string;
}
export interface InboxPage {
  items: InboxCapture[];
  more: boolean;
}

export interface InboxChange {
  kind: 'draft' | 'finish' | 'transfer' | 'preferences' | 'restore';
  id?: string;
  revision?: number;
}
