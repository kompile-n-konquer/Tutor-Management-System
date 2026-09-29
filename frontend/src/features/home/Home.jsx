import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import Benefits from "./components/Benefits";
import Features from "./components/Features";
import Commitment from "./components/Commitment";
import Contact from "./components/Contact";
import Footer from "./components/Footer";

/**
 * Home — the TutorFlow landing page. Each section lives in its own component
 * under features/home/components; the hero embeds a live preview of the real
 * tutor dashboard via DashboardPreview.
 */
export default function Home() {
  return (
    <div className="landing-page bg-background text-on-background font-body-md min-h-screen flex flex-col antialiased">
      <Navbar />
      <main className="flex-grow hero-bg">
        <Hero />
        <Benefits />
        <Features />
        <Commitment />
        <Contact />
      </main>
      <Footer />
    </div>
  );
}
