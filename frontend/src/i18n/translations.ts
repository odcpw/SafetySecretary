export const translations = {
  en: {
    common: {
      appName: "SafetySecretary",
      back: "Back",
      cancel: "Cancel",
      add: "Add",
      delete: "Delete",
      remove: "Remove",
      duplicate: "Duplicate",
      save: "Save",
      invalidDate: "Enter a valid date (YYYY-MM-DD).",
      invalidDateTime: "Enter a valid date/time (YYYY-MM-DDTHH:MM).",
      invalidTime: "Enter a valid time (HH:MM).",
      dateHint: "Format: YYYY-MM-DD",
      timeHint: "Format: HH:MM",
      dateTimeHint: "Format: YYYY-MM-DDTHH:MM",
      update: "Update",
      loading: "Loading...",
      clear: "Clear",
      retry: "Retry",
      upload: "Upload",
      file: "File",
      moveUp: "Up",
      moveDown: "Down",
      signOut: "Sign out",
      signIn: "Sign in",
      signInAgain: "Sign in again",
      continue: "Continue",
      refresh: "Refresh",
      new: "New",
      load: "Load",
      exportPdf: "Export PDF",
      exportXlsx: "Export XLSX",
      exportPreparing: "Preparing {label}...",
      exportReady: "{label} opened in new tab.",
      exportBlocked: "Pop-up blocked. Allow pop-ups to download.",
      more: "More",
      optionalDetails: "Optional details",
      browseCases: "Browse recent cases",
      loadById: "Load by ID",
      searchPlaceholder: "Search by title, location, or date",
      noData: "N/A"
    },
    status: {
      savingChanges: "Saving changes...",
      saved: "Saved.",
      saveFailed: "Save failed."
    },
    auth: {
      welcomeBack: "Welcome back",
      signInSubtitle: "Sign in to your organization workspace.",
      orgSlug: "Organization slug",
      orgSlugPlaceholder: "acme-safety",
      username: "Username",
      usernamePlaceholder: "j.safety",
      password: "Password",
      rememberMe: "Remember me for 10 days",
      sessionExpired: "Your session expired. Please sign in again.",
      loginFailed: "Unable to sign in. Check your details and try again.",
      signingIn: "Signing in...",
      remainingAttempts: "{count} attempts left",
      lockedUntil: "Locked until {date}.",
      contactAdmin: "Contact your organization admin to regain access.",
      adminTitle: "Admin sign in",
      adminSubtitle: "Platform admin access for provisioning and user management.",
      bootstrapTitle: "First-time bootstrap",
      bootstrapToken: "Bootstrap token",
      bootstrapEmail: "Admin email",
      bootstrapUsername: "Admin username",
      bootstrapPassword: "Admin password",
      createAdmin: "Create admin",
      demoDivider: "Demo access",
      demoSubtitle: "Jump into the shared demo workspace with sample data.",
      demoLogin: "Login as test user",
      demoSigningIn: "Entering demo...",
      demoLoginFailed: "Unable to start demo session."
    },
    landing: {
      home: {
        heroTitle: "Choose the safety workflow you need right now.",
        heroSubtitle: "Start a HIRA, JHA, or incident investigation. Each stays organized and export-ready.",
        tiles: {
          hira: {
            badge: "Hazard Identification & Risk Assessment",
            title: "HIRA",
            description: "Guide teams through hazards, ratings, controls, and actions.",
            bulletOne: "Risk ratings + controls",
            bulletTwo: "Action plan output",
            bulletThree: "PDF + XLSX export",
            cta: "Open HIRA"
          },
          jha: {
            badge: "Job Hazard Analysis",
            title: "JHA",
            description: "Build the step-by-step hazard table in a compact format.",
            bulletOne: "Steps, hazards, controls",
            bulletTwo: "LLM row drafting",
            bulletThree: "One-page export",
            cta: "Open JHA"
          },
          incident: {
            badge: "Incident Investigation",
            title: "II",
            description: "Capture witness accounts and trace causes with a shared timeline.",
            bulletOne: "Multi-witness intake",
            bulletTwo: "Timeline + deviations",
            bulletThree: "One-page summary",
            cta: "Open II"
          }
        }
      },
      hira: {
        hero: {
          title: "AI-assisted risk assessments for teams who care about detail.",
          subtitleDefault: "Start by creating a new case or load an existing case ID.",
          subtitleReady: "Ready to open {id}?",
          primaryAction: "Start new case",
          secondaryAction: "Load existing case"
        },
        load: {
          label: "Existing work",
          title: "Load an in-progress case",
          subtitle: "Paste the RiskAssessmentCase ID from the API or PDF export.",
          inputLabel: "RiskAssessmentCase ID",
          inputPlaceholder: "e.g. 9b03b61e-...",
          action: "Jump back in"
        },
        create: {
          label: "New activity",
          title: "Create a fresh assessment",
          subtitle: "Describe the work, then walk through the phases with your team.",
          activityLabel: "Activity name",
          activityPlaceholder: "Inspect mixing tank",
          locationLabel: "Location (optional)",
          locationPlaceholder: "Plant 3 mezzanine",
          teamLabel: "Team (optional)",
          teamPlaceholder: "Maintenance",
          action: "Create case",
          creating: "Creating..."
        },
        recent: {
          label: "Recently opened",
          title: "Your saved cases",
          subtitle: "Pick up where you left off. Cases are stored on the server for your organization.",
          loading: "Loading latest cases...",
          empty: "No cases yet. Create one to see it here.",
          updated: "Updated {date}",
          load: "Load",
          delete: "Delete"
        },
        errors: {
          activityRequired: "Activity name is required",
          missingId: "Enter a case ID",
          createFailed: "Unable to create case",
          loadFailed: "Unable to load cases",
          deleteFailed: "Unable to delete case"
        },
        confirmDelete: "Delete \"{name}\"? This permanently removes it for your organization."
      },
      jha: {
        hero: {
          title: "Job hazard analysis in a clean, compact format.",
          subtitleDefault: "Start a new JHA or load an existing one.",
          subtitleReady: "Ready to open {id}?",
          primaryAction: "Start new JHA",
          secondaryAction: "Load existing"
        },
        load: {
          label: "Existing work",
          title: "Load a JHA by ID",
          subtitle: "Paste the JHA case ID from the API or PDF export.",
          inputLabel: "JHA Case ID",
          inputPlaceholder: "e.g. 9b03b61e-...",
          action: "Jump back in"
        },
        create: {
          label: "New JHA",
          title: "Create a JHA worksheet",
          subtitle: "Capture the job details and then build the hazard table.",
          jobTitleLabel: "Job title",
          jobTitlePlaceholder: "Mobile plant & site traffic",
          siteLabel: "Site",
          sitePlaceholder: "North yard",
          supervisorLabel: "Supervisor",
          supervisorPlaceholder: "Shift supervisor",
          workersLabel: "Workers involved",
          workersPlaceholder: "Operator, spotter",
          jobDateLabel: "Job date",
          jobDatePlaceholder: "2025-03-21",
          jobTimeLabel: "Job time",
          jobTimePlaceholder: "08:00",
          revisionLabel: "Revision",
          revisionPlaceholder: "1.0",
          preparedByLabel: "Prepared by",
          preparedByPlaceholder: "Name",
          reviewedByLabel: "Reviewed by",
          reviewedByPlaceholder: "Name",
          approvedByLabel: "Approved by",
          approvedByPlaceholder: "Name",
          signoffLabel: "Sign-off date",
          signoffPlaceholder: "2025-03-21",
          signoffTimeLabel: "Sign-off time",
          signoffTimePlaceholder: "16:30",
          action: "Create JHA",
          creating: "Creating..."
        },
        recent: {
          label: "Recently opened",
          title: "Your JHA cases",
          subtitle: "Pick up where you left off. JHAs are stored on the server for your organization.",
          loading: "Loading latest JHAs...",
          empty: "No JHAs yet. Create one to see it here.",
          updated: "Updated {date}",
          load: "Load"
        },
        errors: {
          jobTitleRequired: "Job title is required",
          missingId: "Enter a JHA case ID",
          createFailed: "Unable to create JHA",
          loadFailed: "Unable to load JHA cases"
        }
      },
      incident: {
        hero: {
          title: "Incident investigations built from real accounts.",
          subtitleDefault: "Start a new incident or load an existing investigation.",
          subtitleReady: "Ready to open {id}?",
          primaryAction: "Start new incident",
          secondaryAction: "Load existing"
        },
        load: {
          label: "Existing work",
          title: "Load an incident by ID",
          subtitle: "Paste the IncidentCase ID from the API or PDF export.",
          inputLabel: "IncidentCase ID",
          inputPlaceholder: "e.g. 9b03b61e-...",
          action: "Jump back in"
        },
        create: {
          label: "New incident",
          title: "Start a fresh investigation",
          subtitle: "Capture the basics first, then gather witness accounts.",
          titleLabel: "Incident title",
          titlePlaceholder: "Forklift near miss",
          typeLabel: "Incident type",
          whenLabel: "Date/time (approx ok)",
          whenPlaceholder: "2025-03-21T10:15",
          whenNotesLabel: "Date/time notes",
          whenNotesPlaceholder: "About 10am, after break",
          locationLabel: "Location",
          locationPlaceholder: "Warehouse bay 3",
          coordinatorRoleLabel: "Coordinator role",
          coordinatorRolePlaceholder: "Shift supervisor",
          coordinatorNameLabel: "Coordinator name (optional)",
          coordinatorNamePlaceholder: "Jordan Lee",
          action: "Create incident",
          creating: "Creating..."
        },
        recent: {
          label: "Recently opened",
          title: "Your incident cases",
          subtitle: "Pick up where you left off. Incidents are stored on the server for your organization.",
          loading: "Loading latest incidents...",
          empty: "No incidents yet. Create one to see it here.",
          updated: "Updated {date}",
          load: "Load"
        },
        errors: {
          titleRequired: "Title is required",
          coordinatorRequired: "Coordinator role is required",
          missingId: "Enter an incident ID",
          createFailed: "Unable to create incident",
          loadFailed: "Unable to load incidents"
        }
      }
    },
    workspace: {
      hiraWorkspace: "Risk assessment workspace",
      jhaWorkspace: "Job hazard analysis",
      incidentWorkspace: "Incident investigation",
      saving: "Saving latest edits...",
      locationPending: "Location pending",
      teamPending: "Team pending",
      sitePending: "Site pending",
      supervisorPending: "Supervisor pending"
    },
    navigation: {
      primary: "Primary navigation",
      breadcrumbs: "Breadcrumbs",
      home: "Home",
      hira: "HIRA",
      jha: "JHA",
      incidents: "Incidents"
    },
    menu: {
      signedIn: "Signed in",
      account: "Account",
      displayName: "Display name",
      email: "Email",
      preferences: "Preferences",
      theme: "Theme",
      apiKey: "API key (beta)",
      companyKey: "Company key",
      subAccounts: "Sub-accounts (beta)",
      needChanges: "Need changes?",
      managedByAdmin: "Managed by your admin",
      accountEdits: "Account edits are admin-managed during beta.",
      subAccountsHint: "Invite teammates to share the same organization API key. Coming soon.",
      contactAdmin: "Contact your organization admin for role changes, lockouts, or account updates.",
      language: "Language",
      loadFailed: "Unable to load account details.",
      localeUpdateFailed: "Unable to update language preference."
    },
    banners: {
      sessionExpired: "Session expired. Please sign in again.",
      tenantUnavailable: "Service temporarily unavailable for your organization.",
      tenantContactAdmin: "Contact your admin if this persists.",
      demoMode: "Demo mode: data is saved to the test database.",
      demoReset: "Reset demo data",
      demoResetting: "Resetting...",
      demoResetConfirm: "Reset demo data and re-seed sample cases?",
      demoResetSuccess: "Demo data reset.",
      demoResetFailed: "Unable to reset demo data."
    },
    assistant: {
      listening: "Listening...",
      startMic: "Start voice input",
      stopMic: "Stop voice input",
      voiceSupported: "Voice input ready",
      voiceUnsupported: "Voice input not supported"
    },
    hotkeys: {
      global: "Global",
      navigate: "Navigate",
      prev: "Prev",
      next: "Next",
      edit: "Edit",
      save: "Save",
      cancel: "Cancel",
      parse: "Parse",
      views: "Views",
      focus: "Focus",
      blur: "Exit focus"
    },
    theme: {
      switchToDark: "Switch to dark",
      switchToLight: "Switch to light"
    },
    focus: {
      enter: "Enter focus mode",
      exit: "Exit focus mode",
      enterWithHotkey: "Enter focus mode (Shift+F)",
      exitWithHotkey: "Exit focus mode (Shift+F)"
    },
    llm: {
      inputPlaceholder: "Describe changes in natural language...",
      parse: "Parse",
      parsing: "Parsing...",
      parseFailed: "Unable to parse changes",
      clarificationPrefix: "Clarification:",
      clarificationPlaceholder: "Answer the question to clarify...",
      reparse: "Re-parse",
      reparsing: "Re-parsing...",
      reparseFailed: "Unable to re-parse",
      apply: "Apply",
      applying: "Applying...",
      applyFailed: "Unable to apply changes",
      applySingleFailed: "Unable to apply change",
      applyAll: "Apply All",
      proposedChanges: "Proposed changes",
      undo: "Undo",
      undoAvailable: "Undo available for the last apply.",
      undoSuccess: "Changes reverted.",
      undoFailed: "Unable to undo changes.",
      lastApplied: "Last applied changes",
      affectedFields: "Fields: {fields}"
    },
    photos: {
      title: "Step photos",
      subtitle: "Upload photos or sketches for each step.",
      uploading: "Uploading photo...",
      uploadFailed: "Upload failed",
      moving: "Moving photo...",
      moveFailed: "Move failed",
      reordering: "Reordering photos...",
      reorderFailed: "Reorder failed",
      confirmDelete: "Delete \"{name}\"? This removes the file from this step.",
      deleting: "Deleting...",
      deleteFailed: "Delete failed",
      errorLabel: "Photos",
      stepLabel: "Step {index}",
      empty: "No photos yet. Drop a file here or upload one.",
      fileLabel: "File"
    },
    tui: {
      title: "Live workspace",
      statusLabel: "Status",
      status: "Row {row}/{total} · {column}{hazard}",
      ready: "Ready",
      saving: "Saving",
      editing: "Editing",
      refreshing: "Refreshing latest data...",
      refreshFailed: "Refresh failed.",
      loadFailed: "Unable to load case.",
      phasePlaceholderTitle: "Phase UI coming next",
      phasePlaceholderDescription: "This shell is wired to live data; editors are next on the build list.",
      instructions: "Use arrow keys or Enter to edit cells. Esc to stop editing.",
      instructionsShort: "Enter to edit, Esc to stop.",
      empty: "No hazards yet. Add hazards to populate the grid.",
      columns: {
        step: "Step",
        hazard: "Hazard",
        category: "Category",
        baselineSeverity: "Baseline severity",
        baselineLikelihood: "Baseline likelihood",
        residualSeverity: "Residual severity",
        residualLikelihood: "Residual likelihood"
      }
    },
    ra: {
      common: {
        number: "No.",
        seeAll: "See all",
        noDescription: "No description"
      },
      confirmLeaveSteps: "Leave process steps? Unsaved edits will continue to auto-save.",
      confirmAdvanceSteps: "Advance phases? Any step edits still saving will continue in the background.",
      topbar: {
        loadPrompt: "Enter a case ID to load",
        viewGuided: "Guided",
        viewWorkspace: "Workspace",
        viewMatrix: "Matrix",
        viewActions: "Actions",
        viewTui: "TUI"
      },
      stepper: {
        previous: "Previous",
        next: "Next",
        viewing: "Viewing",
        currentPhase: "Current phase",
        advance: "Advance phase"
      },
      workspace: {
        phaseTitle: "Guided workflow",
        tableTitle: "Workspace table",
        tableHeadline: "All hazards in one grid",
        tableDescription: "Edit hazards, ratings, controls, and actions in a single table.",
        matrixTitle: "Risk matrix",
        matrixHeadline: "Matrix view of hazard counts",
        matrixDescription: "Click a cell to see the hazards in that bucket.",
        tuiTitle: "Keyboard grid",
        tuiHeadline: "Terminal-style edit mode",
        tuiDescription: "Fast, keyboard-first edits with inline save states.",
        actionsTitle: "Action plan",
        actionsHeadline: "Track owners and due dates",
        actionsDescription: "Manage action items for every hazard.",
        table: {
          processStep: "Process step",
          category: "Category",
          risk: "Risk",
          severity: "Severity",
          likelihood: "Likelihood",
          residualSeverity: "Residual severity",
          residualLikelihood: "Residual likelihood",
          residualRisk: "Residual risk",
          controls: "Controls",
          actions: "Actions"
        },
        actionAdded: "Action added.",
        actionAddFailed: "Unable to add action.",
        actionUpdated: "Action updated.",
        actionUpdateFailed: "Unable to update action.",
        actionDeleted: "Action deleted.",
        actionDeleteFailed: "Unable to delete action.",
        actionDescriptionPlaceholder: "Action description",
        addAction: "Add action",
        baselineSaved: "Baseline rating saved.",
        baselineSaveFailed: "Unable to save baseline rating.",
        baselineCleared: "Baseline rating cleared.",
        clearingBaseline: "Clearing baseline rating...",
        savingBaseline: "Saving baseline rating...",
        residualSaved: "Residual rating saved.",
        residualSaveFailed: "Unable to save residual rating.",
        residualCleared: "Residual rating cleared.",
        clearingResidual: "Clearing residual rating...",
        savingResidual: "Saving residual rating...",
        categoryUpdated: "Category updated.",
        categoryUpdateFailed: "Unable to update category.",
        controlsUpdated: "Controls updated.",
        controlsUpdateFailed: "Unable to update controls.",
        controlsPlaceholder: "Controls",
        hazardSaved: "Hazard updated.",
        hazardSaveFailed: "Unable to update hazard.",
        hazardLabelPlaceholder: "Hazard label",
        hazardDescriptionPlaceholder: "Describe the hazard",
        proposedAdded: "Proposed control added.",
        proposedAddFailed: "Unable to add proposed control.",
        proposedRemoved: "Proposed control removed.",
        proposedRemoveFailed: "Unable to remove proposed control.",
        proposedPlaceholder: "Proposed control",
        noHazardsForStep: "No hazards for this step yet.",
        noControls: "No controls listed.",
        noDueDate: "No due date",
        unassigned: "Unassigned",
        ownerPlaceholder: "Owner",
        equipmentLabel: "Equipment",
        existingControlsLabel: "Existing controls",
        editExisting: "Edit existing controls"
      },
      steps: {
        assistantTitle: "Draft the process steps with the assistant",
        assistantDescription: "Describe the work and context. The assistant will propose steps, equipment, substances, and notes.",
        assistantPlaceholder: "Describe the work in a few sentences...",
        assistantAction: "Generate steps",
        extracting: "Extracting steps...",
        extracted: "Steps updated.",
        extractFailed: "Unable to extract steps.",
        saving: "Saving steps...",
        saved: "Steps saved.",
        saveFailed: "Unable to save steps.",
        newStep: "Step {index}",
        title: "Process steps",
        subtitle: "Capture activities, equipment, substances, and notes for each step.",
        table: {
          activity: "Activity",
          equipment: "Equipment",
          substances: "Substances",
          notes: "Notes",
          actions: "Actions"
        },
        addStep: "Add step",
        empty: "No steps yet. Add a step to begin.",
        activityPlaceholder: "Describe the activity",
        equipmentPlaceholder: "Equipment or tools",
        substancesPlaceholder: "Substances or materials",
        notesPlaceholder: "Notes or details"
      },
      hazards: {
        assistantTitle: "Draft hazards with the assistant",
        assistantDescription: "Describe the process. The assistant will propose hazards, consequences, and existing controls.",
        assistantPlaceholder: "Paste notes or describe the work...",
        assistantAction: "Generate hazards",
        extracting: "Extracting hazards...",
        extracted: "Hazards updated.",
        extractFailed: "Unable to extract hazards.",
        adding: "Adding hazard...",
        added: "Hazard added.",
        addFailed: "Unable to add hazard.",
        deleting: "Deleting hazard...",
        deleted: "Hazard deleted.",
        deleteFailed: "Unable to delete hazard.",
        confirmDelete: "Delete this hazard?",
        moving: "Moving hazard...",
        moved: "Hazard moved.",
        moveFailed: "Unable to move hazard.",
        moveTitle: "Move hazard",
        movePrompt: "Select the target step.",
        reordering: "Reordering hazards...",
        orderUpdated: "Order updated.",
        reorderFailed: "Unable to reorder hazards.",
        duplicating: "Duplicating hazard...",
        duplicated: "Hazard duplicated.",
        duplicateFailed: "Unable to duplicate hazard.",
        equipmentLabel: "Equipment",
        substancesLabel: "Substances",
        table: {
          processStep: "Process step",
          hazard: "Hazard",
          category: "Category",
          description: "Description",
          existingControls: "Existing controls",
          actions: "Actions"
        },
        form: {
          labelPlaceholder: "Hazard label",
          descriptionPlaceholder: "Describe the hazard",
          addHazard: "Add hazard",
          descriptionHint: "What can go wrong? Include consequences.",
          controlsHint: "List existing controls, one per line."
        },
        empty: "No hazards yet. Add one to start."
      },
      risk: {
        bannerTitle: "Baseline risk assessment",
        bannerBodyPrefix: "Rate each hazard based on",
        bannerBodyEmphasis: "current controls",
        bannerBodySuffix: "and flag anything that needs action.",
        autosaved: "Ratings saved.",
        noHazards: "No hazards to rate yet.",
        table: {
          hazard: "Hazard",
          category: "Category",
          assessment: "Assessment",
          existingControls: "Existing controls"
        },
        selectCategory: "Select category",
        selectOption: "Select...",
        severity: "Severity",
        likelihood: "Likelihood",
        controlsPlaceholder: "Existing controls",
        controlsUpdated: "Controls updated.",
        controlsUpdateFailed: "Unable to update controls.",
        updatingControls: "Updating controls...",
        categoryUpdated: "Category updated.",
        categoryUpdateFailed: "Unable to update category.",
        updatingCategory: "Updating category...",
        savingRating: "Saving rating...",
        saveFailed: "Unable to save rating.",
        ratingCleared: "Rating cleared.",
        clearingRating: "Clearing rating..."
      },
      controls: {
        assistantTitle: "Propose controls with the assistant",
        assistantDescription: "Describe the hazard. The assistant will suggest controls and hierarchy.",
        assistantPlaceholder: "Describe the hazard and context...",
        assistantAction: "Request suggestions",
        requestingSuggestions: "Requesting suggestions...",
        suggestionsRequested: "Suggestions requested.",
        suggestionsFailed: "Unable to get suggestions.",
        noHazards: "No hazards to review.",
        noControls: "No controls yet.",
        nothingToSave: "Nothing to save.",
        pending: "Pending",
        existingLabel: "Existing controls",
        proposedLabel: "Proposed controls",
        proposedPlaceholder: "Add a proposed control",
        baselineLabel: "Baseline risk",
        residualLabel: "Residual risk",
        residualHint: "Rate expected risk after controls.",
        controlsHint: "List one control per line.",
        onePerLine: "One control per line.",
        selectOption: "Select...",
        severity: "Severity",
        likelihood: "Likelihood",
        proposedAdded: "Proposed control added.",
        addFailed: "Unable to add proposed control.",
        addingProposed: "Adding proposed control...",
        removed: "Proposed control removed.",
        removeFailed: "Unable to remove proposed control.",
        removing: "Removing proposed control...",
        confirmRemove: "Remove this proposed control?",
        existingUpdated: "Existing controls updated.",
        existingUpdateFailed: "Unable to update existing controls.",
        updatingExisting: "Updating existing controls...",
        residualUpdated: "Residual rating updated.",
        savingResidual: "Saving residual rating...",
        residualSaved: "Residual rating saved.",
        residualSaveFailed: "Unable to save residual rating.",
        clearingResidual: "Clearing residual rating...",
        residualCleared: "Residual rating cleared.",
        saveResidual: "Save residual rating",
        hierarchySelect: "Select hierarchy",
        hierarchy: {
          technical: "Engineering",
          technicalHint: "Eliminate or isolate with design changes.",
          substitution: "Substitution",
          substitutionHint: "Replace with a safer alternative.",
          organizational: "Administrative",
          organizationalHint: "Procedures, training, or policy.",
          ppe: "PPE",
          ppeHint: "Personal protective equipment."
        },
        table: {
          hazard: "Hazard",
          controls: "Controls",
          residualAssessment: "Residual assessment",
          riskTrend: "Risk trend"
        }
      },
      actions: {
        title: "Action plan",
        assistantTitle: "Draft actions with the assistant",
        assistantDescription: "Describe the hazard. The assistant will suggest actions, owners, and due dates.",
        assistantPlaceholder: "Describe the hazard and what should change...",
        assistantAction: "Generate actions",
        requestingSuggestions: "Requesting suggestions...",
        suggestionsRequested: "Suggestions requested.",
        suggestionsFailed: "Unable to get suggestions.",
        saving: "Saving action...",
        adding: "Adding action...",
        added: "Action added.",
        addFailed: "Unable to add action.",
        updated: "Action updated.",
        updateFailed: "Unable to update action.",
        deleting: "Deleting action...",
        deleted: "Action deleted.",
        deleteFailed: "Unable to delete action.",
        confirmDelete: "Delete this action?",
        reordering: "Reordering actions...",
        reordered: "Actions reordered.",
        reorderFailed: "Unable to reorder actions.",
        noHazards: "No hazards yet.",
        noActions: "No actions yet. Add one below.",
        noActionsForHazard: "No actions for this hazard.",
        addInline: "Add action",
        table: {
          action: "Action",
          owner: "Owner",
          dueDate: "Due date",
          status: "Status",
          hierarchy: "Hierarchy",
          move: "Move",
          remove: "Remove"
        },
        footer: {
          newAction: "New action",
          addAction: "Add action"
        },
        form: {
          actionPlaceholder: "Action",
          descriptionPlaceholder: "Describe the action",
          ownerPlaceholder: "Owner role",
          selectHazard: "Select hazard",
          inlinePlaceholder: "New action"
        },
        status: {
          open: "Open",
          inProgress: "In progress",
          complete: "Complete"
        },
        doneOn: "Done on {date}"
      },
      matrix: {
        current: "Current risk",
        residual: "Residual risk",
        axisHeader: "Severity vs likelihood",
        columnsLabel: "Severity",
        rowsLabel: "Likelihood",
        colorsLabel: "Risk bands",
        customize: "Customize matrix",
        hideSettings: "Hide settings",
        resetDefaults: "Reset defaults",
        labelPlaceholder: "Label",
        columnFallback: "Column",
        rowFallback: "Row"
      },
      caseTable: {
        processStep: "Process step",
        risk: "Risk",
        severity: "Severity",
        likelihood: "Likelihood",
        controls: "Controls",
        monitoring: "Monitoring",
        residualSeverity: "Residual severity",
        residualLikelihood: "Residual likelihood",
        residualRisk: "Residual risk",
        noControls: "No controls listed",
        noHazards: "No hazards recorded",
        noDescription: "No description",
        noDueDate: "No due date",
        unassigned: "Unassigned"
      },
      review: {
        badge: "Living document",
        signoff: {
          title: "Review and share the latest cut",
          body:
            "Use this space to pause, export, and gather signatures. You can always jump back to any phase to keep iterating; cases stay editable forever.",
          action: "Mark this version as shared"
        },
        complete: {
          title: "Living document snapshot",
          body:
            "This workspace treats every case as a living document. Switch phases to edit, then export or duplicate as needed to capture new revisions."
        },
        stats: {
          steps: "Process steps",
          hazards: "Hazards",
          actions: "Actions"
        },
        latest:
          "Latest version captured: {date}. Use the phase chips below to move backwards or forwards; nothing locks when you advance."
      },
      unknownPhase: "Unknown phase: {phase}"
    },
    jha: {
      details: {
        title: "Job details",
        subtitle: "Capture the key details that appear on the JHA summary.",
        save: "Save details",
        errors: {
          jobTitleRequired: "Job title is required."
        },
        status: {
          saving: "Saving details...",
          saved: "Details saved.",
          saveFailed: "Unable to save details"
        },
        fields: {
          jobTitle: "Job title",
          site: "Site",
          supervisor: "Supervisor",
          workers: "Workers involved",
          jobDate: "Job date",
          jobTime: "Job time",
          revision: "Revision",
          preparedBy: "Prepared by",
          reviewedBy: "Reviewed by",
          approvedBy: "Approved by",
          signoffDate: "Sign-off date",
          signoffTime: "Sign-off time"
        }
      },
      assistant: {
        clarificationLabel: "Clarification needed:",
        responsibility: "You remain responsible for the final JHA. Review each suggestion before applying.",
        steps: {
          title: "Update job steps with the assistant",
          description: "Describe new steps or edits. The assistant updates steps without overwriting your table.",
          placeholder: "Insert a step to move the ladder before Step 3.",
          action: "Update steps"
        },
        hazards: {
          title: "Update hazards with the assistant",
          description: "Add or amend hazards for specific steps. Hazards only change when you submit notes.",
          placeholder: "For Step 2: pinch points at the guard rail.",
          action: "Update hazards"
        },
        status: {
          updatingSteps: "Updating steps...",
          updatingHazards: "Updating hazards...",
          updatedSteps: "Steps updated.",
          updatedHazards: "Hazards updated.",
          needsClarification: "Clarification needed.",
          clarificationFallback: "Which step should this change apply to?",
          reviewReady: "{count} changes ready for review.",
          noChanges: "No changes suggested.",
          noSelection: "Select at least one change to apply.",
          applying: "Applying changes...",
          applied: "Changes applied.",
          discarded: "Suggestions discarded.",
          failed: "Unable to update via assistant."
        },
        review: {
          title: "Review suggested changes",
          count: "{count} suggestions",
          apply: "Apply selected",
          discard: "Discard",
          itemFallback: "Suggested change"
        }
      },
      flow: {
        title: "Guided JHA flow",
        subtitle: "Move through steps, hazards, controls, then review the full table.",
        stages: {
          steps: "Steps",
          hazards: "Hazards",
          controls: "Controls",
          review: "Review"
        },
        actions: {
          back: "Back",
          next: "Next",
          saveSteps: "Save steps",
          saveHazards: "Save hazards",
          saveControls: "Save controls",
          saveReview: "Save review"
        },
        errors: {
          stepsIncomplete: "Add and label at least one step before moving on.",
          hazardsIncomplete: "Add at least one hazard before moving on.",
          controlsIncomplete: "Add controls for each hazard before moving on."
        }
      },
      steps: {
        title: "Job steps",
        subtitle: "Name each step so hazards can be tied to it.",
        add: "Add step",
        empty: "No steps yet. Add your first step to start the table.",
        placeholder: "Arrival, setup, work, cleanup",
        confirmRemove: "Remove this step and its hazards?",
        defaultLabel: "Step {index}",
        table: {
          order: "Order",
          label: "Step label",
          actions: "Actions"
        }
      },
      hazards: {
        title: "Hazards",
        subtitle: "Capture each hazard and its consequence.",
        addRow: "Add row",
        addRowAction: "+ Add hazard row",
        saveTable: "Save table",
        empty: "No hazards yet. Add a row or ask the assistant to amend hazards.",
        untitledStep: "Untitled step",
        unassignedStep: "Unassigned step",
        table: {
          step: "Step",
          hazard: "Hazard",
          consequence: "Consequence",
          controls: "Controls",
          actions: "Actions"
        },
        placeholders: {
          hazard: "Site traffic conflict",
          consequence: "Crushing injury",
          controls: "Traffic plan\nBanksman"
        }
      },
      controls: {
        title: "Controls per hazard",
        subtitle: "Capture the controls for each hazard before review.",
        empty: "No hazards available yet. Add hazards first.",
        consequenceLabel: "Consequence",
        none: "No consequence recorded",
        untitled: "Untitled hazard",
        table: {
          step: "Step",
          hazard: "Hazard",
          controls: "Controls"
        },
        placeholders: {
          controls: "Add controls, one per line"
        },
        suggestions: {
          action: "Suggest additional controls",
          hint: "Suggestions use the saved steps + hazards. Review and add the controls you agree with.",
          title: "Suggested controls",
          add: "Add",
          status: {
            thinking: "Generating suggestions...",
            ready: "{count} suggestions ready.",
            empty: "No additional controls suggested.",
            failed: "Unable to suggest controls."
          }
        }
      },
      review: {
        title: "Review and export",
        subtitle: "Review the full JHA table, then export for signatures."
      },
      table: {
        status: {
          saving: "Saving table...",
          saved: "Table saved.",
          saveFailed: "Unable to save table"
        }
      },
      attachments: {
        title: "Attachments",
        subtitle: "Upload photos or sketches to support each step or hazard.",
        errorLabel: "Attachments: {error}",
        confirmDelete: "Delete \"{name}\"? This removes the attachment.",
        status: {
          uploading: "Uploading attachment...",
          uploadFailed: "Upload failed",
          moving: "Moving attachment...",
          moveFailed: "Move failed",
          reordering: "Reordering attachments...",
          reorderFailed: "Reorder failed",
          deleting: "Deleting...",
          deleteFailed: "Delete failed"
        },
        section: {
          steps: "By step",
          hazards: "By hazard"
        },
        stepLabel: "Step {index}: {label}",
        stepHeading: "Step {index}: {label}",
        stepFallback: "Step",
        hazardHeading: "{step} - {hazard}",
        emptyStep: "No attachments yet. Drop a file here or upload one.",
        emptyHazard: "No attachments yet."
      }
    },
    incident: {
      types: {
        nearMiss: "Near miss",
        firstAid: "First aid",
        lostTime: "Lost time",
        propertyDamage: "Property damage"
      },
      flow: {
        title: "Investigation phases",
        subtitle: "Move through facts, causes, and actions with clear checkpoints.",
        stages: {
          facts: "Facts",
          causes: "Causes",
          rootCauses: "Root causes",
          actions: "Actions",
          review: "Review"
        },
        errors: {
          factsIncomplete: "Add at least one timeline entry before moving on.",
          causesIncomplete: "Select at least one proximate cause to continue.",
          rootCausesIncomplete: "Mark at least one root cause to continue.",
          actionsIncomplete: "Add at least one action to continue."
        },
        actions: {
          saveFacts: "Save facts",
          back: "Back",
          next: "Next"
        }
      },
      assistant: {
        title: "Incident assistant",
        subtitle: "Describe the incident in natural language. The assistant drafts facts, timeline events, and clarifications.",
        placeholder: "Describe what happened, who was involved, and what you observed...",
        extract: "Extract draft",
        confirmApply: "Apply the assistant timeline to the case timeline? This will replace current entries.",
        draftUpdated: "Draft updated {date}.",
        draftStatusTitle: "Draft status",
        draftStatusEmpty: "No draft generated yet.",
        draftSummary: "{facts} facts · {timeline} timeline events · {clarifications} clarifications",
        applyHint: "Review the draft and apply when you are ready.",
        status: {
          extracting: "Extracting draft...",
          extracted: "Draft updated.",
          savingDraft: "Saving draft...",
          savedDraft: "Draft saved.",
          applying: "Applying timeline...",
          applied: "Timeline applied.",
          failed: "Unable to extract draft.",
          saveFailed: "Unable to save draft.",
          applyFailed: "Unable to apply timeline."
        },
        actions: {
          saveDraft: "Save draft",
          applyTimeline: "Apply to timeline"
        },
        facts: {
          title: "Draft facts",
          subtitle: "Review the extracted facts before saving.",
          add: "Add fact",
          empty: "No facts extracted yet.",
          placeholder: "Fact statement",
          table: {
            fact: "Fact",
            actions: "Actions"
          }
        },
        timeline: {
          title: "Draft timeline",
          subtitle: "Review and edit the draft timeline before applying.",
          add: "Add event",
          empty: "No timeline events extracted yet.",
          currentTitle: "Current timeline",
          currentSubtitle: "This will be replaced when you apply the draft. {count} entries will be overwritten.",
          currentEmpty: "No timeline entries yet. Applying the draft will create the first entries."
        },
        clarifications: {
          title: "Clarifications",
          subtitle: "Answer the questions to tighten the investigation.",
          empty: "No clarifications needed.",
          placeholder: "Add an answer",
          table: {
            question: "Question",
            answer: "Answer"
          }
        }
      },
      witness: {
        title: "Witness accounts",
        subtitle: "Capture each witness account, then extract facts and a personal timeline.",
        roleLabel: "Role",
        rolePlaceholder: "Supervisor",
        nameLabel: "Name (optional)",
        namePlaceholder: "Jamie Lee",
        otherInfoLabel: "Other info",
        otherInfoPlaceholder: "Shift lead, forklift certified",
        addPerson: "Add person",
        savePerson: "Save person",
        addAccount: "Add account",
        emptyAccount: "No account yet.",
        statementLabel: "Witness statement",
        statementPlaceholder: "What did you see/hear/do?",
        saveStatement: "Save statement",
        extractFacts: "Extract facts",
        factsTitle: "Facts",
        personalTimelineTitle: "Personal timeline",
        status: {
          saving: "Saving account...",
          extracting: "Extracting witness facts..."
        }
      },
      timeline: {
        title: "Timeline",
        subtitle: "Review and edit witness timelines and the merged facts.",
        views: {
          merged: "Merged timeline",
          witness: "Witness {index}"
        },
        merge: "Merge timeline",
        sort: "Sort by time",
        checkConsistency: "Run consistency check",
        status: {
          merging: "Merging timeline...",
          merged: "Timeline merged.",
          mergeFailed: "Unable to merge timeline.",
          saving: "Saving timeline...",
          checking: "Running consistency check...",
          checked: "Consistency check complete.",
          checkFailed: "Consistency check failed."
        },
        table: {
          time: "Time",
          event: "Event",
          confidence: "Confidence",
          sources: "Sources",
          actions: "Actions"
        },
        timePlaceholder: "~10:20",
        eventPlaceholder: "Describe the event",
        addRow: "Add timeline row",
        addPersonal: "Add personal event",
        save: "Save timeline",
        savePersonal: "Save personal timeline",
        consistency: {
          title: "Consistency checks"
        },
        confidence: {
          confirmed: "Confirmed",
          likely: "Likely",
          unclear: "Unclear"
        },
        previewPlaceholder: "Add date and time",
        noWitnessSelected: "Select a witness timeline to review.",
        witnessHeading: "Timeline for {name}",
        witnessFallback: "Witness",
        untimedLabel: "# {index}",
        optionLabel: "{time} {text}"
      },
      coaching: {
        status: {
          generating: "Generating coaching questions...",
          ready: "Coaching questions ready.",
          failed: "Unable to generate coaching questions."
        },
        causes: {
          action: "Generate coaching questions"
        },
        rootCauses: {
          action: "Generate root cause questions"
        },
        actions: {
          action: "Propose actions"
        }
      },
      deviations: {
        title: "Deviations",
        defaultLabel: "Deviation {index}",
        unlinked: "Unlinked",
        table: {
          event: "Linked event",
          expected: "Expected",
          actual: "Actual / change",
          actions: "Actions"
        },
        placeholders: {
          expected: "Expected",
          actual: "Actual / change"
        },
        add: "Add deviation",
        save: "Save deviations"
      },
      causes: {
        title: "Proximate causes",
        subtitle: "Select the facts that directly contributed to the incident.",
        table: {
          event: "Timeline event",
          statement: "Cause statement",
          actions: "Actions"
        },
        placeholders: {
          statement: "Describe the cause"
        },
        select: "Select cause",
        remove: "Remove",
        save: "Save causes",
        status: {
          saving: "Saving causes...",
          saved: "Causes saved."
        },
        proximateLabel: "From timeline #{index} ({time})"
      },
      rootCauses: {
        title: "Root cause analysis",
        subtitle: "Expand proximate causes into deeper causes and mark root causes.",
        markRoot: "Root cause",
        questionLabel: "Guiding question",
        questionPlaceholder: "Add the question you asked",
        addChild: "Add child cause",
        useQuestion: "Use question",
        save: "Save root causes"
      },
      actions: {
        title: "Action plan",
        subtitle: "Add corrective actions tied to each cause.",
        aidNotice: "Suggestions are optional; review before adding.",
        linkedTitle: "Linked actions",
        empty: "No actions linked yet.",
        addSuggested: "Add action",
        selectType: "Select",
        placeholders: {
          action: "Action",
          ownerRole: "Owner role"
        },
        add: "Add action",
        save: "Save actions",
        status: {
          saving: "Saving actions...",
          saved: "Actions saved."
        },
        types: {
          engineering: "Engineering",
          organizational: "Organizational",
          ppe: "PPE",
          training: "Training"
        },
        stopCategories: {
          substitution: "Substitution",
          technical: "Technical",
          organizational: "Organizational",
          ppe: "PPE"
        }
      },
      review: {
        title: "Review and finalize",
        subtitle: "Confirm the timeline, causes, and actions before export.",
        timelineTitle: "Timeline",
        emptyTimeline: "No timeline entries yet.",
        causesTitle: "Causes",
        emptyCauses: "No causes selected yet.",
        actionsTitle: "Actions",
        emptyActions: "No actions yet."
      },
      attachments: {
        title: "Attachments by timeline",
        subtitle: "Upload, reorder, or drag attachments between timeline events.",
        errorLabel: "Attachments: {error}",
        confirmDelete: "Delete \"{name}\"? This removes the attachment.",
        status: {
          uploading: "Uploading attachment...",
          uploadFailed: "Upload failed",
          moving: "Moving attachment...",
          moveFailed: "Move failed",
          reordering: "Reordering attachments...",
          reorderFailed: "Reorder failed",
          deleting: "Deleting...",
          deleteFailed: "Delete failed"
        },
        eventHeading: "Event {index}: {text}",
        empty: "No attachments yet. Drop a file here or upload one."
      }
    },
    shell: {
      missingCaseId: "Missing case id.",
      missingJhaId: "Missing JHA id.",
      missingIncidentId: "Missing incident id.",
      demoHint: "Demo mode only: create a test case to start here.",
      demoCreate: "Create test case",
      demoSeed: "Seed sample case",
      demoCreating: "Creating test case...",
      demoSeeding: "Seeding sample case...",
      demoFailed: "Unable to create demo case."
    },
    admin: {
      title: "Organization provisioning",
      subtitle: "Manage tenants, users, and access for beta testing.",
      platformLabel: "Platform admin",
      organizations: "Organizations",
      selectOrg: "Select org",
      statusLabel: "Status",
      storageRoot: "Storage root",
      dbConnection: "DB connection",
      revokeOrgSessions: "Revoke org sessions",
      provisionOrg: "Provision new org",
      slug: "Slug",
      name: "Name",
      users: "Org users",
      resetPassword: "Reset password",
      unlock: "Unlock",
      revokeSessions: "Revoke sessions",
      createUser: "Create user",
      role: "Role",
      username: "Username",
      loadingOrgs: "Loading organizations...",
      emptyOrgs: "No orgs yet. Create one below.",
      loadingUsers: "Loading users...",
      emptyUsers: "No users yet. Create one below.",
      createOrg: "Create org",
      storageRootLabel: "Storage root (optional)",
      dbConnectionLabel: "DB connection string (optional)",
      userTable: {
        user: "User",
        lockout: "Lockout",
        lastLogin: "Last login",
        actions: "Actions"
      },
      roles: {
        owner: "Owner",
        admin: "Admin",
        member: "Member"
      },
      userStatus: {
        active: "Active",
        locked: "Locked",
        disabled: "Disabled"
      },
      userForm: {
        organization: "Organization",
        selectOrg: "Select org...",
        username: "Username",
        email: "Email",
        password: "Password"
      },
      placeholders: {
        slug: "acme-safety",
        name: "Acme Safety",
        storageRoot: "/var/safetysecretary/acme",
        dbConnection: "postgresql://...",
        username: "j.safety",
        email: "user@company.com"
      },
      prompts: {
        resetPassword: "Enter a new password for {name}.",
        revokeUserSessions: "Revoke all active sessions for {name}?",
        revokeOrgSessions: "Revoke all active sessions for {name}?"
      },
      status: {
        provisioningOrg: "Provisioning org...",
        orgCreated: "Organization created.",
        creatingUser: "Creating user...",
        userCreated: "User created.",
        updatingUser: "Updating user...",
        userUpdated: "User updated.",
        resettingPassword: "Resetting password...",
        passwordReset: "Password reset.",
        unlockingUser: "Unlocking account...",
        userUnlocked: "User unlocked.",
        revokingSessions: "Revoking sessions...",
        sessionsRevoked: "Sessions revoked ({count}).",
        revokingOrgSessions: "Revoking org sessions...",
        orgSessionsRevoked: "Org sessions revoked ({count})."
      },
      errors: {
        loadOrgs: "Unable to load organizations",
        loadUsers: "Unable to load users",
        provisionOrg: "Unable to provision org",
        selectOrg: "Select an organization first.",
        createUser: "Unable to create user",
        updateUser: "Unable to update user",
        resetPassword: "Unable to reset password",
        unlockUser: "Unable to unlock user",
        revokeSessions: "Unable to revoke sessions",
        revokeOrgSessions: "Unable to revoke org sessions"
      },
      bootstrapCreating: "Creating admin...",
      bootstrapFailed: "Unable to create admin",
      bootstrapSuccess: "Admin created.",
      bootstrapTokenPlaceholder: "Paste bootstrap token"
    },
    phases: {
      processDescription: "Process Description",
      processDescriptionDetail: "Describe the work process: activities, equipment, and substances involved.",
      hazardIdentification: "Hazard Identification",
      hazardIdentificationDetail: "Identify hazards for each step, including what can go wrong and existing controls.",
      baselineRisk: "Baseline Risk Assessment",
      baselineRiskDetail: "Rate current risk based on adherence to existing controls.",
      controlsResidual: "Controls & Residual Risk",
      controlsResidualDetail: "Propose additional controls and rate expected risk after they are implemented.",
      actionPlan: "Action Plan",
      actionPlanDetail: "Structure proposed controls into actionable tasks with owners and deadlines.",
      complete: "Complete",
      completeDetail: "Assessment complete. Read-only archive."
    },
    domain: {
      hazardCategories: {
        MECHANICAL: "Mechanical",
        FALLS: "Falls",
        ELECTRICAL: "Electrical",
        HAZARDOUS_SUBSTANCES: "Hazardous Substances",
        FIRE_EXPLOSION: "Fire & Explosion",
        THERMAL: "Thermal",
        PHYSICAL: "Physical",
        ENVIRONMENTAL: "Environmental",
        ERGONOMIC: "Ergonomic",
        PSYCHOLOGICAL: "Psychological",
        CONTROL_FAILURES: "Control Failures",
        POWER_FAILURE: "Power Failure",
        ORGANIZATIONAL: "Organizational"
      },
      severity: {
        A: "A - Catastrophic",
        B: "B - Hazardous",
        C: "C - Major",
        D: "D - Minor",
        E: "E - Negligible"
      },
      likelihood: {
        "1": "1 - Certain to occur",
        "2": "2 - Likely to occur",
        "3": "3 - Possible to occur",
        "4": "4 - Unlikely to occur",
        "5": "5 - Extremely unlikely"
      },
      riskBuckets: {
        negligible: "Negligible Risk",
        minor: "Minor Risk",
        moderate: "Moderate Risk",
        high: "High Risk",
        extreme: "Extreme Risk"
      }
    }
  },
  fr: {
    common: {
      appName: "SafetySecretary",
      back: "Retour",
      cancel: "Annuler",
      add: "Ajouter",
      delete: "Supprimer",
      remove: "Retirer",
      duplicate: "Dupliquer",
      save: "Enregistrer",
      invalidDate: "Entrez une date valide (AAAA-MM-JJ).",
      invalidDateTime: "Entrez une date/heure valide (AAAA-MM-JJTHH:MM).",
      invalidTime: "Entrez une heure valide (HH:MM).",
      dateHint: "Format : AAAA-MM-JJ",
      timeHint: "Format : HH:MM",
      dateTimeHint: "Format : AAAA-MM-JJTHH:MM",
      update: "Mettre a jour",
      loading: "Chargement...",
      clear: "Effacer",
      retry: "Reessayer",
      upload: "Televerser",
      file: "Fichier",
      moveUp: "Monter",
      moveDown: "Descendre",
      signOut: "Se deconnecter",
      signIn: "Se connecter",
      signInAgain: "Se reconnecter",
      continue: "Continuer",
      refresh: "Rafraichir",
      new: "Nouveau",
      load: "Charger",
      exportPdf: "Exporter PDF",
      exportXlsx: "Exporter XLSX",
      exportPreparing: "Preparation de {label}...",
      exportReady: "{label} ouvert dans un nouvel onglet.",
      exportBlocked: "Fenetre bloquee. Autorisez les pop-ups pour telecharger.",
      more: "Plus",
      optionalDetails: "Details optionnels",
      browseCases: "Parcourir les dossiers recents",
      loadById: "Charger par ID",
      searchPlaceholder: "Rechercher par titre, lieu ou date",
      noData: "N/A"
    },
    status: {
      savingChanges: "Enregistrement en cours...",
      saved: "Enregistre.",
      saveFailed: "Echec de l'enregistrement."
    },
    auth: {
      welcomeBack: "Bon retour",
      signInSubtitle: "Connectez-vous a votre espace d'organisation.",
      orgSlug: "Identifiant d'organisation",
      orgSlugPlaceholder: "acme-securite",
      username: "Nom d'utilisateur",
      usernamePlaceholder: "j.securite",
      password: "Mot de passe",
      rememberMe: "Se souvenir de moi pendant 10 jours",
      sessionExpired: "Votre session a expire. Veuillez vous reconnecter.",
      loginFailed: "Connexion impossible. Verifiez vos identifiants.",
      signingIn: "Connexion...",
      remainingAttempts: "{count} tentatives restantes",
      lockedUntil: "Verrouille jusqu'au {date}.",
      contactAdmin: "Contactez l'administrateur de votre organisation pour recuperer l'acces.",
      adminTitle: "Connexion admin",
      adminSubtitle: "Acces administrateur pour le provisionnement et la gestion des utilisateurs.",
      bootstrapTitle: "Initialisation",
      bootstrapToken: "Jeton d'initialisation",
      bootstrapEmail: "Email admin",
      bootstrapUsername: "Nom d'utilisateur admin",
      bootstrapPassword: "Mot de passe admin",
      createAdmin: "Creer admin",
      demoDivider: "Acces demo",
      demoSubtitle: "Accedez a l'espace demo partage avec des exemples.",
      demoLogin: "Connexion test",
      demoSigningIn: "Connexion au demo...",
      demoLoginFailed: "Impossible de demarrer la session demo."
    },
    landing: {
      home: {
        heroTitle: "Choisissez le flux de securite dont vous avez besoin.",
        heroSubtitle: "Demarrez un HIRA, JHA ou une enquete d'incident. Tout reste organise et pret a exporter.",
        tiles: {
          hira: {
            badge: "Identification des dangers et evaluation des risques",
            title: "HIRA",
            description: "Guidez les equipes a travers dangers, notes, controles et actions.",
            bulletOne: "Notes de risque + controles",
            bulletTwo: "Plan d'action",
            bulletThree: "Export PDF + XLSX",
            cta: "Ouvrir HIRA"
          },
          jha: {
            badge: "Analyse JHA",
            title: "JHA",
            description: "Construisez le tableau des dangers etapes par etape.",
            bulletOne: "Etapes, dangers, controles",
            bulletTwo: "Brouillon LLM",
            bulletThree: "Export une page",
            cta: "Ouvrir JHA"
          },
          incident: {
            badge: "Enquete d'incident",
            title: "II",
            description: "Collectez les temoignages et suivez les causes sur une chronologie.",
            bulletOne: "Multi-temoins",
            bulletTwo: "Chronologie + deviations",
            bulletThree: "Resume une page",
            cta: "Ouvrir II"
          }
        }
      },
      hira: {
        hero: {
          title: "Evaluations de risques assistees par IA pour les equipes exigeantes.",
          subtitleDefault: "Creez un nouveau dossier ou chargez un ID existant.",
          subtitleReady: "Pret a ouvrir {id} ?",
          primaryAction: "Demarrer un nouveau dossier",
          secondaryAction: "Charger un dossier"
        },
        load: {
          label: "Travail existant",
          title: "Charger un dossier en cours",
          subtitle: "Collez l'ID RiskAssessmentCase depuis l'API ou l'export PDF.",
          inputLabel: "ID RiskAssessmentCase",
          inputPlaceholder: "ex. 9b03b61e-...",
          action: "Reprendre"
        },
        create: {
          label: "Nouvelle activite",
          title: "Creer une evaluation",
          subtitle: "Decrivez le travail, puis parcourez les phases avec votre equipe.",
          activityLabel: "Nom de l'activite",
          activityPlaceholder: "Inspecter la cuve de melange",
          locationLabel: "Lieu (optionnel)",
          locationPlaceholder: "Mezzanine usine 3",
          teamLabel: "Equipe (optionnel)",
          teamPlaceholder: "Maintenance",
          action: "Creer le dossier",
          creating: "Creation..."
        },
        recent: {
          label: "Ouverts recemment",
          title: "Vos dossiers",
          subtitle: "Reprenez la ou vous vous etes arrete. Les dossiers sont stockes sur le serveur de votre organisation.",
          loading: "Chargement des dossiers...",
          empty: "Aucun dossier. Creez-en un pour l'afficher.",
          updated: "Mis a jour {date}",
          load: "Charger",
          delete: "Supprimer"
        },
        errors: {
          activityRequired: "Nom de l'activite requis",
          missingId: "Entrez un ID de dossier",
          createFailed: "Impossible de creer le dossier",
          loadFailed: "Impossible de charger les dossiers",
          deleteFailed: "Impossible de supprimer le dossier"
        },
        confirmDelete: "Supprimer \"{name}\" ? Cela le supprime definitivement pour votre organisation."
      },
      jha: {
        hero: {
          title: "Analyse JHA dans un format propre et compact.",
          subtitleDefault: "Demarrez une JHA ou chargez-en une existante.",
          subtitleReady: "Pret a ouvrir {id} ?",
          primaryAction: "Demarrer une JHA",
          secondaryAction: "Charger existant"
        },
        load: {
          label: "Travail existant",
          title: "Charger une JHA par ID",
          subtitle: "Collez l'ID JHA depuis l'API ou l'export PDF.",
          inputLabel: "ID JHA",
          inputPlaceholder: "ex. 9b03b61e-...",
          action: "Reprendre"
        },
        create: {
          label: "Nouvelle JHA",
          title: "Creer une fiche JHA",
          subtitle: "Saisissez les details du poste puis construisez le tableau.",
          jobTitleLabel: "Titre du poste",
          jobTitlePlaceholder: "Engins mobiles et circulation",
          siteLabel: "Site",
          sitePlaceholder: "Cour nord",
          supervisorLabel: "Superviseur",
          supervisorPlaceholder: "Chef d'equipe",
          workersLabel: "Travailleurs impliques",
          workersPlaceholder: "Operateur, signaleur",
          jobDateLabel: "Date du travail",
          jobDatePlaceholder: "2025-03-21",
          jobTimeLabel: "Heure du travail",
          jobTimePlaceholder: "08:00",
          revisionLabel: "Revision",
          revisionPlaceholder: "1.0",
          preparedByLabel: "Prepare par",
          preparedByPlaceholder: "Nom",
          reviewedByLabel: "Revise par",
          reviewedByPlaceholder: "Nom",
          approvedByLabel: "Approuve par",
          approvedByPlaceholder: "Nom",
          signoffLabel: "Date de signature",
          signoffPlaceholder: "2025-03-21",
          signoffTimeLabel: "Heure de signature",
          signoffTimePlaceholder: "16:30",
          action: "Creer JHA",
          creating: "Creation..."
        },
        recent: {
          label: "Ouverts recemment",
          title: "Vos JHA",
          subtitle: "Reprenez la ou vous vous etes arrete. Les JHA sont stockees sur le serveur de votre organisation.",
          loading: "Chargement des JHA...",
          empty: "Aucune JHA. Creez-en une pour l'afficher.",
          updated: "Mis a jour {date}",
          load: "Charger"
        },
        errors: {
          jobTitleRequired: "Titre du poste requis",
          missingId: "Entrez un ID JHA",
          createFailed: "Impossible de creer la JHA",
          loadFailed: "Impossible de charger les JHA"
        }
      },
      incident: {
        hero: {
          title: "Enquetes d'incident basees sur des temoignages.",
          subtitleDefault: "Demarrez un incident ou chargez une enquete existante.",
          subtitleReady: "Pret a ouvrir {id} ?",
          primaryAction: "Demarrer un incident",
          secondaryAction: "Charger existant"
        },
        load: {
          label: "Travail existant",
          title: "Charger un incident par ID",
          subtitle: "Collez l'ID IncidentCase depuis l'API ou l'export PDF.",
          inputLabel: "ID IncidentCase",
          inputPlaceholder: "ex. 9b03b61e-...",
          action: "Reprendre"
        },
        create: {
          label: "Nouvel incident",
          title: "Demarrer une enquete",
          subtitle: "Saisissez les bases puis collectez les temoignages.",
          titleLabel: "Titre de l'incident",
          titlePlaceholder: "Presque accident chariot",
          typeLabel: "Type d'incident",
          whenLabel: "Date/heure (approx ok)",
          whenPlaceholder: "2025-03-21T10:15",
          whenNotesLabel: "Notes date/heure",
          whenNotesPlaceholder: "Vers 10h, apres la pause",
          locationLabel: "Lieu",
          locationPlaceholder: "Quai 3",
          coordinatorRoleLabel: "Role du coordinateur",
          coordinatorRolePlaceholder: "Chef d'equipe",
          coordinatorNameLabel: "Nom du coordinateur (optionnel)",
          coordinatorNamePlaceholder: "Jordan Lee",
          action: "Creer incident",
          creating: "Creation..."
        },
        recent: {
          label: "Ouverts recemment",
          title: "Vos incidents",
          subtitle: "Reprenez la ou vous vous etes arrete. Les incidents sont stockes sur le serveur de votre organisation.",
          loading: "Chargement des incidents...",
          empty: "Aucun incident. Creez-en un pour l'afficher.",
          updated: "Mis a jour {date}",
          load: "Charger"
        },
        errors: {
          titleRequired: "Titre requis",
          coordinatorRequired: "Role du coordinateur requis",
          missingId: "Entrez un ID incident",
          createFailed: "Impossible de creer l'incident",
          loadFailed: "Impossible de charger les incidents"
        }
      }
    },
    workspace: {
      hiraWorkspace: "Espace d'evaluation des risques",
      jhaWorkspace: "Analyse de risques (JHA)",
      incidentWorkspace: "Enquete d'incident",
      saving: "Enregistrement en cours...",
      locationPending: "Lieu a definir",
      teamPending: "Equipe a definir",
      sitePending: "Site a definir",
      supervisorPending: "Superviseur a definir"
    },
    navigation: {
      primary: "Navigation principale",
      breadcrumbs: "Fil d'Ariane",
      home: "Accueil",
      hira: "HIRA",
      jha: "JHA",
      incidents: "Incidents"
    },
    menu: {
      signedIn: "Connecte",
      account: "Compte",
      displayName: "Nom affiché",
      email: "Email",
      preferences: "Preferences",
      theme: "Theme",
      apiKey: "Cle API (beta)",
      companyKey: "Cle entreprise",
      subAccounts: "Sous-comptes (beta)",
      needChanges: "Besoin de changements ?",
      managedByAdmin: "Gere par votre admin",
      accountEdits: "Les modifications de compte sont gerees par l'admin pendant la beta.",
      subAccountsHint: "Invitez des collegues pour partager la cle API. Bientot disponible.",
      contactAdmin: "Contactez l'admin pour les roles, blocages ou mises a jour.",
      language: "Langue",
      loadFailed: "Impossible de charger le compte.",
      localeUpdateFailed: "Impossible de mettre a jour la langue."
    },
    banners: {
      sessionExpired: "Session expiree. Veuillez vous reconnecter.",
      tenantUnavailable: "Service indisponible pour votre organisation.",
      tenantContactAdmin: "Contactez votre admin si le probleme persiste.",
      demoMode: "Mode demo : les donnees sont enregistrees dans la base de test.",
      demoReset: "Reinitialiser les donnees demo",
      demoResetting: "Reinitialisation...",
      demoResetConfirm: "Reinitialiser les donnees demo et resemer des exemples ?",
      demoResetSuccess: "Donnees demo reinitialisees.",
      demoResetFailed: "Impossible de reinitialiser les donnees demo."
    },
    assistant: {
      listening: "Ecoute...",
      startMic: "Demarrer la saisie vocale",
      stopMic: "Arreter la saisie vocale",
      voiceSupported: "Saisie vocale disponible",
      voiceUnsupported: "Saisie vocale non prise en charge"
    },
    hotkeys: {
      global: "Global",
      navigate: "Navigation",
      prev: "Precedent",
      next: "Suivant",
      edit: "Edition",
      save: "Enregistrer",
      cancel: "Annuler",
      parse: "Analyser",
      views: "Vues",
      focus: "Focus",
      blur: "Quitter focus"
    },
    theme: {
      switchToDark: "Passer en sombre",
      switchToLight: "Passer en clair"
    },
    focus: {
      enter: "Entrer en mode focus",
      exit: "Sortir du mode focus",
      enterWithHotkey: "Entrer en mode focus (Shift+F)",
      exitWithHotkey: "Sortir du mode focus (Shift+F)"
    },
    llm: {
      inputPlaceholder: "Decrivez les changements en langage naturel...",
      parse: "Analyser",
      parsing: "Analyse...",
      parseFailed: "Impossible d'analyser",
      clarificationPrefix: "Clarification :",
      clarificationPlaceholder: "Repondez pour clarifier...",
      reparse: "Re-analyser",
      reparsing: "Re-analyse...",
      reparseFailed: "Impossible de re-analyser",
      apply: "Appliquer",
      applying: "Application...",
      applyFailed: "Impossible d'appliquer les changements",
      applySingleFailed: "Impossible d'appliquer le changement",
      applyAll: "Appliquer tout",
      proposedChanges: "Changements proposes",
      undo: "Annuler",
      undoAvailable: "Annulation disponible pour la derniere application.",
      undoSuccess: "Modifications annulees.",
      undoFailed: "Impossible d'annuler les modifications.",
      lastApplied: "Dernieres modifications appliquees",
      affectedFields: "Champs : {fields}"
    },
    photos: {
      title: "Photos des etapes",
      subtitle: "Televersez des photos ou croquis pour chaque etape.",
      uploading: "Televersement de la photo...",
      uploadFailed: "Echec du televersement",
      moving: "Deplacement de la photo...",
      moveFailed: "Echec du deplacement",
      reordering: "Reorganisation des photos...",
      reorderFailed: "Echec de reorganisation",
      confirmDelete: "Supprimer \"{name}\" ? Cela retire le fichier de cette etape.",
      deleting: "Suppression...",
      deleteFailed: "Echec de suppression",
      errorLabel: "Photos",
      stepLabel: "Etape {index}",
      empty: "Aucune photo. Deposez un fichier ici ou televersez-en un.",
      fileLabel: "Fichier"
    },
    tui: {
      title: "Espace en direct",
      statusLabel: "Statut",
      status: "Ligne {row}/{total} · {column}{hazard}",
      ready: "Pret",
      saving: "Enregistrement",
      editing: "Edition",
      refreshing: "Actualisation des donnees...",
      refreshFailed: "Echec de l'actualisation.",
      loadFailed: "Impossible de charger le dossier.",
      phasePlaceholderTitle: "Interface de phase bientot disponible",
      phasePlaceholderDescription: "Cette structure est connectee aux donnees; les editeurs arrivent ensuite.",
      instructions: "Utilisez les fleches ou Entree pour modifier. Esc pour arreter.",
      instructionsShort: "Entree pour modifier, Esc pour arreter.",
      empty: "Aucun danger. Ajoutez des dangers pour remplir la grille.",
      columns: {
        step: "Etape",
        hazard: "Danger",
        category: "Categorie",
        baselineSeverity: "Gravite de base",
        baselineLikelihood: "Probabilite de base",
        residualSeverity: "Gravite residuelle",
        residualLikelihood: "Probabilite residuelle"
      }
    },
    ra: {
      common: {
        number: "No.",
        seeAll: "Voir tout",
        noDescription: "Aucune description"
      },
      confirmLeaveSteps: "Quitter les etapes ? Les modifications continueront a s'enregistrer.",
      confirmAdvanceSteps: "Avancer de phase ? Les modifications en cours continueront.",
      topbar: {
        loadPrompt: "Entrez un ID de dossier a charger",
        viewGuided: "Guide",
        viewWorkspace: "Tableau",
        viewMatrix: "Matrice",
        viewActions: "Actions",
        viewTui: "TUI"
      },
      stepper: {
        previous: "Precedent",
        next: "Suivant",
        viewing: "Affichage",
        currentPhase: "Phase actuelle",
        advance: "Avancer la phase"
      },
      workspace: {
        phaseTitle: "Flux guide",
        tableTitle: "Tableau espace",
        tableHeadline: "Tous les dangers dans une grille",
        tableDescription: "Editez dangers, notes, controles et actions dans une seule table.",
        matrixTitle: "Matrice des risques",
        matrixHeadline: "Vue matrice des dangers",
        matrixDescription: "Cliquez une cellule pour voir les dangers.",
        tuiTitle: "Grille clavier",
        tuiHeadline: "Mode edition terminal",
        tuiDescription: "Edition rapide au clavier avec sauvegarde.",
        actionsTitle: "Plan d'action",
        actionsHeadline: "Suivre responsables et echeances",
        actionsDescription: "Gerez les actions pour chaque danger.",
        table: {
          processStep: "Etape du processus",
          category: "Categorie",
          risk: "Risque",
          severity: "Gravite",
          likelihood: "Probabilite",
          residualSeverity: "Gravite residuelle",
          residualLikelihood: "Probabilite residuelle",
          residualRisk: "Risque residuel",
          controls: "Controles",
          actions: "Actions"
        },
        actionAdded: "Action ajoutee.",
        actionAddFailed: "Impossible d'ajouter l'action.",
        actionUpdated: "Action mise a jour.",
        actionUpdateFailed: "Impossible de mettre a jour l'action.",
        actionDeleted: "Action supprimee.",
        actionDeleteFailed: "Impossible de supprimer l'action.",
        actionDescriptionPlaceholder: "Description de l'action",
        addAction: "Ajouter action",
        baselineSaved: "Risque de base enregistre.",
        baselineSaveFailed: "Impossible d'enregistrer le risque de base.",
        baselineCleared: "Risque de base efface.",
        clearingBaseline: "Effacement du risque de base...",
        savingBaseline: "Enregistrement du risque de base...",
        residualSaved: "Risque residuel enregistre.",
        residualSaveFailed: "Impossible d'enregistrer le risque residuel.",
        residualCleared: "Risque residuel efface.",
        clearingResidual: "Effacement du risque residuel...",
        savingResidual: "Enregistrement du risque residuel...",
        categoryUpdated: "Categorie mise a jour.",
        categoryUpdateFailed: "Impossible de mettre a jour la categorie.",
        controlsUpdated: "Controles mis a jour.",
        controlsUpdateFailed: "Impossible de mettre a jour les controles.",
        controlsPlaceholder: "Controles",
        hazardSaved: "Danger mis a jour.",
        hazardSaveFailed: "Impossible de mettre a jour le danger.",
        hazardLabelPlaceholder: "Libelle du danger",
        hazardDescriptionPlaceholder: "Decrire le danger",
        proposedAdded: "Controle propose ajoute.",
        proposedAddFailed: "Impossible d'ajouter le controle propose.",
        proposedRemoved: "Controle propose retire.",
        proposedRemoveFailed: "Impossible de retirer le controle propose.",
        proposedPlaceholder: "Controle propose",
        noHazardsForStep: "Aucun danger pour cette etape.",
        noControls: "Aucun controle liste.",
        noDueDate: "Aucune echeance",
        unassigned: "Non assigne",
        ownerPlaceholder: "Responsable",
        equipmentLabel: "Equipement",
        existingControlsLabel: "Controles existants",
        editExisting: "Modifier les controles existants"
      },
      steps: {
        assistantTitle: "Rediger les etapes avec l'assistant",
        assistantDescription: "Decrivez le travail et le contexte. L'assistant proposera les etapes, equipements, substances et notes.",
        assistantPlaceholder: "Decrivez le travail en quelques phrases...",
        assistantAction: "Generer les etapes",
        extracting: "Extraction des etapes...",
        extracted: "Etapes mises a jour.",
        extractFailed: "Impossible d'extraire les etapes.",
        saving: "Enregistrement des etapes...",
        saved: "Etapes enregistrees.",
        saveFailed: "Impossible d'enregistrer les etapes.",
        newStep: "Etape {index}",
        title: "Etapes du processus",
        subtitle: "Renseignez activites, equipements, substances et notes.",
        table: {
          activity: "Activite",
          equipment: "Equipement",
          substances: "Substances",
          notes: "Notes",
          actions: "Actions"
        },
        addStep: "Ajouter etape",
        empty: "Aucune etape. Ajoutez-en une pour commencer.",
        activityPlaceholder: "Decrire l'activite",
        equipmentPlaceholder: "Equipement ou outils",
        substancesPlaceholder: "Substances ou materiaux",
        notesPlaceholder: "Notes ou details"
      },
      hazards: {
        assistantTitle: "Rediger les dangers avec l'assistant",
        assistantDescription: "Decrivez le processus. L'assistant proposera dangers, consequences et controles existants.",
        assistantPlaceholder: "Collez des notes ou decrivez le travail...",
        assistantAction: "Generer les dangers",
        extracting: "Extraction des dangers...",
        extracted: "Dangers mis a jour.",
        extractFailed: "Impossible d'extraire les dangers.",
        adding: "Ajout du danger...",
        added: "Danger ajoute.",
        addFailed: "Impossible d'ajouter le danger.",
        deleting: "Suppression du danger...",
        deleted: "Danger supprime.",
        deleteFailed: "Impossible de supprimer le danger.",
        confirmDelete: "Supprimer ce danger ?",
        moving: "Deplacement du danger...",
        moved: "Danger deplace.",
        moveFailed: "Impossible de deplacer le danger.",
        moveTitle: "Deplacer le danger",
        movePrompt: "Selectionnez l'etape cible.",
        reordering: "Reorganisation des dangers...",
        orderUpdated: "Ordre mis a jour.",
        reorderFailed: "Impossible de reordonner les dangers.",
        duplicating: "Duplication du danger...",
        duplicated: "Danger duplique.",
        duplicateFailed: "Impossible de dupliquer le danger.",
        equipmentLabel: "Equipement",
        substancesLabel: "Substances",
        table: {
          processStep: "Etape du processus",
          hazard: "Danger",
          category: "Categorie",
          description: "Description",
          existingControls: "Controles existants",
          actions: "Actions"
        },
        form: {
          labelPlaceholder: "Libelle du danger",
          descriptionPlaceholder: "Decrire le danger",
          addHazard: "Ajouter danger",
          descriptionHint: "Que peut-il se passer ? Inclure les consequences.",
          controlsHint: "Lister les controles existants, un par ligne."
        },
        empty: "Aucun danger. Ajoutez-en un pour commencer."
      },
      risk: {
        bannerTitle: "Evaluation du risque de base",
        bannerBodyPrefix: "Evaluez chaque danger selon",
        bannerBodyEmphasis: "les controles actuels",
        bannerBodySuffix: "et signalez ce qui doit etre traite.",
        autosaved: "Notes enregistrees.",
        noHazards: "Aucun danger a evaluer.",
        table: {
          hazard: "Danger",
          category: "Categorie",
          assessment: "Evaluation",
          existingControls: "Controles existants"
        },
        selectCategory: "Choisir categorie",
        selectOption: "Selectionner...",
        severity: "Gravite",
        likelihood: "Probabilite",
        controlsPlaceholder: "Controles existants",
        controlsUpdated: "Controles mis a jour.",
        controlsUpdateFailed: "Impossible de mettre a jour les controles.",
        updatingControls: "Mise a jour des controles...",
        categoryUpdated: "Categorie mise a jour.",
        categoryUpdateFailed: "Impossible de mettre a jour la categorie.",
        updatingCategory: "Mise a jour de la categorie...",
        savingRating: "Enregistrement de la note...",
        saveFailed: "Impossible d'enregistrer la note.",
        ratingCleared: "Note effacee.",
        clearingRating: "Effacement de la note..."
      },
      controls: {
        assistantTitle: "Proposer des controles avec l'assistant",
        assistantDescription: "Decrivez le danger. L'assistant suggerera des controles et une hierarchie.",
        assistantPlaceholder: "Decrivez le danger et le contexte...",
        assistantAction: "Demander des suggestions",
        requestingSuggestions: "Demande de suggestions...",
        suggestionsRequested: "Suggestions demandees.",
        suggestionsFailed: "Impossible d'obtenir des suggestions.",
        noHazards: "Aucun danger a revoir.",
        noControls: "Aucun controle.",
        nothingToSave: "Rien a enregistrer.",
        pending: "En attente",
        existingLabel: "Controles existants",
        proposedLabel: "Controles proposes",
        proposedPlaceholder: "Ajouter un controle propose",
        baselineLabel: "Risque de base",
        residualLabel: "Risque residuel",
        residualHint: "Evaluez le risque apres controles.",
        controlsHint: "Lister un controle par ligne.",
        onePerLine: "Un controle par ligne.",
        selectOption: "Selectionner...",
        severity: "Gravite",
        likelihood: "Probabilite",
        proposedAdded: "Controle propose ajoute.",
        addFailed: "Impossible d'ajouter le controle propose.",
        addingProposed: "Ajout du controle propose...",
        removed: "Controle propose retire.",
        removeFailed: "Impossible de retirer le controle propose.",
        removing: "Suppression du controle propose...",
        confirmRemove: "Retirer ce controle propose ?",
        existingUpdated: "Controles existants mis a jour.",
        existingUpdateFailed: "Impossible de mettre a jour les controles existants.",
        updatingExisting: "Mise a jour des controles existants...",
        residualUpdated: "Risque residuel mis a jour.",
        savingResidual: "Enregistrement du risque residuel...",
        residualSaved: "Risque residuel enregistre.",
        residualSaveFailed: "Impossible d'enregistrer le risque residuel.",
        clearingResidual: "Effacement du risque residuel...",
        residualCleared: "Risque residuel efface.",
        saveResidual: "Enregistrer le risque residuel",
        hierarchySelect: "Choisir une hierarchie",
        hierarchy: {
          technical: "Technique",
          technicalHint: "Eliminer ou isoler par conception.",
          substitution: "Substitution",
          substitutionHint: "Remplacer par une alternative plus sure.",
          organizational: "Organisationnel",
          organizationalHint: "Procedures, formation ou politique.",
          ppe: "EPI",
          ppeHint: "Equipement de protection individuelle."
        },
        table: {
          hazard: "Danger",
          controls: "Controles",
          residualAssessment: "Evaluation residuelle",
          riskTrend: "Evolution du risque"
        }
      },
      actions: {
        title: "Plan d'action",
        assistantTitle: "Rediger des actions avec l'assistant",
        assistantDescription: "Decrivez le danger. L'assistant suggerera actions, responsables et echeances.",
        assistantPlaceholder: "Decrivez le danger et ce qui doit changer...",
        assistantAction: "Generer des actions",
        requestingSuggestions: "Demande de suggestions...",
        suggestionsRequested: "Suggestions demandees.",
        suggestionsFailed: "Impossible d'obtenir des suggestions.",
        saving: "Enregistrement de l'action...",
        adding: "Ajout d'action...",
        added: "Action ajoutee.",
        addFailed: "Impossible d'ajouter l'action.",
        updated: "Action mise a jour.",
        updateFailed: "Impossible de mettre a jour l'action.",
        deleting: "Suppression de l'action...",
        deleted: "Action supprimee.",
        deleteFailed: "Impossible de supprimer l'action.",
        confirmDelete: "Supprimer cette action ?",
        reordering: "Reorganisation des actions...",
        reordered: "Actions reordonnees.",
        reorderFailed: "Impossible de reordonner les actions.",
        noHazards: "Aucun danger.",
        noActions: "Aucune action. Ajoutez-en une ci-dessous.",
        noActionsForHazard: "Aucune action pour ce danger.",
        addInline: "Ajouter action",
        table: {
          action: "Action",
          owner: "Responsable",
          dueDate: "Echeance",
          status: "Statut",
          hierarchy: "Hierarchie",
          move: "Deplacer",
          remove: "Retirer"
        },
        footer: {
          newAction: "Nouvelle action",
          addAction: "Ajouter action"
        },
        form: {
          actionPlaceholder: "Action",
          descriptionPlaceholder: "Decrire l'action",
          ownerPlaceholder: "Role du responsable",
          selectHazard: "Choisir un danger",
          inlinePlaceholder: "Nouvelle action"
        },
        status: {
          open: "Ouverte",
          inProgress: "En cours",
          complete: "Terminee"
        },
        doneOn: "Terminee le {date}"
      },
      matrix: {
        current: "Risque actuel",
        residual: "Risque residuel",
        axisHeader: "Gravite vs probabilite",
        columnsLabel: "Gravite",
        rowsLabel: "Probabilite",
        colorsLabel: "Bandes de risque",
        customize: "Personnaliser la matrice",
        hideSettings: "Masquer les reglages",
        resetDefaults: "Reinitialiser",
        labelPlaceholder: "Libelle",
        columnFallback: "Colonne",
        rowFallback: "Ligne"
      },
      caseTable: {
        processStep: "Etape du processus",
        risk: "Risque",
        severity: "Gravite",
        likelihood: "Probabilite",
        controls: "Controles",
        monitoring: "Suivi",
        residualSeverity: "Gravite residuelle",
        residualLikelihood: "Probabilite residuelle",
        residualRisk: "Risque residuel",
        noControls: "Aucun controle",
        noHazards: "Aucun danger",
        noDescription: "Aucune description",
        noDueDate: "Aucune echeance",
        unassigned: "Non assigne"
      },
      review: {
        badge: "Document vivant",
        signoff: {
          title: "Revoir et partager la derniere version",
          body:
            "Utilisez cet espace pour pause, export et signatures. Vous pouvez revenir a toute phase pour iterer; les dossiers restent modifiables.",
          action: "Marquer cette version comme partagee"
        },
        complete: {
          title: "Instantane du document vivant",
          body:
            "Ce dossier est un document vivant. Changez de phase pour editer, puis exportez ou dupliquez."
        },
        stats: {
          steps: "Etapes",
          hazards: "Dangers",
          actions: "Actions"
        },
        latest:
          "Derniere version capturee : {date}. Utilisez les pastilles de phase pour naviguer; rien ne se verrouille."
      },
      unknownPhase: "Phase inconnue : {phase}"
    },
    jha: {
      details: {
        title: "Details du poste",
        subtitle: "Capturez les details qui apparaissent sur le resume JHA.",
        save: "Enregistrer les details",
        errors: {
          jobTitleRequired: "Titre du poste requis."
        },
        status: {
          saving: "Enregistrement des details...",
          saved: "Details enregistres.",
          saveFailed: "Impossible d'enregistrer les details"
        },
        fields: {
          jobTitle: "Titre du poste",
          site: "Site",
          supervisor: "Superviseur",
          workers: "Travailleurs impliques",
          jobDate: "Date du travail",
          jobTime: "Heure du travail",
          revision: "Revision",
          preparedBy: "Prepare par",
          reviewedBy: "Revise par",
          approvedBy: "Approuve par",
          signoffDate: "Date de signature",
          signoffTime: "Heure de signature"
        }
      },
      assistant: {
        clarificationLabel: "Clarification requise :",
        responsibility: "Vous restez responsable de la JHA finale. Revoyez chaque suggestion avant application.",
        steps: {
          title: "Mettre a jour les etapes avec l'assistant",
          description: "Decrivez les nouvelles etapes ou modifications. L'assistant met a jour sans ecraser le tableau.",
          placeholder: "Inserer une etape pour deplacer l'echelle avant l'etape 3.",
          action: "Mettre a jour les etapes"
        },
        hazards: {
          title: "Mettre a jour les dangers avec l'assistant",
          description: "Ajoutez ou modifiez les dangers par etape. Rien ne change sans votre envoi.",
          placeholder: "Pour l'etape 2 : points de pincement au garde-corps.",
          action: "Mettre a jour les dangers"
        },
        status: {
          updatingSteps: "Mise a jour des etapes...",
          updatingHazards: "Mise a jour des dangers...",
          updatedSteps: "Etapes mises a jour.",
          updatedHazards: "Dangers mis a jour.",
          needsClarification: "Clarification requise.",
          clarificationFallback: "A quelle etape appliquer ce changement ?",
          reviewReady: "{count} changements a revoir.",
          noChanges: "Aucun changement suggere.",
          noSelection: "Selectionnez au moins un changement a appliquer.",
          applying: "Application des changements...",
          applied: "Changements appliques.",
          discarded: "Suggestions ignorees.",
          failed: "Impossible de mettre a jour via l'assistant."
        },
        review: {
          title: "Revoir les changements suggeres",
          count: "{count} suggestions",
          apply: "Appliquer la selection",
          discard: "Ignorer",
          itemFallback: "Changement suggere"
        }
      },
      flow: {
        title: "Flux JHA guide",
        subtitle: "Passez par les etapes, dangers, controles, puis la revue finale.",
        stages: {
          steps: "Etapes",
          hazards: "Dangers",
          controls: "Controles",
          review: "Revue"
        },
        actions: {
          back: "Retour",
          next: "Suivant",
          saveSteps: "Enregistrer les etapes",
          saveHazards: "Enregistrer les dangers",
          saveControls: "Enregistrer les controles",
          saveReview: "Enregistrer la revue"
        },
        errors: {
          stepsIncomplete: "Ajoutez au moins une etape avant de continuer.",
          hazardsIncomplete: "Ajoutez au moins un danger avant de continuer.",
          controlsIncomplete: "Ajoutez des controles pour chaque danger avant de continuer."
        }
      },
      steps: {
        title: "Etapes du poste",
        subtitle: "Nommez chaque etape pour lier les dangers.",
        add: "Ajouter etape",
        empty: "Aucune etape. Ajoutez la premiere pour commencer.",
        placeholder: "Arrivee, installation, travail, nettoyage",
        confirmRemove: "Retirer cette etape et ses dangers ?",
        defaultLabel: "Etape {index}",
        table: {
          order: "Ordre",
          label: "Libelle d'etape",
          actions: "Actions"
        }
      },
      hazards: {
        title: "Dangers",
        subtitle: "Saisissez chaque danger et sa consequence.",
        addRow: "Ajouter ligne",
        addRowAction: "+ Ajouter une ligne de danger",
        saveTable: "Enregistrer le tableau",
        empty: "Aucun danger. Ajoutez une ligne ou demandez a l'assistant.",
        untitledStep: "Etape sans titre",
        unassignedStep: "Etape non assignee",
        table: {
          step: "Etape",
          hazard: "Danger",
          consequence: "Consequence",
          controls: "Controles",
          actions: "Actions"
        },
        placeholders: {
          hazard: "Conflit de circulation",
          consequence: "Blessure par ecrasement",
          controls: "Plan de circulation\nSignaleur"
        }
      },
      controls: {
        title: "Controles par danger",
        subtitle: "Saisissez les controles pour chaque danger avant la revue.",
        empty: "Aucun danger disponible. Ajoutez d'abord des dangers.",
        consequenceLabel: "Consequence",
        none: "Aucune consequence renseignee",
        untitled: "Danger sans titre",
        table: {
          step: "Etape",
          hazard: "Danger",
          controls: "Controles"
        },
        placeholders: {
          controls: "Ajoutez des controles, un par ligne"
        },
        suggestions: {
          action: "Suggérer des controles supplementaires",
          hint: "Les suggestions utilisent les etapes + dangers enregistres. Ajoutez celles que vous validez.",
          title: "Controles suggeres",
          add: "Ajouter",
          status: {
            thinking: "Generation des suggestions...",
            ready: "{count} suggestions pretes.",
            empty: "Aucun controle supplementaire suggere.",
            failed: "Impossible de suggerer des controles."
          }
        }
      },
      review: {
        title: "Revoir et exporter",
        subtitle: "Revoyez le tableau complet avant l'export."
      },
      table: {
        status: {
          saving: "Enregistrement du tableau...",
          saved: "Tableau enregistre.",
          saveFailed: "Impossible d'enregistrer le tableau"
        }
      },
      attachments: {
        title: "Pieces jointes",
        subtitle: "Televersez des photos ou croquis pour chaque etape ou danger.",
        errorLabel: "Pieces jointes : {error}",
        confirmDelete: "Supprimer \"{name}\" ? Cela retire la piece jointe.",
        status: {
          uploading: "Televersement...",
          uploadFailed: "Echec du televersement",
          moving: "Deplacement...",
          moveFailed: "Echec du deplacement",
          reordering: "Reorganisation...",
          reorderFailed: "Echec de reorganisation",
          deleting: "Suppression...",
          deleteFailed: "Echec de suppression"
        },
        section: {
          steps: "Par etape",
          hazards: "Par danger"
        },
        stepLabel: "Etape {index}: {label}",
        stepHeading: "Etape {index}: {label}",
        stepFallback: "Etape",
        hazardHeading: "{step} - {hazard}",
        emptyStep: "Aucune piece jointe. Deposez un fichier ou televersez-en un.",
        emptyHazard: "Aucune piece jointe."
      }
    },
    incident: {
      types: {
        nearMiss: "Presque accident",
        firstAid: "Premiers soins",
        lostTime: "Arret de travail",
        propertyDamage: "Degats materiels"
      },
      flow: {
        title: "Phases d'enquete",
        subtitle: "Passez par faits, causes et actions avec des points de controle.",
        stages: {
          facts: "Faits",
          causes: "Causes",
          rootCauses: "Causes racines",
          actions: "Actions",
          review: "Revue"
        },
        errors: {
          factsIncomplete: "Ajoutez au moins une entree de chronologie avant de continuer.",
          causesIncomplete: "Selectionnez au moins une cause proximale pour continuer.",
          rootCausesIncomplete: "Marquez au moins une cause racine pour continuer.",
          actionsIncomplete: "Ajoutez au moins une action pour continuer."
        },
        actions: {
          saveFacts: "Enregistrer les faits",
          back: "Retour",
          next: "Suivant"
        }
      },
      assistant: {
        title: "Assistant d'incident",
        subtitle: "Decrivez l'incident en langage naturel. L'assistant propose faits, chronologie et clarifications.",
        placeholder: "Decrivez ce qui s'est passe, qui etait implique, et ce que vous avez observe...",
        extract: "Extraire le brouillon",
        confirmApply: "Appliquer la chronologie proposee ? Cela remplacera les entrees actuelles.",
        draftUpdated: "Brouillon mis a jour {date}.",
        draftStatusTitle: "Statut du brouillon",
        draftStatusEmpty: "Aucun brouillon genere pour l'instant.",
        draftSummary: "{facts} faits · {timeline} evenements · {clarifications} clarifications",
        applyHint: "Revoyez le brouillon puis appliquez-le.",
        status: {
          extracting: "Extraction du brouillon...",
          extracted: "Brouillon mis a jour.",
          savingDraft: "Enregistrement du brouillon...",
          savedDraft: "Brouillon enregistre.",
          applying: "Application de la chronologie...",
          applied: "Chronologie appliquee.",
          failed: "Impossible d'extraire le brouillon.",
          saveFailed: "Impossible d'enregistrer le brouillon.",
          applyFailed: "Impossible d'appliquer la chronologie."
        },
        actions: {
          saveDraft: "Enregistrer le brouillon",
          applyTimeline: "Appliquer a la chronologie"
        },
        facts: {
          title: "Faits proposes",
          subtitle: "Revoyez les faits extraits avant d'enregistrer.",
          add: "Ajouter un fait",
          empty: "Aucun fait extrait pour l'instant.",
          placeholder: "Enonce du fait",
          table: {
            fact: "Fait",
            actions: "Actions"
          }
        },
        timeline: {
          title: "Chronologie proposee",
          subtitle: "Revoyez et editez la chronologie avant application.",
          add: "Ajouter un evenement",
          empty: "Aucun evenement extrait pour l'instant.",
          currentTitle: "Chronologie actuelle",
          currentSubtitle:
            "Elle sera remplacee lorsque vous appliquez le brouillon. {count} entrees seront ecrasees.",
          currentEmpty:
            "Aucune entree pour l'instant. L'application du brouillon creera les premieres entrees."
        },
        clarifications: {
          title: "Clarifications",
          subtitle: "Repondez aux questions pour affiner l'enquete.",
          empty: "Aucune clarification necessaire.",
          placeholder: "Ajouter une reponse",
          table: {
            question: "Question",
            answer: "Reponse"
          }
        }
      },
      witness: {
        title: "Temoignages",
        subtitle: "Capturez chaque temoignage, puis extrayez les faits et la chronologie personnelle.",
        roleLabel: "Role",
        rolePlaceholder: "Superviseur",
        nameLabel: "Nom (optionnel)",
        namePlaceholder: "Jamie Lee",
        otherInfoLabel: "Autres infos",
        otherInfoPlaceholder: "Chef d'equipe, chariot elevateur",
        addPerson: "Ajouter personne",
        savePerson: "Enregistrer la personne",
        addAccount: "Ajouter compte",
        emptyAccount: "Aucun compte.",
        statementLabel: "Declaration du temoin",
        statementPlaceholder: "Que s'est-il passe ?",
        saveStatement: "Enregistrer la declaration",
        extractFacts: "Extraire les faits",
        factsTitle: "Faits",
        personalTimelineTitle: "Chronologie personnelle",
        status: {
          saving: "Enregistrement du compte...",
          extracting: "Extraction des faits..."
        }
      },
      timeline: {
        title: "Chronologie",
        subtitle: "Revoyez les chronologies des temoins et la version fusionnee.",
        views: {
          merged: "Chronologie fusionnee",
          witness: "Temoin {index}"
        },
        merge: "Fusionner la chronologie",
        sort: "Trier par heure",
        checkConsistency: "Verifier la coherence",
        status: {
          merging: "Fusion de la chronologie...",
          merged: "Chronologie fusionnee.",
          mergeFailed: "Impossible de fusionner la chronologie.",
          saving: "Enregistrement de la chronologie...",
          checking: "Verification de coherence...",
          checked: "Verification terminee.",
          checkFailed: "Verification echouee."
        },
        table: {
          time: "Heure",
          event: "Evenement",
          confidence: "Confiance",
          sources: "Sources",
          actions: "Actions"
        },
        timePlaceholder: "~10:20",
        eventPlaceholder: "Decrire l'evenement",
        addRow: "Ajouter une ligne",
        addPersonal: "Ajouter evenement personnel",
        save: "Enregistrer la chronologie",
        savePersonal: "Enregistrer chronologie personnelle",
        consistency: {
          title: "Verifications de coherence"
        },
        confidence: {
          confirmed: "Confirme",
          likely: "Probable",
          unclear: "Incertain"
        },
        previewPlaceholder: "Ajouter date et heure",
        noWitnessSelected: "Selectionnez un temoin pour afficher sa chronologie.",
        witnessHeading: "Chronologie de {name}",
        witnessFallback: "Temoin",
        untimedLabel: "# {index}",
        optionLabel: "{time} {text}"
      },
      coaching: {
        status: {
          generating: "Generation des questions...",
          ready: "Questions pretes.",
          failed: "Impossible de generer les questions."
        },
        causes: {
          action: "Generer des questions"
        },
        rootCauses: {
          action: "Generer des questions racines"
        },
        actions: {
          action: "Proposer des actions"
        }
      },
      deviations: {
        title: "Deviations",
        defaultLabel: "Deviation {index}",
        unlinked: "Non lie",
        table: {
          event: "Evenement lie",
          expected: "Attendu",
          actual: "Reel / changement",
          actions: "Actions"
        },
        placeholders: {
          expected: "Attendu",
          actual: "Reel / changement"
        },
        add: "Ajouter deviation",
        save: "Enregistrer deviations"
      },
      causes: {
        title: "Causes proximales",
        subtitle: "Selectionnez les faits qui ont directement conduit a l'incident.",
        table: {
          event: "Evenement de la chronologie",
          statement: "Declaration de cause",
          actions: "Actions"
        },
        placeholders: {
          statement: "Decrire la cause"
        },
        select: "Selectionner",
        remove: "Retirer",
        save: "Enregistrer causes",
        status: {
          saving: "Enregistrement des causes...",
          saved: "Causes enregistrees."
        },
        proximateLabel: "Depuis la chronologie #{index} ({time})"
      },
      rootCauses: {
        title: "Analyse des causes racines",
        subtitle: "Developpez les causes proximales et marquez les causes racines.",
        markRoot: "Cause racine",
        questionLabel: "Question guide",
        questionPlaceholder: "Ajouter la question posee",
        addChild: "Ajouter cause enfant",
        useQuestion: "Utiliser la question",
        save: "Enregistrer causes racines"
      },
      actions: {
        title: "Plan d'action",
        subtitle: "Ajoutez des actions correctives liees aux causes.",
        aidNotice: "Les suggestions sont optionnelles; verifiez avant d'ajouter.",
        linkedTitle: "Actions liees",
        empty: "Aucune action liee.",
        addSuggested: "Ajouter action",
        selectType: "Selectionner",
        placeholders: {
          action: "Action",
          ownerRole: "Role du responsable"
        },
        add: "Ajouter action",
        save: "Enregistrer actions",
        status: {
          saving: "Enregistrement des actions...",
          saved: "Actions enregistrees."
        },
        types: {
          engineering: "Technique",
          organizational: "Organisationnel",
          ppe: "EPI",
          training: "Formation"
        },
        stopCategories: {
          substitution: "Substitution",
          technical: "Technique",
          organizational: "Organisationnel",
          ppe: "EPI"
        }
      },
      review: {
        title: "Revue finale",
        subtitle: "Confirmez chronologie, causes et actions avant export.",
        timelineTitle: "Chronologie",
        emptyTimeline: "Aucune entree de chronologie.",
        causesTitle: "Causes",
        emptyCauses: "Aucune cause selectionnee.",
        actionsTitle: "Actions",
        emptyActions: "Aucune action."
      },
      attachments: {
        title: "Pieces jointes par chronologie",
        subtitle: "Televersez, reordonnez ou glissez les pieces entre evenements.",
        errorLabel: "Pieces jointes : {error}",
        confirmDelete: "Supprimer \"{name}\" ? Cela retire la piece jointe.",
        status: {
          uploading: "Televersement...",
          uploadFailed: "Echec du televersement",
          moving: "Deplacement...",
          moveFailed: "Echec du deplacement",
          reordering: "Reorganisation...",
          reorderFailed: "Echec de reorganisation",
          deleting: "Suppression...",
          deleteFailed: "Echec de suppression"
        },
        eventHeading: "Evenement {index} : {text}",
        empty: "Aucune piece jointe. Deposez un fichier ou televersez-en un."
      }
    },
    shell: {
      missingCaseId: "ID de dossier manquant.",
      missingJhaId: "ID JHA manquant.",
      missingIncidentId: "ID incident manquant.",
      demoHint: "Mode demo : creez un cas de test pour commencer ici.",
      demoCreate: "Creer un cas de test",
      demoSeed: "Charger un exemple",
      demoCreating: "Creation du cas de test...",
      demoSeeding: "Chargement de l'exemple...",
      demoFailed: "Impossible de creer le cas demo."
    },
    admin: {
      title: "Provisionnement des organisations",
      subtitle: "Gerez les tenants, utilisateurs et acces pour la beta.",
      platformLabel: "Admin plateforme",
      organizations: "Organisations",
      selectOrg: "Selectionner une organisation",
      statusLabel: "Statut",
      storageRoot: "Racine de stockage",
      dbConnection: "Connexion DB",
      revokeOrgSessions: "Revoquer les sessions de l'organisation",
      provisionOrg: "Creer une organisation",
      slug: "Slug",
      name: "Nom",
      users: "Utilisateurs",
      resetPassword: "Reinitialiser le mot de passe",
      unlock: "Debloquer",
      revokeSessions: "Revoquer les sessions",
      createUser: "Creer un utilisateur",
      role: "Role",
      username: "Nom d'utilisateur",
      loadingOrgs: "Chargement des organisations...",
      emptyOrgs: "Aucune organisation. Creez-en une ci-dessous.",
      loadingUsers: "Chargement des utilisateurs...",
      emptyUsers: "Aucun utilisateur. Creez-en un ci-dessous.",
      createOrg: "Creer org",
      storageRootLabel: "Racine de stockage (optionnel)",
      dbConnectionLabel: "Chaine de connexion DB (optionnel)",
      userTable: {
        user: "Utilisateur",
        lockout: "Blocage",
        lastLogin: "Derniere connexion",
        actions: "Actions"
      },
      roles: {
        owner: "Proprietaire",
        admin: "Admin",
        member: "Membre"
      },
      userStatus: {
        active: "Actif",
        locked: "Bloque",
        disabled: "Desactive"
      },
      userForm: {
        organization: "Organisation",
        selectOrg: "Selectionner org...",
        username: "Nom d'utilisateur",
        email: "Email",
        password: "Mot de passe"
      },
      placeholders: {
        slug: "acme-securite",
        name: "Acme Securite",
        storageRoot: "/var/safetysecretary/acme",
        dbConnection: "postgresql://...",
        username: "j.securite",
        email: "user@company.com"
      },
      prompts: {
        resetPassword: "Entrez un nouveau mot de passe pour {name}.",
        revokeUserSessions: "Revoquer toutes les sessions actives pour {name} ?",
        revokeOrgSessions: "Revoquer toutes les sessions actives pour {name} ?"
      },
      status: {
        provisioningOrg: "Provisionnement de l'organisation...",
        orgCreated: "Organisation creee.",
        creatingUser: "Creation utilisateur...",
        userCreated: "Utilisateur cree.",
        updatingUser: "Mise a jour utilisateur...",
        userUpdated: "Utilisateur mis a jour.",
        resettingPassword: "Reinitialisation du mot de passe...",
        passwordReset: "Mot de passe reinitialise.",
        unlockingUser: "Deblocage du compte...",
        userUnlocked: "Utilisateur debloque.",
        revokingSessions: "Revocation des sessions...",
        sessionsRevoked: "Sessions revoquees ({count}).",
        revokingOrgSessions: "Revocation des sessions org...",
        orgSessionsRevoked: "Sessions org revoquees ({count})."
      },
      errors: {
        loadOrgs: "Impossible de charger les organisations",
        loadUsers: "Impossible de charger les utilisateurs",
        provisionOrg: "Impossible de provisionner l'organisation",
        selectOrg: "Selectionnez d'abord une organisation.",
        createUser: "Impossible de creer l'utilisateur",
        updateUser: "Impossible de mettre a jour l'utilisateur",
        resetPassword: "Impossible de reinitialiser le mot de passe",
        unlockUser: "Impossible de debloquer l'utilisateur",
        revokeSessions: "Impossible de revoquer les sessions",
        revokeOrgSessions: "Impossible de revoquer les sessions org"
      },
      bootstrapCreating: "Creation admin...",
      bootstrapFailed: "Impossible de creer l'admin",
      bootstrapSuccess: "Admin cree.",
      bootstrapTokenPlaceholder: "Coller le token bootstrap"
    },
    phases: {
      processDescription: "Description du processus",
      processDescriptionDetail: "Decrivez le processus: activites, equipements et substances.",
      hazardIdentification: "Identification des dangers",
      hazardIdentificationDetail: "Identifiez les dangers pour chaque etape, avec controles existants.",
      baselineRisk: "Evaluation du risque de base",
      baselineRiskDetail: "Evaluez le risque actuel selon les controles existants.",
      controlsResidual: "Mesures et risque residuel",
      controlsResidualDetail: "Proposez des controles et evaluez le risque residuel attendu.",
      actionPlan: "Plan d'action",
      actionPlanDetail: "Transformez les controles en actions avec responsables et echeances.",
      complete: "Termine",
      completeDetail: "Evaluation terminee. Archive en lecture seule."
    },
    domain: {
      hazardCategories: {
        MECHANICAL: "Mecanique",
        FALLS: "Chutes",
        ELECTRICAL: "Electrique",
        HAZARDOUS_SUBSTANCES: "Substances dangereuses",
        FIRE_EXPLOSION: "Incendie et explosion",
        THERMAL: "Thermique",
        PHYSICAL: "Physique",
        ENVIRONMENTAL: "Environnemental",
        ERGONOMIC: "Ergonomique",
        PSYCHOLOGICAL: "Psychologique",
        CONTROL_FAILURES: "Defaillances de controle",
        POWER_FAILURE: "Panne d'alimentation",
        ORGANIZATIONAL: "Organisationnel"
      },
      severity: {
        A: "A - Catastrophique",
        B: "B - Dangereux",
        C: "C - Majeur",
        D: "D - Mineur",
        E: "E - Negligeable"
      },
      likelihood: {
        "1": "1 - Certain",
        "2": "2 - Probable",
        "3": "3 - Possible",
        "4": "4 - Peu probable",
        "5": "5 - Tres improbable"
      },
      riskBuckets: {
        negligible: "Risque negligeable",
        minor: "Risque mineur",
        moderate: "Risque modere",
        high: "Risque eleve",
        extreme: "Risque extreme"
      }
    }
  },
  de: {
    common: {
      appName: "SafetySecretary",
      back: "Zuruck",
      cancel: "Abbrechen",
      add: "Hinzufugen",
      delete: "Loschen",
      remove: "Entfernen",
      duplicate: "Duplizieren",
      save: "Speichern",
      invalidDate: "Geben Sie ein gueltiges Datum ein (JJJJ-MM-TT).",
      invalidDateTime: "Geben Sie ein gueltiges Datum/Zeit ein (JJJJ-MM-TTTHH:MM).",
      invalidTime: "Geben Sie eine gueltige Uhrzeit ein (HH:MM).",
      dateHint: "Format: JJJJ-MM-TT",
      timeHint: "Format: HH:MM",
      dateTimeHint: "Format: JJJJ-MM-TTTHH:MM",
      update: "Aktualisieren",
      loading: "Laden...",
      clear: "Leeren",
      retry: "Erneut",
      upload: "Hochladen",
      file: "Datei",
      moveUp: "Hoch",
      moveDown: "Runter",
      signOut: "Abmelden",
      signIn: "Anmelden",
      signInAgain: "Erneut anmelden",
      continue: "Weiter",
      refresh: "Aktualisieren",
      new: "Neu",
      load: "Laden",
      exportPdf: "PDF exportieren",
      exportXlsx: "XLSX exportieren",
      exportPreparing: "{label} wird vorbereitet...",
      exportReady: "{label} im neuen Tab geoffnet.",
      exportBlocked: "Pop-up blockiert. Erlauben Sie Pop-ups zum Download.",
      more: "Mehr",
      optionalDetails: "Optionale Details",
      browseCases: "Zuletzt verwendete Falle durchsuchen",
      loadById: "Nach ID laden",
      searchPlaceholder: "Nach Titel, Ort oder Datum suchen",
      noData: "k.A."
    },
    status: {
      savingChanges: "Speichere Anderungen...",
      saved: "Gespeichert.",
      saveFailed: "Speichern fehlgeschlagen."
    },
    auth: {
      welcomeBack: "Willkommen zuruck",
      signInSubtitle: "Melden Sie sich in Ihrem Organisationsbereich an.",
      orgSlug: "Organisationskennung",
      orgSlugPlaceholder: "acme-sicherheit",
      username: "Benutzername",
      usernamePlaceholder: "j.sicherheit",
      password: "Passwort",
      rememberMe: "10 Tage angemeldet bleiben",
      sessionExpired: "Ihre Sitzung ist abgelaufen. Bitte erneut anmelden.",
      loginFailed: "Anmeldung fehlgeschlagen. Bitte Daten prufen.",
      signingIn: "Anmeldung...",
      remainingAttempts: "{count} Versuche uebrig",
      lockedUntil: "Gesperrt bis {date}.",
      contactAdmin: "Kontaktieren Sie Ihren Organisationsadmin, um den Zugriff wiederherzustellen.",
      adminTitle: "Admin Anmeldung",
      adminSubtitle: "Plattformadmin fur Provisionierung und Benutzerverwaltung.",
      bootstrapTitle: "Erstinitialisierung",
      bootstrapToken: "Bootstrap-Token",
      bootstrapEmail: "Admin E-Mail",
      bootstrapUsername: "Admin Benutzername",
      bootstrapPassword: "Admin Passwort",
      createAdmin: "Admin erstellen",
      demoDivider: "Demo Zugang",
      demoSubtitle: "Oeffnen Sie den gemeinsamen Demo-Arbeitsbereich mit Beispieldaten.",
      demoLogin: "Als Testnutzer anmelden",
      demoSigningIn: "Demo wird gestartet...",
      demoLoginFailed: "Demo-Anmeldung nicht moglich."
    },
    landing: {
      home: {
        heroTitle: "Wahlen Sie den Sicherheitsworkflow, den Sie jetzt benotigen.",
        heroSubtitle: "Starten Sie eine HIRA, JHA oder Incident-Untersuchung. Alles bleibt organisiert und exportbereit.",
        tiles: {
          hira: {
            badge: "Gefahrenidentifikation und Risikobewertung",
            title: "HIRA",
            description: "Fuhren Sie Teams durch Gefahren, Bewertungen, Kontrollen und Aktionen.",
            bulletOne: "Risikobewertung + Kontrollen",
            bulletTwo: "Aktionsplan",
            bulletThree: "PDF + XLSX Export",
            cta: "HIRA offnen"
          },
          jha: {
            badge: "Job-Hazard-Analyse",
            title: "JHA",
            description: "Erstellen Sie die Schritt-fur-Schritt Gefahrentabelle.",
            bulletOne: "Schritte, Gefahren, Kontrollen",
            bulletTwo: "LLM Zeilenentwurf",
            bulletThree: "Ein-Seiten Export",
            cta: "JHA offnen"
          },
          incident: {
            badge: "Incident-Untersuchung",
            title: "II",
            description: "Sammeln Sie Zeugenaussagen und verfolgen Sie Ursachen in einer Timeline.",
            bulletOne: "Mehrere Zeugen",
            bulletTwo: "Timeline + Abweichungen",
            bulletThree: "Ein-Seiten Zusammenfassung",
            cta: "II offnen"
          }
        }
      },
      hira: {
        hero: {
          title: "KI-gestutzte Risikobewertungen fur detailorientierte Teams.",
          subtitleDefault: "Erstellen Sie einen neuen Fall oder laden Sie eine bestehende Fall-ID.",
          subtitleReady: "Bereit zum Offnen {id}?",
          primaryAction: "Neuen Fall starten",
          secondaryAction: "Vorhandenen Fall laden"
        },
        load: {
          label: "Bestehende Arbeit",
          title: "Fall im Fortschritt laden",
          subtitle: "RiskAssessmentCase-ID aus API oder PDF einfugen.",
          inputLabel: "RiskAssessmentCase ID",
          inputPlaceholder: "z.B. 9b03b61e-...",
          action: "Weiterarbeiten"
        },
        create: {
          label: "Neue Aktivitat",
          title: "Neue Bewertung erstellen",
          subtitle: "Beschreiben Sie die Arbeit und gehen Sie die Phasen durch.",
          activityLabel: "Aktivitatsname",
          activityPlaceholder: "Mischbecken inspizieren",
          locationLabel: "Ort (optional)",
          locationPlaceholder: "Werk 3 Zwischenebene",
          teamLabel: "Team (optional)",
          teamPlaceholder: "Instandhaltung",
          action: "Fall erstellen",
          creating: "Erstellen..."
        },
        recent: {
          label: "Zuletzt geoffnet",
          title: "Ihre gespeicherten Falle",
          subtitle: "Weiterarbeiten, wo Sie aufgehort haben. Falle werden auf dem Server Ihrer Organisation gespeichert.",
          loading: "Lade Falle...",
          empty: "Noch keine Falle. Erstellen Sie einen.",
          updated: "Aktualisiert {date}",
          load: "Laden",
          delete: "Loschen"
        },
        errors: {
          activityRequired: "Aktivitatsname erforderlich",
          missingId: "Fall-ID eingeben",
          createFailed: "Fall konnte nicht erstellt werden",
          loadFailed: "Falle konnten nicht geladen werden",
          deleteFailed: "Fall konnte nicht geloscht werden"
        },
        confirmDelete: "\"{name}\" loschen? Dies entfernt ihn dauerhaft fur Ihre Organisation."
      },
      jha: {
        hero: {
          title: "Job-Hazard-Analyse im kompakten Format.",
          subtitleDefault: "Neue JHA starten oder vorhandene laden.",
          subtitleReady: "Bereit zum Offnen {id}?",
          primaryAction: "Neue JHA starten",
          secondaryAction: "Vorhandene laden"
        },
        load: {
          label: "Bestehende Arbeit",
          title: "JHA per ID laden",
          subtitle: "JHA-ID aus API oder PDF einfugen.",
          inputLabel: "JHA ID",
          inputPlaceholder: "z.B. 9b03b61e-...",
          action: "Weiterarbeiten"
        },
        create: {
          label: "Neue JHA",
          title: "JHA Arbeitsblatt erstellen",
          subtitle: "Erfassen Sie Jobdetails und bauen Sie die Tabelle.",
          jobTitleLabel: "Jobtitel",
          jobTitlePlaceholder: "Mobile Anlagen und Verkehr",
          siteLabel: "Standort",
          sitePlaceholder: "Nordhof",
          supervisorLabel: "Supervisor",
          supervisorPlaceholder: "Schichtleiter",
          workersLabel: "Beteiligte",
          workersPlaceholder: "Operator, Einweiser",
          jobDateLabel: "Arbeitsdatum",
          jobDatePlaceholder: "2025-03-21",
          jobTimeLabel: "Arbeitszeit",
          jobTimePlaceholder: "08:00",
          revisionLabel: "Revision",
          revisionPlaceholder: "1.0",
          preparedByLabel: "Erstellt von",
          preparedByPlaceholder: "Name",
          reviewedByLabel: "Gepruft von",
          reviewedByPlaceholder: "Name",
          approvedByLabel: "Freigegeben von",
          approvedByPlaceholder: "Name",
          signoffLabel: "Freigabedatum",
          signoffPlaceholder: "2025-03-21",
          signoffTimeLabel: "Freigabezeit",
          signoffTimePlaceholder: "16:30",
          action: "JHA erstellen",
          creating: "Erstellen..."
        },
        recent: {
          label: "Zuletzt geoffnet",
          title: "Ihre JHA Falle",
          subtitle: "Weiterarbeiten, wo Sie aufgehort haben. JHAs werden auf dem Server Ihrer Organisation gespeichert.",
          loading: "Lade JHAs...",
          empty: "Noch keine JHA. Erstellen Sie eine.",
          updated: "Aktualisiert {date}",
          load: "Laden"
        },
        errors: {
          jobTitleRequired: "Jobtitel erforderlich",
          missingId: "JHA-ID eingeben",
          createFailed: "JHA konnte nicht erstellt werden",
          loadFailed: "JHAs konnten nicht geladen werden"
        }
      },
      incident: {
        hero: {
          title: "Incident-Untersuchungen aus echten Aussagen.",
          subtitleDefault: "Neuen Incident starten oder vorhandene Untersuchung laden.",
          subtitleReady: "Bereit zum Offnen {id}?",
          primaryAction: "Neuen Incident starten",
          secondaryAction: "Vorhandenen laden"
        },
        load: {
          label: "Bestehende Arbeit",
          title: "Incident per ID laden",
          subtitle: "IncidentCase-ID aus API oder PDF einfugen.",
          inputLabel: "IncidentCase ID",
          inputPlaceholder: "z.B. 9b03b61e-...",
          action: "Weiterarbeiten"
        },
        create: {
          label: "Neuer Incident",
          title: "Neue Untersuchung starten",
          subtitle: "Erfassen Sie die Basis und sammeln Sie Aussagen.",
          titleLabel: "Incident Titel",
          titlePlaceholder: "Gabelstapler Beinaheunfall",
          typeLabel: "Incident Typ",
          whenLabel: "Datum/Uhrzeit (ca ok)",
          whenPlaceholder: "2025-03-21T10:15",
          whenNotesLabel: "Zeitnotizen",
          whenNotesPlaceholder: "Ca 10 Uhr, nach Pause",
          locationLabel: "Ort",
          locationPlaceholder: "Halle 3",
          coordinatorRoleLabel: "Koordinator Rolle",
          coordinatorRolePlaceholder: "Schichtleiter",
          coordinatorNameLabel: "Koordinator Name (optional)",
          coordinatorNamePlaceholder: "Jordan Lee",
          action: "Incident erstellen",
          creating: "Erstellen..."
        },
        recent: {
          label: "Zuletzt geoffnet",
          title: "Ihre Incident Falle",
          subtitle: "Weiterarbeiten, wo Sie aufgehort haben. Incidents werden auf dem Server Ihrer Organisation gespeichert.",
          loading: "Lade Incidents...",
          empty: "Noch keine Incidents. Erstellen Sie einen.",
          updated: "Aktualisiert {date}",
          load: "Laden"
        },
        errors: {
          titleRequired: "Titel erforderlich",
          coordinatorRequired: "Koordinator Rolle erforderlich",
          missingId: "Incident-ID eingeben",
          createFailed: "Incident konnte nicht erstellt werden",
          loadFailed: "Incidents konnten nicht geladen werden"
        }
      }
    },
    workspace: {
      hiraWorkspace: "Risikobewertungs-Workspace",
      jhaWorkspace: "Job-Hazard-Analyse",
      incidentWorkspace: "Incident-Untersuchung",
      saving: "Speichere letzte Anderungen...",
      locationPending: "Ort ausstehend",
      teamPending: "Team ausstehend",
      sitePending: "Standort ausstehend",
      supervisorPending: "Supervisor ausstehend"
    },
    navigation: {
      primary: "Hauptnavigation",
      breadcrumbs: "Brotkrumen",
      home: "Startseite",
      hira: "HIRA",
      jha: "JHA",
      incidents: "Incidents"
    },
    menu: {
      signedIn: "Angemeldet",
      account: "Konto",
      displayName: "Anzeigename",
      email: "E-Mail",
      preferences: "Einstellungen",
      theme: "Theme",
      apiKey: "API-Schlussel (Beta)",
      companyKey: "Unternehmensschlussel",
      subAccounts: "Unterkonten (Beta)",
      needChanges: "Anderungen erforderlich?",
      managedByAdmin: "Vom Admin verwaltet",
      accountEdits: "Kontodaten werden in der Beta vom Admin verwaltet.",
      subAccountsHint: "Laden Sie Kolleginnen ein, den API-Schlussel zu teilen. Bald verfugbar.",
      contactAdmin: "Kontaktieren Sie den Admin fur Rollen, Sperren oder Updates.",
      language: "Sprache",
      loadFailed: "Kontodaten konnten nicht geladen werden.",
      localeUpdateFailed: "Sprache konnte nicht aktualisiert werden."
    },
    banners: {
      sessionExpired: "Sitzung abgelaufen. Bitte erneut anmelden.",
      tenantUnavailable: "Dienst fur Ihre Organisation vorubergehend nicht verfugbar.",
      tenantContactAdmin: "Kontaktieren Sie Ihren Admin, falls dies anhaelt.",
      demoMode: "Demo-Modus: Daten werden in der Testdatenbank gespeichert.",
      demoReset: "Demo-Daten zuruecksetzen",
      demoResetting: "Zuruecksetzen...",
      demoResetConfirm: "Demo-Daten zuruecksetzen und Beispiel-Faelle neu anlegen?",
      demoResetSuccess: "Demo-Daten zurueckgesetzt.",
      demoResetFailed: "Demo-Daten konnten nicht zurueckgesetzt werden."
    },
    assistant: {
      listening: "Hoere zu...",
      startMic: "Spracheingabe starten",
      stopMic: "Spracheingabe stoppen",
      voiceSupported: "Spracheingabe bereit",
      voiceUnsupported: "Spracheingabe nicht unterstuetzt"
    },
    hotkeys: {
      global: "Global",
      navigate: "Navigation",
      prev: "Zuruck",
      next: "Weiter",
      edit: "Bearbeiten",
      save: "Speichern",
      cancel: "Abbrechen",
      parse: "Analysieren",
      views: "Ansichten",
      focus: "Fokus",
      blur: "Fokus verlassen"
    },
    theme: {
      switchToDark: "Zu dunkel wechseln",
      switchToLight: "Zu hell wechseln"
    },
    focus: {
      enter: "Fokusmodus aktivieren",
      exit: "Fokusmodus beenden",
      enterWithHotkey: "Fokusmodus aktivieren (Shift+F)",
      exitWithHotkey: "Fokusmodus beenden (Shift+F)"
    },
    llm: {
      inputPlaceholder: "Anderungen in naturlicher Sprache beschreiben...",
      parse: "Analysieren",
      parsing: "Analyse...",
      parseFailed: "Analyse fehlgeschlagen",
      clarificationPrefix: "Klarstellung:",
      clarificationPlaceholder: "Antwort zur Klarstellung eingeben...",
      reparse: "Neu analysieren",
      reparsing: "Neu-Analyse...",
      reparseFailed: "Neu-Analyse fehlgeschlagen",
      apply: "Anwenden",
      applying: "Wird angewendet...",
      applyFailed: "Anderungen konnten nicht angewendet werden",
      applySingleFailed: "Anderung konnte nicht angewendet werden",
      applyAll: "Alles anwenden",
      proposedChanges: "Vorgeschlagene Anderungen",
      undo: "Ruckgangig",
      undoAvailable: "Letzte Anwendung kann ruckgangig gemacht werden.",
      undoSuccess: "Anderungen ruckgangig gemacht.",
      undoFailed: "Anderungen konnten nicht ruckgangig gemacht werden.",
      lastApplied: "Zuletzt angewendet",
      affectedFields: "Felder: {fields}"
    },
    photos: {
      title: "Schrittfotos",
      subtitle: "Fotos oder Skizzen je Schritt hochladen.",
      uploading: "Foto wird hochgeladen...",
      uploadFailed: "Upload fehlgeschlagen",
      moving: "Foto wird verschoben...",
      moveFailed: "Verschieben fehlgeschlagen",
      reordering: "Fotos werden sortiert...",
      reorderFailed: "Sortieren fehlgeschlagen",
      confirmDelete: "\"{name}\" loschen? Dies entfernt die Datei aus diesem Schritt.",
      deleting: "Wird geloscht...",
      deleteFailed: "Loschen fehlgeschlagen",
      errorLabel: "Fotos",
      stepLabel: "Schritt {index}",
      empty: "Noch keine Fotos. Datei hier ablegen oder hochladen.",
      fileLabel: "Datei"
    },
    tui: {
      title: "Live-Workspace",
      statusLabel: "Status",
      status: "Zeile {row}/{total} · {column}{hazard}",
      ready: "Bereit",
      saving: "Speichern",
      editing: "Bearbeiten",
      refreshing: "Daten werden aktualisiert...",
      refreshFailed: "Aktualisierung fehlgeschlagen.",
      loadFailed: "Fall konnte nicht geladen werden.",
      phasePlaceholderTitle: "Phasen-UI folgt als naechstes",
      phasePlaceholderDescription: "Diese Huelle ist mit Daten verbunden; Editoren folgen danach.",
      instructions: "Pfeiltasten oder Enter zum Bearbeiten. Esc zum Beenden.",
      instructionsShort: "Enter bearbeiten, Esc beenden.",
      empty: "Noch keine Gefahren. Fugen Sie Gefahren hinzu.",
      columns: {
        step: "Schritt",
        hazard: "Gefahr",
        category: "Kategorie",
        baselineSeverity: "Basis-Schwere",
        baselineLikelihood: "Basis-Wahrscheinlichkeit",
        residualSeverity: "Rest-Schwere",
        residualLikelihood: "Rest-Wahrscheinlichkeit"
      }
    },
    ra: {
      common: {
        number: "Nr.",
        seeAll: "Alle anzeigen",
        noDescription: "Keine Beschreibung"
      },
      confirmLeaveSteps: "Prozessschritte verlassen? Ungespeicherte Anderungen werden weiter gespeichert.",
      confirmAdvanceSteps: "Phase wechseln? Laufende Speicherung wird fortgesetzt.",
      topbar: {
        loadPrompt: "Fall-ID zum Laden eingeben",
        viewGuided: "Gefuhrt",
        viewWorkspace: "Workspace",
        viewMatrix: "Matrix",
        viewActions: "Aktionen",
        viewTui: "TUI"
      },
      stepper: {
        previous: "Zuruck",
        next: "Weiter",
        viewing: "Ansicht",
        currentPhase: "Aktuelle Phase",
        advance: "Phase vor"
      },
      workspace: {
        phaseTitle: "Gefuhrter Ablauf",
        tableTitle: "Workspace Tabelle",
        tableHeadline: "Alle Gefahren in einer Tabelle",
        tableDescription: "Gefahren, Bewertungen, Kontrollen und Aktionen in einer Tabelle bearbeiten.",
        matrixTitle: "Risikomatrix",
        matrixHeadline: "Matrixansicht der Gefahren",
        matrixDescription: "Zelle anklicken, um Gefahren zu sehen.",
        tuiTitle: "Tastatur-Grid",
        tuiHeadline: "Terminal-Editiermodus",
        tuiDescription: "Schnelle Tastatureingabe mit Status.",
        actionsTitle: "Aktionsplan",
        actionsHeadline: "Eigentumer und Termine verfolgen",
        actionsDescription: "Aktionen pro Gefahr verwalten.",
        table: {
          processStep: "Prozessschritt",
          category: "Kategorie",
          risk: "Risiko",
          severity: "Schwere",
          likelihood: "Wahrscheinlichkeit",
          residualSeverity: "Rest-Schwere",
          residualLikelihood: "Rest-Wahrscheinlichkeit",
          residualRisk: "Rest-Risiko",
          controls: "Kontrollen",
          actions: "Aktionen"
        },
        actionAdded: "Aktion hinzugefugt.",
        actionAddFailed: "Aktion konnte nicht hinzugefugt werden.",
        actionUpdated: "Aktion aktualisiert.",
        actionUpdateFailed: "Aktion konnte nicht aktualisiert werden.",
        actionDeleted: "Aktion geloscht.",
        actionDeleteFailed: "Aktion konnte nicht geloscht werden.",
        actionDescriptionPlaceholder: "Aktionsbeschreibung",
        addAction: "Aktion hinzufugen",
        baselineSaved: "Basisbewertung gespeichert.",
        baselineSaveFailed: "Basisbewertung konnte nicht gespeichert werden.",
        baselineCleared: "Basisbewertung entfernt.",
        clearingBaseline: "Basisbewertung wird entfernt...",
        savingBaseline: "Basisbewertung wird gespeichert...",
        residualSaved: "Restbewertung gespeichert.",
        residualSaveFailed: "Restbewertung konnte nicht gespeichert werden.",
        residualCleared: "Restbewertung entfernt.",
        clearingResidual: "Restbewertung wird entfernt...",
        savingResidual: "Restbewertung wird gespeichert...",
        categoryUpdated: "Kategorie aktualisiert.",
        categoryUpdateFailed: "Kategorie konnte nicht aktualisiert werden.",
        controlsUpdated: "Kontrollen aktualisiert.",
        controlsUpdateFailed: "Kontrollen konnten nicht aktualisiert werden.",
        controlsPlaceholder: "Kontrollen",
        hazardSaved: "Gefahr aktualisiert.",
        hazardSaveFailed: "Gefahr konnte nicht aktualisiert werden.",
        hazardLabelPlaceholder: "Gefahrenname",
        hazardDescriptionPlaceholder: "Gefahr beschreiben",
        proposedAdded: "Vorgeschlagene Kontrolle hinzugefugt.",
        proposedAddFailed: "Vorgeschlagene Kontrolle konnte nicht hinzugefugt werden.",
        proposedRemoved: "Vorgeschlagene Kontrolle entfernt.",
        proposedRemoveFailed: "Vorgeschlagene Kontrolle konnte nicht entfernt werden.",
        proposedPlaceholder: "Vorgeschlagene Kontrolle",
        noHazardsForStep: "Keine Gefahren fur diesen Schritt.",
        noControls: "Keine Kontrollen.",
        noDueDate: "Kein Termin",
        unassigned: "Nicht zugewiesen",
        ownerPlaceholder: "Verantwortlich",
        equipmentLabel: "Ausrustung",
        existingControlsLabel: "Bestehende Kontrollen",
        editExisting: "Bestehende Kontrollen bearbeiten"
      },
      steps: {
        assistantTitle: "Prozessschritte mit Assistent",
        assistantDescription: "Arbeit und Kontext beschreiben. Assistent schlagt Schritte, Ausrustung, Stoffe und Notizen vor.",
        assistantPlaceholder: "Arbeit in ein paar Satzen beschreiben...",
        assistantAction: "Schritte generieren",
        extracting: "Schritte werden extrahiert...",
        extracted: "Schritte aktualisiert.",
        extractFailed: "Schritte konnten nicht extrahiert werden.",
        saving: "Schritte werden gespeichert...",
        saved: "Schritte gespeichert.",
        saveFailed: "Schritte konnten nicht gespeichert werden.",
        newStep: "Schritt {index}",
        title: "Prozessschritte",
        subtitle: "Aktivitaten, Ausrustung, Stoffe und Notizen erfassen.",
        table: {
          activity: "Aktivitat",
          equipment: "Ausrustung",
          substances: "Stoffe",
          notes: "Notizen",
          actions: "Aktionen"
        },
        addStep: "Schritt hinzufugen",
        empty: "Noch keine Schritte. Fugen Sie einen hinzu.",
        activityPlaceholder: "Aktivitat beschreiben",
        equipmentPlaceholder: "Ausrustung oder Werkzeuge",
        substancesPlaceholder: "Stoffe oder Materialien",
        notesPlaceholder: "Notizen oder Details"
      },
      hazards: {
        assistantTitle: "Gefahren mit Assistent",
        assistantDescription: "Prozess beschreiben. Assistent schlagt Gefahren, Konsequenzen und Kontrollen vor.",
        assistantPlaceholder: "Notizen einfugen oder Arbeit beschreiben...",
        assistantAction: "Gefahren generieren",
        extracting: "Gefahren werden extrahiert...",
        extracted: "Gefahren aktualisiert.",
        extractFailed: "Gefahren konnten nicht extrahiert werden.",
        adding: "Gefahr wird hinzugefugt...",
        added: "Gefahr hinzugefugt.",
        addFailed: "Gefahr konnte nicht hinzugefugt werden.",
        deleting: "Gefahr wird geloscht...",
        deleted: "Gefahr geloscht.",
        deleteFailed: "Gefahr konnte nicht geloscht werden.",
        confirmDelete: "Diese Gefahr loschen?",
        moving: "Gefahr wird verschoben...",
        moved: "Gefahr verschoben.",
        moveFailed: "Gefahr konnte nicht verschoben werden.",
        moveTitle: "Gefahr verschieben",
        movePrompt: "Zielschritt auswahlen.",
        reordering: "Gefahren werden sortiert...",
        orderUpdated: "Reihenfolge aktualisiert.",
        reorderFailed: "Reihenfolge konnte nicht aktualisiert werden.",
        duplicating: "Gefahr wird dupliziert...",
        duplicated: "Gefahr dupliziert.",
        duplicateFailed: "Gefahr konnte nicht dupliziert werden.",
        equipmentLabel: "Ausrustung",
        substancesLabel: "Stoffe",
        table: {
          processStep: "Prozessschritt",
          hazard: "Gefahr",
          category: "Kategorie",
          description: "Beschreibung",
          existingControls: "Bestehende Kontrollen",
          actions: "Aktionen"
        },
        form: {
          labelPlaceholder: "Gefahrentitel",
          descriptionPlaceholder: "Gefahr beschreiben",
          addHazard: "Gefahr hinzufugen",
          descriptionHint: "Was kann schiefgehen? Konsequenzen angeben.",
          controlsHint: "Bestehende Kontrollen, eine pro Zeile."
        },
        empty: "Noch keine Gefahren. Fugen Sie eine hinzu."
      },
      risk: {
        bannerTitle: "Basisrisikobewertung",
        bannerBodyPrefix: "Bewerten Sie jede Gefahr anhand",
        bannerBodyEmphasis: "aktueller Kontrollen",
        bannerBodySuffix: "und markieren Sie Handlungsbedarf.",
        autosaved: "Bewertungen gespeichert.",
        noHazards: "Keine Gefahren zu bewerten.",
        table: {
          hazard: "Gefahr",
          category: "Kategorie",
          assessment: "Bewertung",
          existingControls: "Bestehende Kontrollen"
        },
        selectCategory: "Kategorie wahlen",
        selectOption: "Auswahlen...",
        severity: "Schwere",
        likelihood: "Wahrscheinlichkeit",
        controlsPlaceholder: "Bestehende Kontrollen",
        controlsUpdated: "Kontrollen aktualisiert.",
        controlsUpdateFailed: "Kontrollen konnten nicht aktualisiert werden.",
        updatingControls: "Kontrollen werden aktualisiert...",
        categoryUpdated: "Kategorie aktualisiert.",
        categoryUpdateFailed: "Kategorie konnte nicht aktualisiert werden.",
        updatingCategory: "Kategorie wird aktualisiert...",
        savingRating: "Bewertung wird gespeichert...",
        saveFailed: "Bewertung konnte nicht gespeichert werden.",
        ratingCleared: "Bewertung entfernt.",
        clearingRating: "Bewertung wird entfernt..."
      },
      controls: {
        assistantTitle: "Kontrollen mit Assistent",
        assistantDescription: "Gefahr beschreiben. Assistent schlagt Kontrollen und Hierarchie vor.",
        assistantPlaceholder: "Gefahr und Kontext beschreiben...",
        assistantAction: "Vorschlage anfordern",
        requestingSuggestions: "Vorschlage werden angefordert...",
        suggestionsRequested: "Vorschlage angefordert.",
        suggestionsFailed: "Vorschlage konnten nicht geladen werden.",
        noHazards: "Keine Gefahren vorhanden.",
        noControls: "Keine Kontrollen.",
        nothingToSave: "Nichts zu speichern.",
        pending: "Ausstehend",
        existingLabel: "Bestehende Kontrollen",
        proposedLabel: "Vorgeschlagene Kontrollen",
        proposedPlaceholder: "Vorgeschlagene Kontrolle hinzufugen",
        baselineLabel: "Basisrisiko",
        residualLabel: "Rest-Risiko",
        residualHint: "Erwartetes Risiko nach Kontrollen bewerten.",
        controlsHint: "Eine Kontrolle pro Zeile.",
        onePerLine: "Eine Kontrolle pro Zeile.",
        selectOption: "Auswahlen...",
        severity: "Schwere",
        likelihood: "Wahrscheinlichkeit",
        proposedAdded: "Vorgeschlagene Kontrolle hinzugefugt.",
        addFailed: "Vorgeschlagene Kontrolle konnte nicht hinzugefugt werden.",
        addingProposed: "Vorgeschlagene Kontrolle wird hinzugefugt...",
        removed: "Vorgeschlagene Kontrolle entfernt.",
        removeFailed: "Vorgeschlagene Kontrolle konnte nicht entfernt werden.",
        removing: "Vorgeschlagene Kontrolle wird entfernt...",
        confirmRemove: "Vorgeschlagene Kontrolle entfernen?",
        existingUpdated: "Bestehende Kontrollen aktualisiert.",
        existingUpdateFailed: "Bestehende Kontrollen konnten nicht aktualisiert werden.",
        updatingExisting: "Bestehende Kontrollen werden aktualisiert...",
        residualUpdated: "Restbewertung aktualisiert.",
        savingResidual: "Restbewertung wird gespeichert...",
        residualSaved: "Restbewertung gespeichert.",
        residualSaveFailed: "Restbewertung konnte nicht gespeichert werden.",
        clearingResidual: "Restbewertung wird entfernt...",
        residualCleared: "Restbewertung entfernt.",
        saveResidual: "Restbewertung speichern",
        hierarchySelect: "Hierarchie wahlen",
        hierarchy: {
          technical: "Technisch",
          technicalHint: "Durch Design eliminieren oder isolieren.",
          substitution: "Substitution",
          substitutionHint: "Durch sicherere Alternative ersetzen.",
          organizational: "Organisatorisch",
          organizationalHint: "Prozesse, Training oder Richtlinien.",
          ppe: "PSA",
          ppeHint: "Personliche Schutzausrustung."
        },
        table: {
          hazard: "Gefahr",
          controls: "Kontrollen",
          residualAssessment: "Restbewertung",
          riskTrend: "Risikotrend"
        }
      },
      actions: {
        title: "Aktionsplan",
        assistantTitle: "Aktionen mit Assistent",
        assistantDescription: "Gefahr beschreiben. Assistent schlagt Aktionen, Verantwortliche und Termine vor.",
        assistantPlaceholder: "Gefahr und erforderliche Anderungen beschreiben...",
        assistantAction: "Aktionen generieren",
        requestingSuggestions: "Vorschlage werden angefordert...",
        suggestionsRequested: "Vorschlage angefordert.",
        suggestionsFailed: "Vorschlage konnten nicht geladen werden.",
        saving: "Aktion wird gespeichert...",
        adding: "Aktion wird hinzugefugt...",
        added: "Aktion hinzugefugt.",
        addFailed: "Aktion konnte nicht hinzugefugt werden.",
        updated: "Aktion aktualisiert.",
        updateFailed: "Aktion konnte nicht aktualisiert werden.",
        deleting: "Aktion wird geloscht...",
        deleted: "Aktion geloscht.",
        deleteFailed: "Aktion konnte nicht geloscht werden.",
        confirmDelete: "Diese Aktion loschen?",
        reordering: "Aktionen werden sortiert...",
        reordered: "Aktionen sortiert.",
        reorderFailed: "Aktionen konnten nicht sortiert werden.",
        noHazards: "Keine Gefahren.",
        noActions: "Keine Aktionen. Fugen Sie eine hinzu.",
        noActionsForHazard: "Keine Aktionen fur diese Gefahr.",
        addInline: "Aktion hinzufugen",
        table: {
          action: "Aktion",
          owner: "Verantwortlich",
          dueDate: "Termin",
          status: "Status",
          hierarchy: "Hierarchie",
          move: "Verschieben",
          remove: "Entfernen"
        },
        footer: {
          newAction: "Neue Aktion",
          addAction: "Aktion hinzufugen"
        },
        form: {
          actionPlaceholder: "Aktion",
          descriptionPlaceholder: "Aktion beschreiben",
          ownerPlaceholder: "Verantwortliche Rolle",
          selectHazard: "Gefahr auswahlen",
          inlinePlaceholder: "Neue Aktion"
        },
        status: {
          open: "Offen",
          inProgress: "In Arbeit",
          complete: "Abgeschlossen"
        },
        doneOn: "Erledigt am {date}"
      },
      matrix: {
        current: "Aktuelles Risiko",
        residual: "Rest-Risiko",
        axisHeader: "Schwere vs Wahrscheinlichkeit",
        columnsLabel: "Schwere",
        rowsLabel: "Wahrscheinlichkeit",
        colorsLabel: "Risikobander",
        customize: "Matrix anpassen",
        hideSettings: "Einstellungen ausblenden",
        resetDefaults: "Standard wiederherstellen",
        labelPlaceholder: "Label",
        columnFallback: "Spalte",
        rowFallback: "Zeile"
      },
      caseTable: {
        processStep: "Prozessschritt",
        risk: "Risiko",
        severity: "Schwere",
        likelihood: "Wahrscheinlichkeit",
        controls: "Kontrollen",
        monitoring: "Monitoring",
        residualSeverity: "Rest-Schwere",
        residualLikelihood: "Rest-Wahrscheinlichkeit",
        residualRisk: "Rest-Risiko",
        noControls: "Keine Kontrollen",
        noHazards: "Keine Gefahren",
        noDescription: "Keine Beschreibung",
        noDueDate: "Kein Termin",
        unassigned: "Nicht zugewiesen"
      },
      review: {
        badge: "Lebendes Dokument",
        signoff: {
          title: "Letzte Version prufen und teilen",
          body:
            "Nutzen Sie diesen Bereich fur Pause, Export und Unterschriften. Sie konnen jederzeit zur Phase zuruckkehren; Falle bleiben editierbar.",
          action: "Diese Version als geteilt markieren"
        },
        complete: {
          title: "Snapshot des lebenden Dokuments",
          body:
            "Dieser Workspace behandelt jeden Fall als lebendes Dokument. Phasen wechseln, dann exportieren oder duplizieren."
        },
        stats: {
          steps: "Prozessschritte",
          hazards: "Gefahren",
          actions: "Aktionen"
        },
        latest:
          "Letzte Version: {date}. Verwenden Sie die Phasen-Chips zum Navigieren; nichts wird gesperrt."
      },
      unknownPhase: "Unbekannte Phase: {phase}"
    },
    jha: {
      details: {
        title: "Jobdetails",
        subtitle: "Erfassen Sie die Details fur die JHA-Zusammenfassung.",
        save: "Details speichern",
        errors: {
          jobTitleRequired: "Jobtitel erforderlich."
        },
        status: {
          saving: "Details werden gespeichert...",
          saved: "Details gespeichert.",
          saveFailed: "Details konnten nicht gespeichert werden"
        },
        fields: {
          jobTitle: "Jobtitel",
          site: "Standort",
          supervisor: "Supervisor",
          workers: "Beteiligte",
          jobDate: "Arbeitsdatum",
          jobTime: "Arbeitszeit",
          revision: "Revision",
          preparedBy: "Erstellt von",
          reviewedBy: "Gepruft von",
          approvedBy: "Freigegeben von",
          signoffDate: "Freigabedatum",
          signoffTime: "Freigabezeit"
        }
      },
      assistant: {
        clarificationLabel: "Klarstellung erforderlich:",
        responsibility: "Sie bleiben fur die finale JHA verantwortlich. Bitte jede Empfehlung prufen.",
        steps: {
          title: "Jobschritte mit Assistent aktualisieren",
          description: "Neue Schritte oder Anpassungen beschreiben. Der Assistent aktualisiert ohne zu uberschreiben.",
          placeholder: "Einen Schritt einfugen, um die Leiter vor Schritt 3 zu bewegen.",
          action: "Schritte aktualisieren"
        },
        hazards: {
          title: "Gefahren mit Assistent aktualisieren",
          description: "Gefahren pro Schritt erganzen oder andern. Nichts andert sich ohne Ihre Eingabe.",
          placeholder: "Fur Schritt 2: Quetschstellen am Gelander.",
          action: "Gefahren aktualisieren"
        },
        status: {
          updatingSteps: "Schritte werden aktualisiert...",
          updatingHazards: "Gefahren werden aktualisiert...",
          updatedSteps: "Schritte aktualisiert.",
          updatedHazards: "Gefahren aktualisiert.",
          needsClarification: "Klarstellung erforderlich.",
          clarificationFallback: "Auf welchen Schritt soll die Anderung angewendet werden?",
          reviewReady: "{count} Anderungen zur Prufung bereit.",
          noChanges: "Keine Anderungen vorgeschlagen.",
          noSelection: "Bitte mindestens eine Anderung auswahlen.",
          applying: "Anderungen werden angewendet...",
          applied: "Anderungen angewendet.",
          discarded: "Vorschlage verworfen.",
          failed: "Aktualisierung per Assistent fehlgeschlagen."
        },
        review: {
          title: "Vorschlage prufen",
          count: "{count} Vorschlage",
          apply: "Auswahl anwenden",
          discard: "Verwerfen",
          itemFallback: "Vorgeschlagene Anderung"
        }
      },
      flow: {
        title: "Gefuhrter JHA-Ablauf",
        subtitle: "Durch Schritte, Gefahren, Kontrollen und Review arbeiten.",
        stages: {
          steps: "Schritte",
          hazards: "Gefahren",
          controls: "Kontrollen",
          review: "Review"
        },
        actions: {
          back: "Zuruck",
          next: "Weiter",
          saveSteps: "Schritte speichern",
          saveHazards: "Gefahren speichern",
          saveControls: "Kontrollen speichern",
          saveReview: "Review speichern"
        },
        errors: {
          stepsIncomplete: "Fugen Sie mindestens einen Schritt hinzu, bevor Sie fortfahren.",
          hazardsIncomplete: "Fugen Sie mindestens eine Gefahr hinzu, bevor Sie fortfahren.",
          controlsIncomplete: "Fugen Sie Kontrollen fur jede Gefahr hinzu, bevor Sie fortfahren."
        }
      },
      steps: {
        title: "Jobschritte",
        subtitle: "Schritte benennen, damit Gefahren zugeordnet werden.",
        add: "Schritt hinzufugen",
        empty: "Noch keine Schritte. Fugen Sie den ersten hinzu.",
        placeholder: "Ankunft, Aufbau, Arbeit, Abschluss",
        confirmRemove: "Diesen Schritt und seine Gefahren entfernen?",
        defaultLabel: "Schritt {index}",
        table: {
          order: "Reihenfolge",
          label: "Schrittbezeichnung",
          actions: "Aktionen"
        }
      },
      hazards: {
        title: "Gefahren",
        subtitle: "Erfassen Sie jede Gefahr und ihre Konsequenz.",
        addRow: "Zeile hinzufugen",
        addRowAction: "+ Gefahrenzeile hinzufugen",
        saveTable: "Tabelle speichern",
        empty: "Noch keine Gefahren. Zeile hinzufugen oder den Assistenten fragen.",
        untitledStep: "Unbenannter Schritt",
        unassignedStep: "Nicht zugewiesener Schritt",
        table: {
          step: "Schritt",
          hazard: "Gefahr",
          consequence: "Konsequenz",
          controls: "Kontrollen",
          actions: "Aktionen"
        },
        placeholders: {
          hazard: "Verkehrskonflikt",
          consequence: "Quetschverletzung",
          controls: "Verkehrsplan\nEinweiser"
        }
      },
      controls: {
        title: "Kontrollen pro Gefahr",
        subtitle: "Erfassen Sie die Kontrollen fur jede Gefahr vor dem Review.",
        empty: "Noch keine Gefahren vorhanden. Fugen Sie zuerst Gefahren hinzu.",
        consequenceLabel: "Konsequenz",
        none: "Keine Konsequenz angegeben",
        untitled: "Unbenannte Gefahr",
        table: {
          step: "Schritt",
          hazard: "Gefahr",
          controls: "Kontrollen"
        },
        placeholders: {
          controls: "Kontrollen einfugen, eine pro Zeile"
        },
        suggestions: {
          action: "Zusatzliche Kontrollen vorschlagen",
          hint: "Vorschlage nutzen gespeicherte Schritte und Gefahren. Prufen und hinzufugen.",
          title: "Vorgeschlagene Kontrollen",
          add: "Hinzufugen",
          status: {
            thinking: "Vorschlage werden erstellt...",
            ready: "{count} Vorschlage bereit.",
            empty: "Keine zusatzlichen Kontrollen vorgeschlagen.",
            failed: "Kontrollen konnten nicht vorgeschlagen werden."
          }
        }
      },
      review: {
        title: "Review und Export",
        subtitle: "Tabelle prufen und fur Unterschriften exportieren."
      },
      table: {
        status: {
          saving: "Tabelle wird gespeichert...",
          saved: "Tabelle gespeichert.",
          saveFailed: "Tabelle konnte nicht gespeichert werden"
        }
      },
      attachments: {
        title: "Anhange",
        subtitle: "Fotos oder Skizzen fur Schritte oder Gefahren hochladen.",
        errorLabel: "Anhange: {error}",
        confirmDelete: "\"{name}\" loschen? Dies entfernt den Anhang.",
        status: {
          uploading: "Anhang wird hochgeladen...",
          uploadFailed: "Upload fehlgeschlagen",
          moving: "Anhang wird verschoben...",
          moveFailed: "Verschieben fehlgeschlagen",
          reordering: "Anhange werden sortiert...",
          reorderFailed: "Sortieren fehlgeschlagen",
          deleting: "Wird geloscht...",
          deleteFailed: "Loschen fehlgeschlagen"
        },
        section: {
          steps: "Nach Schritt",
          hazards: "Nach Gefahr"
        },
        stepLabel: "Schritt {index}: {label}",
        stepHeading: "Schritt {index}: {label}",
        stepFallback: "Schritt",
        hazardHeading: "{step} - {hazard}",
        emptyStep: "Keine Anhange. Datei ablegen oder hochladen.",
        emptyHazard: "Keine Anhange."
      }
    },
    incident: {
      types: {
        nearMiss: "Beinaheunfall",
        firstAid: "Erste Hilfe",
        lostTime: "Ausfallzeit",
        propertyDamage: "Sachschaden"
      },
      flow: {
        title: "Untersuchungsphasen",
        subtitle: "Durch Fakten, Ursachen und Aktionen mit klaren Checkpoints.",
        stages: {
          facts: "Fakten",
          causes: "Ursachen",
          rootCauses: "Wurzelursachen",
          actions: "Aktionen",
          review: "Review"
        },
        errors: {
          factsIncomplete: "Fugen Sie mindestens einen Timeline-Eintrag hinzu, bevor Sie fortfahren.",
          causesIncomplete: "Wahlen Sie mindestens eine direkte Ursache, um fortzufahren.",
          rootCausesIncomplete: "Markieren Sie mindestens eine Wurzelursache, um fortzufahren.",
          actionsIncomplete: "Fugen Sie mindestens eine Aktion hinzu, um fortzufahren."
        },
        actions: {
          saveFacts: "Fakten speichern",
          back: "Zuruck",
          next: "Weiter"
        }
      },
      assistant: {
        title: "Incident-Assistent",
        subtitle: "Beschreiben Sie den Vorfall in Klartext. Der Assistent erstellt Fakten, Timeline und Klarstellungen.",
        placeholder: "Beschreiben Sie, was passiert ist, wer beteiligt war und was Sie beobachtet haben...",
        extract: "Entwurf extrahieren",
        confirmApply: "Assistenten-Timeline auf den Fall anwenden? Dies ersetzt die aktuellen Eintraege.",
        draftUpdated: "Entwurf aktualisiert {date}.",
        draftStatusTitle: "Entwurfsstatus",
        draftStatusEmpty: "Noch kein Entwurf erstellt.",
        draftSummary: "{facts} Fakten · {timeline} Ereignisse · {clarifications} Klarstellungen",
        applyHint: "Entwurf prufen und bei Bedarf anwenden.",
        status: {
          extracting: "Entwurf wird extrahiert...",
          extracted: "Entwurf aktualisiert.",
          savingDraft: "Entwurf wird gespeichert...",
          savedDraft: "Entwurf gespeichert.",
          applying: "Timeline wird angewendet...",
          applied: "Timeline angewendet.",
          failed: "Entwurf konnte nicht extrahiert werden.",
          saveFailed: "Entwurf konnte nicht gespeichert werden.",
          applyFailed: "Timeline konnte nicht angewendet werden."
        },
        actions: {
          saveDraft: "Entwurf speichern",
          applyTimeline: "Timeline anwenden"
        },
        facts: {
          title: "Entwurfsfakten",
          subtitle: "Prufen Sie die extrahierten Fakten vor dem Speichern.",
          add: "Fakt hinzufugen",
          empty: "Noch keine Fakten extrahiert.",
          placeholder: "Fakt",
          table: {
            fact: "Fakt",
            actions: "Aktionen"
          }
        },
        timeline: {
          title: "Entwurfs-Timeline",
          subtitle: "Prufen und bearbeiten Sie die Timeline vor der Anwendung.",
          add: "Ereignis hinzufugen",
          empty: "Noch keine Timeline-Ereignisse extrahiert.",
          currentTitle: "Aktuelle Timeline",
          currentSubtitle:
            "Sie wird ersetzt, wenn Sie den Entwurf anwenden. {count} Eintraege werden uberschrieben.",
          currentEmpty: "Noch keine Eintraege. Das Anwenden des Entwurfs erstellt die ersten."
        },
        clarifications: {
          title: "Klarstellungen",
          subtitle: "Beantworten Sie die Fragen fur eine klare Analyse.",
          empty: "Keine Klarstellungen erforderlich.",
          placeholder: "Antwort hinzufugen",
          table: {
            question: "Frage",
            answer: "Antwort"
          }
        }
      },
      witness: {
        title: "Zeugenaussagen",
        subtitle: "Erfassen Sie jede Aussage und extrahieren Sie Fakten und Timeline.",
        roleLabel: "Rolle",
        rolePlaceholder: "Supervisor",
        nameLabel: "Name (optional)",
        namePlaceholder: "Jamie Lee",
        otherInfoLabel: "Weitere Infos",
        otherInfoPlaceholder: "Schichtleiter, Staplerschein",
        addPerson: "Person hinzufugen",
        savePerson: "Person speichern",
        addAccount: "Konto hinzufugen",
        emptyAccount: "Noch kein Konto.",
        statementLabel: "Zeugenaussage",
        statementPlaceholder: "Was haben Sie gesehen/gehoert/getan?",
        saveStatement: "Aussage speichern",
        extractFacts: "Fakten extrahieren",
        factsTitle: "Fakten",
        personalTimelineTitle: "Personliche Timeline",
        status: {
          saving: "Konto wird gespeichert...",
          extracting: "Fakten werden extrahiert..."
        }
      },
      timeline: {
        title: "Timeline",
        subtitle: "Zeugen-Timelines und die zusammengefuhrte Timeline bearbeiten.",
        views: {
          merged: "Zusammengefuhrte Timeline",
          witness: "Zeuge {index}"
        },
        merge: "Timeline zusammenfuhren",
        sort: "Nach Zeit sortieren",
        checkConsistency: "Konsistenz prufen",
        status: {
          merging: "Timeline wird zusammengefuhrt...",
          merged: "Timeline zusammengefuhrt.",
          mergeFailed: "Timeline konnte nicht zusammengefuhrt werden.",
          saving: "Timeline wird gespeichert...",
          checking: "Konsistenzprufung...",
          checked: "Konsistenzprufung abgeschlossen.",
          checkFailed: "Konsistenzprufung fehlgeschlagen."
        },
        table: {
          time: "Zeit",
          event: "Ereignis",
          confidence: "Sicherheit",
          sources: "Quellen",
          actions: "Aktionen"
        },
        timePlaceholder: "~10:20",
        eventPlaceholder: "Ereignis beschreiben",
        addRow: "Timeline-Zeile hinzufugen",
        addPersonal: "Personliches Ereignis hinzufugen",
        save: "Timeline speichern",
        savePersonal: "Personliche Timeline speichern",
        consistency: {
          title: "Konsistenzprufungen"
        },
        confidence: {
          confirmed: "Bestatigt",
          likely: "Wahrscheinlich",
          unclear: "Unklar"
        },
        previewPlaceholder: "Datum und Zeit hinzufugen",
        noWitnessSelected: "Wahlen Sie eine Zeugentimeline aus.",
        witnessHeading: "Timeline fur {name}",
        witnessFallback: "Zeuge",
        untimedLabel: "# {index}",
        optionLabel: "{time} {text}"
      },
      coaching: {
        status: {
          generating: "Coaching-Fragen werden erstellt...",
          ready: "Coaching-Fragen bereit.",
          failed: "Coaching-Fragen konnten nicht erstellt werden."
        },
        causes: {
          action: "Coaching-Fragen erzeugen"
        },
        rootCauses: {
          action: "Wurzelursachen-Fragen erzeugen"
        },
        actions: {
          action: "Aktionen vorschlagen"
        }
      },
      deviations: {
        title: "Abweichungen",
        defaultLabel: "Abweichung {index}",
        unlinked: "Nicht verknupft",
        table: {
          event: "Verknupftes Ereignis",
          expected: "Erwartet",
          actual: "Ist / Anderung",
          actions: "Aktionen"
        },
        placeholders: {
          expected: "Erwartet",
          actual: "Ist / Anderung"
        },
        add: "Abweichung hinzufugen",
        save: "Abweichungen speichern"
      },
      causes: {
        title: "Direkte Ursachen",
        subtitle: "Wahlen Sie die Fakten, die direkt zum Vorfall beigetragen haben.",
        table: {
          event: "Timeline-Ereignis",
          statement: "Ursachenstatement",
          actions: "Aktionen"
        },
        placeholders: {
          statement: "Ursache beschreiben"
        },
        select: "Auswahlen",
        remove: "Entfernen",
        save: "Ursachen speichern",
        status: {
          saving: "Ursachen werden gespeichert...",
          saved: "Ursachen gespeichert."
        },
        proximateLabel: "Aus Timeline #{index} ({time})"
      },
      rootCauses: {
        title: "Wurzelursachen-Analyse",
        subtitle: "Direkte Ursachen erweitern und Wurzelursachen markieren.",
        markRoot: "Wurzelursache",
        questionLabel: "Leitfrage",
        questionPlaceholder: "Frage eintragen",
        addChild: "Unterursache hinzufugen",
        useQuestion: "Frage verwenden",
        save: "Wurzelursachen speichern"
      },
      actions: {
        title: "Aktionsplan",
        subtitle: "Korrekturaktionen je Ursache hinzufugen.",
        aidNotice: "Vorschlage sind optional; vor dem Hinzufugen prufen.",
        linkedTitle: "Verknupfte Aktionen",
        empty: "Noch keine Aktionen verknupft.",
        addSuggested: "Aktion hinzufugen",
        selectType: "Auswahlen",
        placeholders: {
          action: "Aktion",
          ownerRole: "Rolle"
        },
        add: "Aktion hinzufugen",
        save: "Aktionen speichern",
        status: {
          saving: "Aktionen werden gespeichert...",
          saved: "Aktionen gespeichert."
        },
        types: {
          engineering: "Technisch",
          organizational: "Organisatorisch",
          ppe: "PSA",
          training: "Training"
        },
        stopCategories: {
          substitution: "Substitution",
          technical: "Technisch",
          organizational: "Organisatorisch",
          ppe: "PSA"
        }
      },
      review: {
        title: "Review und Abschluss",
        subtitle: "Timeline, Ursachen und Aktionen vor Export prufen.",
        timelineTitle: "Timeline",
        emptyTimeline: "Noch keine Timeline-Eintrage.",
        causesTitle: "Ursachen",
        emptyCauses: "Noch keine Ursachen ausgewahlt.",
        actionsTitle: "Aktionen",
        emptyActions: "Noch keine Aktionen."
      },
      attachments: {
        title: "Anhange nach Timeline",
        subtitle: "Anhange hochladen, sortieren oder ziehen.",
        errorLabel: "Anhange: {error}",
        confirmDelete: "\"{name}\" loschen? Dies entfernt den Anhang.",
        status: {
          uploading: "Anhang wird hochgeladen...",
          uploadFailed: "Upload fehlgeschlagen",
          moving: "Anhang wird verschoben...",
          moveFailed: "Verschieben fehlgeschlagen",
          reordering: "Anhange werden sortiert...",
          reorderFailed: "Sortieren fehlgeschlagen",
          deleting: "Wird geloscht...",
          deleteFailed: "Loschen fehlgeschlagen"
        },
        eventHeading: "Ereignis {index}: {text}",
        empty: "Keine Anhange. Datei ablegen oder hochladen."
      }
    },
    shell: {
      missingCaseId: "Fall-ID fehlt.",
      missingJhaId: "JHA-ID fehlt.",
      missingIncidentId: "Incident-ID fehlt.",
      demoHint: "Nur Demo-Modus: Erstellen Sie hier einen Testfall.",
      demoCreate: "Testfall erstellen",
      demoSeed: "Beispiel anlegen",
      demoCreating: "Testfall wird erstellt...",
      demoSeeding: "Beispiel wird angelegt...",
      demoFailed: "Demo-Fall konnte nicht erstellt werden."
    },
    admin: {
      title: "Organisationsbereitstellung",
      subtitle: "Tenants, Benutzer und Zugriffe fur die Beta verwalten.",
      platformLabel: "Plattformadmin",
      organizations: "Organisationen",
      selectOrg: "Organisation auswahlen",
      statusLabel: "Status",
      storageRoot: "Speicherpfad",
      dbConnection: "DB-Verbindung",
      revokeOrgSessions: "Org-Sitzungen widerrufen",
      provisionOrg: "Neue Organisation anlegen",
      slug: "Slug",
      name: "Name",
      users: "Org-Benutzer",
      resetPassword: "Passwort zurucksetzen",
      unlock: "Entsperren",
      revokeSessions: "Sitzungen widerrufen",
      createUser: "Benutzer erstellen",
      role: "Rolle",
      username: "Benutzername",
      loadingOrgs: "Organisationen werden geladen...",
      emptyOrgs: "Noch keine Organisationen. Erstellen Sie unten eine.",
      loadingUsers: "Benutzer werden geladen...",
      emptyUsers: "Noch keine Benutzer. Erstellen Sie unten einen.",
      createOrg: "Org erstellen",
      storageRootLabel: "Speicherpfad (optional)",
      dbConnectionLabel: "DB-Verbindungszeichenfolge (optional)",
      userTable: {
        user: "Benutzer",
        lockout: "Sperre",
        lastLogin: "Letzte Anmeldung",
        actions: "Aktionen"
      },
      roles: {
        owner: "Eigentumer",
        admin: "Admin",
        member: "Mitglied"
      },
      userStatus: {
        active: "Aktiv",
        locked: "Gesperrt",
        disabled: "Deaktiviert"
      },
      userForm: {
        organization: "Organisation",
        selectOrg: "Organisation auswahlen...",
        username: "Benutzername",
        email: "E-Mail",
        password: "Passwort"
      },
      placeholders: {
        slug: "acme-sicherheit",
        name: "Acme Sicherheit",
        storageRoot: "/var/safetysecretary/acme",
        dbConnection: "postgresql://...",
        username: "j.sicherheit",
        email: "user@company.com"
      },
      prompts: {
        resetPassword: "Neues Passwort fur {name} eingeben.",
        revokeUserSessions: "Alle aktiven Sitzungen fur {name} widerrufen?",
        revokeOrgSessions: "Alle aktiven Sitzungen fur {name} widerrufen?"
      },
      status: {
        provisioningOrg: "Organisation wird bereitgestellt...",
        orgCreated: "Organisation erstellt.",
        creatingUser: "Benutzer wird erstellt...",
        userCreated: "Benutzer erstellt.",
        updatingUser: "Benutzer wird aktualisiert...",
        userUpdated: "Benutzer aktualisiert.",
        resettingPassword: "Passwort wird zuruckgesetzt...",
        passwordReset: "Passwort zuruckgesetzt.",
        unlockingUser: "Konto wird entsperrt...",
        userUnlocked: "Benutzer entsperrt.",
        revokingSessions: "Sitzungen werden widerrufen...",
        sessionsRevoked: "Sitzungen widerrufen ({count}).",
        revokingOrgSessions: "Org-Sitzungen werden widerrufen...",
        orgSessionsRevoked: "Org-Sitzungen widerrufen ({count})."
      },
      errors: {
        loadOrgs: "Organisationen konnten nicht geladen werden",
        loadUsers: "Benutzer konnten nicht geladen werden",
        provisionOrg: "Organisation konnte nicht angelegt werden",
        selectOrg: "Bitte zuerst eine Organisation auswahlen.",
        createUser: "Benutzer konnte nicht erstellt werden",
        updateUser: "Benutzer konnte nicht aktualisiert werden",
        resetPassword: "Passwort konnte nicht zuruckgesetzt werden",
        unlockUser: "Benutzer konnte nicht entsperrt werden",
        revokeSessions: "Sitzungen konnten nicht widerrufen werden",
        revokeOrgSessions: "Org-Sitzungen konnten nicht widerrufen werden"
      },
      bootstrapCreating: "Admin wird erstellt...",
      bootstrapFailed: "Admin konnte nicht erstellt werden",
      bootstrapSuccess: "Admin erstellt.",
      bootstrapTokenPlaceholder: "Bootstrap-Token einfugen"
    },
    phases: {
      processDescription: "Prozessbeschreibung",
      processDescriptionDetail: "Beschreiben Sie den Arbeitsprozess: Aktivitaten, Ausrustung und eingesetzte Stoffe.",
      hazardIdentification: "Gefahrenermittlung",
      hazardIdentificationDetail: "Gefahren je Schritt identifizieren, inkl. was schiefgehen kann und bestehender Kontrollen.",
      baselineRisk: "Basisrisikobewertung",
      baselineRiskDetail: "Aktuelles Risiko anhand der bestehenden Kontrollen bewerten.",
      controlsResidual: "Massnahmen und Restrisiko",
      controlsResidualDetail: "Zusatzliche Massnahmen vorschlagen und erwartetes Restrisiko bewerten.",
      actionPlan: "Aktionsplan",
      actionPlanDetail: "Vorgeschlagene Massnahmen in Aufgaben mit Verantwortlichen und Terminen uberfuhren.",
      complete: "Abgeschlossen",
      completeDetail: "Bewertung abgeschlossen. Nur noch lesen."
    },
    domain: {
      hazardCategories: {
        MECHANICAL: "Mechanisch",
        FALLS: "Sturze",
        ELECTRICAL: "Elektrisch",
        HAZARDOUS_SUBSTANCES: "Gefahrstoffe",
        FIRE_EXPLOSION: "Brand und Explosion",
        THERMAL: "Thermisch",
        PHYSICAL: "Physikalisch",
        ENVIRONMENTAL: "Umwelt",
        ERGONOMIC: "Ergonomisch",
        PSYCHOLOGICAL: "Psychologisch",
        CONTROL_FAILURES: "Kontrollausfalle",
        POWER_FAILURE: "Stromausfall",
        ORGANIZATIONAL: "Organisatorisch"
      },
      severity: {
        A: "A - Katastrophal",
        B: "B - Gefahrlich",
        C: "C - Schwer",
        D: "D - Gering",
        E: "E - Vernachlassigbar"
      },
      likelihood: {
        "1": "1 - Sicher",
        "2": "2 - Wahrscheinlich",
        "3": "3 - Moglich",
        "4": "4 - Unwahrscheinlich",
        "5": "5 - Sehr unwahrscheinlich"
      },
      riskBuckets: {
        negligible: "Vernachlassigbares Risiko",
        minor: "Geringes Risiko",
        moderate: "Moderates Risiko",
        high: "Hohes Risiko",
        extreme: "Extremes Risiko"
      }
    }
  }
} as const;

export type Locale = keyof typeof translations;

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  fr: "Francais",
  de: "Deutsch"
};
