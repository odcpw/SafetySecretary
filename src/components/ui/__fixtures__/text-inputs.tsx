import Input from "../Input";
import Textarea from "../Textarea";

export function TextInputFixtures() {
  return (
    <div className="grid gap-4 bg-[var(--color-bg)] p-4 text-[var(--color-text)]">
      <section className="grid gap-3" aria-label="Input states">
        <Input
          id="input-default"
          label="Activity name"
          placeholder="Enter activity name"
        />
        <Input
          disabled
          id="input-disabled"
          label="Disabled activity"
          placeholder="Disabled input"
        />
        <Input
          id="input-readonly"
          label="Read-only activity"
          readOnly
          value="Existing activity"
        />
        <Input
          error="Activity name is required."
          id="input-error"
          label="Activity with error"
          placeholder="Activity name"
        />
        <div className="grid gap-1">
          <p
            className="text-[length:var(--text-xs)] text-[var(--color-muted)]"
            id="input-required-helper"
          >
            Use the short activity name shown in the HIRA workspace.
          </p>
          <Input
            aria-describedby="input-required-helper"
            id="input-required"
            label="Required activity"
            placeholder="Required activity"
            required
          />
        </div>
      </section>

      <section className="grid gap-3" aria-label="Textarea states">
        <Textarea
          id="textarea-default"
          label="Hazard description"
          placeholder="Describe the hazard"
          rows={3}
        />
        <Textarea
          disabled
          id="textarea-disabled"
          label="Disabled description"
          placeholder="Disabled textarea"
          rows={3}
        />
        <Textarea
          id="textarea-readonly"
          label="Read-only description"
          readOnly
          rows={3}
          value="Existing description"
        />
        <Textarea
          error="Description is required."
          id="textarea-error"
          label="Description with error"
          placeholder="Hazard description"
          rows={3}
        />
        <div className="grid gap-1">
          <p
            className="text-[length:var(--text-xs)] text-[var(--color-muted)]"
            id="textarea-required-helper"
          >
            Include the hazard source and exposure context.
          </p>
          <Textarea
            aria-describedby="textarea-required-helper"
            id="textarea-required"
            label="Required description"
            placeholder="Required description"
            required
            rows={3}
          />
        </div>
      </section>
    </div>
  );
}
