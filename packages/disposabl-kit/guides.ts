import publishedMedia from "./guide-media.json";

/** Short reel descriptions and their published playback sources. */
export type GuideLesson = {
  id: string;
  journey: string;
  title: string;
  summary: string;
  durationSeconds: number;
  video?: {
    uri: string;
    webUri?: string;
    posterUri?: string;
    captionsUri?: string;
  };
};
export type GuideJourney = {
  id: string;
  title: string;
  description: string;
  kind: "welcome" | "practice" | "application" | "agent";
  lessonIds: string[];
};

const lessons: GuideLesson[] = [
  {
    id: "welcome",
    journey: "welcome",
    title: "Welcome to Disposabl",
    summary:
      "See what you can make with Disposabl. Choose a guide and take your first useful step.",
    durationSeconds: 36.533333,
  },
  {
    id: "first-workflow",
    journey: "practice",
    title: "Start with one useful thing",
    summary:
      "Give your idea a clear starting point. You can add more after the first useful part works.",
    durationSeconds: 38.566667,
  },
  {
    id: "test-real-user",
    journey: "practice",
    title: "Try it as someone new",
    summary:
      "See whether someone can do what they came for. Try the ordinary mistakes and interruptions too.",
    durationSeconds: 37.066667,
  },
  {
    id: "safe-release",
    journey: "practice",
    title: "Change it without surprises",
    summary:
      "Try changes away from the version people use. Check the result before sharing it with everyone.",
    durationSeconds: 40.6,
  },
  {
    id: "web-start",
    journey: "web",
    title: "Share it with a link",
    summary:
      "A website opens in a browser. People can use it on their phone or computer without installing it.",
    durationSeconds: 34.966667,
  },
  {
    id: "web-publish",
    journey: "web",
    title: "Make your website public",
    summary:
      "Publishing gives people an address they can open. Check that address yourself before you share it.",
    durationSeconds: 36.966667,
  },
  {
    id: "web-run",
    journey: "web",
    title: "Improve it after people arrive",
    summary:
      "A visitor's difficulty can show you what to improve next. Follow one problem through to a working fix.",
    durationSeconds: 43.333333,
  },
  {
    id: "android-start",
    journey: "android",
    title: "Make an Android app",
    summary:
      "Give Android users an app they can install. Try it on a phone before you share it.",
    durationSeconds: 37.4,
  },
  {
    id: "android-publish",
    journey: "android",
    title: "Get it onto Google Play",
    summary:
      "Let a small group try the store version first. Releasing it and looking after it are separate steps.",
    durationSeconds: 42.2,
  },
  {
    id: "ios-start",
    journey: "ios",
    title: "Make an iPhone app",
    summary:
      "Build a first version for iPhone. Try the experience on the device people will use.",
    durationSeconds: 38.1,
  },
  {
    id: "ios-publish",
    journey: "ios",
    title: "Get it into the App Store",
    summary:
      "Use TestFlight to let people try your iPhone app. App Store review comes after that testing.",
    durationSeconds: 42.4,
  },
  {
    id: "desktop-start",
    journey: "desktop",
    title: "Make a desktop app",
    summary:
      "Turn your idea into a desktop app for the operating systems your users use.",
    durationSeconds: 41.7,
  },
  {
    id: "desktop-publish",
    journey: "desktop",
    title: "Keep computer apps up to date",
    summary:
      "Changing the website and updating the installed app are different jobs. Check how the next version reaches people.",
    durationSeconds: 44.966667,
  },
  {
    id: "api",
    journey: "api",
    title: "Let other apps talk to yours",
    summary:
      "Other software can ask your app for information or an action. An API is the doorway that makes that possible.",
    durationSeconds: 41.366667,
  },
  {
    id: "mcp",
    journey: "mcp",
    title: "Let an assistant help with your app",
    summary:
      "Give an assistant a small set of useful actions. You stay in control of what it can access.",
    durationSeconds: 40.533333,
  },
  {
    id: "cli",
    journey: "cli",
    title: "Use your app with simple commands",
    summary:
      "Some people prefer typing a short instruction. You can offer that alongside the app's screen.",
    durationSeconds: 44.866667,
  },
  {
    id: "sdk",
    journey: "sdk",
    title: "Help other builders use your app",
    summary:
      "Give other developers a ready-made way to connect. An SDK helps them use your app from their own code.",
    durationSeconds: 46.166667,
  },
  {
    id: "chatgpt",
    journey: "chatgpt",
    title: "Use your app from ChatGPT",
    summary:
      "Let ChatGPT use a few chosen tools from your app. Try the connection privately before sharing it.",
    durationSeconds: 45.333333,
  },
  {
    id: "codex",
    journey: "codex",
    title: "Help Codex understand your app",
    summary:
      "Give your coding assistant clear instructions and useful tools. A plugin keeps those together.",
    durationSeconds: 39.7,
  },
  {
    id: "operations",
    journey: "care",
    title: "Look after your app",
    summary:
      "Publishing is the beginning of caring for your app. Make time to notice problems and help people.",
    durationSeconds: 38.933333,
  },
];

const media: Record<string, GuideLesson["video"]> = publishedMedia;
export const guideLessons: GuideLesson[] = lessons.map((lesson) => ({
  ...lesson,
  video: media[lesson.id],
}));

export const guideJourneys: GuideJourney[] = [
  {
    id: "welcome",
    title: "Start here",
    description: "One idea, many ways to use it.",
    kind: "welcome",
    lessonIds: ["welcome"],
  },
  {
    id: "practice",
    title: "Best practices",
    description: "Start small and try changes before sharing them.",
    kind: "practice",
    lessonIds: ["first-workflow", "test-real-user", "safe-release"],
  },
  {
    id: "web",
    title: "Website",
    description: "A useful page, a public address, and the next improvement.",
    kind: "application",
    lessonIds: ["web-start", "web-publish", "web-run"],
  },
  {
    id: "android",
    title: "Android",
    description: "From a development build to Google Play and updates.",
    kind: "application",
    lessonIds: ["android-start", "android-publish"],
  },
  {
    id: "ios",
    title: "iPhone",
    description: "Try a device build, then TestFlight and the App Store.",
    kind: "application",
    lessonIds: ["ios-start", "ios-publish"],
  },
  {
    id: "desktop",
    title: "Desktop apps",
    description: "Install on a supported computer and deliver updates.",
    kind: "application",
    lessonIds: ["desktop-start", "desktop-publish"],
  },
  {
    id: "api",
    title: "Connect other apps",
    description: "Let another program ask your app for data or an action.",
    kind: "agent",
    lessonIds: ["api"],
  },
  {
    id: "mcp",
    title: "Connect an assistant",
    description: "Give assistants a safe, understandable set of tools.",
    kind: "agent",
    lessonIds: ["mcp"],
  },
  {
    id: "cli",
    title: "Simple commands",
    description: "Control your app with documented text commands.",
    kind: "agent",
    lessonIds: ["cli"],
  },
  {
    id: "sdk",
    title: "For other builders",
    description: "Use your app through a library inside other code.",
    kind: "agent",
    lessonIds: ["sdk"],
  },
  {
    id: "chatgpt",
    title: "ChatGPT",
    description: "Package and test a connection to your app's tools.",
    kind: "agent",
    lessonIds: ["chatgpt"],
  },
  {
    id: "codex",
    title: "Codex",
    description: "Combine instructions and tools for a repeatable task.",
    kind: "agent",
    lessonIds: ["codex"],
  },
  {
    id: "care",
    title: "After you share",
    description: "Keep your app useful for the people who use it.",
    kind: "practice",
    lessonIds: ["operations"],
  },
];
