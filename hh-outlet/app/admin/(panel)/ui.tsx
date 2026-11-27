'use client';
// Small form pieces shared by the admin screens: large tap targets, labels you can see, errors under the field.

export const inputCls = 'h-12 w-full rounded-lg border border-line bg-surface px-3 text-[16px] text-ink focus:border-gold focus:outline-none aria-[invalid=true]:border-red-400';

export function ErrorText({ msg, id }: { msg?: string; id?: string }) {
  return msg ? <p id={id} className="mt-1 text-sm text-red-300">{msg}</p> : null;
}

export function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm">{label}</label>
      {children}
      <ErrorText msg={error} id={`${id}-err`} />
    </div>
  );
}

/** One-tap choice buttons that post as a normal form field. Tapping the chosen one again clears it. */
export function Chips({ label, name, value, onChange, options, error }: {
  label: string; name: string; value?: string; onChange: (v: string) => void; options: { value: string; label: string }[]; error?: string;
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm">{label}</legend>
      <input type="hidden" name={name} value={value ?? ''} />
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {options.map((o) => {
          const on = value === o.value;
          return (
            <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(on ? '' : o.value)}
              className={`min-h-11 rounded-full border px-4 text-sm ${on ? 'border-gold bg-gold text-ground font-semibold' : 'border-line hover:border-gold'}`}>
              {o.label}
            </button>
          );
        })}
      </div>
      <ErrorText msg={error} />
    </fieldset>
  );
}
