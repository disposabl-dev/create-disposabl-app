export const targets = ["web", "ios", "android", "api", "mcp", "cli"] as const;
export type Target = (typeof targets)[number];
export const targetNames: Record<Target, string> = {
  web: "Web",
  ios: "iOS",
  android: "Android",
  api: "API",
  mcp: "MCP",
  cli: "CLI",
};
export type Example = {
  slug: string;
  name: string;
  line: string;
  color: string;
  ink: string;
  mark: string;
  targets: Target[];
  prompt: string;
  about?: string;
  visibility: "public" | "private";
  owned?: boolean;
  changes: string[];
  category: string;
};
// Original sample concepts and artwork. These are local design fixtures, not generated apps.
export const examples: Example[] = [
  {
    slug: "field",
    name: "Fieldnote",
    line: "A little room for your day.",
    color: "#DCE7BF",
    ink: "#253C2D",
    mark: "leaf",
    targets: ["ios", "android", "web"],
    visibility: "public",
    category: "Everyday rituals",
    prompt:
      "Build a calm daily journal with a mood check-in, photo entries, and a weekly reflection. Make it feel like a quiet place to think.",
    about:
      "A private place for the things you want to remember. Capture a thought, keep a photo, or notice how your week felt. Start with a single sentence.",
    changes: [
      "A new weekly reflection brings your days together.",
      "Add a photo to any entry.",
      "Larger text and a calmer reading view.",
    ],
  },
  {
    slug: "mira",
    name: "Mira",
    line: "Think out loud. Find your next idea.",
    color: "#F4CFBC",
    ink: "#753C2F",
    mark: "chat",
    targets: ["web", "ios", "android", "api", "mcp"],
    visibility: "public",
    category: "A thinking companion",
    prompt:
      "Create an AI chat companion for brainstorming ideas, with saved conversations, image attachments, and an API and MCP server for my agents.",
    about:
      "Give a half-formed idea somewhere to go. Mira helps you explore questions, save useful conversations, and pick up exactly where you left off.",
    changes: [
      "Keep your favorite conversations close.",
      "Bring an image into the conversation.",
    ],
  },
  {
    slug: "tempo",
    name: "Tempo",
    line: "A conversation, without a keyboard.",
    color: "#CBD6F2",
    ink: "#253866",
    mark: "voice",
    targets: ["ios", "android", "web"],
    visibility: "public",
    category: "Made for speaking",
    prompt:
      "Create a realtime voice assistant that listens and responds naturally. Include a clear listening state, captions, and conversation history.",
    about:
      "Speak naturally and hear a live response. Captions keep every conversation accessible, and a simple history lets you return to useful moments.",
    changes: [
      "Live captions follow the conversation.",
      "Pause and resume at your own pace.",
    ],
  },
  {
    slug: "luma",
    name: "Luma",
    line: "Your photos. A new perspective.",
    color: "#E6D1EB",
    ink: "#5A3464",
    mark: "camera",
    targets: ["web", "ios", "android"],
    visibility: "public",
    category: "A fresh look",
    prompt:
      "Build an AI photo editor with camera capture, photo import, a before and after view, and natural-language editing instructions.",
    about:
      "Capture something ordinary and try something unexpected. Describe an edit, compare it with the original, and keep the version that feels like you.",
    changes: [
      "Compare before and after with one gesture.",
      "Save your favorite editing recipes.",
    ],
  },
  {
    slug: "orbit",
    name: "Orbit",
    line: "Make space for what matters.",
    color: "#F2DFAC",
    ink: "#5C4720",
    mark: "orbit",
    targets: ["web", "ios", "android", "api", "cli"],
    visibility: "public",
    category: "A lighter kind of planning",
    prompt:
      "Make a simple weekly planner with three daily priorities, a focus timer, and an API and CLI so my agent can manage tasks.",
    about:
      "A lighter plan for a full life. Choose three priorities, find a little focus, and let everything else wait. Your agent can help with the small stuff.",
    changes: [
      "Set three priorities for each day.",
      "Manage tasks from your terminal.",
    ],
  },
];

export type Guide = {
  id: string;
  section: string;
  title: string;
  body: string;
  example: string;
};
export const guides: Guide[] = [
  {
    id: "api",
    section: "Fundamentals",
    title: "What is an API?",
    body: "An API lets one program ask another for data or an action. A weather app can ask a weather service for today's forecast.",
    example: "mira",
  },
  {
    id: "mcp",
    section: "Fundamentals",
    title: "What is MCP?",
    body: "MCP gives AI agents a standard way to discover and use tools. Your app can expose tools an agent can call on your behalf.",
    example: "orbit",
  },
  {
    id: "cli",
    section: "Fundamentals",
    title: "What is a CLI?",
    body: "A CLI lets you control a program with text commands. Your coding agent can use the Disposabl CLI to create apps and previews.",
    example: "tempo",
  },
  {
    id: "welcome",
    section: "Introduction",
    title: "Meet Disposabl",
    body: "Create on your computer or phone. Review your apps, preview changes, and share a published version.",
    example: "field",
  },
  {
    id: "first-app",
    section: "Introduction",
    title: "Your first app",
    body: "Start with an example prompt, choose your platforms, and describe what you want to build.",
    example: "luma",
  },
  {
    id: "computer",
    section: "Introduction",
    title: "Connect your computer",
    body: "Run bun create disposabl-app on Mac, Windows, or Linux. Setup guides you through sign-in and connecting the accounts your app needs.",
    example: "orbit",
  },
  {
    id: "prompts",
    section: "Mastery · Better prompts",
    title: "Write a useful brief",
    body: "Describe who the app is for, what they need to do, and how you will know it works. Include examples of the inputs and outputs.",
    example: "mira",
  },
  {
    id: "scope",
    section: "Mastery · Better prompts",
    title: "Keep a preview focused",
    body: "Ask for one clear change at a time. Preview it before adding the next change.",
    example: "field",
  },
  {
    id: "previews",
    section: "Mastery · Previews",
    title: "Review changes before publishing",
    body: "Previews stay separate from the published version. Open the preview link on the right platform and check your changes before publishing.",
    example: "luma",
  },
  {
    id: "local",
    section: "Mastery · Previews",
    title: "Work from your CLI",
    body: "Your coding agent can edit the project on your computer. Push your changes to get a preview deployment and follow its build progress here.",
    example: "orbit",
  },
  {
    id: "tools",
    section: "Mastery · Agent tools",
    title: "Connect API, MCP, and CLI",
    body: "Choose the interface your agent needs. Every app includes a website for essentials and access.",
    example: "mira",
  },
  {
    id: "release",
    section: "Mastery · Publishing",
    title: "Share the published app",
    body: "Share the published version. A preview has its own URL, so check which version you are sharing.",
    example: "tempo",
  },
];
export const guideSections = [...new Set(guides.map((guide) => guide.section))];
