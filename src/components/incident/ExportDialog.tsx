"use client";

import { useState } from "react";
import { LOCALES, type Locale } from "../../lib/i18n/types";

export type IncidentExportDialogLabels = {
	communicationsOnePager: string;
	docx: string;
	exportLocale: string;
	format: string;
	fullReport: string;
	localeNames: Record<Locale, string>;
	pdf: string;
	translateStoredContent: string;
};

export type IncidentExportDialogProps = {
	action?: string;
	caseId: string;
	contentLanguage: Locale;
	defaultExportLocale: Locale;
	labels: IncidentExportDialogLabels;
	selectedPhotoIds?: readonly string[];
};

export function IncidentExportDialog({
	action,
	caseId,
	defaultExportLocale,
	labels,
	selectedPhotoIds = [],
}: IncidentExportDialogProps) {
	const [exportLocale, setExportLocale] =
		useState<Locale>(defaultExportLocale);
	const [translateStoredContent, setTranslateStoredContent] = useState(false);
	const exportAction = action ?? `/api/incidents/${caseId}/export`;

	return (
		<form action={exportAction} className="grid gap-3" method="get">
			<label className="grid gap-1">
				<span>{labels.exportLocale}</span>
				<select
					name="locale"
					onChange={(event) => setExportLocale(event.target.value as Locale)}
					value={exportLocale}
				>
					{LOCALES.map((locale) => (
						<option key={locale} value={locale}>
							{labels.localeNames[locale]}
						</option>
					))}
				</select>
			</label>
			<label className="inline-flex items-center gap-2">
				<input
					checked={translateStoredContent}
					name="translate"
					onChange={(event) => setTranslateStoredContent(event.target.checked)}
					type="checkbox"
					value="true"
				/>
				<span>{labels.translateStoredContent}</span>
			</label>
			<label className="grid gap-1">
				<span>{labels.format}</span>
				<select name="format" defaultValue="docx">
					<option value="docx">{labels.docx}</option>
					<option value="pdf">{labels.pdf}</option>
				</select>
			</label>
			{selectedPhotoIds.map((photoId) => (
				<input key={photoId} name="photoId" type="hidden" value={photoId} />
			))}
			<div className="flex flex-wrap gap-2">
				<button name="report" type="submit" value="full-report">
					{labels.fullReport}
				</button>
				<button name="report" type="submit" value="comms">
					{labels.communicationsOnePager}
				</button>
			</div>
		</form>
	);
}
