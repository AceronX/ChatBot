const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

import { useState, useEffect, useRef } from 'react';
import './App.css';

function App() {
  const [userInput, setUserInput] = useState('');
  const [chatLog, setChatLog] = useState([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const chatWindowRef = useRef(null);
  const inputRef = useRef(null);

  // Load chat history from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('chatLog');
      if (stored) setChatLog(JSON.parse(stored));
    } catch (error) {
      console.error('Failed to load chat log from localStorage:', error);
    }
    inputRef.current?.focus();
  }, []);

  // Auto-scroll and persist chat log on update
  useEffect(() => {
    if (chatWindowRef.current) {
      const { scrollHeight, clientHeight } = chatWindowRef.current;
      chatWindowRef.current.scrollTo({
        top: scrollHeight - clientHeight,
        behavior: 'smooth',
      });
    }
    if (chatLog.length > 0) {
      try {
        localStorage.setItem('chatLog', JSON.stringify(chatLog));
      } catch (error) {
        console.error('Failed to save chat log to localStorage:', error);
      }
    }
  }, [chatLog]);

  // Close drawer on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Lock body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  const hamburgerRef = useRef(null);
  const drawerCloseRef = useRef(null);

  // Focus management: move focus into drawer on open, return on close
  useEffect(() => {
    if (drawerOpen) {
      drawerCloseRef.current?.focus();
    } else {
      hamburgerRef.current?.focus();
    }
  }, [drawerOpen]);

  const handleInputChange = (e) => setUserInput(e.target.value);
  const toggleDrawer = () => setDrawerOpen((prev) => !prev);
  const closeDrawer = () => setDrawerOpen(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmedInput = userInput.trim();
    if (!trimmedInput || loading) return;

    setChatLog((prev) => [...prev, { type: 'user', text: trimmedInput }]);
    setUserInput('');
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_message: trimmedInput }),
      });

      if (!response.ok) {
        let errorDetail = `HTTP error! Status: ${response.status}`;
        try {
          const errorData = await response.json();
          errorDetail = errorData.detail || errorDetail;
        } catch {
          errorDetail = `${errorDetail} ${response.statusText || ''}`.trim();
        }
        throw new Error(errorDetail);
      }

      const data = await response.json();
      const botResponseText = data.response;

      if (typeof botResponseText !== 'string' || !botResponseText) {
        throw new Error('Received invalid or empty response from bot.');
      }

      setChatLog((prev) => [...prev, { type: 'bot', text: botResponseText }]);
    } catch (error) {
      console.error('Error fetching chat response:', error);
      setChatLog((prev) => [
        ...prev,
        {
          type: 'error',
          text: `Error: ${error.message || 'Could not connect to the bot. Please try again.'}`,
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const LeftPanel = () => (
    <aside className="side-panel left-panel">
      <h2>AI Chat Assistant</h2>
      <p>
        A minimal full-stack chatbot built with React and FastAPI.
        Ask questions, test prompts, or plug in your own backend logic.
      </p>
      <div className="stats-card">
        <h3>Session Info</h3>
        <ul>
          <li>Messages in chat: <span>{chatLog.length}</span></li>
          <li>Backend: <span>FastAPI</span></li>
          <li>Client: <span>React + Vite</span></li>
        </ul>
      </div>
    </aside>
  );

  const RightPanel = () => (
    <aside className="side-panel right-panel">
      <h3>Try these prompts</h3>
      <ul className="prompt-list">
        <li>"Summarize this project in 3 bullet points."</li>
        <li>"Explain this like I'm 12 years old."</li>
        <li>"Give me 3 ideas to improve this chatbot."</li>
      </ul>
      <div className="gradient-card">
        <p>
          This area can be used later for logs, model settings, or user
          profile info.
        </p>
      </div>
    </aside>
  );

  return (
    <div className="App">

      {/* Mobile: dark overlay behind drawer */}
      {drawerOpen && (
        <div
          className="drawer-overlay"
          onClick={closeDrawer}
          aria-hidden="true"
        />
      )}

      {/* Mobile: slide-in drawer */}
      <div
        className={`drawer-panel${drawerOpen ? ' active' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Side menu"
      >
        <button
          className="drawer-close"
          ref={drawerCloseRef}
          onClick={closeDrawer}
          aria-label="Close menu"
        >
          ✕
        </button>
        <div className="drawer-content">
          <LeftPanel />
          <RightPanel />
        </div>
      </div>

      {/* Main layout */}
      <div className="app-shell">

        {/* Left panel — desktop only */}
        <LeftPanel />

        {/* Center chat panel */}
        <main className="chat-panel">
          <header className="chat-header">
            <div className="chat-title-group">
              <button
                className="hamburger-button"
                ref={hamburgerRef}
                onClick={toggleDrawer}
                aria-label="Open menu"
                aria-expanded={drawerOpen}
              >
                ☰
              </button>
              <div className="chat-avatar">AI</div>
              <div>
                <h1>AI Chat Assistant</h1>
                <p>Conversational interface connected to your FastAPI backend</p>
              </div>
            </div>
          </header>

          <div className="chat-window" ref={chatWindowRef} aria-live="polite">
            {chatLog.map((message, index) => (
              <div key={index} className={`message ${message.type}`}>
                {message.text}
              </div>
            ))}
            {loading && (
              <div className="loading-indicator">Bot is thinking...</div>
            )}
          </div>

          <form className="chat-form" onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              type="text"
              value={userInput}
              onChange={handleInputChange}
              placeholder="Type your message and press Enter..."
              disabled={loading}
              aria-label="Chat message input"
            />
            <button type="submit" disabled={loading}>
              Send
            </button>
          </form>
        </main>

        {/* Right panel — desktop only */}
        <RightPanel />

      </div>
    </div>
  );
}

export default App;
