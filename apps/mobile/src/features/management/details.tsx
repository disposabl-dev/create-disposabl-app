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
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { api } from "../../../../../packages/backend/convex/_generated/api";
import type { releasesResult } from "../../../../../packages/backend/convex/validator";
import { Button, Loading, useStyles } from "./ui";
import { InstallerButton } from "./installer-button";
export function Details({ appId }: { appId: string }) {
  const styles = useStyles();
  const app = useQuery(api.apps.index.get, { appId });
  const release = useQuery(api.releases.index.get, { appId });
  if (!app || release === undefined) return <Loading />;
  return (
    <>
      <Text style={styles.heading}>Platforms and features</Text>
      <Selection
        key={JSON.stringify([app.platforms, app.features])}
        appId={appId}
        initialPlatforms={app.platforms}
        initialFeatures={app.features ?? []}
      />
      <Text style={styles.heading}>Production releases</Text>
      {release ? (
        <View style={styles.card}>
          <Text style={styles.muted}>
            Updated {new Date(release.updatedAt).toLocaleString()}
          </Text>
          <PlatformStates appId={appId} states={release.platforms} />
        </View>
      ) : (
        <Text style={styles.muted}>No production release records yet.</Text>
      )}
      <Text style={styles.heading}>Deployments</Text>
      <Previews appId={appId} />
    </>
  );
}
function Selection({
  appId,
  initialPlatforms,
  initialFeatures,
}: {
  appId: string;
  initialPlatforms: Platform[];
  initialFeatures: Feature[];
}) {
  const styles = useStyles();
  const [selected, setSelected] = useState(initialPlatforms);
  const [chosen, setChosen] = useState(initialFeatures);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const update = useMutation(api.apps.index.requestConfiguration);
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      await update({
        appId,
        platforms: resolvePlatforms(selected),
        features: resolveFeatures(chosen),
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
    <View style={styles.card}>
      <Text style={styles.text}>Platforms</Text>
      <View style={styles.wrap}>
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
            style={[styles.chip, selected.includes(p.id) && styles.selected]}
          >
            <Text style={styles.text}>{p.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.text}>Features</Text>
      <View style={styles.wrap}>
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
            style={[styles.chip, chosen.includes(f.id) && styles.selected]}
          >
            <Text style={styles.text}>{f.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.muted}>
        Web is required. CLI and TypeScript SDK require API; Analytics requires
        Authentication and a PostHog connection.
      </Text>
      <Button
        title={busy ? "Saving..." : "Save selection"}
        disabled={busy}
        onPress={() => void save()}
      />
      {!!message && <Text style={styles.text}>{message}</Text>}
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
  const styles = useStyles();
  return (
    <>
      {Object.entries(states)
        .filter(([, state]) => state.enabled)
        .map(([name, state]) => (
          <View key={name} style={{ gap: 10 }}>
            <Text style={styles.text}>{name}</Text>
            <Text style={styles.muted}>
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
                  style={{ minHeight: 44, justifyContent: "center" }}
                >
                  <Text
                    style={[styles.text, { textDecorationLine: "underline" }]}
                  >
                    View build logs
                  </Text>
                </Pressable>
              )}
          </View>
        ))}
      {!!error && (
        <Text accessibilityRole="alert" style={styles.text}>
          {error}
        </Text>
      )}
    </>
  );
}
function Previews({ appId }: { appId: string }) {
  const styles = useStyles();
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const previews = useQuery(api.previews.index.list, {
    appId,
    paginationOpts: { numItems: 20, cursor: cursors[cursors.length - 1] },
  });
  if (!previews) return <Loading />;
  return (
    <View style={{ gap: 12 }}>
      {previews.page.length === 0 && (
        <Text style={styles.muted}>No deployment records yet.</Text>
      )}
      {previews.page.map((preview) => (
        <View key={preview.reference} style={styles.card}>
          <Text style={styles.text}>{preview.reference}</Text>
          <Text style={styles.muted}>
            {preview.stage} · Updated{" "}
            {new Date(preview.updatedAt).toLocaleString()}
          </Text>
          {preview.deployment && (
            <Text style={styles.muted}>
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
      <View style={styles.row}>
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
