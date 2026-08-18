// Minimal shadcn-style primitives on DS tokens — no Radix, iframe-friendly.
import { useLayoutEffect, useRef, type ComponentProps, type ReactNode } from "react";

export const cn = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");

const buttonVariants = {
  default: "bg-accent text-on-accent hover:bg-accent-hover border border-transparent",
  outline: "border border-border-strong bg-transparent text-fg hover:bg-bg-hover",
  ghost: "border border-transparent text-fg-muted hover:bg-bg-hover hover:text-fg",
  destructive: "border border-transparent text-error hover:bg-error/10",
} as const;

export function Button({
  variant = "default",
  size = "default",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof buttonVariants; size?: "default" | "sm" | "icon" }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
        "disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none",
        size === "default" && "h-7.5 px-3 text-[12.5px]",
        size === "sm" && "h-6.5 px-2 text-[12px]",
        size === "icon" && "h-7 w-7",
        buttonVariants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-7.5 w-full rounded-md border border-border bg-bg-inset px-2.5 text-[12.5px] text-fg",
        "placeholder:text-fg-subtle focus:outline-2 focus:outline-offset-0 focus:outline-focus/60",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, value, ...props }: ComponentProps<"textarea">) {
  // field-sizing:content does this in CSS on new engines; this is the fallback.
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || "fieldSizing" in el.style) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      className={cn(
        "w-full resize-none rounded-md border border-border bg-bg-inset px-2.5 py-2 font-mono text-[12.5px]",
        "leading-relaxed text-fg placeholder:text-fg-subtle placeholder:font-sans",
        "focus:outline-2 focus:outline-offset-0 focus:outline-focus/60",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-7.5 w-full appearance-none rounded-md border border-border bg-bg-inset px-2.5 pr-7 text-[12.5px] text-fg",
        "focus:outline-2 focus:outline-offset-0 focus:outline-focus/60 cursor-pointer",
        "bg-no-repeat bg-[right_0.5rem_center] bg-[length:14px]",
        "bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23888%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')]",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("mb-1 block text-[11px] font-medium text-fg-muted", className)} {...props} />;
}

export function Badge({
  className,
  tone = "default",
  ...props
}: ComponentProps<"span"> & { tone?: "default" | "accent" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-px text-[10.5px] font-medium",
        tone === "default" && "border-border text-fg-muted",
        tone === "accent" && "border-accent/40 bg-accent/10 text-accent",
        className,
      )}
      {...props}
    />
  );
}

export function Section({ title, actions, children, className }: {
  title: ReactNode; actions?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={cn("min-w-0", className)}>
      <div className="mb-1.5 flex h-6 items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold tracking-wide text-fg-muted uppercase">{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-fg-subtle border-t-accent",
        className,
      )}
    />
  );
}
