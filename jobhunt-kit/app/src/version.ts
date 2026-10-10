// The version baked into the compiled program (build.ts passes it with --define). Source runs and local builds say "dev".
declare const __JOBHUNT_VERSION__: string | undefined;

export const VERSION: string = typeof __JOBHUNT_VERSION__ === "string" && __JOBHUNT_VERSION__ ? __JOBHUNT_VERSION__ : "dev";
