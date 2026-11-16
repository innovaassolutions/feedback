"use client";
import { useId, useState } from "react";
import { cx, inputClass } from "@/components/ui";
import { parseSlug } from "@/lib/slug";

/**
 * The short name in a web address, explained as it's typed: what to enter, the address it makes,
 * a suggestion when someone types a website instead, and a warning when an existing address
 * would change. Controlled when `value` is given; otherwise it keeps its own state.
 */
export function WebAddressField({
  name = "slug",
  label = "Web address",
  base,
  help,
  placeholder,
  value,
  onChange,
  initial = "",
  current,
  locked = false,
  lockedNote,
}: {
  name?: string;
  label?: string;
  /** Everything before the short name, such as "feedback.innovaas.co/streamspace/". */
  base: string;
  help: string;
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  initial?: string;
  /** The address in use now, when editing one. */
  current?: string;
  locked?: boolean;
  lockedNote?: string;
}) {
  const id = useId();
  const [own, setOwn] = useState(initial);
  const slug = value ?? own;
  const set = (v: string) => (onChange ? onChange(v) : setOwn(v));
  const check = slug ? parseSlug(slug) : null;
  const changed = current !== undefined && check?.ok === true && check.slug !== current;

  return (
    <div className="text-sm">
      <label htmlFor={`${id}-slug`} className="font-medium">
        {label}
      </label>
      <input
        id={`${id}-slug`}
        name={name}
        required
        value={slug}
        onChange={(e) => set(e.target.value)}
        placeholder={placeholder}
        disabled={locked}
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
              <button type="button" className="font-medium underline" onClick={() => set(check.suggestion!)} disabled={locked}>
                Use {check.suggestion}
              </button>
            ) : null}
          </span>
        ) : (
          <span className="text-muted">
            {current !== undefined ? "Its pages are at" : "Its pages will be at"}{" "}
            <span className="break-all font-medium text-text">
              {base}
              {check?.ok ? check.slug : "…"}
            </span>
          </span>
        )}
      </p>
      {changed ? (
        <p className="mt-1 text-danger" role="note" data-testid="address-change-warning">
          This changes the address from {base}
          {current} to {base}
          {check.ok ? check.slug : ""}. Links, QR codes and emails already sent with the old address will stop working.
        </p>
      ) : null}
      {locked && lockedNote ? <p className="mt-1 text-muted">{lockedNote}</p> : null}
    </div>
  );
}
