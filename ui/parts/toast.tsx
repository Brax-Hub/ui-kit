import { X } from "lucide-react";
import { Toast as ToastPrimitive } from "radix-ui";
import { useEffect, useState } from "react";
import { cn } from "../lib/cn.ts";

/* The prototype's toast (.toast, hub.css 224-226): one bar at the bottom left, 48px, the inverted surface (ink on
   paper, paper on dark), the text, one link in the accent-as-text of that surface, a small close button. On Radix
   Toast with a small store, as Hub administration does (sonner injects a style element without a nonce, which the
   hub's CSP forbids); sonner.tsx is the same look for an app that already uses sonner. */
export type ToastItem = { id: string; title: string; description?: string; action?: { label: string; onClick: () => void }; duration?: number };

type Listener = (items: ToastItem[]) => void;
let items: ToastItem[] = [];
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l(items));

export const toast = {
  show(t: Omit<ToastItem, "id"> & { id?: string }): string {
    const id = t.id ?? Math.random().toString(36).slice(2);
    items = [...items.filter((i) => i.id !== id), { ...t, id }];
    emit();
    return id;
  },
  update(id: string, patch: Partial<Omit<ToastItem, "id">>) {
    items = items.map((i) => (i.id === id ? { ...i, ...patch } : i));
    emit();
  },
  dismiss(id: string) {
    items = items.filter((i) => i.id !== id);
    emit();
  },
  success: (title: string, description?: string) => toast.show({ title, description }),
  error: (title: string, description?: string) => toast.show({ title, description, duration: 8000 }),
  info: (title: string, description?: string) => toast.show({ title, description }),
};

export const toastClass = "pointer-events-auto flex h-toast max-w-full items-center gap-4 bg-toast-bg pr-2 pl-4 text-body text-toast-text animate-slide-up data-[state=closed]:animate-fade-out";
export const toastLinkClass = "cursor-pointer whitespace-nowrap font-display font-strong text-small uppercase tracking-link text-toast-accent hover:underline hover:underline-offset-3";
export const toastCloseClass = "inline-flex size-control-sm shrink-0 cursor-pointer items-center justify-center text-toast-text hover:bg-wash focus-visible:shadow-glow focus-visible:outline-none";

export function Toaster({ closeLabel = "Close", duration = 5000 }: { closeLabel?: string; duration?: number }) {
  const [list, setList] = useState<ToastItem[]>(items);
  useEffect(() => {
    listeners.add(setList);
    return () => {
      listeners.delete(setList);
    };
  }, []);
  return (
    <ToastPrimitive.Provider swipeDirection="left" duration={duration}>
      {list.map((item) => (
        <ToastPrimitive.Root key={item.id} duration={item.duration ?? duration} onOpenChange={(open) => !open && toast.dismiss(item.id)} className={toastClass}>
          <div className="flex min-w-0 items-baseline gap-2 truncate">
            <ToastPrimitive.Title className="truncate">{item.title}</ToastPrimitive.Title>
            {item.description && <ToastPrimitive.Description className="truncate text-small text-ink-3">{item.description}</ToastPrimitive.Description>}
          </div>
          {item.action && (
            <ToastPrimitive.Action altText={item.action.label} className={toastLinkClass} onClick={item.action.onClick}>
              {item.action.label}
            </ToastPrimitive.Action>
          )}
          <ToastPrimitive.Close className={toastCloseClass} aria-label={closeLabel}>
            <X className="size-icon-sm" aria-hidden />
          </ToastPrimitive.Close>
        </ToastPrimitive.Root>
      ))}
      <ToastPrimitive.Viewport className={cn("fixed bottom-6 left-6 z-70 flex w-max max-w-[calc(100%-var(--space)*12)] flex-col gap-2 outline-none")} />
    </ToastPrimitive.Provider>
  );
}
