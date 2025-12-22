import OpenAI from "openai";
import { env } from "../config/env";
import { ControlHierarchy, LikelihoodLevel, ProcessStepInput, SeverityLevel } from "../types/riskAssessment";
import { IncidentTimelineConfidence } from "../types/incident";
import { JhaPatchCommand, JhaPatchParseResult, JhaWorkflowStage } from "../types/jha";

// Result of extracting process steps with HIRA triad
export interface ExtractedStepsResult {
  steps: ProcessStepInput[];
  rawResponse?: string;
}

// Parameters for hazard extraction
export interface ExtractHazardsParams {
  narrative: string;  // User's description of hazards, incidents, existing controls
  steps: ProcessStepInput[];
}

// Extracted hazard with category and existing controls
export interface ExtractedHazard {
  label: string;
  description?: string;
  categoryCode?: string;        // Category from hazard taxonomy
  existingControls?: string[];  // Controls already in place
  stepIds: string[];
}

export interface ExtractedHazardsResult {
  hazards: ExtractedHazard[];
  rawResponse?: string;
}

// Parameters for control suggestions
export interface SuggestControlsParams {
  notes: string;
  hazards: Array<{
    id: string;
    label: string;
    description?: string | null;
    categoryCode?: string | null;
    existingControls?: string[];
    baseline?: HazardAssessmentSnapshotLike;
    residual?: HazardAssessmentSnapshotLike;
  }>;
}

// Control suggestion with S-T-O-P hierarchy
export interface ControlSuggestion {
  hazardId: string;
  controls: string[];
  hierarchy?: ControlHierarchy;
  residualSeverity?: SeverityLevel;
  residualLikelihood?: LikelihoodLevel;
}

export interface SuggestControlsResult {
  suggestions: ControlSuggestion[];
  rawResponse?: string;
}

export interface SuggestActionsParams {
  notes: string;
  hazards: Array<{
    id: string;
    label: string;
    description?: string | null;
  }>;
}

export interface ActionSuggestion {
  hazardId: string;
  description: string;
  owner?: string;
  dueInDays?: number;
}

export interface SuggestActionsResult {
  actions: ActionSuggestion[];
  rawResponse?: string;
}

export interface IncidentNarrativeClarification {
  question: string;
  rationale?: string | null;
  targetField?: string | null;
}

export interface IncidentNarrativeExtractionResult {
  facts: { text: string }[];
  timeline: { eventAt?: string | null; timeLabel?: string | null; text: string; confidence?: IncidentTimelineConfidence }[];
  clarifications: IncidentNarrativeClarification[];
  rawResponse?: string;
}

// Incident witness extraction
export interface IncidentWitnessExtractionResult {
  facts: { text: string }[];
  personalTimeline: { eventAt?: string | null; timeLabel?: string | null; text: string }[];
  openQuestions: string[];
  rawResponse?: string;
}

export interface IncidentWitnessMergeAccount {
  accountId: string;
  role?: string | null;
  name?: string | null;
  facts: { text: string }[];
  personalTimeline: { eventAt?: string | null; timeLabel?: string | null; text: string }[];
}

export interface IncidentTimelineMergeResult {
  timeline: Array<{
    eventAt?: string | null;
    timeLabel?: string | null;
    text: string;
    confidence: IncidentTimelineConfidence;
    sources: Array<{
      accountId: string;
      factIndex?: number;
      personalEventIndex?: number;
    }>;
  }>;
  openQuestions: string[];
  rawResponse?: string;
}

export interface IncidentConsistencyIssue {
  type: "gap" | "contradiction" | "ordering";
  description: string;
  relatedEventIndexes?: number[];
}

export interface IncidentConsistencyCheckResult {
  issues: IncidentConsistencyIssue[];
  rawResponse?: string;
}

export type StopCategory = "SUBSTITUTION" | "TECHNICAL" | "ORGANIZATIONAL" | "PPE";

export interface IncidentCauseCoachingParams {
  timeline: Array<{ eventAt?: string | null; timeLabel?: string | null; text: string }>;
}

export interface IncidentCauseCoachingResult {
  questions: string[];
  rawResponse?: string;
}

export interface IncidentRootCauseCoachingParams {
  causes: Array<{ causeNodeId: string; statement: string }>;
}

export interface IncidentRootCauseCoachingResult {
  questions: Array<{ causeNodeId: string; question: string }>;
  rawResponse?: string;
}

export interface IncidentActionSuggestion {
  causeNodeId: string;
  description: string;
  category: StopCategory;
}

export interface IncidentActionCoachingParams {
  causes: Array<{ causeNodeId: string; statement: string }>;
  existingActions?: Array<{ causeNodeId: string; description: string }>;
}

export interface IncidentActionCoachingResult {
  suggestions: IncidentActionSuggestion[];
  rawResponse?: string;
}

export interface JhaPatchParseParams {
  userInput: string;
  phase: Exclude<JhaWorkflowStage, "review">;
  steps: Array<{ id: string; label: string }>;
  hazards: Array<{
    id: string;
    stepId: string;
    hazard: string;
    consequence?: string | null;
    controls?: string[] | null;
  }>;
}

export interface JhaControlSuggestionParams {
  steps: Array<{ id: string; label: string }>;
  hazards: Array<{
    id: string;
    stepId: string;
    hazard: string;
    consequence?: string | null;
    controls?: string[] | null;
  }>;
}

export interface JhaControlSuggestion {
  hazardId: string;
  control: string;
}

export interface JhaControlSuggestionResult {
  suggestions: JhaControlSuggestion[];
  rawResponse?: string;
}

interface HazardAssessmentSnapshotLike {
  severity?: SeverityLevel | null;
  likelihood?: LikelihoodLevel | null;
}

// Contextual update types for global LLM input
export interface ContextualUpdateParams {
  userInput: string;
  currentPhase: string;
  tableState: {
    steps: Array<{ id: string; activity: string; equipment: string[]; substances: string[] }>;
    hazards: Array<{
      id: string;
      label: string;
      description?: string | null;
      categoryCode?: string | null;
      existingControls?: string[];
      stepId: string;
      baseline?: HazardAssessmentSnapshotLike;
      residual?: HazardAssessmentSnapshotLike;
    }>;
    actions: Array<{ id: string; description: string; hazardId?: string | null }>;
  };
}

export type ContextualUpdateIntent = "add" | "modify" | "delete" | "insert";
export type ContextualUpdateTarget = "step" | "hazard" | "control" | "assessment" | "action";

export interface ContextualUpdateCommand {
  intent: ContextualUpdateIntent;
  target: ContextualUpdateTarget;
  location: {
    stepId?: string;
    stepIndex?: number;
    hazardId?: string;
    actionId?: string;
    controlId?: string;
    insertAfter?: string;
  };
  data: Record<string, unknown>;
  explanation: string;
}

export interface ContextualUpdateResult {
  commands: ContextualUpdateCommand[];
  summary?: string;
  needsClarification?: boolean;
  clarificationPrompt?: string;
  rawResponse?: string;
}

// Hazard categories for classification
const HAZARD_CATEGORIES = [
  "MECHANICAL",
  "FALLS",
  "ELECTRICAL",
  "HAZARDOUS_SUBSTANCES",
  "FIRE_EXPLOSION",
  "THERMAL",
  "PHYSICAL",
  "ENVIRONMENTAL",
  "ERGONOMIC",
  "PSYCHOLOGICAL",
  "CONTROL_FAILURES",
  "POWER_FAILURE",
  "ORGANIZATIONAL"
];

const DEFAULT_MODEL = "gpt-4o-mini";

const openAiClient = env.openAiKey ? new OpenAI({ apiKey: env.openAiKey }) : null;

export class LlmService {
  constructor(private readonly client: OpenAI | null = openAiClient) {}

  // Extract process steps with HIRA triad: activity, equipment, substances
  async extractStepsFromDescription(description: string): Promise<ExtractedStepsResult> {
    if (!this.client) {
      return { steps: this.fallbackSteps(description) };
    }

    try {
      const response = await this.client.chat.completions.create({
        model: DEFAULT_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are a safety engineer. Extract 3-10 ordered task steps from the description.
For each step, identify:
- activity: What is being done (the main action/task)
- equipment: List of tools, machines, or equipment used
- substances: List of materials, chemicals, or substances involved

Return ONLY valid JSON (no markdown, no code fences, no commentary).
Use empty arrays for unknown equipment/substances.

Respond as JSON:
{"steps": [{"activity": string, "equipment": string[], "substances": string[], "description": string}]}`
          },
          {
            role: "user",
            content: description
          }
        ]
      });

      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        return { steps: this.fallbackSteps(description) };
      }
      const parsed = JSON.parse(content);
      const steps = Array.isArray(parsed.steps)
        ? parsed.steps.map((step: any, index: number) => ({
            activity: step.activity ?? `Step ${index + 1}`,
            equipment: Array.isArray(step.equipment) ? step.equipment : [],
            substances: Array.isArray(step.substances) ? step.substances : [],
            description: step.description,
            orderIndex: index
          }))
        : this.fallbackSteps(description);

      return { steps, rawResponse: content };
    } catch (error) {
      console.warn("[llmService] Falling back to heuristic steps", error);
      return { steps: this.fallbackSteps(description) };
    }
  }

  // Extract hazards with category classification and existing controls
  async extractHazardsFromNarrative(params: ExtractHazardsParams): Promise<ExtractedHazardsResult> {
    const { narrative, steps } = params;
    if (!this.client) {
      return { hazards: this.fallbackHazards(narrative, steps) };
    }

    try {
      const response = await this.client.chat.completions.create({
        model: DEFAULT_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are assisting with a safety risk assessment.

Given the user's narrative about hazards, incidents, and existing controls, extract structured hazards.

For each hazard, provide:
- label: Clear, concise hazard name
- description: What can happen / past incidents
- categoryCode: Best match from [${HAZARD_CATEGORIES.join(", ")}]
- existingControls: Array of existing controls/rules mentioned for this hazard
- stepIds: Array of step IDs where this hazard applies

Constraints:
- Use ONLY step IDs from the provided steps list. If unsure, use [].
- Return ONLY valid JSON (no markdown, no code fences, no commentary).

Respond as JSON:
{"hazards": [{"label": string, "description": string, "categoryCode": string, "existingControls": string[], "stepIds": string[]}]}`
          },
          {
            role: "user",
            content: JSON.stringify({
              narrative,
              steps: steps.map((step) => ({
                id: step.id,
                activity: step.activity,
                equipment: step.equipment,
                substances: step.substances
              }))
            })
          }
        ]
      });

      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        return { hazards: this.fallbackHazards(narrative, steps) };
      }

      const parsed = JSON.parse(content);
      const hazards = Array.isArray(parsed.hazards)
        ? parsed.hazards.map((hazard: any, index: number) => ({
            label: hazard.label ?? `Hazard ${index + 1}`,
            description: hazard.description ?? "",
            categoryCode: HAZARD_CATEGORIES.includes(hazard.categoryCode) ? hazard.categoryCode : undefined,
            existingControls: Array.isArray(hazard.existingControls)
              ? hazard.existingControls.filter((c: unknown) => typeof c === "string" && c.trim().length > 0)
              : [],
            stepIds: Array.isArray(hazard.stepIds)
              ? hazard.stepIds.filter((id: unknown) => typeof id === "string")
              : []
          }))
        : this.fallbackHazards(narrative, steps);

      return { hazards, rawResponse: content };
    } catch (error) {
      console.warn("[llmService] Falling back to heuristic hazards", error);
      return { hazards: this.fallbackHazards(narrative, steps) };
    }
  }

  // Backward compatibility alias
  async extractHazardsFromAnecdotes(params: ExtractHazardsParams): Promise<ExtractedHazardsResult> {
    return this.extractHazardsFromNarrative({
      narrative: params.narrative || (params as any).anecdotes,
      steps: params.steps
    });
  }

  // Suggest controls with S-T-O-P hierarchy classification
  async suggestControlsFromNotes(params: SuggestControlsParams): Promise<SuggestControlsResult> {
    if (!this.client) {
      return { suggestions: this.fallbackControlSuggestions(params.hazards) };
    }

    try {
      const response = await this.client.chat.completions.create({
        model: DEFAULT_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are a safety engineer. Review the hazards and notes. Suggest practical controls.

For each hazard, suggest controls classified by the S-T-O-P hierarchy:
- SUBSTITUTION: Replace the hazard entirely (highest effectiveness)
- TECHNICAL: Engineering controls (guards, ventilation, barriers)
- ORGANIZATIONAL: Procedures, training, supervision
- PPE: Personal protective equipment (last resort)

Prioritize higher-effectiveness controls.

Constraints:
- Use ONLY hazardId values present in the input hazards list.
- Return ONLY valid JSON (no markdown, no code fences, no commentary).

Respond as JSON:
{"suggestions":[{
  "hazardId": string,
  "controls": [string],
  "hierarchy": "SUBSTITUTION" | "TECHNICAL" | "ORGANIZATIONAL" | "PPE",
  "residualSeverity": "A" | "B" | "C" | "D" | "E",
  "residualLikelihood": "1" | "2" | "3" | "4" | "5"
}]}`
          },
          {
            role: "user",
            content: JSON.stringify(params)
          }
        ]
      });

      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        return { suggestions: this.fallbackControlSuggestions(params.hazards) };
      }
      const parsed = JSON.parse(content);
      const suggestions: ControlSuggestion[] = Array.isArray(parsed.suggestions)
        ? parsed.suggestions
            .filter((item: any) => typeof item?.hazardId === "string")
            .map((item: any) => ({
              hazardId: item.hazardId,
              controls: Array.isArray(item.controls)
                ? item.controls.filter((value: unknown) => typeof value === "string" && value.trim().length > 0)
                : [],
              hierarchy: this.normalizeHierarchy(item.hierarchy),
              residualSeverity: this.normalizeSeverity(item.residualSeverity),
              residualLikelihood: this.normalizeLikelihood(item.residualLikelihood)
            }))
        : this.fallbackControlSuggestions(params.hazards);
      return { suggestions, rawResponse: content };
    } catch (error) {
      console.warn("[llmService] Falling back to heuristic controls", error);
      return { suggestions: this.fallbackControlSuggestions(params.hazards) };
    }
  }

  async suggestActionsFromNotes(params: SuggestActionsParams): Promise<SuggestActionsResult> {
    if (!this.client) {
      return { actions: this.fallbackActions(params.hazards) };
    }

    try {
      const response = await this.client.chat.completions.create({
        model: DEFAULT_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are a safety coordinator. Convert supervisor notes into concrete corrective actions tied to the provided hazard IDs.

Constraints:
- Use ONLY hazardId values present in the input hazards list.
- Return ONLY valid JSON (no markdown, no code fences, no commentary).

Respond as JSON:
{"actions":[{"hazardId": string, "description": string, "owner": string, "dueInDays": number}]}`
          },
          {
            role: "user",
            content: JSON.stringify(params)
          }
        ]
      });
      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        return { actions: this.fallbackActions(params.hazards) };
      }
      const parsed = JSON.parse(content);
      const actions: ActionSuggestion[] = Array.isArray(parsed.actions)
        ? parsed.actions
            .filter((item: any) => typeof item?.hazardId === "string" && typeof item?.description === "string")
            .map((item: any) => ({
              hazardId: item.hazardId,
              description: item.description,
              owner: typeof item.owner === "string" ? item.owner : undefined,
              dueInDays: typeof item.dueInDays === "number" ? item.dueInDays : undefined
            }))
        : this.fallbackActions(params.hazards);
      return { actions, rawResponse: content };
    } catch (error) {
      console.warn("[llmService] Falling back to heuristic actions", error);
      return { actions: this.fallbackActions(params.hazards) };
    }
  }

  private fallbackSteps(description: string): ProcessStepInput[] {
    const sentences = description
      .split(/\n|\.|\r/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .slice(0, 7);

    if (!sentences.length) {
      return [
        {
          activity: "Describe activity",
          equipment: [],
          substances: [],
          description: "No steps inferred",
          orderIndex: 0
        }
      ];
    }

    return sentences.map((sentence, index) => ({
      activity: sentence.substring(0, 80),
      equipment: [],
      substances: [],
      description: sentence,
      orderIndex: index
    }));
  }

  private fallbackHazards(narrative: string, steps: ProcessStepInput[]): ExtractedHazard[] {
    const lines = narrative
      .split(/\n|\.|\r/)
      .map((line) => line.trim())
      .filter((line) => line.length > 5)
      .slice(0, 5);

    if (!lines.length) {
      return [
        {
          label: "No hazards captured",
          description: "Provide details about what can happen and existing controls.",
          existingControls: [],
          stepIds: steps[0]?.id ? [steps[0].id] : []
        }
      ];
    }

    return lines.map((line, index) => {
      const targetStep = steps.length ? steps[index % steps.length]! : undefined;
      return {
        label: line.substring(0, 60),
        description: line,
        existingControls: [],
        stepIds: targetStep?.id ? [targetStep.id] : []
      };
    });
  }

  private fallbackControlSuggestions(
    hazards: SuggestControlsParams["hazards"]
  ): ControlSuggestion[] {
    return hazards.slice(0, 5).map((hazard) => ({
      hazardId: hazard.id,
      controls: [`Review procedure for ${hazard.label}`, `Brief crew on ${hazard.label} safeguards`],
      hierarchy: ControlHierarchy.ORGANIZATIONAL
    }));
  }

  private fallbackActions(hazards: SuggestActionsParams["hazards"]): ActionSuggestion[] {
    return hazards.slice(0, 5).map((hazard) => ({
      hazardId: hazard.id,
      description: `Verify controls for ${hazard.label}`,
      owner: "Supervisor",
      dueInDays: 14
    }));
  }

  private normalizeSeverity(input: unknown): SeverityLevel | undefined {
    const value = typeof input === "string" ? input.trim().toUpperCase() : "";
    if (["A", "B", "C", "D", "E"].includes(value)) {
      return value as SeverityLevel;
    }
    const normalized = value.replace(/\s+/g, "_");
    const map: Record<string, SeverityLevel> = {
      CATASTROPHIC: "A",
      HAZARDOUS: "B",
      MAJOR: "C",
      MINOR: "D",
      NEGLIGIBLE: "E"
    };
    return map[normalized];
  }

  private normalizeLikelihood(input: unknown): LikelihoodLevel | undefined {
    if (typeof input === "number" && Number.isFinite(input)) {
      const raw = String(input);
      return ["1", "2", "3", "4", "5"].includes(raw) ? (raw as LikelihoodLevel) : undefined;
    }
    const value = typeof input === "string" ? input.trim().toUpperCase().replace(/\s+/g, "_") : "";
    if (["1", "2", "3", "4", "5"].includes(value)) {
      return value as LikelihoodLevel;
    }
    const map: Record<string, LikelihoodLevel> = {
      CERTAIN: "1",
      LIKELY: "2",
      POSSIBLE: "3",
      UNLIKELY: "4",
      EXTREMELY_UNLIKELY: "5",
      EXTREMELY: "5"
    };
    return map[value];
  }

  private normalizeHierarchy(input: unknown): ControlHierarchy | undefined {
    const value = typeof input === "string" ? input.toUpperCase() : "";
    return ["SUBSTITUTION", "TECHNICAL", "ORGANIZATIONAL", "PPE"].includes(value)
      ? (value as ControlHierarchy)
      : undefined;
  }

  private normalizeStopCategory(input: unknown): StopCategory | undefined {
    const value = typeof input === "string" ? input.trim().toUpperCase() : "";
    if (["SUBSTITUTION", "TECHNICAL", "ORGANIZATIONAL", "PPE"].includes(value)) {
      return value as StopCategory;
    }
    const map: Record<string, StopCategory> = {
      ORGANISATIONAL: "ORGANIZATIONAL",
      ORGANIZATION: "ORGANIZATIONAL",
      ORG: "ORGANIZATIONAL",
      TECH: "TECHNICAL",
      ENGINEERING: "TECHNICAL",
      SUB: "SUBSTITUTION",
      SUBSTITUTION: "SUBSTITUTION",
      PPE: "PPE"
    };
    return map[value];
  }

  // Parse contextual update from natural language
  async parseContextualUpdate(params: ContextualUpdateParams): Promise<ContextualUpdateResult> {
    const { userInput, currentPhase, tableState } = params;

    if (!this.client) {
      const commands = this.fallbackContextualUpdate(userInput, currentPhase, tableState);
      return {
        commands,
        summary: this.buildSummary(commands, userInput),
        needsClarification: false
      };
    }

    try {
      const response = await this.client.chat.completions.create({
        model: DEFAULT_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are helping update a HIRA (Hazard Identification & Risk Assessment) table.

Parse the user's natural language input and return structured update commands.

CURRENT PHASE: ${currentPhase}
When user is in a specific phase, bias toward that domain:
- PROCESS_STEPS: favor step/equipment/substance updates
- HAZARD_IDENTIFICATION: favor hazard/existingControl updates
- RISK_RATING: favor assessment updates
- CONTROL_DISCUSSION: favor proposedControl updates
- ACTIONS: favor action updates

For each update command, specify:
- intent: "add" | "modify" | "delete" | "insert"
- target: "step" | "hazard" | "control" | "assessment" | "action"
- location: { stepId?, stepIndex?, hazardId?, actionId?, insertAfter? }
- data: The structured data to apply
- explanation: Human-readable summary

If the user request is ambiguous, set:
- needsClarification: true
- clarificationPrompt: a single concise question
And return commands as an empty array.

Return ONLY valid JSON (no markdown, no code fences, no commentary).

EXAMPLES:
- "We also use a ladder in step 3" → modify step at index 2, add "Ladder" to equipment[]
- "Insert cleaning step between 3 and 4" → insert new step after step at index 2
- "The slip was due to tools on floor" → add new hazard or modify existing hazard description
- "Add PPE requirement: safety glasses" → add control with hierarchy PPE

Respond as JSON:
{"commands": [{"intent": string, "target": string, "location": object, "data": object, "explanation": string}]}`
          },
          {
            role: "user",
            content: JSON.stringify({
              userInput,
              tableState: {
                steps: tableState.steps.map((s, i) => ({ index: i + 1, ...s })),
                hazards: tableState.hazards,
                actions: tableState.actions
              }
            })
          }
        ]
      });

      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        const commands = this.fallbackContextualUpdate(userInput, currentPhase, tableState);
        return {
          commands,
          summary: this.buildSummary(commands, userInput),
          needsClarification: false
        };
      }

      const parsed = JSON.parse(content);
      const commands = Array.isArray(parsed.commands)
        ? parsed.commands.map((cmd: any) => ({
            intent: cmd.intent ?? "modify",
            target: cmd.target ?? "step",
            location: cmd.location ?? {},
            data: cmd.data ?? {},
            explanation: cmd.explanation ?? "Update requested"
          }))
        : this.fallbackContextualUpdate(userInput, currentPhase, tableState);

      const needsClarification = Boolean(parsed.needsClarification);

      return {
        commands: needsClarification ? [] : commands,
        summary: parsed.summary ?? this.buildSummary(commands, userInput),
        needsClarification,
        clarificationPrompt: parsed.clarificationPrompt,
        rawResponse: content
      };
    } catch (error) {
      console.warn("[llmService] Falling back to heuristic contextual update", error);
      const commands = this.fallbackContextualUpdate(userInput, currentPhase, tableState);
      return {
        commands,
        summary: this.buildSummary(commands, userInput),
        needsClarification: false
      };
    }
  }

  private fallbackContextualUpdate(
    userInput: string,
    currentPhase: string,
    tableState: ContextualUpdateParams["tableState"]
  ): ContextualUpdateCommand[] {
    // Simple heuristic: if mentions "step" and a number, try to modify that step
    const stepMatch = userInput.match(/step\s*(\d+)/i);
    if (stepMatch) {
      const stepIndex = parseInt(stepMatch[1]!, 10) - 1;
      const step = tableState.steps[stepIndex];
      if (step) {
        return [{
          intent: "modify",
          target: "step",
          location: { stepId: step.id, stepIndex },
          data: { note: userInput },
          explanation: `Update step ${stepIndex + 1} based on: "${userInput}"`
        }];
      }
    }

    // Default: suggest adding based on current phase
    const targetByPhase: Record<string, ContextualUpdateTarget> = {
      PROCESS_STEPS: "step",
      HAZARD_IDENTIFICATION: "hazard",
      RISK_RATING: "assessment",
      CONTROL_DISCUSSION: "control",
      ACTIONS: "action"
    };

    return [{
      intent: "add",
      target: targetByPhase[currentPhase] ?? "hazard",
      location: {},
      data: { description: userInput },
      explanation: `Add new item based on: "${userInput}"`
    }];
  }

  private buildSummary(commands: ContextualUpdateCommand[], userInput: string): string {
    if (!commands.length) {
      return `No updates parsed from "${userInput}"`;
    }
    if (commands.length === 1) {
      return commands[0]?.explanation ?? `1 update parsed from "${userInput}"`;
    }
    return `${commands.length} updates parsed from "${userInput}"`;
  }

  // Extract incident narrative facts, draft timeline, and clarification questions
  async extractIncidentNarrative(narrative: string): Promise<IncidentNarrativeExtractionResult> {
    if (!this.client) {
      return this.fallbackIncidentNarrative(narrative);
    }

    try {
      const response = await this.client.chat.completions.create({
        model: DEFAULT_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are assisting with an incident investigation. You must not invent facts.
Only use information explicitly provided in the narrative. If details are missing, ask short follow-up questions.

Extract:
1) Facts (atomic statements)
2) Draft timeline (ordered events, with time labels if mentioned and a confidence tag)
3) Clarification questions (max 8) with a short rationale and a target field name

Return ONLY valid JSON.

Respond as JSON:
{"facts":[{"text":string}],"timeline":[{"timeLabel":string,"text":string,"confidence":"CONFIRMED|LIKELY|UNCLEAR"}],"clarifications":[{"question":string,"rationale":string,"targetField":string}]}`
          },
          {
            role: "user",
            content: narrative
          }
        ]
      });

      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        return this.fallbackIncidentNarrative(narrative);
      }

      const parsed = JSON.parse(content);
      const facts = Array.isArray(parsed.facts)
        ? parsed.facts
            .map((fact: any) => (typeof fact?.text === "string" ? { text: fact.text } : null))
            .filter((fact: any): fact is { text: string } => Boolean(fact))
        : [];
      const timeline = Array.isArray(parsed.timeline)
        ? parsed.timeline
            .map((event: any) => {
              const text = typeof event?.text === "string" ? event.text : null;
              if (!text) return null;
              const confidence =
                typeof event?.confidence === "string" && Object.values(IncidentTimelineConfidence).includes(event.confidence)
                  ? (event.confidence as IncidentTimelineConfidence)
                  : IncidentTimelineConfidence.LIKELY;
              return {
                eventAt: typeof event?.eventAt === "string" ? event.eventAt : null,
                timeLabel: typeof event?.timeLabel === "string" ? event.timeLabel : null,
                text,
                confidence
              };
            })
            .filter((event: any): event is IncidentNarrativeExtractionResult["timeline"][number] => Boolean(event))
        : [];
      const clarifications = Array.isArray(parsed.clarifications)
        ? parsed.clarifications
            .map((item: any) => {
              if (typeof item === "string") {
                return { question: item };
              }
              if (typeof item?.question !== "string") return null;
              return {
                question: item.question,
                rationale: typeof item?.rationale === "string" ? item.rationale : null,
                targetField: typeof item?.targetField === "string" ? item.targetField : null
              };
            })
            .filter((item: any): item is IncidentNarrativeClarification => Boolean(item))
            .slice(0, 8)
        : [];

      return {
        facts: facts.length ? facts : this.fallbackIncidentFacts(narrative),
        timeline: timeline.length ? timeline : this.fallbackIncidentNarrative(narrative).timeline,
        clarifications,
        rawResponse: content
      };
    } catch (error) {
      console.warn("[llmService] Falling back to heuristic incident narrative extraction", error);
      return this.fallbackIncidentNarrative(narrative);
    }
  }

  // Extract incident witness facts and personal timeline
  async extractIncidentWitness(statement: string): Promise<IncidentWitnessExtractionResult> {
    if (!this.client) {
      return this.fallbackIncidentWitness(statement);
    }

    try {
      const response = await this.client.chat.completions.create({
        model: DEFAULT_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are assisting with an incident investigation. You must not invent facts.
Only use information explicitly provided by the witness. If details are missing, ask short follow-up questions.

Extract:
1) Facts (atomic statements)
2) Personal timeline (ordered events, with time labels if mentioned)
3) Open questions (max 8)

Return ONLY valid JSON.

Respond as JSON:
{"facts":[{"text":string}],"personalTimeline":[{"timeLabel":string,"text":string}],"openQuestions":[string]}`
          },
          {
            role: "user",
            content: statement
          }
        ]
      });

      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        return this.fallbackIncidentWitness(statement);
      }

      const parsed = JSON.parse(content);
      const facts = Array.isArray(parsed.facts)
        ? parsed.facts
            .map((fact: any) => (typeof fact?.text === "string" ? { text: fact.text } : null))
            .filter((fact: any): fact is { text: string } => Boolean(fact))
        : [];
      const personalTimeline = Array.isArray(parsed.personalTimeline)
        ? parsed.personalTimeline
            .map((event: any) => {
              const text = typeof event?.text === "string" ? event.text : null;
              if (!text) return null;
              return {
                eventAt: typeof event?.eventAt === "string" ? event.eventAt : null,
                timeLabel: typeof event?.timeLabel === "string" ? event.timeLabel : null,
                text
              };
            })
            .filter((event: any): event is { timeLabel?: string | null; text: string } => Boolean(event))
        : [];
      const openQuestions = Array.isArray(parsed.openQuestions)
        ? parsed.openQuestions.filter((q: unknown) => typeof q === "string" && q.trim().length > 0)
        : [];

      return {
        facts: facts.length ? facts : this.fallbackIncidentFacts(statement),
        personalTimeline: personalTimeline.length ? personalTimeline : this.fallbackIncidentTimeline(statement),
        openQuestions,
        rawResponse: content
      };
    } catch (error) {
      console.warn("[llmService] Falling back to heuristic incident witness extraction", error);
      return this.fallbackIncidentWitness(statement);
    }
  }

  // Merge witness timelines into a shared incident timeline
  async mergeIncidentTimeline(accounts: IncidentWitnessMergeAccount[]): Promise<IncidentTimelineMergeResult> {
    if (!this.client) {
      return this.fallbackIncidentMerge(accounts);
    }

    const payload = accounts.map((account) => ({
      accountId: account.accountId,
      role: account.role ?? null,
      name: account.name ?? null,
      facts: account.facts.map((fact, index) => ({ index, text: fact.text })),
      personalTimeline: account.personalTimeline.map((event, index) => ({
        index,
        timeLabel: event.timeLabel ?? null,
        text: event.text
      }))
    }));

    try {
      const response = await this.client.chat.completions.create({
        model: DEFAULT_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are assisting with an incident investigation. Build a SHARED timeline from multiple witnesses.

Rules:
- Do not invent missing steps.
- If accounts conflict, keep both and mark confidence UNCLEAR.
- Use time labels if provided; otherwise keep relative order.
- Reference sources using accountId and factIndex/personalEventIndex from the input.

Return ONLY valid JSON.

Respond as JSON:
{"timeline":[{"timeLabel":string,"text":string,"confidence":"CONFIRMED|LIKELY|UNCLEAR","sources":[{"accountId":string,"factIndex":number,"personalEventIndex":number}]}],"openQuestions":[string]}`
          },
          {
            role: "user",
            content: `INPUT:\n${JSON.stringify(payload, null, 2)}`
          }
        ]
      });

      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        return this.fallbackIncidentMerge(accounts);
      }

      const parsed = JSON.parse(content);
      const timeline = Array.isArray(parsed.timeline)
        ? parsed.timeline
            .map((row: any) => {
              const text = typeof row?.text === "string" ? row.text : null;
              if (!text) return null;
              const confidence =
                typeof row?.confidence === "string" && Object.values(IncidentTimelineConfidence).includes(row.confidence)
                  ? (row.confidence as IncidentTimelineConfidence)
                  : IncidentTimelineConfidence.LIKELY;
              const sources = Array.isArray(row?.sources)
                ? row.sources
                    .map((source: any) => {
                      if (typeof source?.accountId !== "string") return null;
                      const factIndex = Number.isInteger(source.factIndex) ? source.factIndex : undefined;
                      const personalEventIndex = Number.isInteger(source.personalEventIndex)
                        ? source.personalEventIndex
                        : undefined;
                      return { accountId: source.accountId, factIndex, personalEventIndex };
                    })
                    .filter((source: any): source is { accountId: string; factIndex?: number; personalEventIndex?: number } =>
                      Boolean(source)
                    )
                : [];
              return {
                eventAt: typeof row?.eventAt === "string" ? row.eventAt : null,
                timeLabel: typeof row?.timeLabel === "string" ? row.timeLabel : null,
                text,
                confidence,
                sources
              };
            })
            .filter((row: any): row is IncidentTimelineMergeResult["timeline"][number] => Boolean(row))
        : [];

      const openQuestions = Array.isArray(parsed.openQuestions)
        ? parsed.openQuestions.filter((q: unknown) => typeof q === "string" && q.trim().length > 0)
        : [];

      return {
        timeline: timeline.length ? timeline : this.fallbackIncidentMerge(accounts).timeline,
        openQuestions,
        rawResponse: content
      };
    } catch (error) {
      console.warn("[llmService] Falling back to heuristic incident merge", error);
      return this.fallbackIncidentMerge(accounts);
    }
  }

  // Consistency check for timeline (therefore/therefor)
  async checkIncidentConsistency(timeline: Array<{ timeLabel?: string | null; text: string }>): Promise<IncidentConsistencyCheckResult> {
    if (!this.client) {
      return { issues: [] };
    }

    const payload = timeline.map((row, index) => ({ index, timeLabel: row.timeLabel ?? null, text: row.text }));

    try {
      const response = await this.client.chat.completions.create({
        model: DEFAULT_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are assisting with an incident investigation. Check the timeline for gaps, contradictions, or ordering issues.
Do NOT invent facts. Only flag issues and ask questions.

Return ONLY valid JSON.

Respond as JSON:
{"issues":[{"type":"gap|contradiction|ordering","description":string,"relatedEventIndexes":[number]}]}`
          },
          {
            role: "user",
            content: `TIMELINE:\n${JSON.stringify(payload, null, 2)}`
          }
        ]
      });

      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        return { issues: [] };
      }

      const parsed = JSON.parse(content);
      const issues = Array.isArray(parsed.issues)
        ? parsed.issues
            .map((issue: any) => {
              const type = issue?.type;
              const description = typeof issue?.description === "string" ? issue.description : null;
              if (!description || (type !== "gap" && type !== "contradiction" && type !== "ordering")) {
                return null;
              }
              const relatedEventIndexes = Array.isArray(issue.relatedEventIndexes)
                ? issue.relatedEventIndexes.filter((value: unknown) => Number.isInteger(value))
                : undefined;
              return { type, description, relatedEventIndexes } as IncidentConsistencyIssue;
            })
            .filter((issue: any): issue is IncidentConsistencyIssue => Boolean(issue))
        : [];

      return { issues, rawResponse: content };
    } catch (error) {
      console.warn("[llmService] Falling back to empty incident consistency issues", error);
      return { issues: [] };
    }
  }

  async coachIncidentCauses(params: IncidentCauseCoachingParams): Promise<IncidentCauseCoachingResult> {
    if (!this.client) {
      return { questions: this.fallbackIncidentCauseQuestions(params.timeline) };
    }

    try {
      const response = await this.client.chat.completions.create({
        model: DEFAULT_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are assisting with an incident investigation.
Ask clarifying questions that help the investigator select proximate causes from the facts.
Do NOT suggest causes or answers. Keep questions concise.

Return ONLY valid JSON.

Respond as JSON:
{"questions":[string]}`
          },
          {
            role: "user",
            content: `TIMELINE FACTS:\n${JSON.stringify(params.timeline, null, 2)}`
          }
        ]
      });

      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        return { questions: this.fallbackIncidentCauseQuestions(params.timeline) };
      }

      const parsed = JSON.parse(content);
      const questions = Array.isArray(parsed.questions)
        ? parsed.questions.filter((q: unknown) => typeof q === "string" && q.trim().length > 0)
        : [];

      return {
        questions: questions.length ? questions : this.fallbackIncidentCauseQuestions(params.timeline),
        rawResponse: content
      };
    } catch (error) {
      console.warn("[llmService] Falling back to heuristic incident cause questions", error);
      return { questions: this.fallbackIncidentCauseQuestions(params.timeline) };
    }
  }

  async coachIncidentRootCauses(params: IncidentRootCauseCoachingParams): Promise<IncidentRootCauseCoachingResult> {
    if (!this.client) {
      return { questions: this.fallbackIncidentRootCauseQuestions(params.causes) };
    }

    try {
      const response = await this.client.chat.completions.create({
        model: DEFAULT_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are assisting with an incident investigation.
For each proximate cause, ask one follow-up "why" question to deepen the root cause analysis.
Do NOT suggest answers. Keep questions concise and specific.

Return ONLY valid JSON.

Respond as JSON:
{"questions":[{"causeNodeId":string,"question":string}]}`
          },
          {
            role: "user",
            content: `PROXIMATE CAUSES:\n${JSON.stringify(params.causes, null, 2)}`
          }
        ]
      });

      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        return { questions: this.fallbackIncidentRootCauseQuestions(params.causes) };
      }

      const parsed = JSON.parse(content);
      const questions = Array.isArray(parsed.questions)
        ? parsed.questions
            .map((item: any) => {
              if (typeof item?.causeNodeId !== "string" || typeof item?.question !== "string") {
                return null;
              }
              return { causeNodeId: item.causeNodeId, question: item.question };
            })
            .filter((item: any): item is IncidentRootCauseCoachingResult["questions"][number] => Boolean(item))
        : [];

      return {
        questions: questions.length ? questions : this.fallbackIncidentRootCauseQuestions(params.causes),
        rawResponse: content
      };
    } catch (error) {
      console.warn("[llmService] Falling back to heuristic root cause questions", error);
      return { questions: this.fallbackIncidentRootCauseQuestions(params.causes) };
    }
  }

  async suggestIncidentActions(params: IncidentActionCoachingParams): Promise<IncidentActionCoachingResult> {
    if (!this.client) {
      return { suggestions: this.fallbackIncidentActionSuggestions(params.causes) };
    }

    try {
      const response = await this.client.chat.completions.create({
        model: DEFAULT_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are assisting with an incident investigation.
Suggest corrective actions for each cause. Use STOP categories: SUBSTITUTION, TECHNICAL, ORGANIZATIONAL, PPE.
Do NOT repeat existing actions. Keep each action concise.

Return ONLY valid JSON.

Respond as JSON:
{"suggestions":[{"causeNodeId":string,"description":string,"category":"SUBSTITUTION|TECHNICAL|ORGANIZATIONAL|PPE"}]}`
          },
          {
            role: "user",
            content: JSON.stringify(params)
          }
        ]
      });

      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        return { suggestions: this.fallbackIncidentActionSuggestions(params.causes) };
      }

      const parsed = JSON.parse(content);
      const suggestions = Array.isArray(parsed.suggestions)
        ? parsed.suggestions
            .map((item: any) => {
              const category = this.normalizeStopCategory(item?.category);
              if (typeof item?.causeNodeId !== "string" || typeof item?.description !== "string" || !category) {
                return null;
              }
              return {
                causeNodeId: item.causeNodeId,
                description: item.description,
                category
              };
            })
            .filter((item: any): item is IncidentActionSuggestion => Boolean(item))
        : [];

      return {
        suggestions: suggestions.length ? suggestions : this.fallbackIncidentActionSuggestions(params.causes),
        rawResponse: content
      };
    } catch (error) {
      console.warn("[llmService] Falling back to heuristic incident actions", error);
      return { suggestions: this.fallbackIncidentActionSuggestions(params.causes) };
    }
  }

  async suggestJhaControls(params: JhaControlSuggestionParams): Promise<JhaControlSuggestionResult> {
    if (!this.client) {
      return { suggestions: this.fallbackJhaControlSuggestions(params) };
    }

    try {
      const response = await this.client.chat.completions.create({
        model: DEFAULT_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are assisting with a Job Hazard Analysis (JHA).
Suggest additional control measures for each hazard based on the steps and existing controls.
Do NOT repeat controls that already exist. Keep each control concise.

Return ONLY valid JSON.

Respond as JSON:
{"suggestions":[{"hazardId":string,"control":string}]}`
          },
          {
            role: "user",
            content: JSON.stringify(params)
          }
        ]
      });

      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        return { suggestions: this.fallbackJhaControlSuggestions(params) };
      }

      const parsed = JSON.parse(content);
      const suggestions = Array.isArray(parsed.suggestions)
        ? parsed.suggestions
            .map((item: any) => {
              if (typeof item?.hazardId !== "string" || typeof item?.control !== "string") {
                return null;
              }
              return { hazardId: item.hazardId, control: item.control };
            })
            .filter((item: any): item is JhaControlSuggestion => Boolean(item))
        : [];

      return {
        suggestions: suggestions.length ? suggestions : this.fallbackJhaControlSuggestions(params),
        rawResponse: content
      };
    } catch (error) {
      console.warn("[llmService] Falling back to heuristic JHA controls", error);
      return { suggestions: this.fallbackJhaControlSuggestions(params) };
    }
  }

  async parseJhaPatch(params: JhaPatchParseParams): Promise<JhaPatchParseResult> {
    const { userInput, phase, steps, hazards } = params;
    const stepPayload = steps.map((step, index) => ({
      id: step.id,
      index: index + 1,
      label: step.label
    }));
    const stepIndexById = new Map(stepPayload.map((step) => [step.id, step.index]));
    const hazardIndexByStep = new Map<string, number>();
    const hazardPayload = hazards.map((hazard) => {
      const stepIndex = stepIndexById.get(hazard.stepId) ?? null;
      const count = (hazardIndexByStep.get(hazard.stepId) ?? 0) + 1;
      hazardIndexByStep.set(hazard.stepId, count);
      return {
        id: hazard.id,
        stepId: hazard.stepId,
        stepIndex,
        hazardIndex: count,
        hazard: hazard.hazard,
        consequence: hazard.consequence ?? null,
        controls: Array.isArray(hazard.controls) ? hazard.controls : []
      };
    });

    if (!this.client) {
      const commands = this.fallbackJhaPatch(userInput, phase, steps);
      return {
        commands,
        summary: this.buildJhaPatchSummary(commands, userInput),
        needsClarification: false
      };
    }

    try {
      const response = await this.client.chat.completions.create({
        model: DEFAULT_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are helping update a Job Hazard Analysis (JHA).

CURRENT PHASE: ${phase.toUpperCase()}
Only return commands for this phase.

Command format:
{"commands":[{"intent":"add|insert|modify|delete|move","target":"step|hazard|control","location":{...},"data":{...},"explanation":string}],"needsClarification":boolean,"clarificationPrompt":string,"summary":string}

Locations:
- stepIndex (1-based), stepId
- hazardIndex (1-based within step), hazardId
- insertAfterStepIndex / insertBeforeStepIndex
- insertAfterHazardIndex / insertBeforeHazardIndex
- toStepIndex (for moving hazards)

Data fields:
- step: label
- hazard: hazard, consequence, controls
- control: control (single string)

If the request is ambiguous, set needsClarification true and return an empty commands array with a single clarificationPrompt.

Examples:
- "Insert a step to move the ladder between steps 2 and 3" -> intent "insert", target "step", location {"insertBeforeStepIndex":3}
- "Add a new prep step after step 1" -> intent "add", target "step", location {"insertAfterStepIndex":1}
- "For step 2, add hazard: pinch points" -> intent "add", target "hazard", location {"stepIndex":2}

Return ONLY valid JSON.`
          },
          {
            role: "user",
            content: JSON.stringify({
              userInput,
              tableState: {
                steps: stepPayload,
                hazards: hazardPayload
              }
            })
          }
        ]
      });

      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        const commands = this.fallbackJhaPatch(userInput, phase, steps);
        return {
          commands,
          summary: this.buildJhaPatchSummary(commands, userInput),
          needsClarification: false
        };
      }

      const parsed = JSON.parse(content);
      const commands = Array.isArray(parsed.commands)
        ? parsed.commands.map((cmd: any) => ({
            intent: typeof cmd.intent === "string" ? cmd.intent : "modify",
            target: typeof cmd.target === "string" ? cmd.target : "step",
            location: typeof cmd.location === "object" && cmd.location ? cmd.location : {},
            data: typeof cmd.data === "object" && cmd.data ? cmd.data : {},
            explanation: typeof cmd.explanation === "string" ? cmd.explanation : "Update requested"
          }))
        : this.fallbackJhaPatch(userInput, phase, steps);

      const needsClarification = Boolean(parsed.needsClarification);

      return {
        commands: needsClarification ? [] : (commands as JhaPatchCommand[]),
        summary: parsed.summary ?? this.buildJhaPatchSummary(commands, userInput),
        needsClarification,
        clarificationPrompt: parsed.clarificationPrompt,
        rawResponse: content
      };
    } catch (error) {
      console.warn("[llmService] Falling back to heuristic JHA patch", error);
      const commands = this.fallbackJhaPatch(userInput, phase, steps);
      return {
        commands,
        summary: this.buildJhaPatchSummary(commands, userInput),
        needsClarification: false
      };
    }
  }

  // Extract JHA rows from job description
  async extractJhaRows(jobDescription: string): Promise<ExtractJhaRowsResult> {
    if (!this.client) {
      return { rows: this.fallbackJhaRows(jobDescription) };
    }

    try {
      const response = await this.client.chat.completions.create({
        model: DEFAULT_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are a safety engineer creating a Job Hazard Analysis (JHA).

Given a job description, extract structured JHA rows. Each row represents one hazard for one job step.

For each row, provide:
- step: The job step/task where the hazard occurs
- hazard: The specific hazard (what can cause harm)
- consequence: What injury or damage could result
- controls: Array of control measures to prevent the hazard

Guidelines:
- Break down the job into logical sequential steps
- Identify 1-3 hazards per step
- Be specific about consequences (e.g., "laceration to hands" not just "injury")
- Include practical, actionable controls
- Return 5-15 rows total

Return ONLY valid JSON (no markdown, no code fences, no commentary).

Respond as JSON:
{"rows": [{"step": string, "hazard": string, "consequence": string, "controls": string[]}]}`
          },
          {
            role: "user",
            content: jobDescription
          }
        ]
      });

      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        return { rows: this.fallbackJhaRows(jobDescription) };
      }

      const parsed = JSON.parse(content);
      const rows = Array.isArray(parsed.rows)
        ? parsed.rows.map((row: any) => ({
            step: typeof row.step === "string" ? row.step : "Unspecified step",
            hazard: typeof row.hazard === "string" ? row.hazard : "Unspecified hazard",
            consequence: typeof row.consequence === "string" ? row.consequence : null,
            controls: Array.isArray(row.controls)
              ? row.controls.filter((c: unknown) => typeof c === "string" && c.trim().length > 0)
              : []
          }))
        : this.fallbackJhaRows(jobDescription);

      return { rows, rawResponse: content };
    } catch (error) {
      console.warn("[llmService] Falling back to heuristic JHA rows", error);
      return { rows: this.fallbackJhaRows(jobDescription) };
    }
  }

  private fallbackJhaRows(jobDescription: string): JhaRowInput[] {
    const lines = jobDescription
      .split(/\n|\.|\r/)
      .map((line) => line.trim())
      .filter((line) => line.length > 5)
      .slice(0, 5);

    if (!lines.length) {
      return [
        {
          step: "Describe job step",
          hazard: "Identify hazard",
          consequence: "Potential injury or damage",
          controls: ["Add control measures"]
        }
      ];
    }

    return lines.map((line) => ({
      step: line.substring(0, 60),
      hazard: "Review for hazards",
      consequence: "Assess potential consequences",
      controls: ["Identify appropriate controls"]
    }));
  }

  private fallbackJhaPatch(
    userInput: string,
    phase: Exclude<JhaWorkflowStage, "review">,
    steps: Array<{ id: string; label: string }>
  ): JhaPatchCommand[] {
    const lines = userInput
      .split(/\n|\r|\./)
      .map((line) => line.trim())
      .filter((line) => line.length > 3);
    if (!lines.length) {
      return [];
    }

    if (phase === "steps") {
      return lines.map((line) => ({
        intent: "add",
        target: "step",
        data: { label: line },
        explanation: "Add step"
      }));
    }

    if (phase === "hazards") {
      const stepIndex = steps.length ? 1 : null;
      return lines.map((line) => ({
        intent: "add",
        target: "hazard",
        ...(stepIndex ? { location: { stepIndex } } : {}),
        data: { hazard: line },
        explanation: "Add hazard"
      }));
    }

    return lines.map((line) => ({
      intent: "add",
      target: "control",
      location: { stepIndex: 1, hazardIndex: 1 },
      data: { control: line },
      explanation: "Add control"
    }));
  }

  private buildJhaPatchSummary(commands: JhaPatchCommand[], userInput: string): string {
    if (!commands.length) {
      return `No updates parsed from \"${userInput}\"`;
    }
    if (commands.length === 1) {
      return commands[0]?.explanation ?? `1 update parsed from \"${userInput}\"`;
    }
    return `${commands.length} updates parsed from \"${userInput}\"`;
  }

  private fallbackJhaControlSuggestions(params: JhaControlSuggestionParams): JhaControlSuggestion[] {
    return params.hazards.map((hazard) => ({
      hazardId: hazard.id,
      control: `Review controls for ${hazard.hazard}.`
    }));
  }

  private fallbackIncidentNarrative(narrative: string): IncidentNarrativeExtractionResult {
    const trimmed = narrative.trim();
    const facts = this.fallbackIncidentFacts(narrative);
    const timeline = this.fallbackIncidentTimeline(narrative).map((event) => ({
      ...event,
      confidence: IncidentTimelineConfidence.LIKELY
    }));
    const clarifications: IncidentNarrativeClarification[] = trimmed
      ? [
          {
            question: "When did the incident occur?",
            rationale: "Date/time helps anchor the timeline.",
            targetField: "incidentAt"
          },
          {
            question: "Where did the incident occur?",
            rationale: "Location helps confirm context.",
            targetField: "location"
          },
          {
            question: "Who was involved or witnessed the incident?",
            rationale: "People involved help validate the timeline.",
            targetField: "persons"
          }
        ]
      : [
          {
            question: "What happened? Provide a short incident description.",
            rationale: "A narrative is required before structuring facts.",
            targetField: "narrative"
          }
        ];
    return { facts, timeline, clarifications };
  }

  private fallbackIncidentWitness(statement: string): IncidentWitnessExtractionResult {
    return {
      facts: this.fallbackIncidentFacts(statement),
      personalTimeline: this.fallbackIncidentTimeline(statement),
      openQuestions: []
    };
  }

  private fallbackIncidentFacts(statement: string): { text: string }[] {
    const lines = statement
      .split(/\n|\.|\r/)
      .map((line) => line.trim())
      .filter((line) => line.length > 4);
    if (!lines.length) {
      return [{ text: "Witness account pending." }];
    }
    return lines.map((line) => ({ text: line }));
  }

  private fallbackIncidentTimeline(statement: string): { timeLabel?: string | null; text: string }[] {
    return this.fallbackIncidentFacts(statement).map((fact) => ({ text: fact.text }));
  }

  private fallbackIncidentMerge(accounts: IncidentWitnessMergeAccount[]): IncidentTimelineMergeResult {
    const timeline: IncidentTimelineMergeResult["timeline"] = [];
    accounts.forEach((account) => {
      account.personalTimeline.forEach((event, index) => {
        timeline.push({
          timeLabel: event.timeLabel ?? null,
          text: event.text,
          confidence: IncidentTimelineConfidence.LIKELY,
          sources: [{ accountId: account.accountId, personalEventIndex: index }]
        });
      });
    });
    return { timeline, openQuestions: [] };
  }

  private fallbackIncidentCauseQuestions(
    timeline: IncidentCauseCoachingParams["timeline"]
  ): string[] {
    if (!timeline.length) {
      return [
        "Which event most directly led to the incident?",
        "What unsafe condition or action made the incident possible?"
      ];
    }
    return [
      "Which timeline event most directly triggered the incident?",
      "What conditions or actions immediately before the incident could be considered proximate causes?",
      "Which step or decision created the final unsafe situation?"
    ];
  }

  private fallbackIncidentRootCauseQuestions(
    causes: IncidentRootCauseCoachingParams["causes"]
  ): IncidentRootCauseCoachingResult["questions"] {
    if (!causes.length) {
      return [];
    }
    return causes.map((cause) => ({
      causeNodeId: cause.causeNodeId,
      question: `Why did this happen: "${cause.statement}"?`
    }));
  }

  private fallbackIncidentActionSuggestions(
    causes: IncidentActionCoachingParams["causes"]
  ): IncidentActionSuggestion[] {
    if (!causes.length) {
      return [];
    }
    return causes.map((cause) => ({
      causeNodeId: cause.causeNodeId,
      description: `Review procedures and training related to "${cause.statement}".`,
      category: "ORGANIZATIONAL"
    }));
  }
}

// JHA extraction types
export interface JhaRowInput {
  step: string;
  hazard: string;
  consequence?: string | null;
  controls?: string[];
}

export interface ExtractJhaRowsResult {
  rows: JhaRowInput[];
  rawResponse?: string;
}

export type LlmServiceType = LlmService;
