import { MotionConfig } from "framer-motion";
import LandingHeader from "./components/landing/LandingHeader";
import Hero from "./components/landing/Hero";
import HowItWorks from "./components/landing/HowItWorks";
import Showcase from "./components/landing/Showcase";
import TrustSection from "./components/landing/TrustSection";
import AccessSection from "./components/landing/AccessSection";
import LandingFooter from "./components/landing/LandingFooter";

export default function LandingPage() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-background">
        <LandingHeader />
        <main>
          <Hero />
          <HowItWorks />
          <Showcase />
          <TrustSection />
          <AccessSection />
        </main>
        <LandingFooter />
      </div>
    </MotionConfig>
  );
}
