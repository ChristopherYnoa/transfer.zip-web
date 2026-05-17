"use client";
import { useContext } from "react";
import bgBlur from "@/img/bg-blur.png";
import bgBlurSafari from "@/img/bg-blur-safari.png";
import { GlobalContext } from "@/context/GlobalContext";
import { Button } from "../ui/button";

export default function EmptySpace({ title, subtitle, onClick, buttonText, children }) {
  const { isSafari } = useContext(GlobalContext);
  const bgSrc = isSafari ? bgBlurSafari.src : bgBlur.src;
  const bgColor = isSafari ? "#6fb0ff" : "#60a0ff";

  return (
    <div
      className="text-center py-16 rounded-xl border-dashed border-2 bg-no-repeat bg-top"
      style={{
        backgroundImage: `url(${bgSrc})`,
        backgroundSize: "100% auto",
        backgroundColor: bgColor,
      }}
    >
      <h3 className="font-semibold text-3xl mb-1 text-white">{title}</h3>
      <p className="text-gray-200 mx-auto max-w-xl text-lg">
        {subtitle}
      </p>
      {onClick && <Button size={"sm"} className="mt-4" onClick={onClick}>{buttonText} &rarr;</Button>}
      {children}
    </div>
  )
}
