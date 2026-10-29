import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CheckCheck,
  ChevronRight,
  Fingerprint,
  GraduationCap,
  Menu,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { Brand } from "../Brand";
import { Button } from "../ui";
import ProductVisual, {
  ActivityTimeline,
  AttendanceGraphic,
  Advisory,
  examples,
} from "./ProductVisual";
import Readiness from "./Readiness";
import "./public.css";
const LoginDialog = lazy(() => import("./LoginDialog"));
const ConsultationDialog = lazy(() => import("./ConsultationDialog"));
const nav = [
  ["Product", "#product"],
  ["How it works", "#how-it-works"],
  ["For institutions", "#institutions"],
  ["Privacy", "#privacy"],
];
export default function PublicHome({
  onSignedIn,
  authenticated,
}: {
  onSignedIn: () => void;
  authenticated: boolean;
}) {
  const [modal, setModal] = useState<"login" | "consultation" | null>(null);
  const [menu, setMenu] = useState(false);
  const [example, setExample] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (location.state?.login) {
      setModal("login");
      navigate("/", { replace: true, state: null });
    }
  }, [location.state, navigate]);
  useEffect(() => {
    if (
      !("IntersectionObserver" in window) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("section-entered");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.08 },
    );
    document
      .querySelectorAll(".public-section .section-heading")
      .forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);
  const open = (kind: "login" | "consultation") => {
    setMenu(false);
    setModal(kind);
  };
  return (
    <div className="public-site">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="public-header">
        <a href="#" aria-label="Classroom Insight home">
          <Brand />
        </a>
        <button
          className="mobile-nav-toggle"
          aria-label={menu ? "Close navigation" : "Open navigation"}
          aria-expanded={menu}
          aria-controls="public-navigation"
          onClick={() => setMenu(!menu)}
        >
          {menu ? <X /> : <Menu />}
        </button>
        <nav
          id="public-navigation"
          className={menu ? "public-navigation open" : "public-navigation"}
          aria-label="Public navigation"
        >
          {nav.map(([name, href]) => (
            <a key={name} href={href} onClick={() => setMenu(false)}>
              {name}
            </a>
          ))}
          {authenticated ? (
            <Link to="/app">Open workspace</Link>
          ) : (
            <button onClick={() => open("login")}>Employee Login</button>
          )}
          <Button variant="primary" onClick={() => open("consultation")}>
            Request a Consultation
            <ArrowUpRight size={15} />
          </Button>
        </nav>
      </header>
      <main id="main" tabIndex={-1}>
        <section className="public-hero">
          <div className="hero-copy">
            <p className="eyebrow">CLASSROOM INTELLIGENCE, WITH CONTEXT</p>
            <h1>
              Understand
              <br />
              the classroom.
              <br />
              <em>
                Make every
                <br className="desktop-break" /> session count.
              </em>
            </h1>
            <p className="hero-description">
              Bring attendance records, classroom activity signals, and
              AI-assisted insights into one thoughtful workspace. Give educators
              a clearer picture of their sessions without pretending that a
              metric tells the whole story.
            </p>
            <div className="hero-actions">
              <Button variant="primary" onClick={() => open("consultation")}>
                Request a Consultation
                <ArrowUpRight size={16} />
              </Button>
              <a href="#product" className="text-link">
                Explore the Platform
                <ArrowRight size={16} />
              </a>
            </div>
            <p className="trust-note">
              <ShieldCheck size={18} />
              Built to support educator judgement.
            </p>
          </div>
          <div className="hero-product">
            <div className="visual-heading">
              <span>THE CLASSROOM, OBSERVED WITH CARE.</span>
              <span>01—03</span>
            </div>
            <ProductVisual />
            <p className="hero-footnote">
              Records you can confirm. Signals you can question.
              <br />
              Decisions that remain yours.
            </p>
          </div>
        </section>
        <section id="product" className="public-section">
          <div className="section-index">01 / A MORE COMPLETE PICTURE</div>
          <div className="section-heading">
            <h2 className="editorial">
              From scattered records
              <br />
              to shared understanding.
            </h2>
            <p className="section-copy">
              Three connected ways to review a session.
              <br />
              Each with its evidence in view.
            </p>
          </div>
          <div className="capability-grid">
            {[
              {
                icon: Users,
                title: "Attendance intelligence",
                copy: "Maintain an instructor-confirmed register. Follow attendance patterns across students and sessions without confusing visibility with identity.",
                label: "The record",
              },
              {
                icon: Activity,
                title: "Session analysis",
                copy: "Examine available video movement and audio energy. Review anonymous person-count estimates alongside their method and limitations.",
                label: "The observation",
              },
              {
                icon: BookOpen,
                title: "AI-assisted recommendations",
                copy: "Turn session-level metrics into practical teaching suggestions, with their supporting evidence. Local rules remain available without AI.",
                label: "The next question",
              },
            ].map(({ icon: Icon, title, copy, label }, i) => (
              <article key={title}>
                <div className="capability-top">
                  <Icon size={24} />
                  <span>0{i + 1}</span>
                </div>
                <p className="eyebrow">{label}</p>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>
        <section id="how-it-works" className="public-section process-section">
          <div className="section-index">02 / A WORKFLOW WITH INTENTION</div>
          <div className="section-heading">
            <h2 className="editorial">Observe. Review. Decide.</h2>
            <p className="section-copy">
              Technology adds a useful layer.
              <br />
              The instructor supplies the context.
            </p>
          </div>
          <ol className="process-grid">
            {[
              {
                title: "Bring the session together",
                copy: "Create a session, maintain your roster and confirm attendance manually. Add a recording when available and appropriate.",
                tag: "Instructor input + optional recording",
              },
              {
                title: "Look at the evidence",
                copy: "Review attendance from existing records. Uploaded recordings add calculated activity signals where the format and analysis support them.",
                tag: "Records + calculated observations",
              },
              {
                title: "Make an informed next move",
                copy: "Review evidence-linked advisory suggestions, decide what matters for your classroom and export the session records.",
                tag: "Human review + reports",
              },
            ].map((s, i) => (
              <li key={s.title}>
                <div className="process-line">
                  <span>{i + 1}</span>
                  {i < 2 && <ArrowRight size={19} />}
                </div>
                <h3>{s.title}</h3>
                <p>{s.copy}</p>
                <small>{s.tag}</small>
              </li>
            ))}
          </ol>
        </section>
        <section id="demonstration" className="public-section">
          <div className="section-index">03 / INSIDE A SESSION</div>
          <div className="section-heading">
            <h2 className="editorial">The signal is a starting point.</h2>
            <p className="section-copy">
              Switch between two illustrative sessions.
              <br />
              Neither is a real classroom measurement.
            </p>
          </div>
          <div
            className="demo-tabs"
            role="group"
            aria-label="Illustrative session examples"
          >
            {examples.map((s, i) => (
              <button
                key={s.title}
                aria-pressed={example === i}
                onClick={() => setExample(i)}
              >
                {s.title}
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
          <div className="interactive-preview">
            <div>
              <p className="eyebrow">
                Illustrative data · {examples[example].format}
              </p>
              <h3 className="demo-title">{examples[example].title}</h3>
              <ActivityTimeline index={example} />
            </div>
            <div className="demo-sidebar">
              <AttendanceGraphic index={example} />
              <Advisory index={example} />
            </div>
          </div>
          <p className="preview-disclosure">
            Sample data and editorial advisory examples. Switching sessions does
            not call Gemini. Visible movement cannot establish attention,
            emotion or learning.
          </p>
        </section>
        <section
          id="institutions"
          className="public-section institutions-section"
        >
          <div className="section-index">04 / BUILT AROUND YOUR CONTEXT</div>
          <div className="institution-layout">
            <div>
              <GraduationCap size={30} />
              <h2 className="editorial">
                Different institutions.
                <br />
                Better questions.
              </h2>
              <p className="section-copy">
                Start with the workflow you have, and the decisions you need to
                make.
              </p>
              <button
                className="text-link"
                onClick={() => open("consultation")}
              >
                Discuss your requirements
                <ArrowUpRight size={17} />
              </button>
            </div>
            <div className="institution-grid">
              {[
                [
                  "Schools",
                  "Help teachers maintain clear attendance records and review sessions with appropriate oversight.",
                ],
                [
                  "Colleges & universities",
                  "Explore consistent records and instructor-led review across seminars, lectures and workshops.",
                ],
                [
                  "Coaching & training centres",
                  "Review attendance and recorded training sessions alongside the learning plan.",
                ],
                [
                  "Corporate learning teams",
                  "Consider a focused pilot for facilitated training, with employee privacy at its centre.",
                ],
              ].map(([title, copy]) => (
                <article key={title}>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </article>
              ))}
            </div>
          </div>
          <p className="institution-note">
            Onboarding, scale, integrations and data governance require
            consultation. This local demonstration does not establish enterprise
            deployment readiness.
          </p>
        </section>
        <Readiness />
        <section id="privacy" className="privacy-section">
          <div className="section-index">06 / RESPONSIBLE BY INTENTION</div>
          <div className="privacy-layout">
            <div>
              <Fingerprint size={36} />
              <h2 className="editorial">
                A clearer picture.
                <br />
                With clear boundaries.
              </h2>
              <p>
                Trust begins with explaining what a system can see—and what it
                cannot know.
              </p>
            </div>
            <div className="privacy-points">
              {[
                [
                  "Local-first media",
                  "Supported recordings are processed on the local Flask backend. Uploads remain there until deleted; local does not mean encrypted or automatically compliant.",
                ],
                [
                  "People are more than signals",
                  "Anonymous person estimates do not identify students. Movement and audio energy are observations, not reliable measures of attention or emotion.",
                ],
                [
                  "Educators remain in control",
                  "Attendance requires registered records and instructor confirmation. Recommendations are advisory and require human review.",
                ],
                [
                  "Deliberate data handling",
                  "API keys stay on the backend. Readiness generation sends only the workflow descriptions you submit to Gemini. Configure access controls and governance before institutional use.",
                ],
              ].map(([title, copy]) => (
                <article key={title}>
                  <CheckCheck size={18} />
                  <div>
                    <h3>{title}</h3>
                    <p>{copy}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section className="final-cta">
          <p className="eyebrow">THE NEXT STEP IS A CONVERSATION</p>
          <h2 className="editorial">
            What would a useful pilot
            <br />
            look like for your institution?
          </h2>
          <Button variant="primary" onClick={() => open("consultation")}>
            Request a Consultation
            <ArrowUpRight size={17} />
          </Button>
          <p>Start with your needs. Keep the context.</p>
        </section>
      </main>
      <footer className="public-footer">
        <div>
          <Brand />
          <p>
            Classroom intelligence for thoughtful,
            <br />
            instructor-led decisions. Local demonstration.
          </p>
        </div>
        <nav aria-label="Footer navigation">
          {nav.map(([name, href]) => (
            <a key={name} href={href}>
              {name}
            </a>
          ))}
          <button onClick={() => open("login")}>Employee Login</button>
          <button onClick={() => open("consultation")}>
            Request a Consultation
          </button>
        </nav>
        <div className="footer-bottom">
          <span>Classroom Insight</span>
          <span>Attendance · Observation · Context</span>
        </div>
      </footer>
      <Suspense
        fallback={
          <p role="status" className="modal-loading">
            Opening form…
          </p>
        }
      >
        {modal === "login" && (
          <LoginDialog onClose={() => setModal(null)} onSignedIn={onSignedIn} />
        )}{" "}
        {modal === "consultation" && (
          <ConsultationDialog onClose={() => setModal(null)} />
        )}
      </Suspense>
    </div>
  );
}
