import AuthBar from "./components/AuthBar";
import Dashboard from "./components/Dashboard";

export default function HomePage() {
  return (
    <main
      style={{
        padding: "2rem",
        fontFamily: "sans-serif",
        background: "#f5f7fb",
      }}
    >
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <header style={{ marginBottom: "2rem" }}>
          <AuthBar />
          <h1>Job Application Copilot</h1>
          <p>
            Profile intake, multi-source search, scoring, review queue, and
            generated documents.
          </p>
        </header>
        <Dashboard />
      </div>
    </main>
  );
}
