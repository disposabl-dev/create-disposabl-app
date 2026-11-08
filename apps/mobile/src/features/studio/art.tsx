import { VariableContextProvider } from "nativewind";
import { View, Text } from "react-native";
import Svg, { Circle, Path, Rect, Line } from "react-native-svg";
import type { Example } from "./data";
export function AppArtwork({
  app,
  variant = 0,
  compact = false,
}: {
  app: Example;
  variant?: number;
  compact?: boolean;
}) {
  const h = compact ? 180 : 300;
  return (
    <VariableContextProvider
      value={{
        "--layout-height": h,
        "--layout-background-color": app.color,
        "--art-ink": app.ink,
      }}
    >
      <View
        accessible
        accessibilityLabel={`${app.name} concept screenshot: ${variant === 0 ? app.line : "A closer look at your day"}`}
        className="h-[var(--layout-height)] bg-[var(--layout-background-color)] rounded-[24px] overflow-hidden"
      >
        <Svg
          width="100%"
          height="100%"
          viewBox="0 0 340 300"
          preserveAspectRatio="xMidYMid slice"
        >
          <Circle cx="330" cy="20" r="125" fill={app.ink} opacity=".05" />
          <Circle cx="25" cy="285" r="110" fill={app.ink} opacity=".06" />
          {app.slug === "field" ? (
            <>
              <Path
                d="M258 264C186 181 226 99 287 77C311 151 313 209 258 264Z"
                fill={app.ink}
                opacity=".85"
              />
              <Path
                d="M251 246C212 162 150 156 127 178C167 224 203 242 251 246Z"
                fill={app.ink}
                opacity=".45"
              />
              <Path
                d="M254 280Q245 186 281 99"
                stroke={app.color}
                strokeWidth="2"
                fill="none"
              />
            </>
          ) : app.slug === "tempo" ? (
            <>
              {[24, 52, 83, 130, 96, 66, 112, 156, 100, 57, 30].map((v, i) => (
                <Rect
                  key={i}
                  x={70 + i * 20}
                  y={160 - v / 2}
                  width="9"
                  height={v}
                  rx="4.5"
                  fill={app.ink}
                  opacity={0.4 + i * 0.04}
                />
              ))}
            </>
          ) : app.slug === "orbit" ? (
            <>
              <Circle
                cx="240"
                cy="170"
                r="92"
                stroke={app.ink}
                strokeWidth="1"
                fill="none"
              />
              <Circle
                cx="240"
                cy="170"
                r="62"
                stroke={app.ink}
                strokeWidth="18"
                strokeDasharray="280 120"
                fill="none"
              />
              <Circle cx="240" cy="170" r="30" fill={app.ink} />
              <Circle cx="151" cy="146" r="10" fill={app.ink} />
            </>
          ) : app.slug === "luma" ? (
            <>
              <Path d="M90 250L195 80L325 250Z" fill={app.ink} opacity=".5" />
              <Circle cx="250" cy="80" r="35" fill="#FFF6E0" />
              <Path d="M5 280L135 132L261 280Z" fill={app.ink} />
              <Line
                x1="170"
                y1="65"
                x2="170"
                y2="280"
                stroke="white"
                strokeWidth="2"
              />
            </>
          ) : (
            <>
              <Rect
                x="60"
                y="100"
                width="220"
                height="75"
                rx="25"
                fill="#FFFAF3"
              />
              <Rect
                x="105"
                y="190"
                width="175"
                height="54"
                rx="23"
                fill={app.ink}
              />
              <Circle cx="95" cy="137" r="5" fill={app.ink} />
              <Circle cx="115" cy="137" r="5" fill={app.ink} />
              <Circle cx="135" cy="137" r="5" fill={app.ink} />
            </>
          )}
        </Svg>
        <View className="absolute top-[24px] left-[24px] right-[24px] gap-[8px]">
          <Text
            className={`max-w-[215px] font-semibold tracking-[-1px] text-[var(--art-ink)] ${compact ? "text-[23px]" : "text-[30px]"}`}
          >
            {variant
              ? "Made for your everyday."
              : app.slug === "field"
                ? "Today felt\na little lighter."
                : app.slug === "tempo"
                  ? "I'm listening."
                  : app.slug === "mira"
                    ? "Where shall\nwe begin?"
                    : app.slug === "luma"
                      ? "See it differently."
                      : "Less noise.\nMore focus."}
          </Text>
        </View>
        {app.slug === "field" && !compact && (
          <View className="absolute bottom-[24px] left-[24px] w-[160px] gap-[10px]">
            <Text className="text-[11px] text-[var(--art-ink)]">
              SUNDAY, SEPTEMBER 20
            </Text>
            <Text className="text-[15px] leading-[21px] text-[var(--art-ink)]">
              Coffee outside. A long walk. Nothing in a hurry.
            </Text>
            <View className="w-[38px] h-[3px] bg-[var(--art-ink)] mt-[8px]" />
          </View>
        )}
      </View>
    </VariableContextProvider>
  );
}
