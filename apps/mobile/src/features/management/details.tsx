import {
  defaultAndroidArchitectures,
  type AndroidArchitecture,
} from "@disposabl/disposabl-kit/android-architectures";
import {
  features,
  resolveFeatures,
  type Feature,
} from "@disposabl/disposabl-kit/feature-options";
import {
  platforms,
  resolvePlatforms,
  type Platform,
} from "@disposabl/disposabl-kit/platforms";
import { useAction, useQuery } from "convex/react";
import { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { api } from "../../../../../packages/backend/convex/_generated/api";
import type { releasesResult } from "../../../../../packages/backend/convex/validator";
import { Button, Loading } from "./ui";
import { InstallerButton } from "./installer-button";
export function Details({ appId }: { appId: string }) {
  const app = useQuery(api.apps.index.get, { appId });
  const release = useQuery(api.releases.index.get, { appId });
  if (!app || release === undefined) return <Loading />;
  return (
    <>
      <Text className="text-[21px] font-bold text-foreground">
        Platforms and features
      </Text>
      <Selection
        key={JSON.stringify([
          app.platforms,
          app.features,
          app.androidArchitectures,
        ])}
        appId={appId}
        initialPlatforms={app.platforms}
        initialFeatures={app.features ?? []}
        initialArchitectures={
          app.androidArchitectures ?? defaultAndroidArchitectures
        }
      />
      <Text className="text-[21px] font-bold text-foreground">
        Production releases
      </Text>
      {release ? (
        <View className="gap-[12px] rounded-[24px] border border-border bg-card p-[20px]">
          <Text className="text-[14px] leading-[21px] text-muted-foreground">
            Updated {new Date(release.updatedAt).toLocaleString()}
          </Text>
          <PlatformStates appId={appId} states={release.platforms} />
        </View>
      ) : (
        <Text className="text-[14px] leading-[21px] text-muted-foreground">
          No production release records yet.
        </Text>
      )}
      <Text className="text-[21px] font-bold text-foreground">Deployments</Text>
      <Previews appId={appId} />
    </>
  );
}
function Selection({
  appId,
  initialPlatforms,
  initialFeatures,
  initialArchitectures,
}: {
  appId: string;
  initialPlatforms: Platform[];
  initialFeatures: Feature[];
  initialArchitectures: AndroidArchitecture[];
}) {
  const [selected, setSelected] = useState(initialPlatforms);
  const [architectures, setArchitectures] = useState(initialArchitectures);
  const [chosen, setChosen] = useState(initialFeatures);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const update = useAction(api.apps.index.requestConfigurationChecked);
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      await update({
        appId,
        platforms: resolvePlatforms(selected),
        features: resolveFeatures(chosen),
        androidArchitectures: architectures,
      });
      setMessage(
        "Change requested. Follow progress in Chat; current platforms remain listed until the repository configuration is applied.",
      );
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Could not request the change.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <View className="gap-[12px] rounded-[24px] border border-border bg-card p-[20px]">
      <Text className="text-[16px] leading-[23px] text-foreground">
        Platforms
      </Text>
      <View className="flex-row flex-wrap gap-[8px]">
        {platforms.map((p) => (
          <Pressable
            key={p.id}
            accessibilityRole="checkbox"
            accessibilityLabel={p.label}
            accessibilityState={{
              checked: selected.includes(p.id),
              disabled: p.id === "web",
            }}
            disabled={p.id === "web"}
            onPress={() =>
              setSelected(
                selected.includes(p.id)
                  ? selected.filter((x) => x !== p.id)
                  : [...selected, p.id],
              )
            }
            className={`rounded-[24px] border px-[14px] py-[10px] ${selected.includes(p.id) ? "border-foreground bg-muted" : "border-border"}`}
          >
            <Text className="text-[16px] leading-[23px] text-foreground">
              {p.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {selected.includes("android") && (
        <>
          <Text className="text-[16px] leading-[23px] text-foreground">
            Android architectures
          </Text>
          <View className="flex-row flex-wrap gap-[8px]">
            {(
              [
                ["arm64-v8a", "Modern phones (ARM64)"],
                ["x86_64", "Emulators (x86_64)"],
              ] as const
            ).map(([id, label]) => (
              <Pressable
                key={id}
                accessibilityRole="checkbox"
                accessibilityLabel={label}
                accessibilityState={{
                  checked: architectures.includes(id),
                  disabled:
                    architectures.includes(id) && architectures.length === 1,
                }}
                disabled={
                  architectures.includes(id) && architectures.length === 1
                }
                onPress={() =>
                  setArchitectures(
                    architectures.includes(id)
                      ? architectures.filter((x) => x !== id)
                      : [...architectures, id],
                  )
                }
                className={`rounded-[24px] border px-[14px] py-[10px] ${architectures.includes(id) ? "border-foreground bg-muted" : "border-border"}`}
              >
                <Text className="text-[16px] leading-[23px] text-foreground">
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
      <Text className="text-[16px] leading-[23px] text-foreground">
        Features
      </Text>
      <View className="flex-row flex-wrap gap-[8px]">
        {features.map((f) => (
          <Pressable
            key={f.id}
            accessibilityRole="checkbox"
            accessibilityLabel={f.label}
            accessibilityState={{ checked: chosen.includes(f.id) }}
            onPress={() =>
              setChosen(
                chosen.includes(f.id)
                  ? chosen.filter((x) => x !== f.id)
                  : [...chosen, f.id],
              )
            }
            className={`rounded-[24px] border px-[14px] py-[10px] ${chosen.includes(f.id) ? "border-foreground bg-muted" : "border-border"}`}
          >
            <Text className="text-[16px] leading-[23px] text-foreground">
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text className="text-[14px] leading-[21px] text-muted-foreground">
        Web is required. CLI and TypeScript SDK require API; Analytics requires
        Authentication and a PostHog connection.
      </Text>
      <Button
        title={busy ? "Saving..." : "Save selection"}
        disabled={busy}
        onPress={() => void save()}
      />
      {!!message && (
        <Text className="text-[16px] leading-[23px] text-foreground">
          {message}
        </Text>
      )}
    </View>
  );
}
type States = (typeof releasesResult)["type"]["platforms"];
function PlatformStates({
  states,
  appId,
  reference,
}: {
  states: States;
  appId: string;
  reference?: string;
}) {
  const [error, setError] = useState("");
  async function open(url: string) {
    setError("");
    try {
      await Linking.openURL(url);
    } catch {
      setError("Could not open this link. Please try again.");
    }
  }
  return (
    <>
      {Object.entries(states)
        .filter(([, state]) => state.enabled)
        .map(([name, state]) => (
          <View key={name} className="gap-[10px]">
            <Text className="text-[16px] leading-[23px] text-foreground">
              {name}
            </Text>
            <Text className="text-[14px] leading-[21px] text-muted-foreground">
              {state.latest
                ? `${state.latest.status}${state.latest.version ? ` · ${state.latest.version}` : ""}${state.latest.reason ? ` · ${state.latest.reason}` : ""}`
                : "No build reported"}
            </Text>
            {state.latest?.status === "ready" &&
              state.url &&
              /^https:\/\//.test(state.url) && (
                <Button
                  title={`Open ${name}`}
                  onPress={() => void open(state.url!)}
                />
              )}
            {state.latest?.status === "ready" &&
              state.latest.artifactUrl &&
              state.latest.githubReleaseUrl &&
              ["android", "ios", "macos", "windows", "linux"].includes(
                name,
              ) && (
                <InstallerButton
                  appId={appId}
                  platform={name as Platform}
                  reference={reference}
                  releaseKey={JSON.stringify(state.latest)}
                />
              )}
            {state.latest &&
              /^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/\d+(?:\/attempts\/\d+)?$/.test(
                state.latest.run.url,
              ) && (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`View ${name} build logs`}
                  onPress={() => void open(state.latest!.run.url)}
                  className="min-h-[44px] justify-center"
                >
                  <Text className="text-[16px] leading-[23px] text-foreground underline">
                    View build logs
                  </Text>
                </Pressable>
              )}
          </View>
        ))}
      {!!error && (
        <Text
          accessibilityRole="alert"
          className="text-[16px] leading-[23px] text-foreground"
        >
          {error}
        </Text>
      )}
    </>
  );
}
function Previews({ appId }: { appId: string }) {
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const previews = useQuery(api.previews.index.list, {
    appId,
    paginationOpts: { numItems: 20, cursor: cursors[cursors.length - 1] },
  });
  if (!previews) return <Loading />;
  return (
    <View className="gap-[12px]">
      {previews.page.length === 0 && (
        <Text className="text-[14px] leading-[21px] text-muted-foreground">
          No deployment records yet.
        </Text>
      )}
      {previews.page.map((preview) => (
        <View
          key={preview.reference}
          className="gap-[12px] rounded-[24px] border border-border bg-card p-[20px]"
        >
          <Text className="text-[16px] leading-[23px] text-foreground">
            {preview.reference}
          </Text>
          <Text className="text-[14px] leading-[21px] text-muted-foreground">
            {preview.stage} · Updated{" "}
            {new Date(preview.updatedAt).toLocaleString()}
          </Text>
          {preview.deployment && (
            <Text className="text-[14px] leading-[21px] text-muted-foreground">
              Deployment: {preview.deployment.name}
            </Text>
          )}
          <PlatformStates
            appId={appId}
            reference={preview.reference}
            states={preview.platforms}
          />
        </View>
      ))}
      <View className="flex-row items-center gap-[12px]">
        {cursors.length > 1 && (
          <Button
            title="Previous deployments"
            onPress={() => setCursors(cursors.slice(0, -1))}
          />
        )}
        {!previews.isDone && (
          <Button
            title="More deployments"
            onPress={() => setCursors([...cursors, previews.continueCursor])}
          />
        )}
      </View>
    </View>
  );
}
