import OpenAI from "openai";
import { env } from "../config/env";
import { ControlHierarchy, LikelihoodLevel, ProcessStepInput, SeverityLevel } from "../types/riskAssessment";

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
      ACTIONS: "action",
      RESIDUAL_RISK: "assessment"
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
}

export type LlmServiceType = LlmService;
