const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import './App.css';

function CopyButton({ code }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button className="copy-btn" onClick={handleCopy}>
      {copied ? 'Copied!' : 'Copy code'}
    </button>
  );
}

function MarkdownMessage({ text }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ node, inline, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const code = String(children).replace(/\n$/, '');
          if (!inline && match) {
            return (
              <div className="code-block-wrapper">
                <CopyButton code={code} />
                <SyntaxHighlighter
                  style={oneDark}
                  language={match[1]}
                  PreTag="div"
                  {...props}
                >
                  {code}
                </SyntaxHighlighter>
              </div>
            );
          }
          if (!inline) {
            return (
              <div className="code-block-wrapper">
                <CopyButton code={code} />
                <SyntaxHighlighter
                  style={oneDark}
                  PreTag="div"
                  {...props}
                >
                  {code}
                </SyntaxHighlighter>
              </div>
            );
          }
          return <code className={className} {...props}>{children}</code>;
        },
        a({ href, children }) {
          return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
        },
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

function App() {
  const [userInput, setUserInput] = useState('');
  const [chatLog, setChatLog] = useState([]);
  const [loading, setLoading] = useState(false);
  const chatWindowRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    try {
      const storedChatLog = localStorage.getItem('chatLog');
      if (storedChatLog) setChatLog(JSON.parse(storedChatLog));
    } catch (error) {
      console.error('Failed to load chat log from localStorage:', error);
    }
    inputRef.current?.focus();
  }, []);

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

  const handleInputChange = (event) => setUserInput(event.target.value);

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

  return (
    <div className="App">
      <div className="app-shell">
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
                {message.type === 'bot'
                  ? <MarkdownMessage text={message.text} />
                  : message.text}
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
