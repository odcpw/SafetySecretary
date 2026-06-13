import type { MessageKey } from "../i18n/types";

export function personFormErrorMessageKey(errorCode: string): MessageKey {
	return errorCode === "INVALID_PERSON_ID"
		? messageKey("incident", "persons", "error", "invalidPersonId")
		: messageKey("incident", "persons", "error", "invalidPerson");
}

export function accountFormErrorMessageKey(_errorCode: string): MessageKey {
	return messageKey("incident", "persons", "error", "invalidAccount");
}

function messageKey(...parts: string[]): MessageKey {
	return parts.join(".") as MessageKey;
}
