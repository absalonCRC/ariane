export interface LanguageIssue {
  offset: number;
  length: number;
  message: string;
  replacements: string[];
  spelling?: boolean;
}
