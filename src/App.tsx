import { useState } from "react";
import { GalaxyDemo } from "./GalaxyDemo";
import { HeroDemo } from "./HeroDemo";

export const App = () => {
  const [demo, setDemo] = useState<"galaxy" | "hero">("galaxy");

  return (
    <>
      {demo === "hero" ? <HeroDemo></HeroDemo> : <GalaxyDemo></GalaxyDemo>}
     
      <div className="overlay bottom left flex-column">
        <span>
          Version 0.3 <a href="https://github.com/myagoo/graviwar">Github</a>
        </span>
        <button onClick={() => setDemo(demo === "hero" ? "galaxy" : "hero")}>
          Switch to {demo === "hero" ? "galaxy" : "hero"} demo
        </button>
      </div>
    </>
  );
};
