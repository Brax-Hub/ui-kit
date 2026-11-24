import type { ComponentProps } from "react";
import { Toaster as Sonner } from "sonner";
import { toastClass, toastCloseClass, toastLinkClass } from "./toast.tsx";

/* sonner's Toaster in the prototype's toast look (hub.css 224-226), for an app that already calls sonner's toast().
   Unstyled, so sonner writes no colour of its own; the classes are the kit's. Bottom left, as the prototype. */
export function SonnerToaster(props: ComponentProps<typeof Sonner>) {
  return (
    <Sonner
      position="bottom-left"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: toastClass,
          title: "truncate",
          description: "truncate text-small text-ink-3",
          actionButton: toastLinkClass,
          cancelButton: toastLinkClass,
          closeButton: toastCloseClass,
        },
      }}
      {...props}
    />
  );
}

export { toast as sonnerToast } from "sonner";
