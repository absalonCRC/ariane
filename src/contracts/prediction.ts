export interface PredictionPreferences {
  enabled: boolean;
  distinct: boolean;
}
export interface PredictionStatus extends PredictionPreferences {
  forgotten: boolean;
  epoch: number;
}
export interface WordSuggestion {
  word: string;
  feedback: string;
  epoch: number;
}
