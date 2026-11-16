"use client";
import { useId, useState } from "react";
import { cx, inputClass } from "@/components/ui";
import { parseSlug, suggestSlug } from "@/lib/slug";

/**
 * A name and the short name for its web address. The address follows the name until someone
 * edits it, the page shows the address it will make, and a website address gets a suggestion.
 */
export function NameAndAddress({
  nameLabel,
  nameField,
  base,
  help,
  placeholder,
}: {
  nameLabel: string;
  nameField: string;
  /** What comes before the short name, such as "feedback.innovaas.co/". */
  base: string;
  help: string;
  placeholder: string;
}) {
  const id = useId();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [edited, setEdited] = useState(false);
  const check = slug ? parseSlug(slug) : null;

  return (
    <>
      <label className="block text-sm">
        <span className="font-medium">{nameLabel}</span>
        <span className="mt-1 block">
          <input
            name={nameField}
            required
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!edited) setSlug(suggestSlug(e.target.value) ?? "");
            }}
            className={inputClass}
          />
        </span>
      </label>
      <div className="text-sm">
        <label htmlFor={`${id}-slug`} className="font-medium">
          Web address
        </label>
        <input
          id={`${id}-slug`}
          name="slug"
          required
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setEdited(e.target.value !== "");
          }}
          placeholder={placeholder}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby={`${id}-help ${id}-check`}
          className={cx(inputClass, "mt-1")}
        />
        <p id={`${id}-help`} className="mt-1 text-muted">
          {help}
        </p>
        <p id={`${id}-check`} aria-live="polite" className="mt-1" data-testid="address-check">
          {check && !check.ok ? (
            <span className="text-danger">
              {check.message}{" "}
              {check.suggestion ? (
                <button type="button" className="font-medium underline" onClick={() => setSlug(check.suggestion!)}>
                  Use {check.suggestion}
                </button>
              ) : null}
            </span>
          ) : (
            <span className="text-muted">
              Its pages will be at <span className="font-medium text-text break-all">{base}{check?.ok ? check.slug : "…"}</span>
            </span>
          )}
        </p>
      </div>
    </>
  );
}
