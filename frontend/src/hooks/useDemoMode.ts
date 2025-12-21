import { useState } from "react";

const readDemoFlag = () => {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem("ss_demo") === "true";
  } catch {
    return false;
  }
};

export const useDemoMode = () => {
  const [isDemo] = useState(readDemoFlag);
  return isDemo;
};
