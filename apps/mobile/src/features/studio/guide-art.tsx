import { View, Text } from "react-native";
import Svg, { Circle, Path, Rect, Line } from "react-native-svg";

const palettes = [
  ["#DBE7B7", "#283D31"],
  ["#D9C6F2", "#432864"],
  ["#F3AA87", "#672F29"],
  ["#F6D98C", "#5A4319"],
  ["#B5DAD9", "#244B54"],
  ["#F2B8CC", "#663450"],
] as const;

/** Original cover art, drawn locally so every guide has its own visual identity. */
export function GuideCover({
  title,
  index = 0,
  height = 210,
  featured = false,
}: {
  title: string;
  index?: number;
  height?: number;
  featured?: boolean;
}) {
  const [paper, ink] = palettes[index % palettes.length]!;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        height,
        overflow: "hidden",
        borderRadius: featured ? 28 : 12,
        backgroundColor: paper,
      }}
    >
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 320 340"
        preserveAspectRatio="xMidYMid slice"
        style={{ position: "absolute" }}
      >
        {index % 3 === 0 ? (
          <>
            {[0, 1, 2, 3, 4].map((i) => (
              <Path
                key={i}
                d={`M${115 + i * 21} 370V235a${125 - i * 21} ${125 - i * 21} 0 0 1 ${250 - i * 42} 0v135`}
                fill="none"
                stroke={ink}
                strokeWidth="11"
                opacity={0.14 + i * 0.15}
              />
            ))}
          </>
        ) : index % 3 === 1 ? (
          <>
            <Line
              x1="75"
              y1="220"
              x2="265"
              y2="320"
              stroke={ink}
              strokeWidth="2"
            />
            <Line
              x1="75"
              y1="220"
              x2="260"
              y2="170"
              stroke={ink}
              strokeWidth="2"
            />
            <Line
              x1="260"
              y1="170"
              x2="265"
              y2="320"
              stroke={ink}
              strokeWidth="2"
            />
            <Circle cx="75" cy="220" r="54" fill={ink} />
            <Circle cx="260" cy="170" r="38" fill={ink} opacity=".5" />
            <Circle cx="265" cy="320" r="70" fill={ink} opacity=".22" />
            <Circle cx="75" cy="220" r="22" fill={paper} />
          </>
        ) : (
          <>
            {[0, 1, 2, 3, 4].map((i) => (
              <Rect
                key={i}
                x={46 + i * 37}
                y={200 - i * 16}
                width="24"
                height={145 + i * 16}
                rx="12"
                fill={ink}
                opacity={0.25 + i * 0.17}
                transform={`rotate(28 ${58 + i * 37} 260)`}
              />
            ))}
          </>
        )}
      </Svg>
      <Text
        allowFontScaling
        maxFontSizeMultiplier={1.6}
        style={{
          color: ink,
          fontSize: featured ? 43 : 34,
          lineHeight: featured ? 46 : 38,
          letterSpacing: -1.5,
          fontWeight: "600",
          padding: featured ? 28 : 20,
          maxWidth: featured ? "88%" : "100%",
          fontFamily: process.env.EXPO_OS === "ios" ? "Georgia" : "serif",
        }}
      >
        {title}
      </Text>
    </View>
  );
}
