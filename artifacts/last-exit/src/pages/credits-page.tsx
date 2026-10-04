import { useState } from 'react';
import { Link } from 'wouter';
import {
  Radio, Award, ArrowLeft, ExternalLink, Copy, Check,
  Gamepad2, Film, Shield, Terminal, Heart, Sparkles, UserCheck,
} from 'lucide-react';

interface CreditsPageProps {
  onBack?: () => void;
}

export function CreditsPage({ onBack }: CreditsPageProps) {
  const [copied, setCopied] = useState(false);
  const currentUrl = typeof window !== 'undefined' ? `${window.location.origin}/credits` : '/credits';

  const copyCreditsUrl = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="credits-page film-grain">
      {/* Top Header */}
      <header className="credits-header">
        <div className="credits-header-nav">
          <Link href="/" className="button button-outline credits-back-btn">
            <ArrowLeft size={16} /> Return to Terminal
          </Link>
          <div className="credits-status-pill">
            <span className="live-pip" /> ARCHIVE CLASSIFIED RECORD // REF: LE-MDZ-1997
          </div>
        </div>

        <div className="credits-hero">
          <div className="eyebrow hero-eyebrow">
            <span className="red-square" /> OFFICIAL GAME ATTRIBUTION &amp; CREDITS
          </div>
          <h1 className="credits-hero-title">
            THE BACKROOMS<br />
            <span>LAST EXIT</span>
          </h1>
          <p className="credits-hero-subtitle">
            AN ATMOSPHERIC MULTIPLAYER FOUND-FOOTAGE EXPEDITION
          </p>
        </div>
      </header>

      {/* Main Author Spotlight Card */}
      <div className="credits-container">
        <section className="credits-lead-card paper-shadow">
          <div className="credits-badge-banner">
            <span className="credits-hero-badge">
              <Award size={18} /> SOLE CREATOR &amp; LEAD DEVELOPER
            </span>
            <span className="credits-serial">FILE ID: MDZ-CHIEF-01</span>
          </div>

          <div className="credits-lead-content">
            <div className="credits-author-title">
              <span className="credits-eyebrow-accent">CONCEIVED, DESIGNED &amp; DEVELOPED BY</span>
              <h2 className="credits-author-name">MOHAMMED DANSEER Z</h2>
              <p className="credits-author-tagline">
                THE GAME IS MADE BY MOHAMMED DANSEER Z
              </p>
            </div>

            <p className="credits-author-bio">
              From the initial creative vision, soundscapes, and yellow wallpaper lore to the
              multiplayer state management, real-time party mechanics, security infrastructure,
              and interactive 3D Level 0 exploration engine — this entire game is conceived,
              designed, and engineered from the ground up by <strong>Mohammed Danseer Z</strong>.
            </p>

            <div className="credits-url-box">
              <div className="credits-url-info">
                <span className="credits-url-label">OFFICIAL CREDITS URL (ACCESSIBLE ACROSS ALL PAGES):</span>
                <code className="credits-url-code">{currentUrl}</code>
              </div>
              <button
                className="button button-primary credits-copy-btn"
                onClick={copyCreditsUrl}
                aria-label="Copy Credits Page URL"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'URL Copied!' : 'Copy Credits URL'}
              </button>
            </div>

            <div className="credits-quick-links">
              <a
                href="https://github.com/mdanseergit"
                target="_blank"
                rel="noopener noreferrer"
                className="button button-dark"
              >
                <ExternalLink size={15} /> Mohammed Danseer Z on GitHub (@mdanseergit)
              </a>
              <Link href="/play" className="button button-primary">
                <Gamepad2 size={16} /> Play Level 0 Live Now
              </Link>
            </div>
          </div>
        </section>

        {/* Breakdown of Credits */}
        <section className="credits-grid">
          <div className="credits-grid-card">
            <div className="grid-card-icon"><Sparkles size={20} /></div>
            <h3>Game Concept &amp; Creative Direction</h3>
            <p className="credit-person">Mohammed Danseer Z</p>
            <p className="credit-desc">
              Original design concept, Found Footage 1997 aesthetic, audio tape narrative,
              Level 0 maze architecture, and survival rules.
            </p>
          </div>

          <div className="credits-grid-card">
            <div className="grid-card-icon"><Terminal size={20} /></div>
            <h3>Full-Stack Architecture &amp; Engineering</h3>
            <p className="credit-person">Mohammed Danseer Z</p>
            <p className="credit-desc">
              High-performance Express API, PostgreSQL database schema with Drizzle ORM,
              cookie session authentication with Argon2id hashing, and cross-origin CORS handling.
            </p>
          </div>

          <div className="credits-grid-card">
            <div className="grid-card-icon"><Film size={20} /></div>
            <h3>Level 0 Hallway 3D Engine &amp; Gameplay</h3>
            <p className="credit-person">Mohammed Danseer Z</p>
            <p className="credit-desc">
              Fast 60 FPS real-time raycasting exploration engine, flashlight beam simulation,
              anomalous entity proximity radar, and tape collection win conditions.
            </p>
          </div>

          <div className="credits-grid-card">
            <div className="grid-card-icon"><Shield size={20} /></div>
            <h3>Multiplayer Party &amp; Crew Systems</h3>
            <p className="credit-person">Mohammed Danseer Z</p>
            <p className="credit-desc">
              Room code generation, private lobby encryption, real-time presence indicators,
              and bilateral friend request management.
            </p>
          </div>

          <div className="credits-grid-card">
            <div className="grid-card-icon"><Radio size={20} /></div>
            <h3>Atmospheric Audio &amp; Soundscapes</h3>
            <p className="credit-person">Mohammed Danseer Z</p>
            <p className="credit-desc">
              Synthesized 60Hz fluorescent lighting hum, damp carpet footstep audio,
              lo-fi radio static, and analog audio tape mechanics.
            </p>
          </div>

          <div className="credits-grid-card">
            <div className="grid-card-icon"><UserCheck size={20} /></div>
            <h3>Production, UX &amp; Global Deployment</h3>
            <p className="credit-person">Mohammed Danseer Z</p>
            <p className="credit-desc">
              Production configuration for Vercel edge deployment and Render API hosting,
              with responsive mobile &amp; desktop design.
            </p>
          </div>
        </section>

        {/* Found Footage Memo */}
        <section className="credits-memo-box">
          <div className="memo-stamp">TRANSMISSION MEMORANDUM // 04-OCT-1997</div>
          <blockquote className="memo-quote">
            “To any wanderer who stumbles across these yellow halls: know that you are not the first,
            and you will not be the last. Every corner, every flickering fluorescent tube, and every
            creaking door was laid down with purpose. Trust your crew, keep your flashlight charged,
            and keep searching for the Last Exit.”
          </blockquote>
          <div className="memo-signature">
            <span>— MOHAMMED DANSEER Z</span>
            <small>Lead Architect // The Backrooms: Last Exit</small>
          </div>
        </section>

        {/* Navigation Actions */}
        <div className="credits-actions-bar">
          <Link href="/" className="button button-outline">
            <ArrowLeft size={16} /> Back to Main Menu
          </Link>
          <Link href="/party" className="button button-outline">
            Join or Create Party
          </Link>
          <Link href="/play" className="button button-primary">
            <Gamepad2 size={16} /> Launch Playable Simulation
          </Link>
        </div>
      </div>
    </div>
  );
}

export default CreditsPage;
