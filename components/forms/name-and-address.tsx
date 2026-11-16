"use client";
import { useState } from "react";
import { inputClass } from "@/components/ui";
import { suggestSlug } from "@/lib/slug";
import { WebAddressField } from "./web-address-field";

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
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [edited, setEdited] = useState(false);

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
      <WebAddressField
        base={base}
        help={help}
        placeholder={placeholder}
        value={slug}
        onChange={(v) => {
          setSlug(v);
          setEdited(v !== "");
        }}
      />
    </>
  );
}
