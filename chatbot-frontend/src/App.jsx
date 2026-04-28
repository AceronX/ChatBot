// Top of App.jsx
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

function App() {
  const [userInput, setUserInput] = useState('');
  const [chatLog, setChatLog] = useState([]);
  const [loading, setLoading] = useState(false);
  const chatWindowRef = useRef(null);
  const inputRef = useRef(null);
  // Holds the AbortController for the active stream so Stop can cancel it
  const abortControllerRef = useRef(null);
  // Track whether the abort was user-initiated (Stop) vs unexpected (network drop)
  const userAbortedRef = useRef(false);
  // Stable ref to the current bot message index — avoids stale-closure issues
  const botIndexRef = useRef(null);

  useEffect(() => {
    try {
      const storedChatLog = localStorage.getItem('chatLog');
      if (storedChatLog) setChatLog(JSON.parse(storedChatLog));
    } catch (error) {
      console.error('Failed to load chat log from localStorage:', error);
    }
    inputRef.current?.focus();
  }, []);

  // Scroll to bottom on every chatLog change.
  // Use 'instant' while streaming so rapid updates don't queue up animations.
  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTo({
        top: chatWindowRef.current.scrollHeight,
        behavior: loading ? 'instant' : 'smooth',
      });
    }
    if (chatLog.length > 0) {
      try {
        localStorage.setItem('chatLog', JSON.stringify(chatLog));
      } catch (error) {
        console.error('Failed to save chat log to localStorage:', error);
      }
    }
  }, [chatLog, loading]);

  const handleInputChange = (event) => setUserInput(event.target.value);

  /** Cancel the in-flight stream (user-initiated) */
  const handleStop = useCallback(() => {
    userAbortedRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmedInput = userInput.trim();
    if (!trimmedInput || loading) return;

    // Snapshot the index of the bot message we're about to add.
    // Written to a ref so the stream loop always reads the current value
    // regardless of React batching or closure timing.
    setChatLog((prev) => {
      botIndexRef.current = prev.length + 1; // +1 because user message is inserted first
      return [
        ...prev,
        { type: 'user', text: trimmedInput },
        { type: 'bot', text: '' },
      ];
    });

    setUserInput('');
    setLoading(true);
    userAbortedRef.current = false;

    // Create a fresh AbortController for this request
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(`${API_BASE_URL}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_message: trimmedInput }),
        signal: controller.signal,
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

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE messages are separated by "\n\n"
        const parts = buffer.split('\n\n');
        // Keep the last (possibly incomplete) part in the buffer
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data:')) continue;

          const raw = line.slice('data:'.length).trim();
          if (raw === '[DONE]') break;

          let parsed;
          try {
            parsed = JSON.parse(raw);
          } catch {
            // Incomplete JSON fragment — skip, will be reassembled in buffer
            continue;
          }

          if (parsed.error) {
            throw new Error(parsed.error);
          }

          if (parsed.chunk) {
            setChatLog((prev) => {
              const updated = [...prev];
              updated[botIndexRef.current] = {
                ...updated[botIndexRef.current],
                text: updated[botIndexRef.current].text + parsed.chunk,
              };
              return updated;
            });
          }
        }
      }
    } catch (error) {
      if (error.name === 'AbortError' && userAbortedRef.current) {
        // User clicked Stop — keep partial text, append a visual marker
        setChatLog((prev) => {
          const updated = [...prev];
          const current = updated[botIndexRef.current];
          if (current) {
            updated[botIndexRef.current] = {
              ...current,
              text: (current.text || '') + ' [stopped]',
              type: 'bot',
            };
          }
          return updated;
        });
      } else {
        // Network drop, server error, or unexpected abort — show error bubble
        console.error('Error fetching chat response:', error);
        const message =
          error.name === 'AbortError'
            ? 'Connection lost. Please try again.'
            : error.message || 'Could not connect to the bot. Please try again.';
        setChatLog((prev) => {
          const updated = [...prev];
          updated[botIndexRef.current] = {
            type: 'error',
            text: `Error: ${message}`,
          };
          return updated;
        });
      }
    } finally {
      abortControllerRef.current = null;
      userAbortedRef.current = false;
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="App">
      <div className="app-shell">
        {/* Left visual / info panel */}
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

        {/* Center chat panel */}
        <main className="chat-panel">
          <header className="chat-header">
            <div className="chat-title-group">
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
                {/* Blinking cursor on the active bot message while streaming */}
                {loading &&
                  message.type === 'bot' &&
                  index === chatLog.length - 1 && (
                    <span className="streaming-cursor" aria-hidden="true" />
                  )}
              </div>
            ))}
            {/* "Thinking" indicator only before the first chunk arrives */}
            {loading &&
              chatLog[chatLog.length - 1]?.type === 'bot' &&
              chatLog[chatLog.length - 1]?.text === '' && (
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
            {loading ? (
              <button
                type="button"
                className="stop-btn"
                onClick={handleStop}
                aria-label="Stop generating"
              >
                Stop
              </button>
            ) : (
              <button type="submit" disabled={loading}>
                Send
              </button>
            )}
          </form>
        </main>

        {/* Right visual / tips panel */}
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
      </div>
    </div>
  );
}

export default App;
