import type { Locale } from "../../../lib/i18n/types";

/**
 * UI-chrome copy for the Incident Investigation coach surfaces. The coach's
 * own replies are produced by the LLM and are already locale-driven; this map
 * covers only the static chrome (labels, buttons, hints, empty states, and
 * the user-safe error messages) rendered by the client components.
 *
 * Server pages resolve the user's uiLocale and pass the resolved slice to the
 * client tree, mirroring the copyByLocale pattern used by the investigation
 * page. German is Swiss-style ("ss", never "ß").
 */
export type CoachCopy = {
	conversation: {
		ariaLabel: string;
		heading: string;
		subhead: string;
		thinking: string;
		activityTitle: string;
		activityShow: string;
		activityHide: string;
		welcomeBody: string;
		starterPrompt1: string;
		starterPrompt2: string;
		composerPlaceholder: string;
		composerHint: string;
		feedbackButton: string;
		feedbackTitle: string;
		feedbackHint: string;
		feedbackCommentPlaceholder: string;
		feedbackSave: string;
		feedbackSaving: string;
		feedbackSaved: string;
		feedbackError: string;
		feedbackStarLabel: string;
		feedbackClose: string;
		send: string;
		recordAriaLabel: string;
		recordUnavailable: string;
		loadingRecord: string;
		acceptAll: string;
		proposalGroupTitle: string;
		reviewProposals: string;
		hideProposals: string;
		inRecord: string;
		dismissed: string;
		acceptEdited: string;
		cancel: string;
		accept: string;
		edit: string;
		dismiss: string;
		saving: string;
		cleared: string;
	};
	operations: {
		recordDetail: string;
		story: string;
		cause: string;
		causeUpdate: string;
		updateThisCause: string;
		measure: string;
		hiraFollowup: string;
		fact: string;
		rootCauseSuffix: string;
		parkedSuffix: string;
		reopenedSuffix: string;
	};
	fields: {
		actualInjuryOutcome: string;
		areaText: string;
		bodyPart: string;
		controlFailure: string;
		coordinatorName: string;
		departmentText: string;
		eventType: string;
		hazardCategoryCode: string;
		immediateCause: string;
		incidentAt: string;
		incidentTimeNote: string;
		incidentType: string;
		injuryNature: string;
		location: string;
		lostDays: string;
		potentialLikelihoodCode: string;
		potentialOutcomeText: string;
		potentialSeverityCode: string;
		processInvolved: string;
		shiftText: string;
		title: string;
		workActivity: string;
		workType: string;
	};
	chatErrors: {
		alreadyDecided: string;
		causeNodeRequired: string;
		invalidFieldValue: string;
		invalidOperation: string;
		operationNotInMessage: string;
		monthlyCapExceeded: string;
		personAccountRequired: string;
		providerFailed: string;
		unresolvedOperationReference: string;
		generic: string;
	};
	record: {
		stageCaptured: string;
		stageInvestigating: string;
		statusPaused: string;
		stageClosed: string;
		stageApproved: string;
		potentialPrefix: string;
		potentialSeverityOpen: string;
		riskSuffix: string;
		hiraFollowup: string;
		peopleInvolved: string;
		unnamed: string;
		tabOverview: string;
		tabFacts: string;
		tabCauses: string;
		tabActions: string;
		tabPhotos: string;
	};
	overview: {
		title: string;
		type: string;
		when: string;
		where: string;
		actualOutcome: string;
		department: string;
		area: string;
		workActivity: string;
		immediateCause: string;
		coordinator: string;
		save: string;
		saving: string;
		cancel: string;
		cannotBeEmpty: string;
		editPrefix: string;
		errorNotFound: string;
		errorInvalidPayload: string;
		errorGeneric: string;
	};
	timeline: {
		phaseBefore: string;
		phaseEvent: string;
		phaseAfter: string;
		phaseUnsorted: string;
		other: string;
		statementFacts: string;
		empty: string;
		phaseLabel: string;
		timeNotePlaceholder: string;
		whatHappened: string;
		add: string;
		addFact: string;
		edit: string;
		delete: string;
		deletePrompt: string;
		save: string;
		saving: string;
		cancel: string;
		editTitle: string;
		textRequired: string;
		errorNotFound: string;
		errorInvalidPayload: string;
		errorInvalidSource: string;
		errorEventNotFound: string;
		errorGeneric: string;
	};
	causes: {
		empty: string;
		add: string;
		addCause: string;
		addWhy: string;
		add_: string;
		edit: string;
		delete: string;
		save: string;
		cancel: string;
		moveUnder: string;
		mark: string;
		rootReached: string;
		park: string;
		reopen: string;
		chooseNewParent: string;
		topLevel: string;
		deletePrompt: string;
		rootCauseBadge: string;
		parkedBadge: string;
		measureBadgeOne: string;
		measureBadgeMany: string;
		whyPlaceholderChild: string;
		whyPlaceholderRoot: string;
		textRequired: string;
		topDropZone: string;
		dragHint: string;
		gripTitle: string;
		editTitle: string;
		errorNotFound: string;
		errorIncidentNotFound: string;
		errorInvalidBefore: string;
		errorInvalidParent: string;
		errorInvalidPayload: string;
		errorGeneric: string;
	};
	actions: {
		typeSubstitution: string;
		typeTechnical: string;
		typeOrganizational: string;
		typePpe: string;
		statusOpen: string;
		statusInProgress: string;
		statusComplete: string;
		empty: string;
		noCauses: string;
		addMeasure: string;
		whatWillBeDone: string;
		ownerRole: string;
		due: string;
		type: string;
		status: string;
		forPrefix: string;
		duePrefix: string;
		causeAddressed: string;
		chooseCause: string;
		edit: string;
		delete: string;
		deletePrompt: string;
		save: string;
		saving: string;
		cancel: string;
		descriptionRequired: string;
		pickCause: string;
		editTitle: string;
		errorCauseNotFound: string;
		errorActionNotFound: string;
		errorInvalidPayload: string;
		errorInvalidStatus: string;
		errorInvalidType: string;
		errorInvalidDueDate: string;
		errorGeneric: string;
	};
	photos: {
		addTitle: string;
		emptyStrip: string;
		clickHint: string;
		incidentPhoto: string;
		emptyTab: string;
		addDescription: string;
		whatShows: string;
		editDescription: string;
		save: string;
		cancel: string;
		captionSaveFailed: string;
		useDescriptionPrompt: string;
		analysing: string;
		askCoach: string;
		photo: string;
		close: string;
		uploadUnsupported: string;
		uploadTooLarge: string;
		uploadFailed: string;
		analysisMonthlyCap: string;
		analysisNotFound: string;
		analysisProviderFailed: string;
		analysisVisionCompany: string;
		analysisVisionWorkflow: string;
		analysisGeneric: string;
	};
	vision: {
		alwaysButton: string;
		askButton: string;
		cancelButton: string;
		companyUnavailable: string;
		description: string;
		error: string;
		neverButton: string;
		pending: string;
		title: string;
		workflowUnavailable: string;
	};
	mic: {
		listening: string;
		transcribing: string;
		holdToTalk: string;
		recordingRelease: string;
		releaseToTranscribe: string;
		didNotCatch: string;
		couldNotTranscribe: string;
		micBlocked: string;
		errAudioRequired: string;
		errAudioTooLarge: string;
		errMonthlyCap: string;
		errNoProviderKey: string;
		errProviderFailed: string;
		errUnsupportedType: string;
		errGeneric: string;
	};
};

export const coachCopyByLocale: Record<Locale, CoachCopy> = {
	en: {
		conversation: {
			ariaLabel: "Chat history",
			heading: "Safety Secretary",
			subhead: "Talk it through — the record fills itself",
			thinking: "Thinking…",
			activityTitle: "Agent activity",
			activityShow: "Show",
			activityHide: "Hide",
			welcomeBody:
				"I help you investigate this incident: we talk, I fill the record on the right, and together we find what really caused it — and what to change. Start by telling me what happened, in normal words.",
			starterPrompt1:
				"Describe what happened in your own words — who, what, where, roughly when.",
			starterPrompt2:
				"Paste a witness statement or report text; I will sort it into the record.",
			composerPlaceholder:
				"Type what happened, answer the question, or ask for the next step…",
			composerHint:
				"Enter to send · Shift+Enter for a new line · Hold the mic to dictate · Suggestions only land in the record when you accept them",
			feedbackButton: "Feedback",
			feedbackTitle: "Rate this conversation",
			feedbackHint: "Avoid names; initials are enough.",
			feedbackCommentPlaceholder: "What worked well in this conversation?",
			feedbackSave: "Save feedback",
			feedbackSaving: "Saving feedback…",
			feedbackSaved: "Feedback saved",
			feedbackError: "Could not save feedback.",
			feedbackStarLabel: "Rate {rating} of 4",
			feedbackClose: "Close",
			send: "Send",
			recordAriaLabel: "Investigation record",
			recordUnavailable: "Record unavailable.",
			loadingRecord: "Loading record…",
			acceptAll: "Accept all",
			proposalGroupTitle: "Proposed changes",
			reviewProposals: "Review",
			hideProposals: "Hide",
			inRecord: "✓ in record",
			dismissed: "dismissed",
			acceptEdited: "Accept edited",
			cancel: "Cancel",
			accept: "Accept",
			edit: "Edit",
			dismiss: "Dismiss",
			saving: "Saving…",
			cleared: "(cleared)",
		},
		operations: {
			recordDetail: "Record detail",
			story: "Story",
			cause: "Cause",
			causeUpdate: "Cause update",
			updateThisCause: "Update this cause on the tree",
			measure: "Measure",
			hiraFollowup: "HIRA follow-up",
			fact: "Fact",
			rootCauseSuffix: " · root cause",
			parkedSuffix: " · parked — beyond team scope",
			reopenedSuffix: " · reopened",
		},
		fields: {
			actualInjuryOutcome: "Actual outcome",
			areaText: "Area",
			bodyPart: "Body part",
			controlFailure: "Control failure",
			coordinatorName: "Coordinator",
			departmentText: "Department",
			eventType: "Event type",
			hazardCategoryCode: "Hazard category",
			immediateCause: "Immediate cause",
			incidentAt: "When",
			incidentTimeNote: "Time note",
			incidentType: "Type",
			injuryNature: "Injury",
			location: "Where",
			lostDays: "Lost days",
			potentialLikelihoodCode: "Potential likelihood",
			potentialOutcomeText: "Credible worst case",
			potentialSeverityCode: "Potential severity",
			processInvolved: "Process involved",
			shiftText: "Shift",
			title: "Title",
			workActivity: "Work activity",
			workType: "Work type",
		},
		chatErrors: {
			alreadyDecided:
				"This suggestion was already handled — the record is up to date.",
			causeNodeRequired:
				"Accept or add a cause first, then link this measure to it.",
			invalidFieldValue:
				"That value did not fit the field. Edit it and try again.",
			invalidOperation: "This suggestion can no longer be applied.",
			operationNotInMessage:
				"This suggestion can no longer be applied. Reload the page.",
			monthlyCapExceeded:
				"The monthly AI budget for this workspace is used up.",
			personAccountRequired:
				"Add a person with a statement first, then accept fact suggestions.",
			providerFailed:
				"The chat could not reach its language model. Check the LLM configuration and try again.",
			unresolvedOperationReference:
				"Accept the related cause suggestion first, then this one.",
			generic: "Something went wrong. Try again.",
		},
		record: {
			stageCaptured: "Captured",
			stageInvestigating: "Investigating",
			statusPaused: "Paused",
			stageClosed: "Closed",
			stageApproved: "Approved",
			potentialPrefix: "Potential",
			potentialSeverityOpen: "Potential severity open",
			riskSuffix: "risk",
			hiraFollowup: "HIRA follow-up",
			peopleInvolved: "People involved",
			unnamed: "Unnamed",
			tabOverview: "Overview",
			tabFacts: "Facts",
			tabCauses: "Cause tree",
			tabActions: "Action plan",
			tabPhotos: "Photos",
		},
		overview: {
			title: "Title",
			type: "Type",
			when: "When",
			where: "Where",
			actualOutcome: "Actual outcome",
			department: "Department",
			area: "Area",
			workActivity: "Work activity",
			immediateCause: "Immediate cause",
			coordinator: "Coordinator",
			save: "Save",
			saving: "Saving…",
			cancel: "Cancel",
			cannotBeEmpty: "cannot be empty.",
			editPrefix: "Edit",
			errorNotFound: "This incident is no longer available.",
			errorInvalidPayload:
				"That value did not fit the field. Check it and try again.",
			errorGeneric: "Something went wrong. Try again.",
		},
		timeline: {
			phaseBefore: "Before",
			phaseEvent: "Event",
			phaseAfter: "After",
			phaseUnsorted: "Unsorted",
			other: "Other",
			statementFacts: "Statement facts",
			empty:
				"No facts yet. Add the first one below, or type what happened in the chat.",
			phaseLabel: "Phase",
			timeNotePlaceholder: "Time note (optional)",
			whatHappened: "What happened?",
			add: "Add",
			addFact: "Add fact",
			edit: "Edit",
			delete: "Delete",
			deletePrompt: "Delete this fact?",
			save: "Save",
			saving: "Saving…",
			cancel: "Cancel",
			editTitle: "Edit this fact",
			textRequired: "The fact text cannot be empty.",
			errorNotFound: "This incident is no longer available.",
			errorInvalidPayload: "The fact text cannot be empty.",
			errorInvalidSource:
				"A linked person changed. The record was refreshed — try again.",
			errorEventNotFound:
				"That fact no longer exists. The record was refreshed.",
			errorGeneric: "Something went wrong. Try again.",
		},
		causes: {
			empty:
				"No causes yet. Add the first cause below, or dig into why it happened in the chat.",
			add: "Add",
			addCause: "Add cause",
			addWhy: "Add why",
			add_: "Add",
			edit: "Edit",
			delete: "Delete",
			save: "Save",
			cancel: "Cancel",
			moveUnder: "Move under",
			mark: "Mark…",
			rootReached: "Root reached",
			park: "Park — beyond team scope",
			reopen: "Reopen",
			chooseNewParent: "Choose a new parent…",
			topLevel: "Top level (new branch)",
			deletePrompt: "Delete this cause and its deeper whys?",
			rootCauseBadge: "root cause",
			parkedBadge: "parked — beyond team scope",
			measureBadgeOne: "measure",
			measureBadgeMany: "measures",
			whyPlaceholderChild: "Why did that happen?",
			whyPlaceholderRoot: "What contributed to the incident?",
			textRequired: "The cause text cannot be empty.",
			topDropZone: "Top level — drop here to start a new branch",
			dragHint:
				"Drag the ⋮⋮ handle onto a cause to make it a deeper why, or to a row's edge to reorder — or use Move under…",
			gripTitle:
				"Drag onto a cause to nest this why under it, or to a row edge to reorder",
			editTitle: "Edit this cause",
			errorNotFound: "That cause no longer exists. The record was refreshed.",
			errorIncidentNotFound: "This incident is no longer available.",
			errorInvalidBefore:
				"That spot in the tree changed. The record was refreshed — try again.",
			errorInvalidParent:
				"That move would create a loop in the tree. Pick a different parent.",
			errorInvalidPayload: "The cause text cannot be empty.",
			errorGeneric: "Something went wrong. Try again.",
		},
		actions: {
			typeSubstitution: "Substitution (S)",
			typeTechnical: "Technical (T)",
			typeOrganizational: "Organizational (O)",
			typePpe: "PPE (P)",
			statusOpen: "Open",
			statusInProgress: "In progress",
			statusComplete: "Complete",
			empty:
				"No action plan yet. Each important cause should end with who does what until when.",
			noCauses:
				"Add a cause on the cause tree first, then a measure can be linked to it.",
			addMeasure: "Add measure",
			whatWillBeDone: "What will be done?",
			ownerRole: "Owner / role",
			due: "Due",
			type: "Type",
			status: "Status",
			forPrefix: "for",
			duePrefix: "due",
			causeAddressed: "Cause this measure addresses",
			chooseCause: "Choose a cause…",
			edit: "Edit",
			delete: "Delete",
			deletePrompt: "Delete this measure?",
			save: "Save",
			saving: "Saving…",
			cancel: "Cancel",
			descriptionRequired: "The measure description cannot be empty.",
			pickCause: "Pick the cause this measure addresses.",
			editTitle: "Edit this measure",
			errorCauseNotFound:
				"That cause no longer exists. The record was refreshed.",
			errorActionNotFound:
				"That measure no longer exists. The record was refreshed.",
			errorInvalidPayload: "The measure description cannot be empty.",
			errorInvalidStatus: "Pick a valid status.",
			errorInvalidType: "Pick a valid measure type.",
			errorInvalidDueDate: "Enter the due date as a valid date.",
			errorGeneric: "Something went wrong. Try again.",
		},
		photos: {
			addTitle: "Add an incident photo",
			emptyStrip:
				"Add photos of the scene — you can look at them together in the chat",
			clickHint: "Click a photo to view it or ask about it in the chat",
			incidentPhoto: "Incident photo",
			emptyTab:
				"No photos yet. Add photos of the scene in the chat — they collect here with their descriptions.",
			addDescription: "Add a description…",
			whatShows: "What does this photo show?",
			editDescription: "Edit the photo description",
			save: "Save",
			cancel: "Cancel",
			captionSaveFailed: "The description could not be saved. Try again.",
			useDescriptionPrompt: "Use the suggested description for this photo?",
			analysing: "Analysing…",
			askCoach: "Ask about this photo in the chat",
			photo: "Photo",
			close: "Close",
			uploadUnsupported: "Only PNG or JPEG photos can be uploaded.",
			uploadTooLarge: "That photo is too large to upload.",
			uploadFailed: "The photo could not be uploaded. Try again.",
			analysisMonthlyCap:
				"The monthly AI budget for this workspace is used up.",
			analysisNotFound: "This photo is no longer available. Reload the page.",
			analysisProviderFailed:
				"The chat could not reach its vision model. Check the LLM configuration and try again.",
			analysisVisionCompany:
				"Photo analysis is switched off for this workspace.",
			analysisVisionWorkflow:
				"Photo analysis is switched off for this investigation.",
			analysisGeneric: "The photo analysis failed. Try again in a moment.",
		},
		vision: {
			alwaysButton: "Allow for this whole investigation",
			askButton: "Allow once",
			cancelButton: "Cancel",
			companyUnavailable: "Photo analysis is switched off for this workspace.",
			description:
				"To analyse the photo, it is sent to the configured AI model. Nothing leaves this workspace without your say-so.",
			error: "Could not save your choice. Try again.",
			neverButton: "Never for this investigation",
			pending: "Saving…",
			title: "Send this photo to the AI model?",
			workflowUnavailable:
				"Photo analysis is switched off for this investigation.",
		},
		mic: {
			listening: "Listening…",
			transcribing: "Transcribing…",
			holdToTalk: "Hold to talk",
			recordingRelease: "Recording — release to transcribe",
			releaseToTranscribe: "Release to transcribe",
			didNotCatch: "Did not catch that — try holding the mic a little longer.",
			couldNotTranscribe:
				"Could not transcribe — check your connection or type instead.",
			micBlocked: "Microphone blocked — allow access or type instead.",
			errAudioRequired:
				"Did not catch that — hold the mic and speak, then release.",
			errAudioTooLarge: "That clip was too long. Record a shorter message.",
			errMonthlyCap: "The monthly AI budget for this workspace is used up.",
			errNoProviderKey:
				"Voice input needs an AI key. Configure one in settings or type instead.",
			errProviderFailed:
				"The transcription service could not be reached. Try again or type instead.",
			errUnsupportedType:
				"This browser's audio format is not supported — type instead.",
			errGeneric: "Could not transcribe — try again or type instead.",
		},
	},
	de: {
		conversation: {
			ariaLabel: "Chat-Verlauf",
			heading: "Safety Secretary",
			subhead: "Erzähl es einfach — der Datensatz füllt sich von selbst",
			thinking: "Denkt nach…",
			activityTitle: "Agentenaktivität",
			activityShow: "Anzeigen",
			activityHide: "Ausblenden",
			welcomeBody:
				"Ich helfe dir, dieses Ereignis zu untersuchen: Wir reden, ich fülle den Datensatz rechts, und gemeinsam finden wir die wahre Ursache — und was zu ändern ist. Erzähl einfach, was passiert ist, in normalen Worten.",
			starterPrompt1:
				"Beschreibe in eigenen Worten, was passiert ist — wer, was, wo, ungefähr wann.",
			starterPrompt2:
				"Füge eine Zeugenaussage oder einen Berichtstext ein; ich ordne ihn in den Datensatz ein.",
			composerPlaceholder:
				"Schreib, was passiert ist, beantworte die Frage oder frag nach dem nächsten Schritt…",
			composerHint:
				"Enter zum Senden · Shift+Enter für eine neue Zeile · Mikrofon gedrückt halten zum Diktieren · Vorschläge landen erst im Datensatz, wenn du sie annimmst",
			feedbackButton: "Feedback",
			feedbackTitle: "Gespräch bewerten",
			feedbackHint: "Keine Namen; Initialen reichen.",
			feedbackCommentPlaceholder:
				"Was hat in diesem Gespräch gut funktioniert?",
			feedbackSave: "Feedback speichern",
			feedbackSaving: "Feedback wird gespeichert…",
			feedbackSaved: "Feedback gespeichert",
			feedbackError: "Feedback konnte nicht gespeichert werden.",
			feedbackStarLabel: "{rating} von 4 bewerten",
			feedbackClose: "Schliessen",
			send: "Senden",
			recordAriaLabel: "Untersuchungsdatensatz",
			recordUnavailable: "Datensatz nicht verfügbar.",
			loadingRecord: "Datensatz wird geladen…",
			acceptAll: "Alle annehmen",
			proposalGroupTitle: "Vorgeschlagene Änderungen",
			reviewProposals: "Prüfen",
			hideProposals: "Ausblenden",
			inRecord: "✓ im Datensatz",
			dismissed: "verworfen",
			acceptEdited: "Bearbeitet annehmen",
			cancel: "Abbrechen",
			accept: "Annehmen",
			edit: "Bearbeiten",
			dismiss: "Verwerfen",
			saving: "Speichern…",
			cleared: "(geleert)",
		},
		operations: {
			recordDetail: "Datensatz-Detail",
			story: "Ablauf",
			cause: "Ursache",
			causeUpdate: "Ursachen-Update",
			updateThisCause: "Diese Ursache im Baum aktualisieren",
			measure: "Massnahme",
			hiraFollowup: "HIRA-Folgemassnahme",
			fact: "Fakt",
			rootCauseSuffix: " · Grundursache",
			parkedSuffix: " · geparkt — ausserhalb des Teamrahmens",
			reopenedSuffix: " · wieder geöffnet",
		},
		fields: {
			actualInjuryOutcome: "Tatsächliche Folge",
			areaText: "Bereich",
			bodyPart: "Körperteil",
			controlFailure: "Versagen der Massnahme",
			coordinatorName: "Koordinator",
			departmentText: "Abteilung",
			eventType: "Ereignistyp",
			hazardCategoryCode: "Gefahrenkategorie",
			immediateCause: "Unmittelbare Ursache",
			incidentAt: "Wann",
			incidentTimeNote: "Zeitnotiz",
			incidentType: "Typ",
			injuryNature: "Verletzung",
			location: "Wo",
			lostDays: "Ausfalltage",
			potentialLikelihoodCode: "Mögliche Wahrscheinlichkeit",
			potentialOutcomeText: "Glaubhafter schlimmster Fall",
			potentialSeverityCode: "Mögliche Schwere",
			processInvolved: "Beteiligter Prozess",
			shiftText: "Schicht",
			title: "Titel",
			workActivity: "Tätigkeit",
			workType: "Arbeitsart",
		},
		chatErrors: {
			alreadyDecided:
				"Dieser Vorschlag wurde bereits behandelt — der Datensatz ist aktuell.",
			causeNodeRequired:
				"Nimm zuerst eine Ursache an oder ergänze eine, dann kann diese Massnahme verknüpft werden.",
			invalidFieldValue:
				"Dieser Wert passte nicht ins Feld. Bearbeite ihn und versuche es erneut.",
			invalidOperation: "Dieser Vorschlag kann nicht mehr angewendet werden.",
			operationNotInMessage:
				"Dieser Vorschlag kann nicht mehr angewendet werden. Lade die Seite neu.",
			monthlyCapExceeded:
				"Das monatliche KI-Budget dieses Arbeitsbereichs ist aufgebraucht.",
			personAccountRequired:
				"Ergänze zuerst eine Person mit einer Aussage, dann nimm Fakt-Vorschläge an.",
			providerFailed:
				"Der Chat konnte sein Sprachmodell nicht erreichen. Prüfe die LLM-Konfiguration und versuche es erneut.",
			unresolvedOperationReference:
				"Nimm zuerst den zugehörigen Ursachen-Vorschlag an, dann diesen.",
			generic: "Etwas ist schiefgelaufen. Versuche es erneut.",
		},
		record: {
			stageCaptured: "Erfasst",
			stageInvestigating: "In Untersuchung",
			statusPaused: "Pausiert",
			stageClosed: "Abgeschlossen",
			stageApproved: "Freigegeben",
			potentialPrefix: "Potential",
			potentialSeverityOpen: "Mögliche Schwere offen",
			riskSuffix: "Risiko",
			hiraFollowup: "HIRA-Folgemassnahme",
			peopleInvolved: "Beteiligte Personen",
			unnamed: "Unbenannt",
			tabOverview: "Übersicht",
			tabFacts: "Fakten",
			tabCauses: "Ursachenbaum",
			tabActions: "Massnahmenplan",
			tabPhotos: "Fotos",
		},
		overview: {
			title: "Titel",
			type: "Typ",
			when: "Wann",
			where: "Wo",
			actualOutcome: "Tatsächliche Folge",
			department: "Abteilung",
			area: "Bereich",
			workActivity: "Tätigkeit",
			immediateCause: "Unmittelbare Ursache",
			coordinator: "Koordinator",
			save: "Speichern",
			saving: "Speichern…",
			cancel: "Abbrechen",
			cannotBeEmpty: "darf nicht leer sein.",
			editPrefix: "Bearbeiten",
			errorNotFound: "Dieses Ereignis ist nicht mehr verfügbar.",
			errorInvalidPayload:
				"Dieser Wert passte nicht ins Feld. Prüfe ihn und versuche es erneut.",
			errorGeneric: "Etwas ist schiefgelaufen. Versuche es erneut.",
		},
		timeline: {
			phaseBefore: "Davor",
			phaseEvent: "Ereignis",
			phaseAfter: "Danach",
			phaseUnsorted: "Unsortiert",
			other: "Sonstiges",
			statementFacts: "Fakten aus Aussagen",
			empty:
				"Noch keine Fakten. Ergänze unten den ersten, oder schreib im Chat, was passiert ist.",
			phaseLabel: "Phase",
			timeNotePlaceholder: "Zeitnotiz (optional)",
			whatHappened: "Was ist passiert?",
			add: "Hinzufügen",
			addFact: "Fakt hinzufügen",
			edit: "Bearbeiten",
			delete: "Löschen",
			deletePrompt: "Diesen Fakt löschen?",
			save: "Speichern",
			saving: "Speichern…",
			cancel: "Abbrechen",
			editTitle: "Diesen Fakt bearbeiten",
			textRequired: "Der Fakt-Text darf nicht leer sein.",
			errorNotFound: "Dieses Ereignis ist nicht mehr verfügbar.",
			errorInvalidPayload: "Der Fakt-Text darf nicht leer sein.",
			errorInvalidSource:
				"Eine verknüpfte Person hat sich geändert. Der Datensatz wurde aktualisiert — versuche es erneut.",
			errorEventNotFound:
				"Dieser Fakt existiert nicht mehr. Der Datensatz wurde aktualisiert.",
			errorGeneric: "Etwas ist schiefgelaufen. Versuche es erneut.",
		},
		causes: {
			empty:
				"Noch keine Ursachen. Ergänze unten die erste, oder untersuche im Chat, warum es passiert ist.",
			add: "Hinzufügen",
			addCause: "Ursache hinzufügen",
			addWhy: "Warum hinzufügen",
			add_: "Hinzufügen",
			edit: "Bearbeiten",
			delete: "Löschen",
			save: "Speichern",
			cancel: "Abbrechen",
			moveUnder: "Verschieben unter",
			mark: "Markieren…",
			rootReached: "Grundursache erreicht",
			park: "Parken — ausserhalb des Teamrahmens",
			reopen: "Wieder öffnen",
			chooseNewParent: "Neue übergeordnete Ursache wählen…",
			topLevel: "Oberste Ebene (neuer Zweig)",
			deletePrompt: "Diese Ursache und ihre tieferen Warum löschen?",
			rootCauseBadge: "Grundursache",
			parkedBadge: "geparkt — ausserhalb des Teamrahmens",
			measureBadgeOne: "Massnahme",
			measureBadgeMany: "Massnahmen",
			whyPlaceholderChild: "Warum ist das passiert?",
			whyPlaceholderRoot: "Was hat zum Ereignis beigetragen?",
			textRequired: "Der Ursachen-Text darf nicht leer sein.",
			topDropZone:
				"Oberste Ebene — hier ablegen, um einen neuen Zweig zu starten",
			dragHint:
				"Ziehe den Griff ⋮⋮ auf eine Ursache, um sie als tieferes Warum einzuordnen, oder an den Rand einer Zeile, um umzusortieren — oder nutze Verschieben unter…",
			gripTitle:
				"Auf eine Ursache ziehen, um dieses Warum darunter einzuordnen, oder an einen Zeilenrand, um umzusortieren",
			editTitle: "Diese Ursache bearbeiten",
			errorNotFound:
				"Diese Ursache existiert nicht mehr. Der Datensatz wurde aktualisiert.",
			errorIncidentNotFound: "Dieses Ereignis ist nicht mehr verfügbar.",
			errorInvalidBefore:
				"Diese Stelle im Baum hat sich geändert. Der Datensatz wurde aktualisiert — versuche es erneut.",
			errorInvalidParent:
				"Diese Verschiebung würde eine Schleife im Baum erzeugen. Wähle eine andere übergeordnete Ursache.",
			errorInvalidPayload: "Der Ursachen-Text darf nicht leer sein.",
			errorGeneric: "Etwas ist schiefgelaufen. Versuche es erneut.",
		},
		actions: {
			typeSubstitution: "Substitution (S)",
			typeTechnical: "Technisch (T)",
			typeOrganizational: "Organisatorisch (O)",
			typePpe: "PSA (P)",
			statusOpen: "Offen",
			statusInProgress: "In Arbeit",
			statusComplete: "Erledigt",
			empty:
				"Noch kein Massnahmenplan. Jede wichtige Ursache sollte mit wer-was-bis-wann enden.",
			noCauses:
				"Ergänze zuerst eine Ursache im Ursachenbaum, dann kann eine Massnahme damit verknüpft werden.",
			addMeasure: "Massnahme hinzufügen",
			whatWillBeDone: "Was wird gemacht?",
			ownerRole: "Verantwortlich / Rolle",
			due: "Fällig",
			type: "Typ",
			status: "Status",
			forPrefix: "für",
			duePrefix: "fällig",
			causeAddressed: "Ursache, die diese Massnahme adressiert",
			chooseCause: "Ursache wählen…",
			edit: "Bearbeiten",
			delete: "Löschen",
			deletePrompt: "Diese Massnahme löschen?",
			save: "Speichern",
			saving: "Speichern…",
			cancel: "Abbrechen",
			descriptionRequired: "Die Massnahmenbeschreibung darf nicht leer sein.",
			pickCause: "Wähle die Ursache, die diese Massnahme adressiert.",
			editTitle: "Diese Massnahme bearbeiten",
			errorCauseNotFound:
				"Diese Ursache existiert nicht mehr. Der Datensatz wurde aktualisiert.",
			errorActionNotFound:
				"Diese Massnahme existiert nicht mehr. Der Datensatz wurde aktualisiert.",
			errorInvalidPayload: "Die Massnahmenbeschreibung darf nicht leer sein.",
			errorInvalidStatus: "Wähle einen gültigen Status.",
			errorInvalidType: "Wähle einen gültigen Massnahmentyp.",
			errorInvalidDueDate: "Gib das Fälligkeitsdatum als gültiges Datum ein.",
			errorGeneric: "Etwas ist schiefgelaufen. Versuche es erneut.",
		},
		photos: {
			addTitle: "Ein Ereignisfoto hinzufügen",
			emptyStrip:
				"Füge Fotos vom Ort hinzu — ihr könnt sie im Chat gemeinsam ansehen",
			clickHint:
				"Klicke ein Foto an, um es anzusehen oder im Chat dazu zu fragen",
			incidentPhoto: "Ereignisfoto",
			emptyTab:
				"Noch keine Fotos. Füge im Chat Fotos vom Ort hinzu — sie sammeln sich hier mit ihren Beschreibungen.",
			addDescription: "Beschreibung hinzufügen…",
			whatShows: "Was zeigt dieses Foto?",
			editDescription: "Fotobeschreibung bearbeiten",
			save: "Speichern",
			cancel: "Abbrechen",
			captionSaveFailed:
				"Die Beschreibung konnte nicht gespeichert werden. Versuche es erneut.",
			useDescriptionPrompt:
				"Die vorgeschlagene Beschreibung für dieses Foto übernehmen?",
			analysing: "Analysiert…",
			askCoach: "Im Chat zu diesem Foto fragen",
			photo: "Foto",
			close: "Schliessen",
			uploadUnsupported: "Nur PNG- oder JPEG-Fotos können hochgeladen werden.",
			uploadTooLarge: "Dieses Foto ist zu gross zum Hochladen.",
			uploadFailed:
				"Das Foto konnte nicht hochgeladen werden. Versuche es erneut.",
			analysisMonthlyCap:
				"Das monatliche KI-Budget dieses Arbeitsbereichs ist aufgebraucht.",
			analysisNotFound:
				"Dieses Foto ist nicht mehr verfügbar. Lade die Seite neu.",
			analysisProviderFailed:
				"Der Chat konnte sein Vision-Modell nicht erreichen. Prüfe die LLM-Konfiguration und versuche es erneut.",
			analysisVisionCompany:
				"Die Fotoanalyse ist für diesen Arbeitsbereich ausgeschaltet.",
			analysisVisionWorkflow:
				"Die Fotoanalyse ist für diese Untersuchung ausgeschaltet.",
			analysisGeneric:
				"Die Fotoanalyse ist fehlgeschlagen. Versuche es gleich erneut.",
		},
		vision: {
			alwaysButton: "Für diese ganze Untersuchung erlauben",
			askButton: "Einmal erlauben",
			cancelButton: "Abbrechen",
			companyUnavailable:
				"Die Fotoanalyse ist für diesen Arbeitsbereich ausgeschaltet.",
			description:
				"Zur Analyse wird das Foto an das konfigurierte KI-Modell gesendet. Nichts verlässt diesen Arbeitsbereich ohne deine Zustimmung.",
			error: "Deine Wahl konnte nicht gespeichert werden. Versuche es erneut.",
			neverButton: "Nie für diese Untersuchung",
			pending: "Speichern…",
			title: "Dieses Foto an das KI-Modell senden?",
			workflowUnavailable:
				"Die Fotoanalyse ist für diese Untersuchung ausgeschaltet.",
		},
		mic: {
			listening: "Hört zu…",
			transcribing: "Transkribiert…",
			holdToTalk: "Zum Sprechen halten",
			recordingRelease: "Nimmt auf — loslassen zum Transkribieren",
			releaseToTranscribe: "Loslassen zum Transkribieren",
			didNotCatch: "Nicht verstanden — halte das Mikrofon etwas länger.",
			couldNotTranscribe:
				"Konnte nicht transkribieren — prüfe deine Verbindung oder tippe stattdessen.",
			micBlocked:
				"Mikrofon blockiert — Zugriff erlauben oder stattdessen tippen.",
			errAudioRequired:
				"Nicht verstanden — Mikrofon halten und sprechen, dann loslassen.",
			errAudioTooLarge:
				"Dieser Clip war zu lang. Nimm eine kürzere Nachricht auf.",
			errMonthlyCap:
				"Das monatliche KI-Budget dieses Arbeitsbereichs ist aufgebraucht.",
			errNoProviderKey:
				"Spracheingabe braucht einen KI-Schlüssel. Konfiguriere einen in den Einstellungen oder tippe stattdessen.",
			errProviderFailed:
				"Der Transkriptionsdienst war nicht erreichbar. Versuche es erneut oder tippe stattdessen.",
			errUnsupportedType:
				"Das Audioformat dieses Browsers wird nicht unterstützt — tippe stattdessen.",
			errGeneric:
				"Konnte nicht transkribieren — versuche es erneut oder tippe stattdessen.",
		},
	},
	fr: {
		conversation: {
			ariaLabel: "Historique du chat",
			heading: "Safety Secretary",
			subhead: "Raconte-le — le dossier se remplit tout seul",
			thinking: "Réflexion…",
			activityTitle: "Activité de l'agent",
			activityShow: "Afficher",
			activityHide: "Masquer",
			welcomeBody:
				"Je t'aide à enquêter sur cet événement : on discute, je remplis le dossier à droite, et ensemble on trouve la vraie cause — et ce qu'il faut changer. Commence par raconter ce qui s'est passé, avec des mots simples.",
			starterPrompt1:
				"Décris ce qui s'est passé avec tes propres mots — qui, quoi, où, à peu près quand.",
			starterPrompt2:
				"Colle une déclaration de témoin ou un texte de rapport ; je le range dans le dossier.",
			composerPlaceholder:
				"Écris ce qui s'est passé, réponds à la question ou demande l'étape suivante…",
			composerHint:
				"Entrée pour envoyer · Maj+Entrée pour une nouvelle ligne · Maintiens le micro pour dicter · Les suggestions n'entrent dans le dossier que si tu les acceptes",
			feedbackButton: "Feedback",
			feedbackTitle: "Évaluer cette conversation",
			feedbackHint: "Évite les noms ; les initiales suffisent.",
			feedbackCommentPlaceholder:
				"Qu'est-ce qui a bien fonctionné dans cette conversation ?",
			feedbackSave: "Enregistrer le feedback",
			feedbackSaving: "Enregistrement du feedback…",
			feedbackSaved: "Feedback enregistré",
			feedbackError: "Impossible d'enregistrer le feedback.",
			feedbackStarLabel: "Évaluer {rating} sur 4",
			feedbackClose: "Fermer",
			send: "Envoyer",
			recordAriaLabel: "Dossier d'enquête",
			recordUnavailable: "Dossier indisponible.",
			loadingRecord: "Chargement du dossier…",
			acceptAll: "Tout accepter",
			proposalGroupTitle: "Modifications proposées",
			reviewProposals: "Examiner",
			hideProposals: "Masquer",
			inRecord: "✓ dans le dossier",
			dismissed: "écarté",
			acceptEdited: "Accepter la version modifiée",
			cancel: "Annuler",
			accept: "Accepter",
			edit: "Modifier",
			dismiss: "Écarter",
			saving: "Enregistrement…",
			cleared: "(effacé)",
		},
		operations: {
			recordDetail: "Détail du dossier",
			story: "Récit",
			cause: "Cause",
			causeUpdate: "Mise à jour de cause",
			updateThisCause: "Mettre à jour cette cause dans l'arbre",
			measure: "Mesure",
			hiraFollowup: "Suivi HIRA",
			fact: "Fait",
			rootCauseSuffix: " · cause racine",
			parkedSuffix: " · mis de côté — hors du périmètre de l'équipe",
			reopenedSuffix: " · rouvert",
		},
		fields: {
			actualInjuryOutcome: "Conséquence réelle",
			areaText: "Zone",
			bodyPart: "Partie du corps",
			controlFailure: "Défaillance de la mesure",
			coordinatorName: "Coordinateur",
			departmentText: "Service",
			eventType: "Type d'événement",
			hazardCategoryCode: "Catégorie de danger",
			immediateCause: "Cause immédiate",
			incidentAt: "Quand",
			incidentTimeNote: "Note horaire",
			incidentType: "Type",
			injuryNature: "Blessure",
			location: "Où",
			lostDays: "Jours perdus",
			potentialLikelihoodCode: "Probabilité potentielle",
			potentialOutcomeText: "Pire cas crédible",
			potentialSeverityCode: "Gravité potentielle",
			processInvolved: "Processus impliqué",
			shiftText: "Équipe",
			title: "Titre",
			workActivity: "Activité",
			workType: "Type de travail",
		},
		chatErrors: {
			alreadyDecided:
				"Cette suggestion a déjà été traitée — le dossier est à jour.",
			causeNodeRequired:
				"Accepte ou ajoute d'abord une cause, puis lie cette mesure à celle-ci.",
			invalidFieldValue:
				"Cette valeur ne convenait pas au champ. Modifie-la et réessaie.",
			invalidOperation: "Cette suggestion ne peut plus être appliquée.",
			operationNotInMessage:
				"Cette suggestion ne peut plus être appliquée. Recharge la page.",
			monthlyCapExceeded:
				"Le budget IA mensuel de cet espace de travail est épuisé.",
			personAccountRequired:
				"Ajoute d'abord une personne avec une déclaration, puis accepte les suggestions de faits.",
			providerFailed:
				"Le chat n'a pas pu joindre son modèle de langage. Vérifie la configuration LLM et réessaie.",
			unresolvedOperationReference:
				"Accepte d'abord la suggestion de cause liée, puis celle-ci.",
			generic: "Une erreur s'est produite. Réessaie.",
		},
		record: {
			stageCaptured: "Saisi",
			stageInvestigating: "En enquête",
			statusPaused: "En pause",
			stageClosed: "Clôturé",
			stageApproved: "Validé",
			potentialPrefix: "Potentiel",
			potentialSeverityOpen: "Gravité potentielle à définir",
			riskSuffix: "risque",
			hiraFollowup: "Suivi HIRA",
			peopleInvolved: "Personnes impliquées",
			unnamed: "Sans nom",
			tabOverview: "Aperçu",
			tabFacts: "Faits",
			tabCauses: "Arbre des causes",
			tabActions: "Plan d'actions",
			tabPhotos: "Photos",
		},
		overview: {
			title: "Titre",
			type: "Type",
			when: "Quand",
			where: "Ou",
			actualOutcome: "Conséquence réelle",
			department: "Service",
			area: "Zone",
			workActivity: "Activité",
			immediateCause: "Cause immédiate",
			coordinator: "Coordinateur",
			save: "Enregistrer",
			saving: "Enregistrement…",
			cancel: "Annuler",
			cannotBeEmpty: "ne peut pas être vide.",
			editPrefix: "Modifier",
			errorNotFound: "Cet événement n'est plus disponible.",
			errorInvalidPayload:
				"Cette valeur ne convenait pas au champ. Vérifie-la et réessaie.",
			errorGeneric: "Une erreur s'est produite. Réessaie.",
		},
		timeline: {
			phaseBefore: "Avant",
			phaseEvent: "Événement",
			phaseAfter: "Après",
			phaseUnsorted: "Non classé",
			other: "Autre",
			statementFacts: "Faits des déclarations",
			empty:
				"Aucun fait pour l'instant. Ajoute le premier ci-dessous, ou raconte ce qui s'est passé dans le chat.",
			phaseLabel: "Phase",
			timeNotePlaceholder: "Note horaire (facultatif)",
			whatHappened: "Que s'est-il passé ?",
			add: "Ajouter",
			addFact: "Ajouter un fait",
			edit: "Modifier",
			delete: "Supprimer",
			deletePrompt: "Supprimer ce fait ?",
			save: "Enregistrer",
			saving: "Enregistrement…",
			cancel: "Annuler",
			editTitle: "Modifier ce fait",
			textRequired: "Le texte du fait ne peut pas être vide.",
			errorNotFound: "Cet événement n'est plus disponible.",
			errorInvalidPayload: "Le texte du fait ne peut pas être vide.",
			errorInvalidSource:
				"Une personne liée a changé. Le dossier a été actualisé — réessaie.",
			errorEventNotFound: "Ce fait n'existe plus. Le dossier a été actualisé.",
			errorGeneric: "Une erreur s'est produite. Réessaie.",
		},
		causes: {
			empty:
				"Aucune cause pour l'instant. Ajoute la première ci-dessous, ou creuse le pourquoi dans le chat.",
			add: "Ajouter",
			addCause: "Ajouter une cause",
			addWhy: "Ajouter un pourquoi",
			add_: "Ajouter",
			edit: "Modifier",
			delete: "Supprimer",
			save: "Enregistrer",
			cancel: "Annuler",
			moveUnder: "Déplacer sous",
			mark: "Marquer…",
			rootReached: "Cause racine atteinte",
			park: "Mettre de côté — hors du périmètre de l'équipe",
			reopen: "Rouvrir",
			chooseNewParent: "Choisir un nouveau parent…",
			topLevel: "Niveau supérieur (nouvelle branche)",
			deletePrompt: "Supprimer cette cause et ses pourquoi plus profonds ?",
			rootCauseBadge: "cause racine",
			parkedBadge: "mis de côté — hors du périmètre de l'équipe",
			measureBadgeOne: "mesure",
			measureBadgeMany: "mesures",
			whyPlaceholderChild: "Pourquoi est-ce arrivé ?",
			whyPlaceholderRoot: "Qu'est-ce qui a contribué à l'événement ?",
			textRequired: "Le texte de la cause ne peut pas être vide.",
			topDropZone:
				"Niveau supérieur — dépose ici pour démarrer une nouvelle branche",
			dragHint:
				"Fais glisser la poignée ⋮⋮ sur une cause pour en faire un pourquoi plus profond, ou vers le bord d'une ligne pour réordonner — ou utilise Déplacer sous…",
			gripTitle:
				"Fais glisser sur une cause pour imbriquer ce pourquoi dessous, ou vers le bord d'une ligne pour réordonner",
			editTitle: "Modifier cette cause",
			errorNotFound: "Cette cause n'existe plus. Le dossier a été actualisé.",
			errorIncidentNotFound: "Cet événement n'est plus disponible.",
			errorInvalidBefore:
				"Cet endroit dans l'arbre a changé. Le dossier a été actualisé — réessaie.",
			errorInvalidParent:
				"Ce déplacement créerait une boucle dans l'arbre. Choisis un autre parent.",
			errorInvalidPayload: "Le texte de la cause ne peut pas être vide.",
			errorGeneric: "Une erreur s'est produite. Réessaie.",
		},
		actions: {
			typeSubstitution: "Substitution (S)",
			typeTechnical: "Technique (T)",
			typeOrganizational: "Organisationnel (O)",
			typePpe: "EPI (P)",
			statusOpen: "Ouvert",
			statusInProgress: "En cours",
			statusComplete: "Terminé",
			empty:
				"Aucun plan d'actions. Chaque cause importante devrait se terminer par qui fait quoi pour quand.",
			noCauses:
				"Ajoute d'abord une cause dans l'arbre des causes, puis une mesure pourra y être liée.",
			addMeasure: "Ajouter une mesure",
			whatWillBeDone: "Que va-t-on faire ?",
			ownerRole: "Responsable / rôle",
			due: "Échéance",
			type: "Type",
			status: "Statut",
			forPrefix: "pour",
			duePrefix: "échéance",
			causeAddressed: "Cause traitée par cette mesure",
			chooseCause: "Choisir une cause…",
			edit: "Modifier",
			delete: "Supprimer",
			deletePrompt: "Supprimer cette mesure ?",
			save: "Enregistrer",
			saving: "Enregistrement…",
			cancel: "Annuler",
			descriptionRequired: "La description de la mesure ne peut pas être vide.",
			pickCause: "Choisis la cause traitée par cette mesure.",
			editTitle: "Modifier cette mesure",
			errorCauseNotFound:
				"Cette cause n'existe plus. Le dossier a été actualisé.",
			errorActionNotFound:
				"Cette mesure n'existe plus. Le dossier a été actualisé.",
			errorInvalidPayload: "La description de la mesure ne peut pas être vide.",
			errorInvalidStatus: "Choisis un statut valide.",
			errorInvalidType: "Choisis un type de mesure valide.",
			errorInvalidDueDate: "Saisis l'échéance sous forme de date valide.",
			errorGeneric: "Une erreur s'est produite. Réessaie.",
		},
		photos: {
			addTitle: "Ajouter une photo de l'événement",
			emptyStrip:
				"Ajoute des photos des lieux — vous pouvez les regarder ensemble dans le chat",
			clickHint:
				"Clique sur une photo pour la voir ou pour poser une question à son sujet dans le chat",
			incidentPhoto: "Photo de l'événement",
			emptyTab:
				"Aucune photo pour l'instant. Ajoute des photos des lieux dans le chat — elles se regroupent ici avec leurs descriptions.",
			addDescription: "Ajouter une description…",
			whatShows: "Que montre cette photo ?",
			editDescription: "Modifier la description de la photo",
			save: "Enregistrer",
			cancel: "Annuler",
			captionSaveFailed:
				"La description n'a pas pu être enregistrée. Réessaie.",
			useDescriptionPrompt:
				"Utiliser la description proposée pour cette photo ?",
			analysing: "Analyse…",
			askCoach: "Poser une question sur cette photo dans le chat",
			photo: "Photo",
			close: "Fermer",
			uploadUnsupported:
				"Seules les photos PNG ou JPEG peuvent être téléversées.",
			uploadTooLarge: "Cette photo est trop volumineuse à téléverser.",
			uploadFailed: "La photo n'a pas pu être téléversée. Réessaie.",
			analysisMonthlyCap:
				"Le budget IA mensuel de cet espace de travail est épuisé.",
			analysisNotFound: "Cette photo n'est plus disponible. Recharge la page.",
			analysisProviderFailed:
				"Le chat n'a pas pu joindre son modèle de vision. Vérifie la configuration LLM et réessaie.",
			analysisVisionCompany:
				"L'analyse de photos est désactivée pour cet espace de travail.",
			analysisVisionWorkflow:
				"L'analyse de photos est désactivée pour cette enquête.",
			analysisGeneric:
				"L'analyse de la photo a échoué. Réessaie dans un instant.",
		},
		vision: {
			alwaysButton: "Autoriser pour toute cette enquête",
			askButton: "Autoriser une fois",
			cancelButton: "Annuler",
			companyUnavailable:
				"L'analyse de photos est désactivée pour cet espace de travail.",
			description:
				"Pour analyser la photo, elle est envoyée au modèle IA configuré. Rien ne quitte cet espace de travail sans ton accord.",
			error: "Impossible d'enregistrer ton choix. Réessaie.",
			neverButton: "Jamais pour cette enquête",
			pending: "Enregistrement…",
			title: "Envoyer cette photo au modèle IA ?",
			workflowUnavailable:
				"L'analyse de photos est désactivée pour cette enquête.",
		},
		mic: {
			listening: "Écoute…",
			transcribing: "Transcription…",
			holdToTalk: "Maintiens pour parler",
			recordingRelease: "Enregistrement — relâche pour transcrire",
			releaseToTranscribe: "Relâche pour transcrire",
			didNotCatch:
				"Pas bien compris — maintiens le micro un peu plus longtemps.",
			couldNotTranscribe:
				"Transcription impossible — vérifie ta connexion ou tape plutôt.",
			micBlocked: "Micro bloqué — autorise l'accès ou tape plutôt.",
			errAudioRequired:
				"Pas bien compris — maintiens le micro et parle, puis relâche.",
			errAudioTooLarge:
				"Ce clip était trop long. Enregistre un message plus court.",
			errMonthlyCap:
				"Le budget IA mensuel de cet espace de travail est épuisé.",
			errNoProviderKey:
				"La saisie vocale a besoin d'une clé IA. Configure-en une dans les réglages ou tape plutôt.",
			errProviderFailed:
				"Le service de transcription était injoignable. Réessaie ou tape plutôt.",
			errUnsupportedType:
				"Le format audio de ce navigateur n'est pas pris en charge — tape plutôt.",
			errGeneric: "Transcription impossible — réessaie ou tape plutôt.",
		},
	},
	it: {
		conversation: {
			ariaLabel: "Cronologia della chat",
			heading: "Safety Secretary",
			subhead: "Raccontalo — il record si compila da solo",
			thinking: "Sto pensando…",
			activityTitle: "Attività dell'agente",
			activityShow: "Mostra",
			activityHide: "Nascondi",
			welcomeBody:
				"Ti aiuto a indagare su questo evento: parliamo, io compilo il record a destra e insieme troviamo la vera causa — e cosa cambiare. Inizia raccontando cosa è successo, con parole semplici.",
			starterPrompt1:
				"Descrivi cosa è successo con parole tue — chi, cosa, dove, all'incirca quando.",
			starterPrompt2:
				"Incolla una dichiarazione di un testimone o il testo di un rapporto; lo sistemo nel record.",
			composerPlaceholder:
				"Scrivi cosa è successo, rispondi alla domanda o chiedi il passo successivo…",
			composerHint:
				"Invio per inviare · Maiusc+Invio per una nuova riga · Tieni premuto il microfono per dettare · I suggerimenti entrano nel record solo se li accetti",
			feedbackButton: "Feedback",
			feedbackTitle: "Valuta questa conversazione",
			feedbackHint: "Evita i nomi; bastano le iniziali.",
			feedbackCommentPlaceholder:
				"Cosa ha funzionato bene in questa conversazione?",
			feedbackSave: "Salva feedback",
			feedbackSaving: "Salvataggio feedback…",
			feedbackSaved: "Feedback salvato",
			feedbackError: "Impossibile salvare il feedback.",
			feedbackStarLabel: "Valuta {rating} su 4",
			feedbackClose: "Chiudi",
			send: "Invia",
			recordAriaLabel: "Record dell'indagine",
			recordUnavailable: "Record non disponibile.",
			loadingRecord: "Caricamento del record…",
			acceptAll: "Accetta tutti",
			proposalGroupTitle: "Modifiche proposte",
			reviewProposals: "Rivedi",
			hideProposals: "Nascondi",
			inRecord: "✓ nel record",
			dismissed: "scartato",
			acceptEdited: "Accetta la versione modificata",
			cancel: "Annulla",
			accept: "Accetta",
			edit: "Modifica",
			dismiss: "Scarta",
			saving: "Salvataggio…",
			cleared: "(cancellato)",
		},
		operations: {
			recordDetail: "Dettaglio del record",
			story: "Racconto",
			cause: "Causa",
			causeUpdate: "Aggiornamento causa",
			updateThisCause: "Aggiorna questa causa nell'albero",
			measure: "Misura",
			hiraFollowup: "Follow-up HIRA",
			fact: "Fatto",
			rootCauseSuffix: " · causa radice",
			parkedSuffix: " · parcheggiata — oltre l'ambito del team",
			reopenedSuffix: " · riaperta",
		},
		fields: {
			actualInjuryOutcome: "Conseguenza reale",
			areaText: "Area",
			bodyPart: "Parte del corpo",
			controlFailure: "Cedimento della misura",
			coordinatorName: "Coordinatore",
			departmentText: "Reparto",
			eventType: "Tipo di evento",
			hazardCategoryCode: "Categoria di pericolo",
			immediateCause: "Causa immediata",
			incidentAt: "Quando",
			incidentTimeNote: "Nota oraria",
			incidentType: "Tipo",
			injuryNature: "Lesione",
			location: "Dove",
			lostDays: "Giorni persi",
			potentialLikelihoodCode: "Probabilità potenziale",
			potentialOutcomeText: "Peggior caso credibile",
			potentialSeverityCode: "Gravità potenziale",
			processInvolved: "Processo coinvolto",
			shiftText: "Turno",
			title: "Titolo",
			workActivity: "Attività",
			workType: "Tipo di lavoro",
		},
		chatErrors: {
			alreadyDecided:
				"Questo suggerimento è già stato gestito — il record è aggiornato.",
			causeNodeRequired:
				"Accetta o aggiungi prima una causa, poi collega questa misura ad essa.",
			invalidFieldValue:
				"Quel valore non si adattava al campo. Modificalo e riprova.",
			invalidOperation: "Questo suggerimento non può più essere applicato.",
			operationNotInMessage:
				"Questo suggerimento non può più essere applicato. Ricarica la pagina.",
			monthlyCapExceeded:
				"Il budget IA mensile di questo spazio di lavoro è esaurito.",
			personAccountRequired:
				"Aggiungi prima una persona con una dichiarazione, poi accetta i suggerimenti di fatti.",
			providerFailed:
				"La chat non ha potuto raggiungere il suo modello linguistico. Controlla la configurazione LLM e riprova.",
			unresolvedOperationReference:
				"Accetta prima il suggerimento di causa collegato, poi questo.",
			generic: "Qualcosa è andato storto. Riprova.",
		},
		record: {
			stageCaptured: "Registrato",
			stageInvestigating: "In indagine",
			statusPaused: "In pausa",
			stageClosed: "Chiuso",
			stageApproved: "Approvato",
			potentialPrefix: "Potenziale",
			potentialSeverityOpen: "Gravità potenziale da definire",
			riskSuffix: "rischio",
			hiraFollowup: "Follow-up HIRA",
			peopleInvolved: "Persone coinvolte",
			unnamed: "Senza nome",
			tabOverview: "Panoramica",
			tabFacts: "Fatti",
			tabCauses: "Albero delle cause",
			tabActions: "Piano d'azione",
			tabPhotos: "Foto",
		},
		overview: {
			title: "Titolo",
			type: "Tipo",
			when: "Quando",
			where: "Dove",
			actualOutcome: "Conseguenza reale",
			department: "Reparto",
			area: "Area",
			workActivity: "Attività",
			immediateCause: "Causa immediata",
			coordinator: "Coordinatore",
			save: "Salva",
			saving: "Salvataggio…",
			cancel: "Annulla",
			cannotBeEmpty: "non può essere vuoto.",
			editPrefix: "Modifica",
			errorNotFound: "Questo evento non è più disponibile.",
			errorInvalidPayload:
				"Quel valore non si adattava al campo. Controllalo e riprova.",
			errorGeneric: "Qualcosa è andato storto. Riprova.",
		},
		timeline: {
			phaseBefore: "Prima",
			phaseEvent: "Evento",
			phaseAfter: "Dopo",
			phaseUnsorted: "Non ordinato",
			other: "Altro",
			statementFacts: "Fatti dalle dichiarazioni",
			empty:
				"Ancora nessun fatto. Aggiungi il primo qui sotto, o racconta nella chat cosa è successo.",
			phaseLabel: "Fase",
			timeNotePlaceholder: "Nota oraria (facoltativa)",
			whatHappened: "Cosa è successo?",
			add: "Aggiungi",
			addFact: "Aggiungi fatto",
			edit: "Modifica",
			delete: "Elimina",
			deletePrompt: "Eliminare questo fatto?",
			save: "Salva",
			saving: "Salvataggio…",
			cancel: "Annulla",
			editTitle: "Modifica questo fatto",
			textRequired: "Il testo del fatto non può essere vuoto.",
			errorNotFound: "Questo evento non è più disponibile.",
			errorInvalidPayload: "Il testo del fatto non può essere vuoto.",
			errorInvalidSource:
				"Una persona collegata è cambiata. Il record è stato aggiornato — riprova.",
			errorEventNotFound:
				"Questo fatto non esiste più. Il record è stato aggiornato.",
			errorGeneric: "Qualcosa è andato storto. Riprova.",
		},
		causes: {
			empty:
				"Ancora nessuna causa. Aggiungi la prima qui sotto, o approfondisci il perché nella chat.",
			add: "Aggiungi",
			addCause: "Aggiungi causa",
			addWhy: "Aggiungi perché",
			add_: "Aggiungi",
			edit: "Modifica",
			delete: "Elimina",
			save: "Salva",
			cancel: "Annulla",
			moveUnder: "Sposta sotto",
			mark: "Contrassegna…",
			rootReached: "Causa radice raggiunta",
			park: "Parcheggia — oltre l'ambito del team",
			reopen: "Riapri",
			chooseNewParent: "Scegli un nuovo elemento superiore…",
			topLevel: "Livello superiore (nuovo ramo)",
			deletePrompt: "Eliminare questa causa e i suoi perché più profondi?",
			rootCauseBadge: "causa radice",
			parkedBadge: "parcheggiata — oltre l'ambito del team",
			measureBadgeOne: "misura",
			measureBadgeMany: "misure",
			whyPlaceholderChild: "Perché è successo?",
			whyPlaceholderRoot: "Cosa ha contribuito all'evento?",
			textRequired: "Il testo della causa non può essere vuoto.",
			topDropZone: "Livello superiore — rilascia qui per avviare un nuovo ramo",
			dragHint:
				"Trascina la maniglia ⋮⋮ su una causa per renderla un perché più profondo, o sul bordo di una riga per riordinare — oppure usa Sposta sotto…",
			gripTitle:
				"Trascina su una causa per annidare questo perché sotto di essa, o sul bordo di una riga per riordinare",
			editTitle: "Modifica questa causa",
			errorNotFound:
				"Questa causa non esiste più. Il record è stato aggiornato.",
			errorIncidentNotFound: "Questo evento non è più disponibile.",
			errorInvalidBefore:
				"Quel punto nell'albero è cambiato. Il record è stato aggiornato — riprova.",
			errorInvalidParent:
				"Questo spostamento creerebbe un ciclo nell'albero. Scegli un altro elemento superiore.",
			errorInvalidPayload: "Il testo della causa non può essere vuoto.",
			errorGeneric: "Qualcosa è andato storto. Riprova.",
		},
		actions: {
			typeSubstitution: "Sostituzione (S)",
			typeTechnical: "Tecnica (T)",
			typeOrganizational: "Organizzativa (O)",
			typePpe: "DPI (P)",
			statusOpen: "Aperto",
			statusInProgress: "In corso",
			statusComplete: "Completato",
			empty:
				"Ancora nessun piano d'azione. Ogni causa importante dovrebbe finire con chi fa cosa entro quando.",
			noCauses:
				"Aggiungi prima una causa nell'albero delle cause, poi una misura potrà essere collegata ad essa.",
			addMeasure: "Aggiungi misura",
			whatWillBeDone: "Cosa verrà fatto?",
			ownerRole: "Responsabile / ruolo",
			due: "Scadenza",
			type: "Tipo",
			status: "Stato",
			forPrefix: "per",
			duePrefix: "scadenza",
			causeAddressed: "Causa affrontata da questa misura",
			chooseCause: "Scegli una causa…",
			edit: "Modifica",
			delete: "Elimina",
			deletePrompt: "Eliminare questa misura?",
			save: "Salva",
			saving: "Salvataggio…",
			cancel: "Annulla",
			descriptionRequired: "La descrizione della misura non può essere vuota.",
			pickCause: "Scegli la causa affrontata da questa misura.",
			editTitle: "Modifica questa misura",
			errorCauseNotFound:
				"Questa causa non esiste più. Il record è stato aggiornato.",
			errorActionNotFound:
				"Questa misura non esiste più. Il record è stato aggiornato.",
			errorInvalidPayload: "La descrizione della misura non può essere vuota.",
			errorInvalidStatus: "Scegli uno stato valido.",
			errorInvalidType: "Scegli un tipo di misura valido.",
			errorInvalidDueDate: "Inserisci la scadenza come data valida.",
			errorGeneric: "Qualcosa è andato storto. Riprova.",
		},
		photos: {
			addTitle: "Aggiungi una foto dell'evento",
			emptyStrip:
				"Aggiungi foto del luogo — potete guardarle insieme nella chat",
			clickHint:
				"Clicca una foto per vederla o per fare una domanda a riguardo nella chat",
			incidentPhoto: "Foto dell'evento",
			emptyTab:
				"Ancora nessuna foto. Aggiungi foto del luogo nella chat — si raccolgono qui con le loro descrizioni.",
			addDescription: "Aggiungi una descrizione…",
			whatShows: "Cosa mostra questa foto?",
			editDescription: "Modifica la descrizione della foto",
			save: "Salva",
			cancel: "Annulla",
			captionSaveFailed: "La descrizione non è stata salvata. Riprova.",
			useDescriptionPrompt: "Usare la descrizione proposta per questa foto?",
			analysing: "Analisi…",
			askCoach: "Fai una domanda su questa foto nella chat",
			photo: "Foto",
			close: "Chiudi",
			uploadUnsupported: "Si possono caricare solo foto PNG o JPEG.",
			uploadTooLarge: "Questa foto è troppo grande da caricare.",
			uploadFailed: "La foto non è stata caricata. Riprova.",
			analysisMonthlyCap:
				"Il budget IA mensile di questo spazio di lavoro è esaurito.",
			analysisNotFound:
				"Questa foto non è più disponibile. Ricarica la pagina.",
			analysisProviderFailed:
				"La chat non ha potuto raggiungere il suo modello di visione. Controlla la configurazione LLM e riprova.",
			analysisVisionCompany:
				"L'analisi delle foto è disattivata per questo spazio di lavoro.",
			analysisVisionWorkflow:
				"L'analisi delle foto è disattivata per questa indagine.",
			analysisGeneric:
				"L'analisi della foto non è riuscita. Riprova tra un momento.",
		},
		vision: {
			alwaysButton: "Consenti per tutta questa indagine",
			askButton: "Consenti una volta",
			cancelButton: "Annulla",
			companyUnavailable:
				"L'analisi delle foto è disattivata per questo spazio di lavoro.",
			description:
				"Per analizzare la foto, viene inviata al modello IA configurato. Niente lascia questo spazio di lavoro senza il tuo consenso.",
			error: "Impossibile salvare la tua scelta. Riprova.",
			neverButton: "Mai per questa indagine",
			pending: "Salvataggio…",
			title: "Inviare questa foto al modello IA?",
			workflowUnavailable:
				"L'analisi delle foto è disattivata per questa indagine.",
		},
		mic: {
			listening: "In ascolto…",
			transcribing: "Trascrizione…",
			holdToTalk: "Tieni premuto per parlare",
			recordingRelease: "Registrazione — rilascia per trascrivere",
			releaseToTranscribe: "Rilascia per trascrivere",
			didNotCatch:
				"Non ho capito — tieni premuto il microfono un po' più a lungo.",
			couldNotTranscribe:
				"Impossibile trascrivere — controlla la connessione o digita invece.",
			micBlocked: "Microfono bloccato — consenti l'accesso o digita invece.",
			errAudioRequired:
				"Non ho capito — tieni premuto il microfono e parla, poi rilascia.",
			errAudioTooLarge:
				"Quel clip era troppo lungo. Registra un messaggio più breve.",
			errMonthlyCap:
				"Il budget IA mensile di questo spazio di lavoro è esaurito.",
			errNoProviderKey:
				"L'input vocale richiede una chiave IA. Configurane una nelle impostazioni o digita invece.",
			errProviderFailed:
				"Il servizio di trascrizione non era raggiungibile. Riprova o digita invece.",
			errUnsupportedType:
				"Il formato audio di questo browser non è supportato — digita invece.",
			errGeneric: "Impossibile trascrivere — riprova o digita invece.",
		},
	},
};

export function resolveCoachCopy(locale: string): CoachCopy {
	return coachCopyByLocale[locale as Locale] ?? coachCopyByLocale.en;
}
