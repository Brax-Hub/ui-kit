import type { PluginOption } from "vite";

/** The browsers the kit's colour math needs; the build's CSS target. */
export declare const browsers: string[];
/** The kit's Tailwind and the build settings its stylesheet and parts need. Put it first in `plugins`. */
export declare function braxUi(): PluginOption[];
