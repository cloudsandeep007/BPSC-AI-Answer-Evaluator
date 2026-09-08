import { Citation } from "../citation";
import { SlotType } from "../content/answerTemplates";

export interface BlueprintDimension {
  heading: string; // e.g., "Constitutional Framework"
  expectedPoints: Array<{
    point: string;
    weight: number;
    cues: string[];
    source: Citation;
  }>;
}

export interface EvaluationBlueprint {
  questionId: string;
  topic: string;
  paper: string;
  slotType: SlotType;
  marks: number;
  wordLimit: number;
  directive: string;
  
  // The structured ideal answer
  introductionMustCover: string;
  dimensions: BlueprintDimension[];
  conclusionMustCover: string;
  
  // Specificity rules (e.g. "Needs at least 2 Article numbers")
  minimumSpecifics: string[];
  commonMistakesToPenalise: string[];
}
