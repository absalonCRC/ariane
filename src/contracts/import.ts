export interface Report {
  source: string;
  projectName: string;
  projectPath?: string;
  items: { source: string; title: string; folder: string; format: string }[];
  copiedFiles: number;
  warnings: string[];
}
