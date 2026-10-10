// Which build this is: the commit's first seven characters, or "dev" for a
// build made without one (this container, a local run). Shown in the corner
// by BuildTag and sent as X-App-Build on user requests (backend 4298), so
// the admin can see which build each device keeps running.
export const APP_BUILD = (process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || "dev";
