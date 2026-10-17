"use client";

import { useEffect } from "react";

/** Brings the quoted passage into view when the page opens, since a long thread can put it far below the fold. */
export function ToMark() {
  useEffect(() => {
    const mark = document.querySelector("main mark");
    if (!mark) return;
    const box = mark.getBoundingClientRect();
    if (box.top > window.innerHeight * 0.8)
      mark.scrollIntoView({ block: "center" });
  }, []);
  return null;
}
