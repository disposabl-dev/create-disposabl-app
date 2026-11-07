import { Text, type TextProps } from "react-native";

import { ThemeColor } from "./theme";

export type ThemedTextProps = TextProps & {
  type?:
    | "default"
    | "title"
    | "small"
    | "smallBold"
    | "subtitle"
    | "link"
    | "linkPrimary"
    | "code";
  themeColor?: ThemeColor;
};

const colorClasses: Record<ThemeColor, string> = {
  background: "text-background",
  foreground: "text-foreground",
  card: "text-card",
  cardForeground: "text-card-foreground",
  primary: "text-primary",
  primaryForeground: "text-primary-foreground",
  primaryText: "text-primary-text",
  muted: "text-muted",
  mutedForeground: "text-muted-foreground",
  border: "text-border",
  destructive: "text-destructive",
  destructiveForeground: "text-destructive-foreground",
};

const typeClasses: Record<NonNullable<ThemedTextProps["type"]>, string> = {
  code: "type-code",
  default: "type-default",
  link: "type-link",
  linkPrimary: "type-link",
  small: "type-small",
  smallBold: "type-small-bold",
  subtitle: "type-subtitle",
  title: "type-title",
};

export function ThemedText({
  className,
  style,
  type = "default",
  themeColor,
  ...rest
}: ThemedTextProps) {
  const color =
    themeColor ?? (type === "linkPrimary" ? "primaryText" : "foreground");

  return (
    <Text
      className={`${colorClasses[color]} ${typeClasses[type]} ${className ?? ""}`}
      style={style}
      {...rest}
    />
  );
}
