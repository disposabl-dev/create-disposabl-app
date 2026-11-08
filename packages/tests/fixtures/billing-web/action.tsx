import React from "react";
export const Action = ({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) => (
  <button disabled={disabled} onClick={onPress}>
    {label}
  </button>
);
