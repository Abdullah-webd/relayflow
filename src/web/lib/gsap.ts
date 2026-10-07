import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { useGSAP } from "@gsap/react";

// Register once. Import GSAP from here everywhere so plugins are never tree-shaken.
gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText, DrawSVGPlugin);
ScrollTrigger.config({ ignoreMobileResize: true });
gsap.defaults({ ease: "expo.out", duration: 0.9 });

export { gsap, ScrollTrigger, SplitText, useGSAP };
